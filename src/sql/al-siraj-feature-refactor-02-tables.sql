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
  debit_account TEXT,
  credit_account TEXT,
  party_name TEXT,
  description TEXT,
  receipt_number TEXT,
  status TEXT DEFAULT 'approved',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id, direction)
);
