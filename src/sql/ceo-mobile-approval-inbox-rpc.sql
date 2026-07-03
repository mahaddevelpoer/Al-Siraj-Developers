-- CEO mobile pending/approved/rejected inbox repair.
-- Run this once in Supabase SQL Editor.
-- Purpose:
-- 1. Give CEO app one lightweight RPC for approvals instead of heavy/raw table reads.
-- 2. Avoid RLS/query-shape issues that can make the Pending tab blank or slow.
-- 3. Keep pending rows pending until CEO approves/rejects.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS town_name text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE IF EXISTS public.appeals
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS town_name text,
  ADD COLUMN IF NOT EXISTS requested_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid;

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS time text;

UPDATE public.appeals
SET status = 'pending'
WHERE status IS NULL OR btrim(status) = '';

UPDATE public.daily_entries
SET review_status = 'approved'
WHERE review_status IS NULL OR btrim(review_status) = '';

CREATE INDEX IF NOT EXISTS idx_ceo_mobile_appeals_status_created
  ON public.appeals (lower(status), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ceo_mobile_daily_entries_review_created
  ON public.daily_entries (lower(review_status), created_at DESC);

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

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;

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
  time text
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
      NULL::text AS time
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
        'time', d.time
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
      d.time::text AS time
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

-- Quick test after running:
-- SELECT * FROM public.ceo_mobile_review_inbox('pending', 40);

NOTIFY pgrst, 'reload schema';
