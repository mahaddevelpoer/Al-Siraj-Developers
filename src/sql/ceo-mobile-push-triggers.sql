-- CEO mobile push notification trigger setup.
-- 1) Deploy supabase/functions/send-ceo-push.
-- 2) Set Edge Function secrets:
--    FIREBASE_SERVICE_ACCOUNT_JSON = full Firebase service account JSON
--    CEO_PUSH_WEBHOOK_SECRET = any strong random string
-- 3) Replace the placeholders below, then run this SQL in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pg_net;

DROP POLICY IF EXISTS "CEO mobile read appeals" ON public.appeals;
CREATE POLICY "CEO mobile read appeals" ON public.appeals
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile read notifications" ON public.notifications;
CREATE POLICY "CEO mobile read notifications" ON public.notifications
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile read daily_entries" ON public.daily_entries;
CREATE POLICY "CEO mobile read daily_entries" ON public.daily_entries
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile read all_sales" ON public.all_sales;
CREATE POLICY "CEO mobile read all_sales" ON public.all_sales
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile read properties" ON public.properties;
CREATE POLICY "CEO mobile read properties" ON public.properties
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile read installments" ON public.installments;
CREATE POLICY "CEO mobile read installments" ON public.installments
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile read expenses" ON public.expenses;
CREATE POLICY "CEO mobile read expenses" ON public.expenses
FOR SELECT USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile update appeals" ON public.appeals;
CREATE POLICY "CEO mobile update appeals" ON public.appeals
FOR UPDATE USING (public.is_ceo()) WITH CHECK (public.is_ceo());

DROP POLICY IF EXISTS "CEO mobile update daily_entries" ON public.daily_entries;
CREATE POLICY "CEO mobile update daily_entries" ON public.daily_entries
FOR UPDATE USING (public.is_ceo()) WITH CHECK (public.is_ceo());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'appeals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appeals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'daily_entries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_entries;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'all_sales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.all_sales;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'properties') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.properties;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'installments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.installments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;
END $$;

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

DROP TRIGGER IF EXISTS all_sales_ceo_mobile_push ON public.all_sales;
CREATE TRIGGER all_sales_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.all_sales
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS properties_ceo_mobile_push ON public.properties;
CREATE TRIGGER properties_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS installments_ceo_mobile_push ON public.installments;
CREATE TRIGGER installments_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS expenses_ceo_mobile_push ON public.expenses;
CREATE TRIGGER expenses_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();
