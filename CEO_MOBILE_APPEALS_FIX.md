# CEO Mobile Appeals — Diagnostic & Fix Guide

## Problem
Appeals are created and visible in the CEO desktop app, but **do not appear** in the CEO mobile app.

## Root Cause
The CEO mobile app relies on **Supabase RPC functions** (`ceo_mobile_get_appeals`, `ceo_mobile_review_inbox`) that must be deployed to the Supabase database. If these functions don't exist, or if the `users` table doesn't have `role='ceo'` for the logged-in user, the mobile app's queries fail silently and fall back to direct table reads (which may also fail due to RLS).

## Fix (One-Time Setup)

### Step 1: Run the SQL Migration
1. Open your Supabase project → **SQL Editor**
2. Open the file: `src/sql/ceo-mobile-appeals-complete-fix.sql`
3. Copy **all** its contents and paste into the SQL Editor
4. Click **Run** (or press Ctrl+Enter)
5. Wait for `NOTIFY pgrst, 'reload schema'` to complete

### Step 2: Verify the CEO User
Run this query in SQL Editor:
```sql
SELECT id, email, role, is_active, full_name FROM public.users WHERE role = 'ceo';
```
If this returns **zero rows**, the CEO auth user doesn't have a profile with `role='ceo'`. Fix it:
```sql
-- Replace <CEO_AUTH_UUID> with the actual UUID from auth.users
UPDATE public.users SET role = 'ceo', is_active = true WHERE id = '<CEO_AUTH_UUID>';
-- Or insert if missing:
INSERT INTO public.users (id, email, role, is_active, full_name)
VALUES ('<CEO_AUTH_UUID>', 'ceo@example.com', 'ceo', true, 'CEO')
ON CONFLICT (id) DO UPDATE SET role = 'ceo', is_active = true;
```

### Step 3: Verify Appeals Exist
```sql
SELECT id, appeal_type, status, town_name, created_at, requested_by_user_id
FROM public.appeals
ORDER BY created_at DESC
LIMIT 10;
```

### Step 4: Test the RPC Functions
```sql
-- Test the appeals-only RPC:
SELECT * FROM public.ceo_mobile_get_appeals('pending', 10);

-- Test the unified inbox RPC:
SELECT * FROM public.ceo_mobile_review_inbox('pending', 40);
```
Both should return JSON/array rows. If they return `null` or empty arrays, the appeals data doesn't match the status filter.

### Step 5: Diagnose Auth (as the CEO user)
Log into the mobile app as the CEO user, then run this in SQL Editor:
```sql
SELECT * FROM public.ceo_mobile_diagnose_auth();
```
Expected output:
```json
{
  "uid": "<ceo-uuid>",
  "uid_text": "<ceo-uuid>",
  "has_uid": true,
  "role_in_db": "ceo",
  "is_ceo": true,
  "is_active": true
}
```
If `"is_ceo": false` → the `users` table row for this user doesn't have `role='ceo'`.

## How the Mobile App Fetches Appeals (3-Tier Fallback)

```
Tier 1 (preferred):  ceo_mobile_get_appeals(p_status, p_limit)
                     → SECURITY DEFINER RPC, bypasses RLS entirely
                     → Returns jsonb array with nested user profiles

Tier 2 (fallback):   ceo_mobile_review_inbox(p_status, p_limit)
                     → SECURITY DEFINER RPC, UNION ALL appeals + daily_entries
                     → Returns table rows with review_kind discriminator

Tier 3 (last resort): Direct .from('appeals') query
                     → Subject to RLS policies
                     → Only works if "CEO mobile read appeals inbox" policy exists
```

All three tiers run **in parallel** (via `Future.wait`), and the first one with data wins. If all three fail, the mobile app shows an error.

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank pending tab, no error | RPC functions don't exist on Supabase | Run `ceo-mobile-appeals-complete-fix.sql` |
| "Only CEO can use this app" | `users.role != 'ceo'` for logged-in user | Update `users` table: `role='ceo'` |
| `PGRST202` error in logs | RPC function name not found | Run SQL migration + wait for schema reload |
| RPC returns empty `[]` | No pending appeals in DB | Check `SELECT count(*) FROM appeals WHERE status='pending'` |
| Direct query fails with RLS error | Missing RLS policy | SQL migration creates the policy automatically |
| `town_name` column missing | Old schema | SQL migration adds it via `ADD COLUMN IF NOT EXISTS` |

## Files Involved

| File | Role |
|------|------|
| `src/sql/ceo-mobile-appeals-complete-fix.sql` | **One-shot migration** — deploy everything |
| `src/sql/ceo-mobile-raw-appeals-rpc.sql` | Standalone RPC (older, superseded by complete fix) |
| `src/sql/ceo-mobile-approval-inbox-rpc.sql` | Unified inbox RPC (older, superseded by complete fix) |
| `ceo_mobile_app/lib/rebuilt/repository.dart` | `_loadReviews()` — 3-tier fallback logic |
| `ceo_mobile_app/lib/approval_service.dart` | Parallel loading of RPC + direct queries |
| `ceo_mobile_app/lib/rebuilt/screens.dart` | Login screen — checks `role='ceo'` after sign-in |
| `src/main/ipc.js` (lines 3428–3492) | Desktop IPC handlers for appeals |
