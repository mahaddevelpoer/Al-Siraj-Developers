# AL SIRAJ DEVELOPERS - Handover Deployment Checklist

Use this checklist before sending a test/final installer to the client.

## 1. Supabase Schema Step

Run this SQL once in Supabase SQL Editor before using Cash & Banks/payment accounts in production:

```sql
-- File in repo:
-- src/sql/cash-bank-accounts.sql
```

Expected result:

- `cash_bank_accounts` table exists.
- `money_ledger` has payment account columns.
- financial tables have payment account columns.
- PostgREST schema reload is triggered by `NOTIFY pgrst, 'reload schema';`.

## 2. Local Build Checks

Run:

```powershell
npx vite build
npm run audit:business
npm run audit:wiring
```

Expected:

- Vite build succeeds.
- Business audit returns `issueCount: 0`.
- Wiring audit returns `issueCount: 0`.

## 3. In-App Health Check

Open:

- `Settings`
- `System Health Audit`
- click `Run System Audit`

Expected:

- Issues: `0`
- Pending Sync: expected count, ideally `0` before handover
- Status: `Safe`
- `Open Audit Report` opens the generated report.

## 4. Manual Money Flow Smoke Test

Use fresh test data or a dedicated test town.

1. Add a town.
2. Add one bank account in `Cash & Banks`.
3. Add one plot/shop.
4. Sell property with advance into `Cash in Hand`.
5. Sell another property with installments into bank.
6. Pay two installments from Installment Tracker.
7. Collect remaining amount for an advance-only sale.
8. Add daily income and daily expense with payment account selection.
9. Pay employee salary from bank.
10. Add investor credit to bank.
11. Add investor debit from Cash in Hand.
12. Add construction payment from bank.
13. Add commission payment from Cash in Hand.

Expected after every save:

- UI updates without restart.
- Town dashboard totals update.
- Cash & Banks balances update.
- Accounts/ledgers update.
- Receipt/report opens with current value.
- `npm run audit:business` stays clean.

## 5. Sync Smoke Test

1. Do one local write while online.
2. Confirm no red sync warning appears.
3. If sync warning appears, open Settings and check pending sync.
4. Run Sync from Cloud/Sync to Cloud flow as needed.
5. On second PC, pull/sync and confirm same town, sales, ledger, cash/bank balances.

Expected:

- No duplicate ledger rows.
- No stale remaining values.
- No missing receipts/media metadata.

## 6. Build Package

Preferred order:

```powershell
npx vite build
npm run audit:business
npm run audit:wiring
npm run build
```

Note:

- If `npm run build` hangs in Electron/NSIS packaging, do not assume app code failed. Vite build and audits validate renderer/main wiring; packaging may need separate NSIS/electron-builder troubleshooting.

## 7. Final Handover Status Terms

Use these only after checks:

- `Wiring Audit: Passed`
- `Business Audit: Passed`
- `Single Source of Truth: Partially Implemented`
- `Cash & Banks: Wired for high-risk financial flows`
- `Remaining Risk: Manual real-data smoke test and Supabase SQL execution required`

