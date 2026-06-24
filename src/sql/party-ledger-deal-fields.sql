-- Adds fields required for negotiated sale deals and partial person ledgers.
-- Safe to run even when some optional module tables do not exist yet.

DO $$
BEGIN
  IF to_regclass('public.all_sales') IS NOT NULL THEN
    ALTER TABLE public.all_sales
      ADD COLUMN IF NOT EXISTS expected_amount_pkr NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS deal_amount_pkr NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discount_amount_pkr NUMERIC DEFAULT 0;
  END IF;

  IF to_regclass('public.commissions') IS NOT NULL THEN
    ALTER TABLE public.commissions
      ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_paid_date DATE;

    CREATE INDEX IF NOT EXISTS idx_commissions_agent_status
      ON public.commissions (agent_name, status);
  END IF;

  IF to_regclass('public.commission_receipts') IS NOT NULL THEN
    ALTER TABLE public.commission_receipts
      ADD COLUMN IF NOT EXISTS paid_before NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS paid_after NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS remaining_after NUMERIC DEFAULT 0;
  END IF;

  IF to_regclass('public.salary_payments') IS NOT NULL THEN
    ALTER TABLE public.salary_payments
      ADD COLUMN IF NOT EXISTS salary_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS salary_paid_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS salary_paid_before NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS salary_paid_after NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS salary_remaining_after NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_advance_salary TEXT DEFAULT 'No';

    CREATE INDEX IF NOT EXISTS idx_salary_payments_employee_month
      ON public.salary_payments (employee_name, month);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
