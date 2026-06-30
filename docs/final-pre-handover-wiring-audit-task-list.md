# AL SIRAJ DEVELOPERS - Final Pre-Handover Wiring Audit Task List

Purpose: keep the final handover work focused even after context compaction. Do not rewrite the whole app. Do not delete business data. Audit and fix wiring so every write updates Excel, ledger, summaries, UI, receipts/reports, sync, and dashboards safely.

## Non-Negotiable Safety Rules

- Do not delete existing Excel, Supabase, or business records.
- Do not destructively rewrite Excel files or Supabase tables.
- Keep old Excel/Supabase records readable.
- Local Excel save must happen before cloud sync.
- UI must refresh after local save succeeds, without waiting for Supabase.
- Pending/rejected approvals must not affect totals.
- Approved actions must apply once only.
- Never silently convert invalid amount to a wrong value.
- Never show success if a critical save failed.
- All user-facing errors/success messages should be professional English.

## Current Known Context

- Electron + React desktop ERP.
- ExcelJS local-first storage.
- Supabase sync/cloud backup.
- Flutter CEO Android app integration exists separately.
- Cash & Banks / Payment Accounts feature has been partly wired.
- `npx vite build` and `npm run audit:business` were green after latest Cash & Banks wiring.
- Required Supabase SQL for Cash & Banks/payment columns: `src/sql/cash-bank-accounts.sql`.

## Phase 1 - Financial Write Flow Audit

Goal: every money action must be connected end-to-end.

Check each module:

- Property sale.
- Cash/full sale.
- Advance-only sale.
- Installment sale.
- Installment payment.
- Remaining collection.
- Sold properties.
- Resell property/history.
- Daily income entries.
- Daily expense entries.
- Salary payments.
- Employee salary remaining.
- Commission payments.
- Investor credit.
- Investor debit.
- Construction deal/payment.
- Town prices affecting sale values.
- Approvals.
- Reports.
- Receipts.
- CEO dashboard.
- Town dashboard.
- Accounts/ledgers.
- Cash & Banks / Payment Accounts.
- Pending Sync.
- Supabase sync/pull.
- Bell notifications.

For every financial action verify:

- Input validation blocks invalid amount/date/town/account.
- Local Excel write succeeds first.
- `money_ledger` row is created or updated with stable source id.
- Selected payment account is attached: `Payment_Account_ID`, `Payment_Account_Name`, `Payment_Account_Type`.
- Derived summaries are rebuilt or invalidated.
- Renderer event is emitted.
- Affected screens reload fresh data.
- Receipt/report uses fresh source data.
- Pending sync item is created or sync warning is visible.
- Supabase upsert uses stable conflict keys.
- Sync success/failure is clearly shown.
- Double click/retry cannot duplicate ledger totals.
- Audit trail id / transaction id exists.

Done when:

- No known money action bypasses ledger/sync/refresh.
- No button silently does nothing.

## Phase 2 - Single Source Of Truth Verification

Goal: money totals come from ledger/source records, not stale component state.

Verify:

- Total Received comes from `money_ledger` or source financial records.
- Total Expenses comes from `money_ledger` or source financial records.
- Cash Balance = received minus paid out.
- Cash in Hand balance comes from ledger rows assigned to Cash in Hand.
- Bank balances come from ledger rows assigned to each bank.
- Overall Balance = Cash in Hand + all banks.
- Pending/Remainings come from sale/installment/collection source records.
- `town_financial_summary` is cache only, rebuilt from truth.
- Dashboards do not trust stale React state.
- Receipts/reports reload source data before generating.

Done when:

- CEO dashboard, town dashboard, Cash & Banks, Accounts, Remainings, Sold Properties, and reports agree on the same values after save and restart.

## Phase 3 - Instant UI Refresh / Data Invalidation

Goal: no restart needed after saves.

Verify central events and listeners for:

- `ledger:changed`
- `summary:rebuild-required`
- `summary:rebuilt`
- `property:changed`
- `installment:changed`
- `remaining:changed`
- `salary:changed`
- `expense:changed`
- `investor:changed`
- `construction:changed`
- `commission:changed`
- `cash-bank:changed`
- `receipt:created`
- `report:created`
- `sync:queued`
- `sync:success`
- `sync:failed`

