-- AL SIRAJ DEVELOPERS
-- Adds explicit debit/credit account columns to the central money ledger.

ALTER TABLE public.money_ledger
  ADD COLUMN IF NOT EXISTS debit_account TEXT,
  ADD COLUMN IF NOT EXISTS credit_account TEXT;

UPDATE public.money_ledger
SET
  debit_account = COALESCE(
    NULLIF(debit_account, ''),
    CASE
      WHEN direction = 'income' THEN 'Cash / Bank'
      WHEN source_type ILIKE '%salary%' THEN 'Salary Expense'
      WHEN source_type ILIKE '%commission%' THEN 'Commission Expense'
      WHEN source_type ILIKE '%construction%' THEN 'Construction Expense'
      WHEN source_type ILIKE '%investor%' THEN 'Investor Withdrawal'
      WHEN source_type ILIKE '%expense%' THEN 'Operating Expense'
      ELSE INITCAP(REPLACE(COALESCE(source_type, 'general'), '_', ' '))
    END
  ),
  credit_account = COALESCE(
    NULLIF(credit_account, ''),
    CASE
      WHEN direction = 'expense' THEN 'Cash / Bank'
      WHEN source_type ILIKE '%sale%' OR source_type ILIKE '%collection%' OR source_type ILIKE '%installment%' THEN 'Property Revenue'
      WHEN source_type ILIKE '%investor%' THEN 'Investor Capital'
      WHEN source_type ILIKE '%daily%' THEN 'Daily Income'
      ELSE INITCAP(REPLACE(COALESCE(source_type, 'general'), '_', ' '))
    END
  )
WHERE debit_account IS NULL
   OR debit_account = ''
   OR credit_account IS NULL
   OR credit_account = '';

NOTIFY pgrst, 'reload schema';
