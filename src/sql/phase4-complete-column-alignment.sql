-- ═══════════════════════════════════════════════════════════════
-- PHASE 4: COMPLETE COLUMN ALIGNMENT & MISSING TABLES
-- Run this in Supabase SQL Editor to fix all silent sync failures.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. COLLECTION PAYMENTS TABLE (MISSING ENTIRELY) ─────────
CREATE TABLE IF NOT EXISTS public.collection_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT UNIQUE NOT NULL,
    sale_id TEXT,
    sale_code TEXT,
    type TEXT,
    plot_shop_number TEXT,
    town_name TEXT,
    customer_name TEXT,
    agent_name TEXT,
    amount NUMERIC DEFAULT 0,
    received_before NUMERIC DEFAULT 0,
    received_after NUMERIC DEFAULT 0,
    remaining_after NUMERIC DEFAULT 0,
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method TEXT,
    notes TEXT,
    receipt_number TEXT,
    payment_account_id TEXT,
    payment_account_name TEXT,
    payment_account_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.collection_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO full access collection_payments" ON public.collection_payments;
CREATE POLICY "CEO full access collection_payments" ON public.collection_payments
  FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "Accountant access collection_payments" ON public.collection_payments;
CREATE POLICY "Accountant access collection_payments" ON public.collection_payments
  FOR ALL USING (public.is_accountant() AND town_name = public.accountant_town());

CREATE INDEX IF NOT EXISTS idx_collection_payments_town ON public.collection_payments(town_name);
CREATE INDEX IF NOT EXISTS idx_collection_payments_sale ON public.collection_payments(sale_id);

-- ─── 2. TOWN FINANCIAL SUMMARY TABLE (MISSING ENTIRELY) ─────
CREATE TABLE IF NOT EXISTS public.town_financial_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    town_name TEXT UNIQUE NOT NULL,
    total_received NUMERIC DEFAULT 0,
    total_expenses NUMERIC DEFAULT 0,
    cash_balance NUMERIC DEFAULT 0,
    pending_collection NUMERIC DEFAULT 0,
    investor_balance NUMERIC DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.town_financial_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO full access town_financial_summary" ON public.town_financial_summary;
CREATE POLICY "CEO full access town_financial_summary" ON public.town_financial_summary
  FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "Accountant access town_financial_summary" ON public.town_financial_summary;
CREATE POLICY "Accountant access town_financial_summary" ON public.town_financial_summary
  FOR ALL USING (public.is_accountant() AND town_name = public.accountant_town());

-- ─── 3. FIX INVESTORS TABLE — ADD MISSING COLUMNS ───────────
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS cnic TEXT;
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';

-- ─── 4. FIX INVESTOR_TRANSACTIONS — ADD MISSING COLUMNS ─────
ALTER TABLE public.investor_transactions ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE public.investor_transactions ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.investor_transactions ADD COLUMN IF NOT EXISTS payment_account_id TEXT;
ALTER TABLE public.investor_transactions ADD COLUMN IF NOT EXISTS payment_account_name TEXT;
ALTER TABLE public.investor_transactions ADD COLUMN IF NOT EXISTS payment_account_type TEXT;

-- ─── 5. FIX CONSTRUCTION_PROJECTS — ADD MISSING COLUMNS ─────
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS material_name TEXT;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS material_quantity NUMERIC DEFAULT 0;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS material_rate NUMERIC DEFAULT 0;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS deal_amount NUMERIC DEFAULT 0;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.construction_projects ADD COLUMN IF NOT EXISTS deal_receipt_number TEXT;

-- ─── 6. FIX CONSTRUCTION_PAYMENTS — ADD MISSING COLUMNS ─────
ALTER TABLE public.construction_payments ADD COLUMN IF NOT EXISTS material_name TEXT;
ALTER TABLE public.construction_payments ADD COLUMN IF NOT EXISTS material_quantity NUMERIC DEFAULT 0;
ALTER TABLE public.construction_payments ADD COLUMN IF NOT EXISTS material_rate NUMERIC DEFAULT 0;
ALTER TABLE public.construction_payments ADD COLUMN IF NOT EXISTS remaining_after NUMERIC DEFAULT 0;
ALTER TABLE public.construction_payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE public.construction_payments ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── 7. FIX DAILY_ENTRIES — ADD MISSING COLUMNS ─────────────
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved';
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS payment_account_id TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS payment_account_name TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS payment_account_type TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS receipt_number TEXT;

