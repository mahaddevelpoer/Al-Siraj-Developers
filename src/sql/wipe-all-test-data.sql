-- ====================================================================
-- AL SIRAJ DEVELOPERS — Complete Test Data Wipe SQL Script (Ultra-Resilient)
-- Run this script in Supabase SQL Editor to wipe ALL test transaction
-- data from Cloud DB while preserving Table Schemas, RLS Policies, and Town structures.
-- ====================================================================

BEGIN;

-- 1. Wipe all transaction and ledger tables
DELETE FROM public.all_sales;
DELETE FROM public.expenses;
DELETE FROM public.installments;
DELETE FROM public.collection_payments;
DELETE FROM public.resell_history;
DELETE FROM public.ceo_expenses;
DELETE FROM public.ceo_salary;
DELETE FROM public.salary_records;
DELETE FROM public.salary_payments;
DELETE FROM public.advance_salaries;
DELETE FROM public.employees;
DELETE FROM public.employees_v2;
DELETE FROM public.daily_entries;
DELETE FROM public.daily_reports;
DELETE FROM public.notifications;
DELETE FROM public.commissions;
DELETE FROM public.commission_receipts;
DELETE FROM public.town_agents;
DELETE FROM public.investor_transactions;
DELETE FROM public.investors;
DELETE FROM public.construction_payments;
DELETE FROM public.construction_projects;
DELETE FROM public.receipt_archive;
DELETE FROM public.media_library;
DELETE FROM public.money_ledger;
DELETE FROM public.town_financial_summary;
DELETE FROM public.appeals;
DELETE FROM public.audit_schedules;
DELETE FROM public.locker_audits;

-- 2. Reset all properties status to Available and clear customer/buyer details
UPDATE public.properties
SET 
  status = 'Available',
  file_status = 'Available',
  customer_name = NULL,
  cnic = NULL,
  phone_number = NULL,
  agent_name = NULL;

COMMIT;

-- 3. Verification Check
SELECT 'all_sales' AS table_name, COUNT(*) FROM public.all_sales
UNION ALL
SELECT 'daily_entries', COUNT(*) FROM public.daily_entries
UNION ALL
SELECT 'installments', COUNT(*) FROM public.installments
UNION ALL
SELECT 'money_ledger', COUNT(*) FROM public.money_ledger
UNION ALL
SELECT 'properties_available', COUNT(*) FROM public.properties WHERE status = 'Available';
