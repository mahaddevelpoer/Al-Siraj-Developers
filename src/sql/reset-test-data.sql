-- AL SIRAJ DEVELOPERS handover cleanup.
-- Deletes business/test data only. It keeps auth users, app schema, functions,
-- policies, and configuration tables intact.
--
-- Run through scripts/reset-test-data.ps1, or paste this file in Supabase SQL
-- editor when you intentionally want a clean handover database.

BEGIN;

DO $$
DECLARE
  tbl TEXT;
  tables_to_clear TEXT[] := ARRAY[
    'appeal_notifications',
    'appeals',
    'notifications',
    'ceo_push_delivery_log',
    'audit_log',
    'user_activity',
    'money_ledger',
    'receipt_archive',
    'file_manifest',
    'commission_receipts',
    'commissions',
    'collection_payments',
    'construction_payments',
    'construction_projects',
    'investor_transactions',
    'investors',
    'town_agents',
    'salary_payments',
    'advance_salaries',
    'employees_v2',
    'employees',
    'salary_records',
    'ceo_salary',
    'ceo_expenses',
    'expenses',
    'daily_entries',
    'installments',
    'all_sales',
    'properties',
    'town_prices',
    'towns',
    'agent_property_access'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_clear LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', tbl);
    END IF;
  END LOOP;
END $$;

-- Existing CEO/accountant login accounts are kept, but old town assignment is
-- cleared so new handover towns can be assigned cleanly.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE public.users
    SET town_id = NULL,
        town_name = NULL,
        agent_town = NULL,
        agent_towns = NULL,
        updated_at = NOW()
    WHERE role IN ('accountant', 'agent');
  END IF;
END $$;

-- Supabase Storage is backup/file data, not schema. Keep buckets, delete files.
DELETE FROM storage.objects
WHERE bucket_id IN (
  'zameenkhata-files',
  'zameen-khata',
  'receipts',
  'property-files',
  'property_images',
  'property-images'
)
AND (
  bucket_id <> 'zameenkhata-files'
  OR name LIKE 'zameen-khata/%'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
