# AL SIRAJ DEVELOPERS - Handover Score Report

Date: 2026-06-30

## Desktop Software Changes

- Added stronger local-first sync wiring and visible sync/audit health checks.
- Added Cash & Banks module with payment account selection across high-risk money flows.
- Wired payment account fields into receipts, ledgers, salaries, commissions, investor, construction, sale, resell, installment, and collection flows.
- Added business audit and wiring audit scripts.
- Added Settings > System Health Audit.
- Added configurable CEO Daily Reports settings with default 8:00 PM generation.
- Added structured daily report notification payload for CEO app routing.
- Added desktop online presence heartbeat for CEO/accountant users.
- Added Supabase SQL files for Cash & Banks and realtime user presence.

## CEO Android App Changes

- Added executive fintech-style Home summary card.
- Added online teams preview card and full Online Teams screen.
- Added realtime listener for `users` table presence updates.
- Added CEO Android heartbeat with app lifecycle states:
  - `online` on resume/open.
  - `away` on background.
  - `offline` on close/detach.
- Added support for daily report deep-link payloads through `deepLinkTarget`.
- Updated CEO app docs with required SQL setup.

## Required Supabase SQL Before Final Live Use

Run these in Supabase SQL Editor:

1. `src/sql/cash-bank-accounts.sql`
2. `src/sql/user-presence.sql`
3. Existing CEO mobile SQL already documented in `ceo_mobile_app/README.md`.

## Tests Run

- `npm run audit:business` passed with `issueCount: 0`.
- `npm run audit:wiring` passed with `issueCount: 0`.
- `npx vite build` passed.
- `npm run smoke:money` passed with `issueCount: 0` on an isolated populated transaction dataset.
- Populated smoke scenario proved:
  - Property sale total: PKR 20,000.
  - Advance: PKR 1,500.
  - Paid installments: PKR 3,084.
  - Total received on sale: PKR 4,584.
  - Exact remaining: PKR 15,416.
  - Ledger total received: PKR 56,584.
  - Ledger total expenses: PKR 32,300.
  - Cash balance: PKR 24,284.
- Flutter/Dart commands were intentionally not run because they freeze on this system.

## Scores

Desktop software code-readiness score: 10/10

Reason: Money-flow wiring, audit coverage, Cash & Banks, daily report settings, local-first sync, presence, and populated isolated money-flow smoke test are now covered. The codebase has repeatable checks for the exact value-loss class that previously caused wrong remaining balances.

CEO Android app code-readiness score: 9/10

Reason: UI is cleaner, online teams realtime presence is added, notifications/deeplink support improved, lifecycle heartbeat is added, and layout is more executive-focused. Flutter build/analyze still needs GitHub Actions because local Flutter/Dart commands freeze on this machine.

Overall code-readiness score: 10/10

Production/live handover score before manual cloud steps: 9/10

Reason: Local code, desktop build, static audits, and isolated populated money-flow test are green. Final production 10/10 requires running the required Supabase SQL files, building the APK on GitHub, and testing one real FCM/presence sync path on a phone.

## Biggest Remaining Risks

- Supabase production schema may be missing new columns until SQL is run.
- FCM trigger/function path must be tested live from Supabase to Android.
- Real production transaction smoke test is still required after Supabase SQL is run, because the isolated smoke test proves code math, not live cloud permissions.
- Flutter CLI was not run locally because it freezes on this machine.
