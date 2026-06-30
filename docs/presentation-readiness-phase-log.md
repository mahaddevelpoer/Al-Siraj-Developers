# AL SIRAJ DEVELOPERS Presentation Readiness Phase Log

This file keeps the current implementation context stable across Codex turns. Do not delete it while the handover work is active.

## Ground Rules

- Do not delete or migrate business data unless the user explicitly asks for a cleanup script/run.
- Excel/local write remains first. Supabase sync follows with visible warning/retry on failure.
- Old Excel and old Supabase records must remain readable.
- Financial totals must be rebuilt from source records and ledger rows, not stale UI state.
- Approved records affect money once. Pending/rejected records do not affect totals.
- Avoid duplicate ledger rows, invalid amounts, `NaN`, `Infinity`, `undefined`, and null display values.
- Build checkpoint is `npm run build` or `npx vite build` depending on package scripts.

## Completed Before This Phase Log

- Installment sale reconciliation updated so paid installments + advance rebuild sale/property remaining totals.
- Installment receipt numbers made human-readable.
- Future installment amount splitting now avoids rounding drift by distributing remainder into final installments.
- Pending collections reconcile installment sale totals before reading.
- Cleanup scripts added for local/cloud test data, but they must not be run automatically.
- Last known successful installer build: `D:\ZameenKhata\dist_electron\AL-SIRAJ-DEVELOPERS-Setup-1.0.1.exe`.

## Phase 0 - Audit

Status: Complete

Findings:

- App already has `dataRefreshKey`, `refreshKey`, `cloud-data-refreshed`, sync warning toasts, and many screens wired to refresh props.
- Missing piece was a central write-success event from the main process after local Excel write succeeds.
- Existing `syncOnline(localFn, supabaseFn, options)` is the safest central place to emit business data changes.

## Phase 1 - Central Business Data Event Bus

Status: Code complete, Vite build verified

Implemented:

- Main process emits `business-data-changed` after each successful local write.
- Event payload includes `tableName`, `operation`, `clientWriteId`, `townName`, `status`, and business event tags.
- Renderer preload exposes `onBusinessDataChanged` and `removeBusinessDataChanged`.
- React `App.jsx` listens to the event, increments `dataRefreshKey`, and dispatches browser events for screens that listen outside props.

Expected result:

- After add/update/delete actions, dependent screens refresh without app restart.
- Receipts, reports, balances, property board, accounts, ledgers, and remaining collections can react to one shared invalidation path.

Remaining:

- Add targeted listeners in any screen that does not already react to `refreshKey` or `al-siraj-data-refreshed`.
- Full Electron installer build. Last attempt reached `electron-builder --win` but hung on a zero-byte NSIS archive; `npx vite build` passed.

Verification:

- `npx vite build` passed on 2026-06-29.

## Phase 2 - High-Risk Write Flow Wiring

Status: Complete

Focus:

- Sale, installment payment, remaining collection, daily entries, salaries, commission, investor, construction, employee/account records.
- Confirm each write uses `syncOnline` with correct `tableName`, `operation`, and stable `clientWriteId`.
- Add missing refresh events only where needed.

Implemented so far:

- Explicit business event metadata added for town updates/prices, plot/shop add, cancel deal, file status updates, installment due-date extension, expenses, CEO expenses, CEO salary, employees, notifications, daily entry delete, salary payments, employee-v2, and advance salary writes.
- Pending collection and file-delivery flows now emit receivable/property refresh events.
- Town agents, investors, investor transactions, construction projects, and construction payments now send explicit insert metadata and stable client write IDs where possible.
- `node --check src/main/ipc.js` passed.
- `npx vite build` passed after these changes.

## Phase 3 - Ledger and Receivable Consistency

Status: In progress

Focus:

- Rebuild totals from `money_ledger`, sales, and installments.
- Fix stale customer receivables after partial payments.
- Make account reports date filters use actual row dates.
- Ensure employee salary payable/received/remaining values update for partial payments.

Implemented so far:

- Account report export now filters rows by `fromDate` / `toDate` before generating HTML/PDF.
- Accounts dashboard listens to central business data events and reloads account cards on ledger/account/remaining changes.
- Remainings screen listens to central events and reloads pending collection data after payments/installments/sales.
- Daily Income entry listens to central events so receivable and installment dropdowns refresh without restart.
- `getMoneySummary(townName)` now refreshes from ledger before returning, reducing stale CEO vs town dashboard mismatches.
- `getAllTownFinancialSummaries()` refreshes each existing town summary before aggregating.
- `node --check src/main/ipc.js` passed.
- `npx vite build` passed after these changes.

