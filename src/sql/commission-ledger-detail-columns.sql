-- AL SIRAJ DEVELOPERS
-- Preserve manual town-agent commission ledgers and partial payments in cloud.

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_paid_at TIMESTAMPTZ;

UPDATE public.commissions
SET
  paid_amount = COALESCE(paid_amount, 0),
  remaining_amount = CASE
    WHEN remaining_amount IS NULL OR remaining_amount = 0
      THEN GREATEST(0, COALESCE(commission_amount, 0) - COALESCE(paid_amount, 0))
    ELSE remaining_amount
  END
WHERE paid_amount IS NULL
   OR remaining_amount IS NULL
   OR remaining_amount = 0;

NOTIFY pgrst, 'reload schema';
