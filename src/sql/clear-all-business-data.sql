-- AL SIRAJ DEVELOPERS - clear business/test data while keeping schema and auth users.
-- Run in Supabase SQL Editor only when you are ready to remove test data.

begin;

do $$
declare
  tbl text;
  tables text[] := array[
    'money_ledger',
    'media_library',
    'receipt_archive',
    'collection_payments',
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
    'daily_entries',
    'notifications',
    'resell_history',
    'installments',
    'all_sales',
    'expenses',
    'ceo_expenses',
    'ceo_salary',
    'properties',
    'town_financial_summary',
    'town_map_shapes',
    'appeals',
    'accounting_reports',
    'daily_report_receipts'
  ];
begin
  foreach tbl in array tables loop
    if to_regclass('public.' || tbl) is not null then
      execute format('truncate table public.%I restart identity cascade', tbl);
    end if;
  end loop;
end $$;

-- Keep auth.users and public.users so CEO/accountant login stays working.
-- If you also want to remove towns, run this separately:
-- truncate table public.towns restart identity cascade;

-- Supabase blocks direct deletion from storage.objects.
-- Clear Storage files through the Storage API instead:
--   $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
--   $env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
--   node scripts/clear-cloud-storage.mjs

notify pgrst, 'reload schema';

commit;
