# Project Summary — AL SIRAJ DEVELOPERS

## Goal
Complete dual-write integration (Excel + Supabase for all writes with user-visible sync warnings) and redesign auth/registration system (only Agent self-registers; CEO creates Accountant accounts).

## Constraints & Preferences
- Every write must go to Excel first, then sync to Supabase; if sync fails, show a visible error toast to the user
- All reads must come from local Excel (fast, offline-capable); no Supabase reads in IPC handlers
- Existing Excel data stays unchanged — no migration
- Only Agent role can see a Register tab on the login screen; CEO and Accountant must have no self-registration option
- Accountant accounts can only be created by a CEO via a button in the CEO dashboard (enter email + password)
- Login UI should be premium / improved
- Build must pass with `npx vite build`

## Progress
### Done
- Dual-write architecture complete: all 28 write IPC handlers now call `syncOnline(localResult, syncFn)` — local write first, then Supabase sync
- `syncOnline` helper returns `syncWarning` field in the response object on failure and sends a `sync-warning` IPC event to the renderer
- Renderer listens for `sync-warning` via `window.api.onSyncWarning` and shows a red `.toast.error` in the top-right corner
- Online adapter (`src/main/db/online/index.js`) has complete CRUD for all entities: towns, properties, sales, installments, expenses, ceo_expenses, ceo_salary, employees, notifications, daily_entries, employees_v2, advance_salaries, salary_payments
- Removed duplicate `cancel-deal` and `updateFileStatus` handlers that were overriding the correct dual-write versions
- SQL schema updated with price columns on towns table, added `employees_v2`, `advance_salaries`, `salary_payments` tables with RLS policies
- Settings UI simplified to info-only card ("Dual-Write Mode Active") instead of mode toggle
- AuthScreen Register tab now only renders when `selectedRole === 'agent'`
- AuthScreen role selection buttons redesigned with icon-wrap, info block, and arrow indicator
- CEO ProjectsHub has a "➕ Accountant" button that opens a modal (name, email, password) to create accountant via Supabase signUp
- IPC handler `create-accountant` in `ipc.js` validates fields, calls `supabase.auth.signUp`, inserts into `users` table with role=accountant
- Preload bridge exposed as `window.api.createAccountant(params)`

### Done (Phase 3 additions)
- AuthScreen: Town dropdown loads from Supabase via `window.api.getTowns()` (shows `<select>` if towns available, falls back to text `<input>`)
- Added `.auth-select-input` CSS class in `index.css` with custom chevron icon
- CEOProjectsHub: Pending Commissions banner appears below the financial summary when commissions are pending (shows agent name, amount, "Mark Paid" button per commission, total count/summary)
- Online `getCommissions` now joins `users` table to include `agent_name` / `agent_email` in results
- Setup SQL updated to include Phase 2 schema (ALTER all_sales, new commissions table, role-based RLS policies)
- Created `src/sql/phase2-schema.sql` for manual Supabase SQL editor use
- Added IPC handlers `get-commissions` and `mark-commission-paid` in ipc.js + preload.js
- `recordCollectionPayment` now auto-creates commission record when remaining_amount reaches 0

### Done (Phase 4 — Accountant Auth Revamp)
- **AccountantUnlockScreen**: New dedicated component (`AccountantUnlockScreen.jsx`) — showed directly after first-time login setup. Only asks for administration password (no email/password fields). Bypasses entire AuthScreen role selection flow.
- **AuthScreen admin password removed**: Admin password field removed from login form. After first successful email+password login, accountant sees a "Set Administration Password" step (password + confirm). Only shown once per accountant.
- **App.jsx unlock detection**: `needsAccountantUnlock` check reads localStorage for saved session with `admin_password_set: true`. When true, renders AccountantUnlockScreen instead of AuthScreen.
- **AdminPasswordConfirm modal**: Reusable modal component (`AdminPasswordConfirm.jsx`) for destructive actions — validates admin password before allowing delete/cancel operations. Integrated into DailyEntries delete and SoldProperties cancel deal.
- **Town deletion deactivates accountants**: `delete-town` IPC handler now calls `accountantAuth.deactivateByTown(dbPath, townName)` to mark local accountants as inactive, and updates Supabase `users` table (`is_active = false`) for accountants assigned to the deleted town.
- **`deactivateByTown` added to `accountantAuth.js`**: New exported function that finds all accountants by town name and sets `is_active = false` in the local `Accountant_Offline_Logins.json`.
- **CSS**: Added `.unlock-container`, `.unlock-card`, `.unlock-shield`, `.unlock-title`, `.unlock-accountant-info`, `.admin-password-modal` styles in `index.css`.

### In Progress
- None

## Key Decisions
- `syncOnline` catches Supabase errors and attaches `syncWarning` to the response object instead of silently logging
- `mainWindow.webContents.send('sync-warning', msg)` fires a real-time toast even for fire-and-forget calls
- `registerIpcHandlers(ipcMain, dbPath, win)` now accepts the main window reference for sending events to renderer
- CEO creates accountant via Supabase `signUp` + direct `users` table insert with role='accountant', is_active=true — bypasses registration flow entirely

## Relevant Files
- `src/main/ipc.js`: Central IPC handler file; all 28 write handlers use `syncOnline`, `syncOnline` helper with `mainWindow.webContents.send`, `registerIpcHandlers` now accepts win parameter; added `create-accountant` handler
- `src/main/preload.js`: Exposes `onSyncWarning(callback)` and `createAccountant(params)` for renderer
- `src/main/main.js`: Passes `activeWindow` as third arg to `registerIpcHandlers`
- `src/main/db/online/index.js`: Full CRUD module for 15+ business tables; resellProperty, cancelDeal, updateFileStatus, sellProperty complete flows
- `src/main/db/supabase.js`: Main-process Supabase client instance
- `src/sql/supabase-business-tables.sql`: 18 tables defined with indexes and RLS policies
- `src/renderer/components/AuthScreen.jsx`: Role selection redesign, Register tab conditional on agent role
- `src/renderer/components/Settings.jsx`: Dual-write info card replacing mode toggle
- `src/renderer/App.jsx`: `useEffect` for `window.api.onSyncWarning` to show toast
- `src/renderer/components/CEOProjectsHub.jsx`: Create Accountant button + modal UI (name, email, password, success state)
- `src/renderer/contexts/AuthContext.jsx`: Auth context with signIn/signUp/signOut
- `src/renderer/lib/supabase.js`: Renderer-side Supabase client singleton
- `src/renderer/index.css`: Auth CSS classes (updated role button styles at ~line 2958–3025)
- `src/renderer/components/AccountantUnlockScreen.jsx`: Dedicated unlock screen — only admin password input, bypasses role selection
- `src/renderer/components/AdminPasswordConfirm.jsx`: Reusable modal for destructive actions with password validation
- `src/main/db/accountantAuth.js`: Added `deactivateByTown` function for town-deletion accountant cleanup
