-- Run in Supabase SQL Editor.
-- Adds the unique keys required by AL SIRAJ sync upserts.

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
    ARRAY['money_ledger', 'ledger_id'],
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

NOTIFY pgrst, 'reload schema';
