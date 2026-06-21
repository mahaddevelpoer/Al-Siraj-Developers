-- AL SIRAJ DEVELOPERS
-- Clears test/business data only. Keeps schema, columns, indexes, RLS, auth users,
-- public.users login profiles, and app code/framework intact.
--
-- Safe to run in Supabase SQL Editor on schemas where some phase tables do not
-- exist yet. It skips missing tables instead of failing.

BEGIN;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'appeals',
    'notifications',
    'daily_entries',
    'town_financial_summary',
    'money_ledger',
    'receipt_archive',
    'commission_receipts',
    'commissions',
    'construction_payments',
    'construction_projects',
    'investor_transactions',
    'investors',
    'town_agents',
    'salary_payments',
    'salary_records',
    'advance_salaries',
    'employees_v2',
    'employees',
    'ceo_salary',
    'ceo_expenses',
    'expenses',
    'installments',
    'collection_payments',
    'resell_history',
    'all_sales',
    'properties',
    'towns',
    'file_manifest'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', tbl);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
