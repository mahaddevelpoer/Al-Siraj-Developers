-- PHASE 3: INVESTORS, CONSTRUCTORS, AND CASHBOOK LEDGER
-- Description: Creates the missing tables for Investors, Construction Projects, Cash/Bank Accounts, and Money Events.
-- This ensures that the dual-write architecture completely covers all financial records, preventing data loss.

-- 1. INVESTORS TABLE
CREATE TABLE IF NOT EXISTS public.investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id TEXT UNIQUE NOT NULL,
    investor_name TEXT NOT NULL,
    town_name TEXT NOT NULL,
    phone_number TEXT,
    address TEXT,
    balance NUMERIC DEFAULT 0,
    created_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. INVESTOR TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.investor_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT UNIQUE NOT NULL,
    investor_id TEXT NOT NULL,
    investor_name TEXT NOT NULL,
    town_name TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Credit', 'Debit', 'credit', 'debit')),
    amount NUMERIC NOT NULL,
    balance_before NUMERIC,
    balance_after NUMERIC,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. CONSTRUCTION PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.construction_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT UNIQUE NOT NULL,
    town_name TEXT NOT NULL,
    category TEXT NOT NULL,
    constructor_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    estimated_cost NUMERIC DEFAULT 0,
    paid_amount NUMERIC DEFAULT 0,
    balance NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. CONSTRUCTION PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.construction_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    town_name TEXT NOT NULL,
    category TEXT NOT NULL,
    constructor_name TEXT NOT NULL,
    payment_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    created_by TEXT,
    payment_account_id TEXT,
    payment_account_name TEXT,
    payment_account_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. CASH/BANK ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.cash_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id TEXT UNIQUE NOT NULL,
    town_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'Cash', 'Bank')),
    opening_balance NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active',
    updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. MONEY LEDGER (CASHBOOK / GENERAL LEDGER) TABLE
CREATE TABLE IF NOT EXISTS public.money_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id TEXT UNIQUE NOT NULL,
    town_name TEXT NOT NULL,
    date DATE NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'Income', 'Expense')),
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

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- HELPER FUNCTIONS FOR RLS
CREATE OR REPLACE FUNCTION public.is_accountant()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'accountant'
    AND COALESCE(is_active, true) = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.accountant_town()
RETURNS text AS $$
DECLARE
  v_town text;
BEGIN
  SELECT assigned_town INTO v_town
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
  
  RETURN v_town;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_ledger ENABLE ROW LEVEL SECURITY;

-- CEO Policies (Full Access)
DROP POLICY IF EXISTS "CEO full access investors" ON public.investors;
CREATE POLICY "CEO full access investors" ON public.investors FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO full access investor_transactions" ON public.investor_transactions;
CREATE POLICY "CEO full access investor_transactions" ON public.investor_transactions FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO full access construction_projects" ON public.construction_projects;
CREATE POLICY "CEO full access construction_projects" ON public.construction_projects FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO full access construction_payments" ON public.construction_payments;
CREATE POLICY "CEO full access construction_payments" ON public.construction_payments FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO full access cash_bank_accounts" ON public.cash_bank_accounts;
CREATE POLICY "CEO full access cash_bank_accounts" ON public.cash_bank_accounts FOR ALL USING (public.is_ceo());

DROP POLICY IF EXISTS "CEO full access money_ledger" ON public.money_ledger;
CREATE POLICY "CEO full access money_ledger" ON public.money_ledger FOR ALL USING (public.is_ceo());

-- Accountant Policies (Read/Write for their Assigned Town)
-- Investors
DROP POLICY IF EXISTS "Accountant access investors" ON public.investors;
CREATE POLICY "Accountant access investors" ON public.investors FOR ALL
USING (public.is_accountant() AND town_name = public.accountant_town());

-- Investor Transactions
DROP POLICY IF EXISTS "Accountant access investor_transactions" ON public.investor_transactions;
CREATE POLICY "Accountant access investor_transactions" ON public.investor_transactions FOR ALL
USING (public.is_accountant() AND town_name = public.accountant_town());

-- Construction Projects
DROP POLICY IF EXISTS "Accountant access construction_projects" ON public.construction_projects;
CREATE POLICY "Accountant access construction_projects" ON public.construction_projects FOR ALL
USING (public.is_accountant() AND town_name = public.accountant_town());

-- Construction Payments
DROP POLICY IF EXISTS "Accountant access construction_payments" ON public.construction_payments;
CREATE POLICY "Accountant access construction_payments" ON public.construction_payments FOR ALL
USING (public.is_accountant() AND town_name = public.accountant_town());

-- Cash/Bank Accounts
DROP POLICY IF EXISTS "Accountant access cash_bank_accounts" ON public.cash_bank_accounts;
CREATE POLICY "Accountant access cash_bank_accounts" ON public.cash_bank_accounts FOR ALL
USING (public.is_accountant() AND town_name = public.accountant_town());

-- Money Ledger
DROP POLICY IF EXISTS "Accountant access money_ledger" ON public.money_ledger;
CREATE POLICY "Accountant access money_ledger" ON public.money_ledger FOR ALL
USING (public.is_accountant() AND town_name = public.accountant_town());

-- Agent Policies (Agents shouldn't have access to investors/constructors/cashbook, but just in case, read-only for their town if needed)
-- Explicitly skipping Agent access as these are core financial modules.
