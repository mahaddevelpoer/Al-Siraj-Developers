-- CEO mobile: bypass-all RPC for appeals (SECURITY DEFINER, no RLS).
-- Use ONLY if normal SELECT queries fail on mobile but succeed on desktop.
-- This proves whether the issue is RLS/auth or something else.

CREATE OR REPLACE FUNCTION public.ceo_mobile_get_appeals(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  status text,
  appeal_type text,
  entity_type text,
  entity_id text,
  town_name text,
  reason text,
  requested_data jsonb,
  created_at timestamptz,
  requested_by_user_id jsonb,
  otp_code text,
  otp_expires_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  review_kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wanted_status text := CASE
    WHEN lower(coalesce(p_status, 'pending')) IN ('approved', 'rejected') THEN lower(p_status)
    ELSE 'pending'
  END;
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.status,
    a.appeal_type,
    a.entity_type,
    a.entity_id,
    COALESCE(nullif(a.town_name, ''), 'No town')::text AS town_name,
    a.reason,
    COALESCE(a.requested_data, '{}'::jsonb) AS requested_data,
    a.created_at,
    jsonb_build_object(
      'id', u.id,
      'full_name', COALESCE(u.full_name, u.email, 'Accountant'),
      'email', u.email,
      'town_name', u.town_name
    ) AS requested_by_user_id,
    a.otp_code,
    a.otp_expires_at,
    a.reviewed_at,
    a.reviewed_by_user_id,
    'appeal'::text AS review_kind
  FROM public.appeals a
  LEFT JOIN public.users u ON u.id = a.requested_by_user_id
  WHERE CASE
    WHEN lower(coalesce(a.status, 'pending')) IN ('approved', 'rejected') THEN lower(a.status)
    ELSE 'pending'
  END = wanted_status
  ORDER BY a.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 60), 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_get_appeals(text, integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- DIAGNOSTIC: call this from Supabase SQL Editor to check auth state
-- ═══════════════════════════════════════════════════════════════
-- SELECT * FROM public.ceo_mobile_get_appeals('pending', 10);
-- SELECT public.ceo_mobile_diagnose_auth();

CREATE OR REPLACE FUNCTION public.ceo_mobile_diagnose_auth()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'uid', auth.uid(),
    'uid_text', auth.uid()::text,
    'has_uid', auth.uid() IS NOT NULL,
    'role_in_db', (SELECT role FROM public.users WHERE id = auth.uid()),
    'is_ceo', (SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo' AND COALESCE(is_active, true) = true)),
    'is_active', (SELECT is_active FROM public.users WHERE id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_diagnose_auth() TO authenticated;