Screens that must reload fresh data:

- CEO dashboard.
- Town dashboard overview.
- Property board.
- Sold properties.
- Remainings.
- Installment tracker.
- Accounts.
- Salaries.
- Investors.
- Construction.
- Commission tracker.
- Reports/media.
- Bell notifications.
- Cash & Banks.

Done when:

- A successful local save changes all dependent screens immediately.

## Phase 4 - Cash & Banks Wiring

Goal: payment account is first-class everywhere money moves.

Verify:

- Cash in Hand exists by default.
- Active banks appear in payment account dropdowns.
- Archived/inactive banks are hidden from new payments.
- Sale advance credits selected account.
- Installment payment credits selected account.
- Remaining collection credits selected account.
- Investor credit credits selected account.
- Daily expense debits selected account.
- Salary debits selected account.
- Commission debits selected account.
- Construction payment debits selected account.
- Investor debit debits selected account.
- Receipts show payment account.
- Reports show payment account.
- Ledger stores payment account fields.
- Old rows without account safely default to Cash in Hand or legacy/unassigned without breaking totals.

Done when:

- Cash & Banks balances update instantly after every money action.

## Phase 5 - Amount Safety And Calculation Audit

Search risky calculation usage:

- `NaN`
- `Number(`
- `parseFloat`
- `parseInt`
- `amount`
- `advance`
- `remaining`
- `paid`
- `received`
- `expense`
- `salary`
- `commission`
- `investor`
- `construction`
- `balance`
- `totalReceived`
- `totalExpenses`
- `cashBalance`
- `bankBalance`
- `townSummary`
- `financialSummary`
- `dashboardSummary`

Fix with shared safe money utilities where needed:

- `parseMoney`
- `validateMoney`
- `formatMoney`
- `addMoney`
- `subtractMoney`
- `calculateRemaining`
- `calculateCashBalance`
- `calculateAccountBalance`

Installment rules:

- Advance + paid installments determines remaining.
- Future installments split exactly.
- Last installment absorbs rounding difference.
- Total scheduled installments must not exceed deal amount.
- Paid installment must update tracker, remainings, sold property, receipt, dashboard, and Cash & Banks.

Done when:

- No known `NaN`, Infinity, silent zero, duplicate count, or wrong remaining path exists.

## Phase 6 - Approval Safety

Verify:

- Pending approval does not affect totals.
- Rejected approval does not affect totals.
- Approved approval applies exactly once.
- Approved entry creates/updates correct ledger record.
- Approval changes refresh dashboards/reports.
- Offline approval is blocked with clear message.
- Approval sync status is visible.

Done when:

- Daily entry/date-change/salary/investor/construction approval flows are financially safe.

## Phase 7 - Receipts And Reports

Before every receipt/report:

- Reload fresh source data.
- Rebuild/invalidate summaries if needed.
- Generate from current real records.
- Include payment account info where applicable.
- Save metadata into receipt/media archive.
- Queue cloud sync.
- Emit refresh event.
- Show English success/error.

Audit:

- Property sale receipt/agreement.
- Installment receipt.
- Salary receipt.
- Investor debit/credit receipt.
- Construction receipt.
- Commission receipt.
- Account ledger report.
- Town ledger report.
- Daily CEO report.
- Due installment report.

Done when:

- Reports do not use stale component state and remain available after restart.

## Phase 8 - Supabase Sync / Pending Sync

Verify:

- Every local write creates or triggers pending sync.
- Queue item has stable id, entity type, operation, payload, status, retry count, timestamps.
- Retry does not duplicate rows.
- Sync failure keeps local data safe.
- Sync failure shows English warning.
- Sync success marks item synced.
- Cloud pull does not overwrite newer unsynced local data.
- After pull, summaries rebuild and UI refreshes.
- Second PC receives latest data after sync.
- Bank accounts sync.
- Account-linked ledger syncs.
- `receipt_archive` syncs.
- `media_library` syncs.

Manual Sync Now flow if needed:

