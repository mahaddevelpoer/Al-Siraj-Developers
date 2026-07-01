-- ============================================================
-- Accountant business appeals RLS fix
-- Run this once in Supabase SQL Editor if accountant sees:
-- "new row violates row-level security policy for table appeals"
--
-- Safe/idempotent: no data is deleted.
-- Allows an authenticated active accountant to create pending appeals
-- only for their assigned town. CEO can also create business appeals.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS town_name TEXT,
  ADD COLUMN IF NOT EXISTS town_id TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE public.appeals
  ADD COLUMN IF NOT EXISTS town_name TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requested_data JSONB,
  ADD COLUMN IF NOT EXISTS original_data JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE public.daily_entries
  ADD COLUMN IF NOT EXISTS "Time" TEXT,
  ADD COLUMN IF NOT EXISTS "Payment_Account_ID" TEXT DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS "Payment_Account_Name" TEXT DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS "Payment_Account_Type" TEXT DEFAULT 'cash';

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

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

CREATE OR REPLACE FUNCTION public.can_create_business_appeal(
  p_requested_by UUID,
  p_requested_role TEXT,
  p_appeal_type TEXT,
  p_town_name TEXT,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() = p_requested_by
    AND COALESCE(p_status, 'pending') = 'pending'
    AND COALESCE(p_appeal_type, '') <> 'agent_registration'
    AND COALESCE(NULLIF(BTRIM(p_town_name), ''), '') <> ''
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND (
          u.role = 'ceo'
          OR (
            u.role = 'accountant'
            AND LOWER(BTRIM(COALESCE(u.town_name, ''))) = LOWER(BTRIM(COALESCE(p_town_name, '')))
          )
        )
    );
$$;

DROP POLICY IF EXISTS "Accountant can create own town appeals" ON public.appeals;
CREATE POLICY "Accountant can create own town appeals" ON public.appeals
FOR INSERT TO authenticated
WITH CHECK (
  public.can_create_business_appeal(
    requested_by_user_id,
    requested_by_role,
    appeal_type,
    town_name,
    status
  )
);

DROP POLICY IF EXISTS "CEO review read appeals" ON public.appeals;
CREATE POLICY "CEO review read appeals" ON public.appeals
FOR SELECT TO authenticated
USING (
  public.is_ceo()
  OR auth.uid() = requested_by_user_id
);

DROP POLICY IF EXISTS "CEO review update appeals" ON public.appeals;
CREATE POLICY "CEO review update appeals" ON public.appeals
FOR UPDATE TO authenticated
USING (public.is_ceo())
WITH CHECK (public.is_ceo());

CREATE OR REPLACE FUNCTION public.create_business_appeal(
  p_requested_by_user_id UUID,
  p_requested_by_role TEXT,
  p_appeal_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_town_name TEXT,
  p_original_data JSONB DEFAULT NULL,
  p_requested_data JSONB DEFAULT '{}'::jsonb,
  p_reason TEXT DEFAULT '',
  p_otp_code TEXT DEFAULT NULL,
  p_otp_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS public.appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_row public.appeals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_requested_by_user_id THEN
    RAISE EXCEPTION 'You can only create your own appeal';
  END IF;

  IF COALESCE(NULLIF(BTRIM(p_town_name), ''), '') = '' THEN
    RAISE EXCEPTION 'Town name is required for appeal';
  END IF;

  IF NOT public.can_create_business_appeal(
    p_requested_by_user_id,
    p_requested_by_role,
    p_appeal_type,
    p_town_name,
    'pending'
  ) THEN
    RAISE EXCEPTION 'Appeal not allowed for this user/town';
  END IF;

  INSERT INTO public.appeals (
    requested_by_user_id,
    requested_by_role,
    appeal_type,
    entity_type,
    entity_id,
    town_name,
    original_data,
    requested_data,
    reason,
    status,
    otp_code,
    otp_expires_at,
    created_at
  )
  VALUES (
    p_requested_by_user_id,
    COALESCE(NULLIF(BTRIM(p_requested_by_role), ''), 'accountant'),
    p_appeal_type,
    p_entity_type,
    p_entity_id,
    p_town_name,
    p_original_data,
    COALESCE(p_requested_data, '{}'::jsonb),
    p_reason,
    'pending',
    p_otp_code,
    p_otp_expires_at,
    NOW()
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_business_appeal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TIMESTAMP WITH TIME ZONE
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_business_appeal_otp(
  p_appeal_id UUID,
  p_otp_code TEXT,
  p_otp_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS public.appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.appeals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Login is required';
  END IF;

  UPDATE public.appeals
  SET
    otp_code = p_otp_code,
    otp_expires_at = p_otp_expires_at
  WHERE id = p_appeal_id
    AND (requested_by_user_id = auth.uid() OR public.is_ceo())
    AND status = 'pending'
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found or OTP update is not allowed';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_business_appeal_otp(
  UUID, TEXT, TIMESTAMP WITH TIME ZONE
) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_business_appeal_otp(
  p_appeal_id UUID,
  p_otp_code TEXT
)
RETURNS public.appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.appeals%ROWTYPE;
  updated_row public.appeals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Login is required';
  END IF;

  SELECT * INTO current_row
  FROM public.appeals
  WHERE id = p_appeal_id
    AND requested_by_user_id = auth.uid()
    AND status = 'pending'
    AND COALESCE(appeal_type, '') <> 'agent_registration';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found or already reviewed';
  END IF;

  IF COALESCE(NULLIF(BTRIM(current_row.otp_code), ''), '') = '' THEN
    RAISE EXCEPTION 'OTP not generated yet';
  END IF;

  IF current_row.otp_expires_at IS NOT NULL AND current_row.otp_expires_at < NOW() THEN
    RAISE EXCEPTION 'OTP expired';
  END IF;

  IF BTRIM(current_row.otp_code) <> BTRIM(COALESCE(p_otp_code, '')) THEN
    RAISE EXCEPTION 'Incorrect OTP';
  END IF;

  UPDATE public.appeals
  SET
    status = 'approved',
    otp_code = NULL,
    reviewed_at = NOW()
  WHERE id = p_appeal_id
  RETURNING * INTO updated_row;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_business_appeal_otp(
  UUID, TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';
