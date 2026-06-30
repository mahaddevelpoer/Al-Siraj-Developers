-- AL SIRAJ DEVELOPERS - Cash & Banks schema
-- Safe/idempotent: can be run more than once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.cash_bank_accounts (
  account_id text PRIMARY KEY,
  town_name text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'bank',
  opening_balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sync_status text DEFAULT 'synced'
);

ALTER TABLE public.money_ledger
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.all_sales
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.daily_entries
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.salary_records
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.investor_transactions
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.construction_payments
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.commission_receipts
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

ALTER TABLE public.collection_payments
  ADD COLUMN IF NOT EXISTS payment_account_id text DEFAULT 'cash-in-hand',
  ADD COLUMN IF NOT EXISTS payment_account_name text DEFAULT 'Cash in Hand',
  ADD COLUMN IF NOT EXISTS payment_account_type text DEFAULT 'cash';

CREATE INDEX IF NOT EXISTS idx_cash_bank_accounts_town
  ON public.cash_bank_accounts (town_name, status);

CREATE INDEX IF NOT EXISTS idx_money_ledger_payment_account
  ON public.money_ledger (town_name, payment_account_id);

ALTER TABLE public.cash_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_full_cash_bank_accounts" ON public.cash_bank_accounts;
CREATE POLICY "office_full_cash_bank_accounts"
ON public.cash_bank_accounts
FOR ALL
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
