-- DB-first sync metadata and realtime setup.
-- Run once in Supabase SQL Editor.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'towns','properties','all_sales','installments','expenses','ceo_expenses',
    'ceo_salary','notifications','daily_entries','employees','employees_v2',
    'advance_salaries','salary_records','salary_payments','town_agents',
    'investors','investor_transactions','construction_projects',
    'construction_payments','commissions','commission_receipts',
    'collection_payments','resell_history','receipt_archive','money_ledger',
    'town_financial_summary'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS client_write_id TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT ''synced''', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at)', t || '_updated_at_idx', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (client_write_id)', t || '_client_write_id_idx', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'towns','properties','all_sales','installments','expenses','ceo_expenses',
    'ceo_salary','notifications','daily_entries','employees','employees_v2',
    'advance_salaries','salary_records','salary_payments','town_agents',
    'investors','investor_transactions','construction_projects',
    'construction_payments','commissions','commission_receipts',
    'collection_payments','resell_history','receipt_archive','money_ledger',
    'town_financial_summary'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch_updated_at ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_%I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appeals','daily_entries','notifications','money_ledger','town_financial_summary',
    'towns','properties','all_sales','installments','expenses','ceo_expenses',
    'ceo_salary','employees','employees_v2','advance_salaries','salary_records',
    'salary_payments','town_agents','investors','investor_transactions',
    'construction_projects','construction_payments','commissions',
    'commission_receipts','collection_payments','resell_history','receipt_archive'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.receipt_archive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id TEXT UNIQUE,
    receipt_number TEXT,
    receipt_type TEXT,
    town_name TEXT,
    entity_id TEXT,
    entity_name TEXT,
    amount NUMERIC DEFAULT 0,
    receipt_date DATE,
    payload_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    client_write_id TEXT,
    sync_status TEXT DEFAULT 'synced',
    deleted_at TIMESTAMPTZ
  );
  ALTER TABLE public.receipt_archive ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS receipt_archive_read_all ON public.receipt_archive;
  DROP POLICY IF EXISTS receipt_archive_write_all ON public.receipt_archive;
  CREATE POLICY receipt_archive_read_all ON public.receipt_archive FOR SELECT USING (true);
  CREATE POLICY receipt_archive_write_all ON public.receipt_archive FOR ALL USING (true) WITH CHECK (true);
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'receipt_archive'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_archive;
  END IF;

  IF to_regclass('public.appeals') IS NOT NULL THEN
    ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS town_name TEXT;
    CREATE INDEX IF NOT EXISTS appeals_town_status_created_idx
      ON public.appeals (town_name, status, created_at DESC);
  END IF;

  IF to_regclass('public.installments') IS NOT NULL THEN
    ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS receipt_number TEXT;
    ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS paid_by TEXT;
    ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS payee_name TEXT;
  END IF;

  IF to_regclass('public.money_ledger') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS money_ledger_source_type_source_id_direction_uidx
      ON public.money_ledger (source_type, source_id, direction)
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND direction IS NOT NULL;
  END IF;

  IF to_regclass('public.collection_payments') IS NOT NULL THEN
    ALTER TABLE public.collection_payments ADD COLUMN IF NOT EXISTS payment_id TEXT;
    ALTER TABLE public.collection_payments ADD COLUMN IF NOT EXISTS sale_code TEXT;
    ALTER TABLE public.collection_payments ADD COLUMN IF NOT EXISTS received_before NUMERIC DEFAULT 0;
    ALTER TABLE public.collection_payments ADD COLUMN IF NOT EXISTS received_after NUMERIC DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS collection_payments_payment_id_uidx
      ON public.collection_payments (payment_id)
      WHERE payment_id IS NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
