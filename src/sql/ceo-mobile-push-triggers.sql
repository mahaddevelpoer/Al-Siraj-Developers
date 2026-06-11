-- CEO mobile push notification trigger setup.
-- 1) Deploy supabase/functions/send-ceo-push.
-- 2) Set Edge Function secrets:
--    FIREBASE_SERVICE_ACCOUNT_JSON = full Firebase service account JSON
--    CEO_PUSH_WEBHOOK_SECRET = any strong random string
-- 3) Replace the placeholders below, then run this SQL in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.ceo_push_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  function_url TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ceo_push_config_singleton CHECK (id)
);

INSERT INTO public.ceo_push_config (id, function_url, webhook_secret)
VALUES (
  TRUE,
  'https://YOUR_PROJECT_REF.functions.supabase.co/send-ceo-push',
  'REPLACE_WITH_CEO_PUSH_WEBHOOK_SECRET'
)
ON CONFLICT (id) DO UPDATE SET
  function_url = EXCLUDED.function_url,
  webhook_secret = EXCLUDED.webhook_secret,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.notify_ceo_mobile_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cfg public.ceo_push_config%ROWTYPE;
  row_payload JSONB;
BEGIN
  SELECT * INTO cfg FROM public.ceo_push_config WHERE id = TRUE;

  IF cfg.function_url IS NULL OR cfg.webhook_secret IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  row_payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'event', TG_OP,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );

  PERFORM net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-ceo-push-secret', cfg.webhook_secret
    ),
    body := row_payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
CREATE TRIGGER notifications_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;
CREATE TRIGGER daily_entries_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.daily_entries
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();
