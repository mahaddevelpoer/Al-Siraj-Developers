-- CEO mobile: bypass-all RPC for appeals (SECURITY DEFINER, no RLS).
-- Use ONLY if normal SELECT queries fail on mobile but succeed on desktop.
-- This proves whether the issue is RLS/auth or something else.

CREATE OR REPLACE FUNCTION public.ceo_mobile_get_appeals(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 60
)
RETURNS jsonb
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
  result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'status', a.status,
      'appeal_type', a.appeal_type,
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'town_name', COALESCE(nullif(a.town_name, ''), 'No town'),
      'reason', a.reason,
      'requested_data', COALESCE(a.requested_data, '{}'::jsonb),
      'created_at', a.created_at,
      'requested_by_user_id', jsonb_build_object(
        'id', u.id,
        'full_name', COALESCE(u.full_name, u.email, 'Accountant'),
        'email', u.email,
        'town_name', u.town_name
      ),
      'otp_code', a.otp_code,
      'otp_expires_at', a.otp_expires_at,
      'reviewed_at', a.reviewed_at,
      'reviewed_by_user_id', a.reviewed_by_user_id,
      'review_kind', 'appeal'
    )
    ORDER BY a.created_at DESC
  ) INTO result
  FROM public.appeals a
  LEFT JOIN public.users u ON u.id = a.requested_by_user_id
  WHERE CASE
    WHEN lower(coalesce(a.status, 'pending')) IN ('approved', 'rejected') THEN lower(a.status)
    ELSE 'pending'
  END = wanted_status;

  RETURN COALESCE(result, '[]'::jsonb);
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