- Push pending local changes.
- Pull cloud changes.
- Rebuild summaries.
- Refresh UI.
- Show final sync result.

Done when:

- Local and cloud can recover from retry without duplicates.

## Phase 9 - Accountant Town Scope

Verify:

- Accountant sees only assigned town.
- Accountant writes only assigned town.
- Accountant sync/download is town-scoped.
- CEO sees all towns.
- CEO aggregate dashboards include all towns correctly.
- No calculations lose data because of wrong role/town filters.

Done when:

- Same data is correct for CEO global view and accountant town view.

## Phase 10 - System Health / Audit Tool

Existing script:

- `npm run audit:business`

Upgrade script or add CEO/admin-only screen to check:

- Pending sync count.
- Failed sync count.
- Latest local write time.
- Latest cloud sync time.
- Ledger total vs `town_financial_summary`.
- Cash in Hand mismatch.
- Bank balance mismatch.
- Overall balance mismatch.
- Installment remaining mismatch.
- Sold property remaining mismatch.
- Missing payment account.
- Invalid payment account id.
- Duplicate transaction ids.
- NaN/invalid amounts.
- Missing receipt files.
- Orphan receipt_archive rows.
- Orphan media_library rows.
- Approval records incorrectly affecting totals.
- Accountant town scope issues.

Done when:

- Audit reports issues clearly in English and does not auto-delete anything.

## Phase 11 - Practical Verification Scripts / Manual Flows

Add or run tests for:

- Add town.
- Add bank.
- Sell cash/full property to Cash in Hand.
- Sell installment property to bank.
- Pay two installments.
- Collect remaining.
- Add expense from Cash in Hand.
- Add salary from bank.
- Add investor credit to bank.
- Add investor debit from Cash in Hand.
- Add construction payment from bank.
- Add commission payment.
- Pending approval does not affect totals.
- Approved approval affects totals once.
- Rejected approval does not affect totals.
- Receipt uses fresh data.
- Report uses fresh data.
- Local save with cloud failure remains safe.
- Sync retry does not duplicate.
- Second PC pull shows same data.
- Dashboard updates without restart.
- Cash & Banks balances update instantly.

Done when:

- Results are written into `docs/presentation-readiness-phase-log.md` or an audit report.

## Phase 12 - Button Audit

Audit main buttons:

- Save.
- Update.
- Delete/Cancel if available.
- Sell property.
- Pay installment.
- Collect remaining.
- Add bank.
- Generate receipt.
- Generate report.
- Sync now.
- Approve/reject.
- Rebuild summary.
- Add salary.
- Add expense.
- Add investor credit/debit.
- Add construction payment.
- Add commission payment.

Each button must:

- Validate input.
- Prevent double-click duplicates.
- Show loading state.
- Save locally first.
- Queue sync where needed.
- Emit refresh events.
- Show clear English success/error.

Done when:

- No critical button silently fails or double-posts.

## Final Report Required

When complete, final answer must include:

1. Wiring Audit Result
2. Previous Stale Data Problem
3. Single Source of Truth Status
4. Amount Safety Status
5. Sync Safety Status
6. Files Changed
7. Tests / Checks Run
8. Remaining Risks

Use one exact source-of-truth status:

- `Single Source of Truth: Implemented`
- `Single Source of Truth: Partially Implemented`
- `Single Source of Truth: Not Implemented`

## Build / Check Commands

Run before handover:

```powershell
npx vite build
npm run audit:business
```

Run syntax checks for changed main-process files:

```powershell
node --check src\main\ipc.js
node --check src\main\db\online\index.js
node --check src\main\db\moneyLedger.js
node --check src\main\db\globals.js
node --check src\main\db\properties.js
node --check src\main\db\businessExtras.js
node --check src\main\db\dailyEntries.js
```

## Acceptance Criteria

The task is complete only when:

- All critical modules are wired to central data flow.
- Financial calculations are source-of-truth based.
- UI refreshes instantly after local save.
- Sync is safe and retry does not duplicate.
- Receipts/reports use fresh data.
- Cash & Banks is wired everywhere.
- Old data remains safe/readable.
- Build passes.
- Audit passes or known issues are documented honestly.