-- ─── 8. FIX SALARY_PAYMENTS — ADD MISSING COLUMNS ───────────
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS new_advance_given NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS salary_amount NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS salary_gross_amount NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS cash_disbursed_amount NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS salary_paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS salary_paid_before NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS salary_paid_after NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS salary_remaining_after NUMERIC DEFAULT 0;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS is_advance_salary TEXT DEFAULT 'No';
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS payment_account_id TEXT;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS payment_account_name TEXT;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS payment_account_type TEXT;

-- ─── 9. VERIFY: Ensure phase3 tables exist ───────────────────
-- (These should already exist from phase3-investors-constructors-cashbook.sql,
--  but just in case they were never run)
CREATE TABLE IF NOT EXISTS public.investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id TEXT UNIQUE NOT NULL,
    investor_name TEXT NOT NULL,
    town_name TEXT NOT NULL,
    phone_number TEXT,
    cnic TEXT,
    address TEXT,
    notes TEXT,
    balance NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Active',
    approval_status TEXT DEFAULT 'approved',
    created_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.investor_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT UNIQUE NOT NULL,
    investor_id TEXT NOT NULL,
    investor_name TEXT NOT NULL,
    town_name TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    balance_before NUMERIC,
    balance_after NUMERIC,
    description TEXT,
    receipt_number TEXT,
    created_by TEXT,
    payment_account_id TEXT,
    payment_account_name TEXT,
    payment_account_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.construction_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT UNIQUE NOT NULL,
    town_name TEXT NOT NULL,
    category TEXT NOT NULL,
    constructor_name TEXT NOT NULL,
    phone_number TEXT,
    company_name TEXT,
    material_name TEXT,
    material_quantity NUMERIC DEFAULT 0,
    material_rate NUMERIC DEFAULT 0,
    deal_amount NUMERIC DEFAULT 0,
    paid_amount NUMERIC DEFAULT 0,
    remaining_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Active',
    start_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    deal_receipt_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.construction_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    town_name TEXT NOT NULL,
    category TEXT,
    constructor_name TEXT,
    amount NUMERIC NOT NULL,
    payment_date DATE NOT NULL,
    material_name TEXT,
    material_quantity NUMERIC DEFAULT 0,
    material_rate NUMERIC DEFAULT 0,
    remaining_after NUMERIC DEFAULT 0,
    receipt_number TEXT,
    notes TEXT,
    description TEXT,
    created_by TEXT,
    payment_account_id TEXT,
    payment_account_name TEXT,
    payment_account_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.cash_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id TEXT UNIQUE NOT NULL,
    town_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    opening_balance NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active',
    updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.money_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id TEXT UNIQUE NOT NULL,
    town_name TEXT NOT NULL,
    date DATE NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    debit_account TEXT,
    credit_account TEXT,
    party_name TEXT,
    description TEXT,
    created_by TEXT,
    status TEXT DEFAULT 'approved',
    receipt_number TEXT,
    payment_account_id TEXT,
    payment_account_name TEXT,
    payment_account_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ─── 10. ENABLE RLS ON ALL TABLES (IDEMPOTENT) ──────────────

ALTER TABLE public.collection_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.town_financial_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_ledger ENABLE ROW LEVEL SECURITY;

-- ─── 11. OPEN RLS POLICIES (for development) ────────────────
-- These allow all authenticated users full access. Tighten these
-- for production by restricting to role-based town access.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'collection_payments','town_financial_summary','investors','investor_transactions',
    'construction_projects','construction_payments','cash_bank_accounts','money_ledger'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public_full_%s" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "public_full_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Done! All tables and columns are now aligned with the sync layer.