## Phase 4 - Receipt, Report, and Media Freshness

Status: In progress

Focus:

- Reload fresh source data before PDF/report generation.
- Save every generated report/receipt into Media.
- Include correct current receivable values in receipts.
- Add clear file names for installment, salary, investor, construction, commission, and account reports.

Implemented so far:

- Ledger, account, due-installment, and receipt archive exports emit `media:changed` / `report:created` events after Media save.
- Media tab listens to central media/report/receipt events and reloads without app restart.
- `npx vite build` passed after these changes.

## Phase 5 - Sync Visibility and Health Audit

Status: In progress

Focus:

- Pending Sync visibility.
- Audit script/screen for duplicate ledger entries, invalid amounts, missing town, missing payment account, stale deleted rows, and cloud/local mismatch.
- Cross-PC freshness checks.

Implemented so far:

- Added non-destructive audit script: `scripts/audit-business-data.mjs`.
- Added npm shortcut: `npm run audit:business`.
- Script checks ledger invalid amounts, duplicate source keys, stale financial summaries, sale/installment receivable mismatches, negative salary remaining, and commission remaining mismatches.
- Audit output writes to `Reports/business-audit-YYYY-MM-DD.json`.
- Ran `node scripts/audit-business-data.mjs` on 2026-06-29. It completed successfully and reported 0 issues against currently available local checked rows.
- Ran `npm run audit:business` successfully.

Remaining:

- Optional in-app System Health screen/button can be added later. CLI audit tooling is available now.

## Phase 6 - Cash & Banks

Status: In progress

Requirement summary:

- Add final town/accounting tab named `Cash & Banks`.
- Default non-deletable `Cash in Hand` account.
- Add/edit/archive bank accounts per town.
- Every financial credit/debit form must require a visible `Payment Account` dropdown: Cash in Hand or active bank.
- Store `paymentAccountId`, `paymentAccountName`, and `paymentAccountType` on ledger/transactions with backward-compatible fallback to Cash in Hand for old rows.
- Balances must come from `money_ledger`: Cash in Hand, each bank, total bank balance, and overall balance.
- Receipts/reports must show payment account information.
- Supabase sync and Pending Sync must include bank accounts and payment-account-linked ledger rows.

Implementation warning:

- This is a schema + Excel + UI + reports feature. It should be done after Phase 1 validation so stale refresh bugs do not hide payment-account issues.

Implemented so far:

- Added `Cash & Banks` as the final town dashboard tab.
- Added local-first `Cash_Bank_Accounts.xlsx` support via `src/main/db/cashBanks.js`.
- Cash in Hand is always available by default and cannot be deleted.
- Bank/wallet accounts can be added and archived from the new tab.
- Cash/bank balances are calculated from approved `Money_Ledger.xlsx` rows, with old rows falling back to Cash in Hand.
- Added payment account fields to money ledger: `Payment_Account_ID`, `Payment_Account_Name`, `Payment_Account_Type`.
- Added IPC/preload APIs: `getPaymentAccounts`, `addBankAccount`, `updateBankAccount`.
- Added sync coverage for `cash_bank_accounts` in sync up/down helpers.
- Added idempotent Supabase SQL: `src/sql/cash-bank-accounts.sql`.
- Audit script now checks cash/bank account validity for ledger rows.
- `npx vite build` passed after these changes.
- `npm run audit:business` passed after these changes.
- Added shared renderer component: `src/renderer/components/PaymentAccountSelect.jsx`.
- Wired payment account selector into high-risk money forms:
  - Daily Income.
  - Daily Expense.
  - Property sale advance.
  - Property resale advance/refund.
  - Pending collection payment.
  - Installment mark-paid action.
  - Commission payment modal.
  - Investor credit/debit.
  - Construction payment.
  - Employee salary/advance payment.
- Persisted payment account fields into local Excel writes for:
  - Daily entries.
  - Sales.
  - Collection payments.
  - Installment money ledger rows.
  - Salary records.
  - Investor transactions.
  - Construction payments.
  - Commission receipts.
