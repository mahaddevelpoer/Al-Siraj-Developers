-- CEO mobile push notification trigger setup.
-- 1) Deploy supabase/functions/send-ceo-push.
-- 2) Set Edge Function secrets:
--    FIREBASE_SERVICE_ACCOUNT_JSON = full Firebase service account JSON
--    CEO_PUSH_WEBHOOK_SECRET = any strong random string
-- 3) Replace the placeholders below, then run this SQL in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_entries_review_status
  ON public.daily_entries (review_status);

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

DROP POLICY IF EXISTS "Public can create agent registration appeals" ON public.appeals;
CREATE POLICY "Public can create agent registration appeals" ON public.appeals
FOR INSERT WITH CHECK (
  requested_by_role = 'agent'
  AND appeal_type = 'agent_registration'
  AND entity_type = 'agent'
  AND entity_id = requested_by_user_id::text
  AND status = 'pending'
);

CREATE OR REPLACE FUNCTION public.create_agent_registration_appeal(
  p_user_id UUID,
  p_otp_code TEXT,
  p_otp_expires_at TIMESTAMP WITHOUT TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_appeal_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = p_user_id
      AND role = 'agent'
  ) THEN
    RAISE EXCEPTION 'Agent profile not found';
  END IF;

  INSERT INTO public.appeals (
    requested_by_user_id,
    requested_by_role,
    appeal_type,
    entity_type,
    entity_id,
    status,
    otp_code,
    otp_expires_at
  )
  VALUES (
    p_user_id,
    'agent',
    'agent_registration',
    'agent',
    p_user_id::text,
    'pending',
    p_otp_code,
    p_otp_expires_at
  )
  RETURNING id INTO new_appeal_id;

  RETURN jsonb_build_object('id', new_appeal_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_agent_registration_appeal(UUID, TEXT, TIMESTAMP WITHOUT TIME ZONE) TO anon, authenticated;

DROP POLICY IF EXISTS "CEO mobile update daily_entries" ON public.daily_entries;
CREATE POLICY "CEO mobile update daily_entries" ON public.daily_entries
FOR UPDATE USING (public.is_ceo()) WITH CHECK (public.is_ceo());

CREATE OR REPLACE FUNCTION public.ceo_review_appeal(appeal_id UUID, new_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  appeal_row public.appeals%ROWTYPE;
  rd JSONB;
  new_entry_id TEXT;
BEGIN
  IF NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Only CEO can review appeals';
  END IF;

  IF new_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: %', new_status;
  END IF;

  SELECT * INTO appeal_row
  FROM public.appeals
  WHERE id = appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found';
  END IF;

  UPDATE public.appeals
  SET status = new_status,
      reviewed_at = NOW(),
      reviewed_by_user_id = auth.uid(),
      otp_code = NULL,
      otp_expires_at = NULL
  WHERE id = appeal_id;

  IF new_status = 'approved' AND appeal_row.appeal_type = 'agent_registration' THEN
    UPDATE public.users
    SET is_active = TRUE,
        updated_at = NOW()
    WHERE id = appeal_row.requested_by_user_id;
  END IF;

  IF new_status = 'approved'
     AND appeal_row.appeal_type IN ('backdated_daily_entry', 'future_daily_entry') THEN
    rd := COALESCE(appeal_row.requested_data, '{}'::jsonb);
    new_entry_id := 'MOB-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.daily_entries (
      entry_id,
      town_name,
      date,
      type,
      category,
      amount,
      description,
      reference,
      created_by,
      review_status,
      reviewed_by,
      reviewed_at
    )
    VALUES (
      new_entry_id,
      COALESCE(rd->>'townName', rd->>'Town_Name', rd->>'town_name', ''),
      COALESCE(NULLIF(rd->>'date', ''), CURRENT_DATE::text)::date,
      COALESCE(rd->>'type', rd->>'Type', 'Expense'),
      COALESCE(rd->>'category', rd->>'Category', ''),
      COALESCE(NULLIF(rd->>'amount', ''), '0')::numeric,
      COALESCE(rd->>'description', rd->>'Description', ''),
      appeal_row.id::text,
      'CEO Mobile',
      'approved',
      auth.uid(),
      NOW()
    )
    ON CONFLICT (entry_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'status', new_status,
    'appeal_id', appeal_id,
    'message', CASE
      WHEN new_status = 'approved' THEN 'approved'
      ELSE 'rejected'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_review_appeal(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ceo_review_daily_entry(entry_uuid UUID, new_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entry_row public.daily_entries%ROWTYPE;
BEGIN
  IF NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Only CEO can review daily entries';
  END IF;

  IF new_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: %', new_status;
  END IF;

  SELECT * INTO entry_row
  FROM public.daily_entries
  WHERE id = entry_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily entry not found';
  END IF;

  UPDATE public.daily_entries
  SET review_status = new_status,
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      rejection_reason = CASE
        WHEN new_status = 'approved' THEN NULL
        ELSE COALESCE(rejection_reason, 'Rejected from CEO mobile app')
      END
  WHERE id = entry_uuid;

  RETURN jsonb_build_object(
    'success', TRUE,
    'status', new_status,
    'entry_id', entry_uuid,
    'message', CASE
      WHEN new_status = 'approved' THEN 'approved'
      ELSE 'rejected'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_review_daily_entry(UUID, TEXT) TO authenticated;

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
  'https://wdislbdftnwmaexqtfmn.functions.supabase.co/send-ceo-push',
  COALESCE((SELECT webhook_secret FROM public.ceo_push_config WHERE id = TRUE), 'REPLACE_WITH_CEO_PUSH_WEBHOOK_SECRET')
)
ON CONFLICT (id) DO UPDATE SET
  function_url = EXCLUDED.function_url,
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
      'authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc',
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
AFTER INSERT ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

-- Android push must stay appeal-only. notifications/daily_entries are fetched
-- inside the app, but they should not create separate FCM banners.
DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;

DROP TRIGGER IF EXISTS all_sales_ceo_mobile_push ON public.all_sales;
DROP TRIGGER IF EXISTS properties_ceo_mobile_push ON public.properties;
DROP TRIGGER IF EXISTS installments_ceo_mobile_push ON public.installments;
DROP TRIGGER IF EXISTS expenses_ceo_mobile_push ON public.expenses;

NOTIFY pgrst, 'reload schema';
