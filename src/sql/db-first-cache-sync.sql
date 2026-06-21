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
    'construction_payments','commission_receipts','receipt_archive','money_ledger',
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
    'construction_payments','commission_receipts','receipt_archive','money_ledger',
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
  FOREACH t IN ARRAY ARRAY['appeals','daily_entries','notifications','money_ledger','town_financial_summary','all_sales','installments']
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

NOTIFY pgrst, 'reload schema';
