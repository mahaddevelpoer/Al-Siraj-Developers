-- AL SIRAJ DEVELOPERS
-- Preserve detailed employee salary ledger fields in Supabase.

ALTER TABLE public.salary_records
  ADD COLUMN IF NOT EXISTS Advance_Deduction NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS New_Advance_Given NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Salary_Amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Salary_Gross_Amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Cash_Disbursed_Amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Salary_Paid_Amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Salary_Paid_Before NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Salary_Paid_After NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Salary_Remaining_After NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS Is_Advance_Salary VARCHAR(10) DEFAULT 'No';

DO $$
BEGIN
  IF to_regclass('public.salary_payments') IS NOT NULL THEN
    ALTER TABLE public.salary_payments
      ADD COLUMN IF NOT EXISTS Advance_Deduction NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS New_Advance_Given NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Salary_Amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Salary_Gross_Amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Cash_Disbursed_Amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Salary_Paid_Amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Salary_Paid_Before NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Salary_Paid_After NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Salary_Remaining_After NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS Is_Advance_Salary VARCHAR(10) DEFAULT 'No';
  END IF;
END $$;

UPDATE public.salary_records
SET Cash_Disbursed_Amount = COALESCE(NULLIF(Cash_Disbursed_Amount, 0), Amount),
    Salary_Paid_Amount = COALESCE(NULLIF(Salary_Paid_Amount, 0), GREATEST(0, Amount - COALESCE(New_Advance_Given, 0)))
WHERE Cash_Disbursed_Amount IS NULL
   OR Cash_Disbursed_Amount = 0
   OR Salary_Paid_Amount IS NULL
   OR Salary_Paid_Amount = 0;

NOTIFY pgrst, 'reload schema';
