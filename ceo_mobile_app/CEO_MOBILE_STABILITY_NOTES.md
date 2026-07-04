# CEO Mobile Stability Notes

## What Was Stabilized
- Pending approvals now load through RPC first, then direct table fallback, then disk cache.
- Daily entry review rows share the same approval inbox path.
- Notifications, badge count, towns, activity, online presence, and daily receipt bundles dedupe in-flight requests.
- Realtime refresh bursts are throttled so sync/database changes do not repeatedly rebuild the whole app.
- Daily ledger receipt bundles are cached locally, so the 8 PM receipt screen has a fallback if cloud is slow.
- Active town loaders prefer `ceo_mobile_active_towns` view and fall back to `towns`.

## Supabase SQL To Run
Run this once in Supabase SQL Editor:

```text
src/sql/ceo-mobile-performance-support.sql
```

It creates:
- guarded indexes for faster mobile queries
- `ceo_mobile_active_towns` view
- `ceo_mobile_review_inbox(...)` RPC
- `ceo_mobile_daily_receipt_rows(...)` RPC
- schema cache reload notification

## Build Notes
- Do not run local Flutter commands on this PC if they freeze.
- GitHub Actions workflow: `.github/workflows/build-ceo-android-apk.yml`
- The workflow builds `ceo_mobile_app/build/app/outputs/flutter-apk/app-debug.apk`.

## Remaining Hardening Ideas
- Add server-side filtered realtime channels after SQL is deployed.
- Add a small "last updated" label on pending approvals and daily receipts.
- Add pagination if approvals grow beyond the current `reviewListLimit`.
