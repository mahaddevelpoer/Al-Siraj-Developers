-- Optional fast path for CEO Android daily receipt screen.
-- App still has direct-table and memory-cache fallbacks if this RPC is not installed.

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS time text;

DROP FUNCTION IF EXISTS public.ceo_mobile_daily_receipt_rows(date);

CREATE OR REPLACE FUNCTION public.ceo_mobile_daily_receipt_rows(
  p_report_date date DEFAULT CURRENT_DATE
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
BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.users u
       WHERE u.id = auth.uid()
         AND lower(coalesce(u.role, '')) = 'ceo'
         AND coalesce(u.is_active, true) = true
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d."Entry_ID"::text AS entry_id,
    d."Town_Name"::text AS town_name,
    d."Date"::text AS date,
    d."Type"::text AS type,
    d."Category"::text AS category,
    d."Amount"::numeric AS amount,
    d."Description"::text AS description,
    d.account_type::text AS account_type,
    d."time"::text AS entry_time,
    coalesce(d.review_status, 'approved')::text AS review_status,
    d.created_at
  FROM public.daily_entries d
  WHERE d."Date" = p_report_date
    AND lower(coalesce(d.review_status, 'approved')) NOT IN ('pending', 'rejected')
  ORDER BY d."Town_Name", d.created_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_mobile_daily_receipt_rows(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