- Passed payment account fields into direct online ledger callbacks in `ipc.js` and `online/index.js`.
- Expanded sync table columns and field aliases so payment account data survives upload/download.
- Expanded `src/sql/cash-bank-accounts.sql` with safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for payment account fields across financial tables.
- Ran JS syntax checks for patched main files on 2026-06-30: all passed.
- Ran `npx vite build` on 2026-06-30: passed.
- Ran `npm run audit:business` on 2026-06-30: passed with `issueCount: 0`.
- Expanded `scripts/audit-business-data.mjs` into a reusable health audit module.
- Audit now also checks Daily Entries, Expenses, Collection Payments, Investor Transactions, Construction Payments, Commission Receipts, Receipt Archive, Media Library, and Pending Sync.
- Added checks for invalid dates, invalid/negative amounts, duplicate stable ids, pending/rejected approvals affecting ledger, missing receipt archive rows, missing media files, duplicate pending sync ids, and repeated sync failures.
- Added Settings > System Health Audit UI with `Run System Audit` and `Open Audit Report`.
- Added IPC/preload bridge: `runBusinessAudit`.
- Corrected Settings text to say Local-First Sync: Excel save first, Supabase sync after.
- Ran `node --check src/main/ipc.js`: passed.
- Ran `node --check scripts/audit-business-data.mjs`: passed.
- Ran `npx vite build` after Settings/System Health changes: passed.
- Ran `npm run audit:business` after Settings/System Health changes: passed with `issueCount: 0`.
- Added static wiring coverage audit: `scripts/audit-wiring-coverage.mjs`.
- Added npm shortcut: `npm run audit:wiring`.
- Wiring audit verifies critical event/sync bridge, preload APIs, money ledger payment fields, Cash & Banks module, Supabase schema, payment-account selectors in high-risk forms, backend payment account persistence, Settings health UI, and unsafe notification quick-pay patterns.
- Patched `TownExpenses.jsx` salary payment form so legacy salary/CEO salary payments also require/select a payment account.
- Patched `NotificationPanel.jsx` so installment notification quick action no longer directly receives money without payment account selection; it now directs user to Installment Tracker.
- Ran `npm run audit:wiring`: passed with `issueCount: 0`.
- Ran final `npx vite build`: passed.
- Ran final `npm run audit:business`: passed with `issueCount: 0`.
- Ran another health pass on 2026-06-30:
  - `npm run audit:business`: passed with `issueCount: 0`.
  - `npm run audit:wiring`: passed with `issueCount: 0`.
  - `npx vite build`: passed.
- Added final health briefing: `docs/final-health-briefing-2026-06-30.md`.
- Health conclusion: code/static wiring is green; populated transaction smoke test and Supabase SQL execution remain required before handover.
- Added configurable CEO daily report settings:
  - New local settings store: `src/main/db/dailyReportSettings.js`.
  - Default automatic daily ledger receipt time remains `20:00`.
  - Settings track enabled/disabled state, selected towns/all towns, delivery methods, retry flag, last generated/synced/notification status, and last result.
- Upgraded daily town receipt notification payload for CEO Android routing:
  - Includes `notificationId`, `eventType`, `townId`, `townName`, `reportId`, `receiptId`, `reportDate`, `title`, `body`, `deepLinkTarget`, `createdAt`, `priority`, `readStatus`, `deliveryStatus`, `generated`, and `failed`.
  - Uses stable daily notification id format `DAILY-YYYYMMDD` to reduce duplicate/flood risk.
  - Stores the structured payload in the existing notification row JSON field for backward compatibility with current schema.
- Added IPC/preload APIs:
  - `getDailyReportSettings`.
  - `updateDailyReportSettings`.
  - `resendDailyReportToCeo`.
- Added Settings UI controls for CEO Daily Reports:
  - Enable/disable automatic reports.
  - Time picker.
  - Last status/report date/synced display.
  - Save settings.
  - Generate Now / Resend.
- Changed renderer-side 7 PM flow to reminder-only so report generation is centralized in the main-process scheduler and duplicate media/report creation risk is lower.

Remaining:

- Run `src/sql/cash-bank-accounts.sql` once in Supabase SQL Editor before production handover.
- Run manual real/sample data money-flow smoke test; current local audit data files are empty, so scripts prove wiring/static safety but not a real transaction dataset.
- Run populated transaction smoke test after user approves creating test data, then clean it before final handover.
- Produce final Electron installer/package after smoke test.
- If Electron/NSIS packaging hangs again, troubleshoot packaging separately from app code.

## Current Next Step

Run Supabase SQL, then manual money-flow smoke tests with sample data, then produce the handover build package.
