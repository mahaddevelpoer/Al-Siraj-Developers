-- AL SIRAJ DEVELOPERS
-- CEO Android FCM bridge repair + test helper.
--
-- Run this in Supabase SQL Editor when Firebase Console notifications work
-- but app does not receive notifications created from desktop/accountant flows.
--
-- IMPORTANT:
-- 1. If the Edge Function has CEO_PUSH_WEBHOOK_SECRET set, replace
--    REPLACE_WITH_REAL_SECRET below with the exact same secret.
-- 2. If you unset CEO_PUSH_WEBHOOK_SECRET from the Edge Function, the value
--    here can be any non-empty string because the function will not enforce it.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ceo_push_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  function_url TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ceo_push_config_singleton CHECK (id)
);

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

INSERT INTO public.ceo_push_config (id, function_url, webhook_secret)
VALUES (
  TRUE,
  'https://wdislbdftnwmaexqtfmn.functions.supabase.co/send-ceo-push',
  COALESCE(
    NULLIF((SELECT webhook_secret FROM public.ceo_push_config WHERE id = TRUE), ''),
    'REPLACE_WITH_REAL_SECRET'
  )
)
ON CONFLICT (id) DO UPDATE SET
  function_url = EXCLUDED.function_url,
  webhook_secret = CASE
    WHEN public.ceo_push_config.webhook_secret IS NULL
      OR public.ceo_push_config.webhook_secret = ''
      OR public.ceo_push_config.webhook_secret = 'REPLACE_WITH_CEO_PUSH_WEBHOOK_SECRET'
      OR public.ceo_push_config.webhook_secret = 'REPLACE_WITH_REAL_SECRET'
    THEN EXCLUDED.webhook_secret
    ELSE public.ceo_push_config.webhook_secret
  END,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.set_ceo_push_secret(p_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_secret IS NULL OR btrim(p_secret) = '' THEN
    RAISE EXCEPTION 'Secret is required';
  END IF;

  UPDATE public.ceo_push_config
  SET webhook_secret = p_secret,
      updated_at = NOW()
  WHERE id = TRUE;

  RETURN jsonb_build_object('success', TRUE, 'message', 'CEO push DB secret updated');
END;
$$;

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
  record_id TEXT;
BEGIN
  SELECT * INTO cfg FROM public.ceo_push_config WHERE id = TRUE;

  IF cfg.function_url IS NULL OR cfg.webhook_secret IS NULL OR cfg.webhook_secret = '' THEN
    INSERT INTO public.ceo_push_delivery_log(table_name, event_name, record_id, note)
    VALUES (TG_TABLE_NAME, TG_OP, COALESCE(NEW.id::TEXT, OLD.id::TEXT), 'missing_push_config');
    RETURN COALESCE(NEW, OLD);
  END IF;

  row_payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'event', TG_OP,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );
  record_id := COALESCE(NEW.id::TEXT, OLD.id::TEXT);

  SELECT net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc',
      'content-type', 'application/json',
      'x-ceo-push-secret', cfg.webhook_secret
    ),
    body := row_payload,
    timeout_milliseconds := 7000
  )
  INTO req_id;

  INSERT INTO public.ceo_push_delivery_log(
    table_name,
    event_name,
    record_id,
    request_id,
    request_payload,
    note
  )
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    record_id,
    req_id,
    row_payload,
    'queued_to_edge_function'
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.ceo_push_delivery_log(table_name, event_name, record_id, request_payload, note)
  VALUES (TG_TABLE_NAME, TG_OP, COALESCE(NEW.id::TEXT, OLD.id::TEXT), row_payload, SQLERRM);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

-- Keep push approval-only. App-open realtime can still listen to business
-- tables, but Android lock-screen FCM must not flood for old synced rows.
DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;
DROP TRIGGER IF EXISTS all_sales_ceo_mobile_push ON public.all_sales;
DROP TRIGGER IF EXISTS properties_ceo_mobile_push ON public.properties;
DROP TRIGGER IF EXISTS installments_ceo_mobile_push ON public.installments;
DROP TRIGGER IF EXISTS expenses_ceo_mobile_push ON public.expenses;

ALTER TABLE public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.test_ceo_push_appeal()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
  requester_id UUID;
BEGIN
  SELECT id INTO requester_id
  FROM public.users
  WHERE role IN ('accountant', 'ceo')
  ORDER BY CASE WHEN role = 'accountant' THEN 1 ELSE 2 END, created_at DESC
  LIMIT 1;

  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'No public.users accountant/ceo profile found for push test';
  END IF;

  INSERT INTO public.appeals (
    requested_by_user_id,
    requested_by_role,
    appeal_type,
    entity_type,
    entity_id,
    status,
    town_name,
    reason,
    requested_data,
    created_at
  )
  VALUES (
    requester_id,
    'accountant',
    'push_test',
    'push_test',
    'push-test-' || extract(epoch from now())::BIGINT,
    'pending',
    'Push Test Town',
    'CEO Android push bridge test',
    jsonb_build_object(
      'townName', 'Push Test Town',
      'accountant_name', 'System Test',
      'amount', 1,
      'date', CURRENT_DATE::TEXT
    ),
    NOW()
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'appeal_id', new_id,
    'next_check', 'select * from public.ceo_push_delivery_log order by id desc limit 5;'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ceo_push_secret(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_ceo_push_appeal() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appeals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appeals;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_entries;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- After replacing the secret, test with:
-- select public.set_ceo_push_secret('YOUR_REAL_SECRET');
-- select public.test_ceo_push_appeal();
-- select * from public.ceo_push_delivery_log order by id desc limit 5;
