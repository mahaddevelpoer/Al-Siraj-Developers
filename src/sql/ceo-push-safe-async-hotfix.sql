-- AL SIRAJ DEVELOPERS
-- Hotfix: keep CEO push trigger non-blocking for business writes.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.ceo_push_delivery_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  table_name TEXT,
  event_name TEXT,
  record_id TEXT,
  request_id BIGINT,
  request_payload JSONB,
  note TEXT
);

CREATE OR REPLACE FUNCTION public.notify_ceo_mobile_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  cfg public.ceo_push_config%ROWTYPE;
  row_payload JSONB;
  req_id BIGINT;
BEGIN
  SELECT * INTO cfg FROM public.ceo_push_config WHERE id = TRUE;
  IF cfg.function_url IS NULL OR cfg.webhook_secret IS NULL OR cfg.webhook_secret = '' THEN
    RETURN NEW;
  END IF;

  row_payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'event', TG_OP,
    'record', to_jsonb(NEW),
    'old_record', NULL
  );

  -- pg_net queues the HTTP request outside the business transaction. The
  -- timeout is intentionally short so an FCM/Edge outage can never block inserts.
  SELECT net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc',
      'content-type', 'application/json',
      'x-ceo-push-secret', cfg.webhook_secret
    ),
    body := row_payload,
    timeout_milliseconds := 3000
  )
  INTO req_id;

  INSERT INTO public.ceo_push_delivery_log(table_name, event_name, record_id, request_id, request_payload, note)
  VALUES (TG_TABLE_NAME, TG_OP, NEW.id::TEXT, req_id, row_payload, 'queued_to_edge_function');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.ceo_push_delivery_log(table_name, event_name, record_id, request_payload, note)
    VALUES (TG_TABLE_NAME, TG_OP, COALESCE(NEW.id::TEXT, ''), row_payload, SQLERRM);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

NOTIFY pgrst, 'reload schema';
