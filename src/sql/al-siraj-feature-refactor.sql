-- AL SIRAJ DEVELOPERS feature refactor schema
-- Run this full file once in Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS town_id TEXT,
  ADD COLUMN IF NOT EXISTS town_name TEXT;

DO $$
DECLARE
  town_col TEXT;
  first_town TEXT;
BEGIN
  SELECT column_name INTO town_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'towns'
    AND column_name IN ('town_name', 'Town_Name', 'name')
  ORDER BY CASE column_name WHEN 'town_name' THEN 1 WHEN 'Town_Name' THEN 2 ELSE 3 END
  LIMIT 1;

  IF town_col IS NOT NULL THEN
    EXECUTE format('SELECT %I::TEXT FROM public.towns WHERE %I IS NOT NULL AND %I::TEXT <> '''' ORDER BY %I::TEXT LIMIT 1', town_col, town_col, town_col, town_col)
      INTO first_town;

    IF first_town IS NOT NULL THEN
      UPDATE public.users
      SET town_name = COALESCE(NULLIF(town_name, ''), first_town),
          town_id = COALESCE(NULLIF(town_id, ''), first_town)
      WHERE role = 'accountant'
        AND (town_name IS NULL OR town_name = '' OR town_id IS NULL OR town_id = '');
    END IF;
  END IF;
END $$;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS length_ft NUMERIC,
  ADD COLUMN IF NOT EXISTS width_ft NUMERIC,
  ADD COLUMN IF NOT EXISTS area_sqft NUMERIC,
  ADD COLUMN IF NOT EXISTS resell_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_owner_name TEXT;

ALTER TABLE public.towns
  ADD COLUMN IF NOT EXISTS residential_plot_price NUMERIC,
  ADD COLUMN IF NOT EXISTS commercial_plot_price NUMERIC,
  ADD COLUMN IF NOT EXISTS residential_shop_price NUMERIC,
  ADD COLUMN IF NOT EXISTS commercial_shop_price NUMERIC;

CREATE TABLE IF NOT EXISTS public.town_agents (
  agent_id TEXT PRIMARY KEY,
  town_name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  phone_number TEXT,
  cnic TEXT,
  address TEXT,
  notes TEXT,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.investors (
  investor_id TEXT PRIMARY KEY,
  town_name TEXT NOT NULL,
  investor_name TEXT NOT NULL,
  phone_number TEXT,
  cnic TEXT,
  address TEXT,
  notes TEXT,
  balance NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approval_status TEXT DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS public.investor_transactions (
  transaction_id TEXT PRIMARY KEY,
  investor_id TEXT,
  town_name TEXT NOT NULL,
  investor_name TEXT,
  type TEXT CHECK (type IN ('Credit','Debit')),
  amount NUMERIC DEFAULT 0,
  date DATE,
  notes TEXT,
  balance_after NUMERIC DEFAULT 0,
  receipt_number TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.construction_projects (
  project_id TEXT PRIMARY KEY,
  town_name TEXT NOT NULL,
  category TEXT NOT NULL,
  constructor_name TEXT NOT NULL,
  phone_number TEXT,
  company_name TEXT,
  material_name TEXT,
  material_quantity TEXT,
  material_rate TEXT,
  deal_amount NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  remaining_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Active',
  start_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.construction_payments (
  payment_id TEXT PRIMARY KEY,
  project_id TEXT,
  town_name TEXT NOT NULL,
  category TEXT,
  constructor_name TEXT,
  amount NUMERIC DEFAULT 0,
  payment_date DATE,
  material_name TEXT,
  material_quantity TEXT,
  material_rate TEXT,
  remaining_after NUMERIC DEFAULT 0,
  receipt_number TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.commission_receipts (
  receipt_id TEXT PRIMARY KEY,
  commission_id TEXT,
  sale_id TEXT,
  town_name TEXT,
  agent_name TEXT,
  plot_shop_number TEXT,
  amount NUMERIC DEFAULT 0,
  paid_date DATE,
  receipt_number TEXT,
  paid_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.money_ledger (
  ledger_id TEXT PRIMARY KEY,
  town_name TEXT,
  date DATE,
  source_type TEXT,
  source_id TEXT,
  direction TEXT CHECK (direction IN ('income','expense')),
  amount NUMERIC DEFAULT 0,
  party_name TEXT,
  description TEXT,
  receipt_number TEXT,
  status TEXT DEFAULT 'approved',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id, direction)
);

ALTER TABLE public.town_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_full_town_agents" ON public.town_agents;
CREATE POLICY "office_full_town_agents" ON public.town_agents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_investors" ON public.investors;
CREATE POLICY "office_full_investors" ON public.investors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_investor_transactions" ON public.investor_transactions;
CREATE POLICY "office_full_investor_transactions" ON public.investor_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_construction_projects" ON public.construction_projects;
CREATE POLICY "office_full_construction_projects" ON public.construction_projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_construction_payments" ON public.construction_payments;
CREATE POLICY "office_full_construction_payments" ON public.construction_payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_commission_receipts" ON public.commission_receipts;
CREATE POLICY "office_full_commission_receipts" ON public.commission_receipts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_money_ledger" ON public.money_ledger;
CREATE POLICY "office_full_money_ledger" ON public.money_ledger FOR ALL USING (true) WITH CHECK (true);

DELETE FROM public.agent_property_access;
DELETE FROM public.commissions;
DELETE FROM public.appeals
WHERE requested_by_role = 'agent'
   OR appeal_type IN ('agent_registration','property_access_request');
DELETE FROM public.users WHERE role = 'agent';

NOTIFY pgrst, 'reload schema';
