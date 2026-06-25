-- AL SIRAJ DEVELOPERS
-- Preserve expected price, final negotiated deal price, and discount on sales.

ALTER TABLE public.all_sales
  ADD COLUMN IF NOT EXISTS expected_amount_pkr NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deal_amount_pkr NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount_pkr NUMERIC DEFAULT 0;

UPDATE public.all_sales
SET
  expected_amount_pkr = COALESCE(NULLIF(expected_amount_pkr, 0), total_amount_pkr),
  deal_amount_pkr = COALESCE(NULLIF(deal_amount_pkr, 0), total_amount_pkr),
  discount_amount_pkr = COALESCE(
    NULLIF(discount_amount_pkr, 0),
    GREATEST(0, COALESCE(expected_amount_pkr, total_amount_pkr, 0) - COALESCE(deal_amount_pkr, total_amount_pkr, 0))
  )
WHERE expected_amount_pkr IS NULL
   OR expected_amount_pkr = 0
   OR deal_amount_pkr IS NULL
   OR deal_amount_pkr = 0;

NOTIFY pgrst, 'reload schema';
