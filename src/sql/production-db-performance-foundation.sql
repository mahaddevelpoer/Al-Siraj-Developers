-- AL SIRAJ DEVELOPERS production DB foundation.
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.money_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id text UNIQUE NOT NULL,
  town_name text NOT NULL,
  date date,
  source_type text NOT NULL,
  source_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('income', 'expense')),
  amount numeric NOT NULL DEFAULT 0,
  party_name text,
  description text,
  receipt_number text,
  status text NOT NULL DEFAULT 'approved',
  client_write_id text,
  sync_status text DEFAULT 'synced',
  deleted_at timestamptz,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (source_type, source_id, direction)
);

CREATE TABLE IF NOT EXISTS public.town_financial_summary (
  town_name text PRIMARY KEY,
  total_received numeric NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  cash_balance numeric NOT NULL DEFAULT 0,
  pending_collection numeric NOT NULL DEFAULT 0,
  investor_balance numeric NOT NULL DEFAULT 0,
  client_write_id text,
  sync_status text DEFAULT 'synced',
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  role text,
  town_name text,
  device_id text,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.towns') IS NOT NULL THEN
    ALTER TABLE public.towns ADD COLUMN IF NOT EXISTS total_plots integer DEFAULT 0;
    ALTER TABLE public.towns ADD COLUMN IF NOT EXISTS total_shops integer DEFAULT 0;
  END IF;
END $$;

-- Standard sync metadata for every high-value business table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'towns','properties','all_sales','installments','expenses','ceo_expenses',
    'ceo_salary','notifications','daily_entries','employees','employees_v2',
    'advance_salaries','salary_records','salary_payments','town_agents',
    'investors','investor_transactions','construction_projects',
    'construction_payments','commissions','commission_receipts','receipt_archive',
    'money_ledger','town_financial_summary'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS client_write_id text', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sync_status text DEFAULT ''synced''', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at)', t || '_updated_at_idx', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (client_write_id)', t || '_client_write_id_idx', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_at)', t || '_deleted_at_idx', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'towns','properties','all_sales','installments','expenses','ceo_expenses',
    'ceo_salary','notifications','daily_entries','employees','employees_v2',
    'advance_salaries','salary_records','salary_payments','town_agents',
    'investors','investor_transactions','construction_projects',
    'construction_payments','commissions','commission_receipts','receipt_archive',
    'money_ledger','town_financial_summary'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch_updated_at ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_%I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_town_financial_summary(p_town_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.town_financial_summary (
    town_name,
    total_received,
    total_expenses,
    cash_balance,
    pending_collection,
    investor_balance,
    updated_at
  )
  SELECT
    p_town_name,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'income' AND status = 'approved'), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction = 'expense' AND status = 'approved'), 0),
    COALESCE(SUM(CASE
      WHEN direction = 'income' AND status = 'approved' THEN amount
      WHEN direction = 'expense' AND status = 'approved' THEN -amount
      ELSE 0
    END), 0),
    COALESCE((SELECT SUM(remaining_amount) FROM public.all_sales WHERE town_name = p_town_name), 0),
    COALESCE((SELECT SUM(balance) FROM public.investors WHERE town_name = p_town_name AND COALESCE(status, 'Active') <> 'Deleted'), 0),
    now()
  FROM public.money_ledger
  WHERE town_name = p_town_name
    AND deleted_at IS NULL
  ON CONFLICT (town_name) DO UPDATE SET
    total_received = EXCLUDED.total_received,
    total_expenses = EXCLUDED.total_expenses,
    cash_balance = EXCLUDED.cash_balance,
    pending_collection = EXCLUDED.pending_collection,
    investor_balance = EXCLUDED.investor_balance,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_summary_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_town_financial_summary(COALESCE(NEW.town_name, OLD.town_name));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS refresh_summary_money_ledger ON public.money_ledger;
CREATE TRIGGER refresh_summary_money_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.money_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_summary_from_ledger();

-- Required unique constraints for reliable upsert sync.
DO $$
DECLARE
  item text[];
  items text[][] := ARRAY[
    ARRAY['salary_records', 'receipt_number'],
    ARRAY['salary_payments', 'receipt_number'],
    ARRAY['investors', 'investor_id'],
    ARRAY['investor_transactions', 'transaction_id'],
    ARRAY['town_agents', 'agent_id'],
    ARRAY['construction_projects', 'project_id'],
    ARRAY['construction_payments', 'payment_id'],
    ARRAY['commission_receipts', 'receipt_id'],
    ARRAY['receipt_archive', 'receipt_id'],
    ARRAY['daily_entries', 'entry_id'],
    ARRAY['notifications', 'notification_id'],
    ARRAY['expenses', 'expense_id'],
    ARRAY['ceo_expenses', 'expense_id'],
    ARRAY['ceo_salary', 'salary_id'],
    ARRAY['installments', 'tracker_id'],
    ARRAY['all_sales', 'sale_id']
  ];
  tbl text;
  col text;
BEGIN
  FOREACH item SLICE 1 IN ARRAY items LOOP
    tbl := item[1];
    col := item[2];
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM public.%I a USING public.%I b WHERE a.ctid < b.ctid AND a.%I IS NOT NULL AND b.%I IS NOT NULL AND a.%I = b.%I',
        tbl, tbl, col, col, col, col
      );
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = tbl || '_' || col || '_key'
          AND conrelid = ('public.' || tbl)::regclass
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%I)', tbl, tbl || '_' || col || '_key', col);
      END IF;
    END IF;
  END LOOP;
END $$;

-- High-value indexes for 400k+ row workloads.
CREATE INDEX IF NOT EXISTS idx_money_ledger_town_date ON public.money_ledger (town_name, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_money_ledger_source ON public.money_ledger (source_type, source_id, direction);
CREATE INDEX IF NOT EXISTS idx_money_ledger_status_direction ON public.money_ledger (status, direction);
CREATE INDEX IF NOT EXISTS idx_town_financial_summary_updated ON public.town_financial_summary (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_table_row ON public.audit_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_town_created ON public.audit_log (town_name, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.all_sales') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_all_sales_town_date ON public.all_sales (town_name, sell_date DESC);
    CREATE INDEX IF NOT EXISTS idx_all_sales_town_status ON public.all_sales (town_name, status);
  END IF;
  IF to_regclass('public.daily_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_daily_entries_town_date ON public.daily_entries (town_name, date DESC);
  END IF;
  IF to_regclass('public.installments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_installments_town_due ON public.installments (town_name, due_date, status);
  END IF;
  IF to_regclass('public.properties') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_properties_town_status ON public.properties (town_name, status);
    CREATE INDEX IF NOT EXISTS idx_properties_town_type_number ON public.properties (town_name, property_type, property_number);
  END IF;
  IF to_regclass('public.investors') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_investors_town_status ON public.investors (town_name, status);
  END IF;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appeals','daily_entries','notifications','money_ledger',
    'town_financial_summary','all_sales','installments'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
