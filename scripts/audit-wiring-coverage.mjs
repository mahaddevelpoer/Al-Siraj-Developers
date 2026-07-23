import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  const filePath = path.join(root, rel);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function add(issues, severity, area, message, file = '') {
  issues.push({ severity, area, message, file });
}

function mustContain(issues, file, patterns, area) {
  const text = read(file);
  if (!text) {
    add(issues, 'error', area, 'Required file is missing', file);
    return;
  }
  for (const pattern of patterns) {
    const ok = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    if (!ok) add(issues, 'error', area, `Missing required wiring: ${pattern.toString()}`, file);
  }
}

function warnIfContains(issues, file, patterns, area, message) {
  const text = read(file);
  if (!text) return;
  for (const pattern of patterns) {
    if ((pattern instanceof RegExp && pattern.test(text)) || (typeof pattern === 'string' && text.includes(pattern))) {
      add(issues, 'warning', area, message || `Risky pattern found: ${pattern.toString()}`, file);
    }
  }
}

const issues = [];

mustContain(issues, 'src/main/ipc.js', [
  'function sendBusinessDataChanged',
  'businessEventsForTable',
  'syncOnline',
  'pendingSync.addPendingSync',
  'run-business-audit',
  'cash_bank_accounts',
  'money_ledger',
], 'main_event_sync_wiring');

mustContain(issues, 'src/main/preload.js', [
  'runBusinessAudit',
  'runHandoverAudit',
  'onBusinessDataChanged',
  'getPaymentAccounts',
  'addBankAccount',
  'updateBankAccount',
], 'preload_bridge');

mustContain(issues, 'src/main/db/moneyLedger.js', [
  'Payment_Account_ID',
  'Payment_Account_Name',
  'Payment_Account_Type',
  'recordMoneyEvent',
  'refreshTownFinancialSummary',
], 'money_ledger');

mustContain(issues, 'src/main/db/cashBanks.js', [
  'Cash in Hand',
  'getPaymentAccounts',
  'addBankAccount',
  'updateBankAccount',
  'getMoneyLedger',
], 'cash_banks');

mustContain(issues, 'src/sql/cash-bank-accounts.sql', [
  'CREATE TABLE IF NOT EXISTS public.cash_bank_accounts',
  'ALTER TABLE public.money_ledger',
  'payment_account_id',
  'NOTIFY pgrst',
], 'supabase_schema');

const paymentForms = [
  ['src/renderer/systems/DailySystem/DailyIncomeEntry.jsx', 'Daily Income'],
  ['src/renderer/systems/DailySystem/DailyExpenseEntry.jsx', 'Daily Expense'],
  ['src/renderer/components/SellFlow.jsx', 'Property Sale'],
  ['src/renderer/components/ResellProperty.jsx', 'Resell Property'],
  ['src/renderer/components/PendingCollections.jsx', 'Pending Collections'],
  ['src/renderer/components/InstallmentTracker.jsx', 'Installment Tracker'],
  ['src/renderer/components/CommissionTracker.jsx', 'Commission Tracker'],
  ['src/renderer/components/InvestorDashboard.jsx', 'Investor Dashboard'],
  ['src/renderer/components/ConstructionDashboard.jsx', 'Construction Dashboard'],
  ['src/renderer/systems/ExpenseSystem/EmployeeSalary.jsx', 'Employee Salary'],
];

for (const [file, area] of paymentForms) {
  mustContain(issues, file, [
    'PaymentAccountSelect',
    /paymentAccount/i,
  ], area);
}

const backendPaymentWriters = [
  ['src/main/db/dailyEntries.js', 'Daily Entries'],
  ['src/main/db/properties.js', 'Property Sale/Resell'],
  ['src/main/db/globals.js', 'Installments/Collections/Salaries'],
  ['src/main/db/businessExtras.js', 'Investor/Construction/Commission'],
  ['src/main/db/online/index.js', 'Online Adapter'],
  ['src/main/db/syncHelpers.js', 'Sync Helpers'],
];

for (const [file, area] of backendPaymentWriters) {
  mustContain(issues, file, [
    'Payment_Account_ID',
    'Payment_Account_Name',
    'Payment_Account_Type',
  ], area);
}

mustContain(issues, 'scripts/audit-business-data.mjs', [
  'runBusinessAudit',
  'Pending_Sync.xlsx',
  'Receipt_Archive.xlsx',
  'Media_Library.xlsx',
  'Payment_Account_ID',
  'pendingSyncCount',
], 'business_audit');

mustContain(issues, 'src/renderer/components/Settings.jsx', [
  'System Health Audit',
  'runBusinessAudit',
  'runHandoverAudit',
  'Handover Audit',
  'Open Audit Report',
  'Local-First Sync Active',
], 'settings_health_ui');

warnIfContains(issues, 'src/renderer/components/NotificationPanel.jsx', [
  /markInstallmentPaid\s*\(/,
], 'button_audit', 'Notification panel must not receive installment directly without payment account selection.');

const report = {
  generatedAt: new Date().toISOString(),
  issueCount: issues.length,
  issues,
};

const outDir = path.join(root, 'Reports');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `wiring-coverage-audit-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({ success: true, outPath, issueCount: issues.length }, null, 2));
if (issues.some((issue) => issue.severity === 'error')) process.exitCode = 2;
