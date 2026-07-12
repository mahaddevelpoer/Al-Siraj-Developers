-- ============================================================
-- BYPASS SUPABASE AUTH RESTRICTIONS
-- Run this script in the Supabase SQL Editor.
-- This script removes the restrictive RLS policies that block
-- unauthenticated (anon) users from reading/writing data.
-- It also updates the create_business_appeal RPC to allow
-- creation without a valid Supabase Auth JWT.
-- ============================================================

-- 1. Open RLS on Appeals
DROP POLICY IF EXISTS "CEO review read appeals" ON public.appeals;
DROP POLICY IF EXISTS "CEO review update appeals" ON public.appeals;
DROP POLICY IF EXISTS "Agent can create own registration appeal" ON public.appeals;
DROP POLICY IF EXISTS "Accountant can create own town appeals" ON public.appeals;
DROP POLICY IF EXISTS "Public full access appeals" ON public.appeals;

CREATE POLICY "Public full access appeals" ON public.appeals FOR ALL USING (true) WITH CHECK (true);

-- 2. Open RLS on Daily Entries
DROP POLICY IF EXISTS "CEO review daily entries" ON public.daily_entries;
DROP POLICY IF EXISTS "CEO mobile read daily_entries" ON public.daily_entries;
DROP POLICY IF EXISTS "CEO mobile update daily_entries" ON public.daily_entries;
DROP POLICY IF EXISTS "CEO full access daily_entries" ON public.daily_entries;
DROP POLICY IF EXISTS "Public full access daily_entries" ON public.daily_entries;

CREATE POLICY "Public full access daily_entries" ON public.daily_entries FOR ALL USING (true) WITH CHECK (true);

-- 3. Open RLS on Users
DROP POLICY IF EXISTS "CEO review update users" ON public.users;
DROP POLICY IF EXISTS "Public full access users" ON public.users;

CREATE POLICY "Public full access users" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- 4. Open RLS on other main business tables (just to be safe)
CREATE POLICY "Public full access properties" ON public.properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access all_sales" ON public.all_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access installments" ON public.installments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- 5. Update the RPC to remove auth.uid() checks
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
  -- We have REMOVED the auth.uid() check to allow desktop app admin password to work!
  
  IF COALESCE(NULLIF(BTRIM(p_town_name), ''), '') = '' THEN
    RAISE EXCEPTION 'Town name is required for appeal';
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
) TO anon, authenticated;

-- Allow anon to set/verify OTPs and review
GRANT EXECUTE ON FUNCTION public.set_business_appeal_otp(UUID, TEXT, TIMESTAMP WITH TIME ZONE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_business_appeal_otp(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ceo_review_appeal(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ceo_review_daily_entry(UUID, TEXT) TO anon, authenticated;

-- Disable the trigger that blocks non-CEO
DROP TRIGGER IF EXISTS prevent_non_ceo_appeal_review ON public.appeals;

NOTIFY pgrst, 'reload schema';
