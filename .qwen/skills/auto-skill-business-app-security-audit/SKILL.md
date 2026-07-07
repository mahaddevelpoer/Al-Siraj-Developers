---
name: business-app-security-audit
description: Security audit methodology for offline-first, dual-write business management apps with fraud prevention, accountant accountability, and data integrity checks.
source: auto-skill
extracted_at: '2026-07-06T17:45:00.000Z'
---

## Problem Context

A business management app (towns, properties, sales, installments, expenses, employees, investors, constructors) where:
- Accountants work offline in remote areas with no internet
- CEO approves sensitive changes via desktop or mobile app
- Every write goes to local Excel first, then syncs to Supabase
- Accountant has incentive to manipulate data for personal gain (ghapla/fraud)
- **Even 1 Rs of data loss or manipulation is unacceptable**

## Audit Framework — Check These 9 Areas

### 1. Server-Side Input Validation (IPC/API Layer)
**Rule:** Never trust the renderer. Every IPC handler must validate inputs server-side.

**Check:**
- Can a user bypass UI restrictions by calling IPC directly with modified data?
- Are dates, amounts, enums, and IDs validated before processing?
- Are sensitive actions (sell, delete, modify) checked for authorization?

**Example vulnerability:** `Sell_Date` is `disabled` in UI, but `sell-property` IPC handler accepts any date from the payload without server-side validation.

### 2. Offline Mode Exploitation
**Rule:** Offline operations must be queued with expiry warnings and archival — never silently deleted.

