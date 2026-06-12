-- ============================================================
-- CEO review schema repair
-- Run once in Supabase SQL Editor when appeal/daily-entry review
-- shows PGRST204 or missing-column schema errors.
-- Existing data is preserved.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_ceo()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'ceo'
      AND COALESCE(is_active, TRUE) = TRUE
  );
$$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS agent_town VARCHAR(255),
  ADD COLUMN IF NOT EXISTS agent_towns TEXT,
  ADD COLUMN IF NOT EXISTS agent_license_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.appeals
  ADD COLUMN IF NOT EXISTS requested_data JSONB,
  ADD COLUMN IF NOT EXISTS original_data JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS contact_requested BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_appeals_status_created
  ON public.appeals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appeals_agent_registration
  ON public.appeals (appeal_type, status)
  WHERE appeal_type = 'agent_registration';

CREATE INDEX IF NOT EXISTS idx_daily_entries_review_status
  ON public.daily_entries (review_status);

CREATE INDEX IF NOT EXISTS idx_daily_entries_date
  ON public.daily_entries (Date DESC);

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO review read appeals" ON public.appeals;
CREATE POLICY "CEO review read appeals" ON public.appeals
FOR SELECT USING (
  public.is_ceo()
  OR auth.uid() = requested_by_user_id
);

DROP POLICY IF EXISTS "CEO review update appeals" ON public.appeals;
CREATE POLICY "CEO review update appeals" ON public.appeals
FOR UPDATE USING (public.is_ceo()) WITH CHECK (public.is_ceo());

DROP POLICY IF EXISTS "Agent can create own registration appeal" ON public.appeals;
CREATE POLICY "Agent can create own registration appeal" ON public.appeals
FOR INSERT WITH CHECK (
  requested_by_role = 'agent'
  AND appeal_type = 'agent_registration'
  AND entity_type = 'agent'
  AND entity_id = requested_by_user_id::text
  AND status = 'pending'
);

DROP POLICY IF EXISTS "CEO review daily entries" ON public.daily_entries;
CREATE POLICY "CEO review daily entries" ON public.daily_entries
FOR ALL USING (public.is_ceo()) WITH CHECK (public.is_ceo());

DROP POLICY IF EXISTS "CEO review update users" ON public.users;
CREATE POLICY "CEO review update users" ON public.users
FOR UPDATE USING (public.is_ceo() OR auth.uid() = id)
WITH CHECK (public.is_ceo() OR auth.uid() = id);

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
  ON CONFLICT (requested_by_user_id, entity_id, appeal_type)
  DO UPDATE SET
    status = 'pending',
    otp_code = EXCLUDED.otp_code,
    otp_expires_at = EXCLUDED.otp_expires_at,
    reviewed_at = NULL,
    reviewed_by_user_id = NULL
  RETURNING id INTO new_appeal_id;

  RETURN jsonb_build_object('success', TRUE, 'id', new_appeal_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_agent_registration_appeal(UUID, TEXT, TIMESTAMP WITHOUT TIME ZONE) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ceo_review_appeal(appeal_id UUID, new_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appeal_row public.appeals%ROWTYPE;
  rd JSONB;
  new_entry_id TEXT;
BEGIN
  IF NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Only CEO can review appeals';
  END IF;

  new_status := lower(trim(new_status));
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

  IF COALESCE(appeal_row.status, 'pending') <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'status', appeal_row.status,
      'appeal_id', appeal_id,
      'message', 'already ' || appeal_row.status
    );
  END IF;

  UPDATE public.appeals
  SET status = new_status,
      reviewed_at = NOW(),
      reviewed_by_user_id = auth.uid(),
      otp_code = NULL,
      otp_expires_at = NULL
  WHERE id = appeal_id;

  IF appeal_row.appeal_type = 'agent_registration' THEN
    UPDATE public.users
    SET is_active = (new_status = 'approved'),
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
      'CEO Review',
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
    'message', CASE WHEN new_status = 'approved' THEN 'approved' ELSE 'rejected' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_review_appeal(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ceo_review_daily_entry(entry_uuid UUID, new_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entry_row public.daily_entries%ROWTYPE;
BEGIN
  IF NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Only CEO can review daily entries';
  END IF;

  new_status := lower(trim(new_status));
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
        ELSE COALESCE(rejection_reason, 'Rejected from CEO review')
      END
  WHERE id = entry_uuid;

  RETURN jsonb_build_object(
    'success', TRUE,
    'status', new_status,
    'entry_id', entry_uuid,
    'message', CASE WHEN new_status = 'approved' THEN 'approved' ELSE 'rejected' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_review_daily_entry(UUID, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appeals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appeals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_entries;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
