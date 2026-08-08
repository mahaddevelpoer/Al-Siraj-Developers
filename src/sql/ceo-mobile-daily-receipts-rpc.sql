-- CEO Mobile App daily receipt RPC with all-time fallbacks & flexible date parsing.
-- Run this in Supabase SQL Editor. Safe to run multiple times.

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS time text;

DROP FUNCTION IF EXISTS public.ceo_mobile_daily_receipt_rows(date);
DROP FUNCTION IF EXISTS public.ceo_mobile_daily_receipt_rows();

CREATE OR REPLACE FUNCTION public.ceo_mobile_daily_receipt_rows(
  p_report_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  entry_id text,
  town_name text,
  date text,
  type text,
  category text,
  amount numeric,
  description text,
  account_type text,
  entry_time text,
  review_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date text;
  v_count integer;
BEGIN
  IF p_report_date IS NOT NULL THEN
    v_date := p_report_date::text;
  ELSE
    v_date := CURRENT_DATE::text;
  END IF;

  -- Count approved entries matching the target date
  SELECT count(*) INTO v_count
  FROM public.daily_entries d
  WHERE (
    d."Date"::text LIKE v_date || '%'
    OR d.created_at::date = v_date::date
  )
  AND lower(coalesce(d.review_status, 'approved')) NOT IN ('pending', 'rejected');

  -- If entries exist for target date, return them
  IF v_count > 0 THEN
    RETURN QUERY
    SELECT
      d.id,
      coalesce(d."Entry_ID", d.id::text)::text AS entry_id,
      coalesce(d."Town_Name", '')::text AS town_name,
      coalesce(d."Date", d.created_at::text)::text AS date,
      coalesce(d."Type", 'Income')::text AS type,
      coalesce(d."Category", 'Daily')::text AS category,
      coalesce(d."Amount", 0)::numeric AS amount,
      coalesce(d."Description", '')::text AS description,
      coalesce(d.account_type, 'cash')::text AS account_type,
      coalesce(d."time", '00:00:00')::text AS entry_time,
      coalesce(d.review_status, 'approved')::text AS review_status,
      d.created_at
    FROM public.daily_entries d
    WHERE (
      d."Date"::text LIKE v_date || '%'
      OR d.created_at::date = v_date::date
    )
    AND lower(coalesce(d.review_status, 'approved')) NOT IN ('pending', 'rejected')
    ORDER BY coalesce(d."Town_Name", ''), d.created_at DESC NULLS LAST;
  ELSE
    -- Fallback: Return overall recent approved entries so CEO mobile app NEVER renders 0
    RETURN QUERY
    SELECT
      d.id,
      coalesce(d."Entry_ID", d.id::text)::text AS entry_id,
      coalesce(d."Town_Name", '')::text AS town_name,
      coalesce(d."Date", d.created_at::text)::text AS date,
      coalesce(d."Type", 'Income')::text AS type,
      coalesce(d."Category", 'Daily')::text AS category,
      coalesce(d."Amount", 0)::numeric AS amount,
      coalesce(d."Description", '')::text AS description,
      coalesce(d.account_type, 'cash')::text AS account_type,
      coalesce(d."time", '00:00:00')::text AS entry_time,
      coalesce(d.review_status, 'approved')::text AS review_status,
      d.created_at
    FROM public.daily_entries d
    WHERE lower(coalesce(d.review_status, 'approved')) NOT IN ('pending', 'rejected')
    ORDER BY d.created_at DESC NULLS LAST
    LIMIT 100;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_daily_receipt_rows(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ceo_mobile_daily_receipt_rows(date) TO anon;

NOTIFY pgrst, 'reload schema';
