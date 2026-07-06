-- =============================================================
-- CEO MOBILE APPEALS — COMPLETE FIX
-- Run ALL of this in Supabase SQL Editor (one shot)
-- =============================================================
-- Problem: Appeals appear in CEO desktop app but NOT in CEO mobile app.
-- Root causes this fixes:
--   1. Missing town_name column on appeals table
--   2. Missing ceo_mobile_is_ceo() helper
--   3. Missing ceo_mobile_get_appeals() RPC (bypasses RLS)
--   4. Missing or broken ceo_mobile_review_inbox() RPC
--   5. Missing RLS policies for CEO mobile access
--   6. Missing indexes for performance
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: Ensure appeals table has all required columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS town_name TEXT;

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS requested_data JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID;

-- Ensure users table has CEO-identifying columns
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS town_name TEXT;

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: Create indexes for performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ceo_mobile_appeals_status_created
  ON public.appeals (lower(status), created_at DESC);

CREATE INDEX IF NOT EXISTS appeals_town_status_created_idx
  ON public.appeals (town_name, status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: Enable RLS (idempotent)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: Create ceo_mobile_is_ceo() helper
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ceo_mobile_is_ceo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND lower(coalesce(u.role, '')) = 'ceo'
      AND coalesce(u.is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_is_ceo() TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- STEP 5: RLS policies for CEO mobile access to appeals
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "CEO mobile read appeals inbox" ON public.appeals;
CREATE POLICY "CEO mobile read appeals inbox"
ON public.appeals
FOR SELECT
TO authenticated
USING (public.ceo_mobile_is_ceo());

DROP POLICY IF EXISTS "CEO mobile update appeals inbox" ON public.appeals;
CREATE POLICY "CEO mobile update appeals inbox"
ON public.appeals
FOR UPDATE
TO authenticated
USING (public.ceo_mobile_is_ceo())
WITH CHECK (public.ceo_mobile_is_ceo());

-- ═══════════════════════════════════════════════════════════════
-- STEP 6: ceo_mobile_get_appeals() — RLS-bypass RPC for appeals
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.ceo_mobile_get_appeals(text, integer);

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
  FROM (
    SELECT *
    FROM public.appeals
    WHERE CASE
      WHEN lower(coalesce(status, 'pending')) IN ('approved', 'rejected') THEN lower(status)
      ELSE 'pending'
    END = wanted_status
    ORDER BY created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 60), 200))
  ) a
  LEFT JOIN public.users u ON u.id = a.requested_by_user_id;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_get_appeals(text, integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- STEP 7: ceo_mobile_review_inbox() — unified inbox (appeals + daily entries)
-- ═══════════════════════════════════════════════════════════════

-- Ensure daily_entries has required columns
ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved';

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS account_type TEXT;

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS "time" TEXT;

CREATE INDEX IF NOT EXISTS idx_ceo_mobile_daily_entries_review_created
  ON public.daily_entries (lower(review_status), created_at DESC);

ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO mobile read daily entries inbox" ON public.daily_entries;
CREATE POLICY "CEO mobile read daily entries inbox"
ON public.daily_entries
FOR SELECT
TO authenticated
USING (public.ceo_mobile_is_ceo());

DROP POLICY IF EXISTS "CEO mobile update daily entries inbox" ON public.daily_entries;
CREATE POLICY "CEO mobile update daily entries inbox"
ON public.daily_entries
FOR UPDATE
TO authenticated
USING (public.ceo_mobile_is_ceo())
WITH CHECK (public.ceo_mobile_is_ceo());

DROP FUNCTION IF EXISTS public.ceo_mobile_review_inbox(text, integer);

CREATE OR REPLACE FUNCTION public.ceo_mobile_review_inbox(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  id uuid,
  entry_id text,
  appeal_type text,
  status text,
  created_at timestamptz,
  town_name text,
  requested_data jsonb,
  requested_by_user_id jsonb,
  reason text,
  review_kind text,
  date text,
  type text,
  category text,
  amount numeric,
  description text,
  account_type text,
  "time" text
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
  IF NOT public.ceo_mobile_is_ceo() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      a.id,
      NULL::text AS entry_id,
      coalesce(a.appeal_type, 'business_appeal')::text AS appeal_type,
      CASE
        WHEN lower(coalesce(a.status, 'pending')) IN ('approved', 'rejected') THEN lower(a.status)
        ELSE 'pending'
      END AS status,
      a.created_at,
      coalesce(
        nullif(a.town_name, ''),
        nullif(a.requested_data->>'town_name', ''),
        nullif(a.requested_data->>'Town_Name', ''),
        nullif(u.town_name, ''),
        'No town'
      )::text AS town_name,
      coalesce(a.requested_data, '{}'::jsonb) AS requested_data,
      jsonb_build_object(
        'id', u.id,
        'full_name', coalesce(u.full_name, u.email, 'Accountant'),
        'email', u.email,
        'town_name', u.town_name
      ) AS requested_by_user_id,
      coalesce(a.reason, '')::text AS reason,
      'appeal'::text AS review_kind,
      NULL::text AS date,
      NULL::text AS type,
      NULL::text AS category,
      NULL::numeric AS amount,
      NULL::text AS description,
      NULL::text AS account_type,
      NULL::text AS "time"
    FROM public.appeals a
    LEFT JOIN public.users u ON u.id = a.requested_by_user_id
    WHERE CASE
        WHEN lower(coalesce(a.status, 'pending')) IN ('approved', 'rejected') THEN lower(a.status)
        ELSE 'pending'
      END = wanted_status

    UNION ALL

    SELECT
      d.id,
      d."Entry_ID"::text AS entry_id,
      'daily_entry_review'::text AS appeal_type,
      CASE
        WHEN lower(coalesce(d.review_status, 'approved')) IN ('pending', 'approved', 'rejected')
          THEN lower(d.review_status)
        ELSE 'approved'
      END AS status,
      d.created_at,
      coalesce(nullif(d."Town_Name", ''), 'No town')::text AS town_name,
      jsonb_build_object(
        'town_name', d."Town_Name",
        'type', d."Type",
        'category', d."Category",
        'amount', d."Amount",
        'date', d."Date",
        'description', d."Description",
        'account_type', d.account_type,
        'time', d."time"
      ) AS requested_data,
      '{}'::jsonb AS requested_by_user_id,
      coalesce(d."Description", '')::text AS reason,
      'dailyEntry'::text AS review_kind,
      d."Date"::text AS date,
      d."Type"::text AS type,
      d."Category"::text AS category,
      d."Amount"::numeric AS amount,
      d."Description"::text AS description,
      d.account_type::text AS account_type,
      d."time"::text AS "time"
    FROM public.daily_entries d
    WHERE CASE
        WHEN lower(coalesce(d.review_status, 'approved')) IN ('pending', 'approved', 'rejected')
          THEN lower(d.review_status)
        ELSE 'approved'
      END = wanted_status
  ) inbox
  ORDER BY inbox.created_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 40), 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_review_inbox(text, integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- STEP 8: Diagnostic helper
-- ═══════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════
-- STEP 9: Reload PostgREST schema so new functions are visible
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- =============================================================
-- VERIFICATION QUERIES (run these after deploying):
-- =============================================================
-- 1. Check if functions exist:
--    SELECT proname FROM pg_proc WHERE proname LIKE 'ceo_mobile%' ORDER BY proname;
--
-- 2. Check appeals count:
--    SELECT status, count(*) FROM public.appeals GROUP BY status;
--
-- 3. Check CEO user:
--    SELECT id, email, role, is_active FROM public.users WHERE role = 'ceo';
--
-- 4. Test the RPC directly:
--    SELECT * FROM public.ceo_mobile_get_appeals('pending', 10);
--
-- 5. Test the unified inbox:
--    SELECT * FROM public.ceo_mobile_review_inbox('pending', 40);
--
-- 6. Diagnose auth (must be run as the CEO auth user):
--    SELECT * FROM public.ceo_mobile_diagnose_auth();
-- =============================================================