**Check:**
- Are offline pending items stored in durable storage (not just localStorage)?
- Is there a 24-hour expiry with warnings at 22h and 23h?
- Do expired items get archived (not silently deleted)?
- Can the accountant perform fraud-only operations while offline (where appeals can't fire)?

**Critical question:** What operations work fully offline without requiring CEO approval? Those are the fraud vectors.

### 3. File Integrity (Excel/Direct Storage)
**Rule:** If the user has filesystem access to data files, they can edit them directly.

**Check:**
- Can data files (Excel, JSON, SQLite) be opened and edited outside the app?
- Is there any checksum, hash, or integrity verification?
- Is there a file watcher to detect external modifications?

**Fix options:** SHA-256 hash on every write, verify on startup. Or `fs.watch` for real-time detection.

### 4. Dual-Write Consistency
**Rule:** The local and cloud copies must stay consistent. Divergence = data loss risk.

**Check:**
- What happens when Excel write succeeds but Supabase sync fails permanently?
- Is there a retry limit? What happens after max retries?
- Can cloud download be permanently blocked by stuck pending rows?
- Do read handlers prefer local data (correct) or cloud data (risk of stale data)?

### 5. Sequential/Ordered Payment Validation
**Rule:** Payments must follow business rules — out-of-order payments indicate fraud.

**Check:**
- Can installment #5 be paid before #1?
- Can partial payments be applied to the wrong account?
- Are running balances recalculated after every payment?

### 6. Deletion Without Audit Trail
**Rule:** Every deletion must leave a trace.

**Check:**
- Are delete operations logged?
- Can a town be deleted with all its history (sales, expenses, employees)?
- Is there soft-delete with archive instead of permanent purge?

### 7. Receipt/Document Tampering
**Rule:** Generated receipts must be tamper-proof.

**Check:**
- Can receipts be created without a corresponding transaction?
- Is there a receipt hash/signature?
- Can old receipts be modified after generation?

### 8. Role-Based Access Enforcement
**Rule:** Role checks must be server-side, not client-side.

**Check:**
- Can an accountant impersonate CEO by modifying client-side role state?
- Are destructive actions gated by server-side role verification?
- Is `assertPermanentDeleteAllowed()` called in every delete handler?

### 9. Scheduled/Cron Jobs
**Rule:** If a feature promises automated actions (daily reports, notifications), verify they exist.

**Check:**
- Does the daily 8PM report actually have a cron/scheduler?
- Are FCM push notifications triggered on the right events?
- What happens if the edge function fails?

## Fraud Scenario Test Matrix

After the audit, test these specific scenarios:

| Fraud Attempt | Expected Result | Actual Result |
|---------------|----------------|---------------|
| Change sell date via DevTools IPC call | Rejected | ? |
| Edit Excel file directly | Detected | ? |
| Submit backdated entry offline | Queued + warns on expiry | ? |
| Pay installment #5 before #1 | Rejected | ? |
| Delete town with full history | Soft-delete + archive | ? |
| Create receipt without transaction | Rejected | ? |
| Manipulate cash balance in Excel | Detected | ? |

## Priority Classification

- **P0 (Critical):** Direct financial loss possible — fix immediately
- **P1 (High):** Significant risk — fix this week
- **P2 (Medium):** Improvements needed — fix this sprint
- **P3 (Low):** Good to have — plan for next release

## Files to Audit

| Area | Key Files |
|------|-----------|
| IPC handlers | `src/main/ipc.js` — every handler is a potential entry point |
| Dual-write helper | `syncOnline()` function — check error handling and retry logic |
| Offline storage | `pendingSync.js`, localStorage usage — check durability |
| Auth/guards | `assertPermanentDeleteAllowed()`, `isAccountantScoped()` |
| Money tracking | `moneyLedger.js`, `cashBanks.js` — balance computation |
| Offline auth | `accountantAuth.js` — offline login bypass risk |
| Appeals | `appeals.js`, `PendingAppeals.jsx` — expiry and reminder logic |
| Mobile RPCs | SQL files in `src/sql/` — deployed or not? |

## Implemented Security Fixes (Reference)

These fixes were applied after the initial audit — use as reference patterns:

### Fix: Server-Side Date Validation
In `sell-property` and `resell-property` IPC handlers:
```js
const today = new Date().toISOString().slice(0, 10);
const saleDate = String(data.Sell_Date || '').slice(0, 10);
if (saleDate && saleDate !== today) {
  throw new Error(`Sell date must be today (${today}). To use a different date, request a date change appeal from CEO first.`);
}
if (!saleDate) data.Sell_Date = today;
```

### Fix: File Integrity Hash System
In `core.js` — three exported functions:
- `hashExcelFile(filePath)` — SHA-256 of file contents
- `verifyAllFileHashes()` — compare current hashes against `Global/File_Integrity_Hashes.json`
- `updateAllFileHashes()` — walk Global/, Towns/, Properties/ and regenerate all hashes

### Fix: Pending Appeals Archive + Warnings
In `PendingAppeals.jsx` — `refresh()` now:
- Separates items into `next`, `expired`, `warnings` arrays
- Archives expired items to localStorage (not silent delete)
- Shows warning toast at 22h, error toast at expiry

### Fix: Sequential Installment Payment
In `globals.js` `markInstallmentPaid()`:
```js
const targetMonth = parseInt(item.Month_Number || 1, 10);
if (saleId && targetMonth > 1) {
  const sameSale = all.filter(i => i.Sale_ID === saleId)
                     .sort((a, b) => a.Month_Number - b.Month_Number);
  for (const prev of sameSale) {
    if (prev.Month_Number < targetMonth && prev.Status !== 'Paid') {
      throw new Error(`Installment #${prev.Month_Number} must be paid before #${targetMonth}`);
    }
  }
}
```

### Fix: Max Retry Limit for Pending Sync
In `pendingSync.js` — `markPendingAttemptFailed()`:
- After 10 retries, marks row as `"failed"` instead of infinite retries
- Prevents cloud download from being permanently blocked by stuck rows

### Fix: File Watcher — Real-Time Tamper Detection
In `src/main/db/fileWatcher.js`:
- Builds SHA-256 baseline hash of ALL Excel files on startup
- Uses `fs.watch(recursive: true)` on Global/, Towns/, Properties/
- Fallback: 30-second periodic scan catches what `fs.watch` misses
- On hash change (not from our app): sends Electron `Notification` + `webContents.send('file-tamper-alert', ...)`
- Renderer shows red toast via `window.api.onFileTamperAlert`
- `signalWriteStart()` / `signalWriteDone()` suppress false positives from our own writes

### Fix: Town Prices Supabase Comparison
In `get-town-prices` IPC handler:
- After reading local prices, fetches cloud prices from Supabase `towns` table
- Compares `Plot_Rate_Per_Marla` local vs cloud
- Returns `cloudWarning: { localPlotRate, cloudPlotRate, mismatch: true }` if different
- Non-blocking: 3s timeout, errors silently swallowed
- Enables frontend to detect accountant's local-only price manipulation

### Fix: Commissions Supabase Fallback
In `get-commissions` IPC handler:
- Reads local `Commissions.xlsx` as primary source
- Fetches cloud `commissions` table via Supabase
- Merges: cloud status (paid/partial) updates local pending rows
- Adds cloud-only rows that are missing locally
- Non-blocking: 3s timeout, errors silently swallowed

### Fix: 8PM Daily Report Scheduler
In `src/main/db/dailyReportScheduler.js`:
- Reads configured time from `dailyReportSettings` (default `20:00`)
- Calculates next run time (today if future, tomorrow if past)
- On trigger: generates per-town summary (properties sold, revenue, expenses, net)
- Sends Electron `Notification` to desktop
- Sends `webContents.send('daily-report-ready', ...)` to renderer
- Invokes Supabase Edge Function `send-ceo-push` for FCM push to CEO mobile
- Re-schedules automatically after each run (recursive `startDailyReportScheduler`)

### Fix: 2-Hour Reminder Bell for Pending Appeals
In `PendingAppeals.jsx` `refresh()`:
- Each pending appeal has `nextReminderAt` (created + 2h, then rolling +2h)
- Every 60s check: if `now >= nextReminderAt` → fire reminder
- Reminder fires: `Notification` API + toast + audio playback
- Updates `nextReminderAt` to `now + 2h` (prevents spam)
- Requests `Notification.requestPermission()` on first mount
- Works even when window is in background
