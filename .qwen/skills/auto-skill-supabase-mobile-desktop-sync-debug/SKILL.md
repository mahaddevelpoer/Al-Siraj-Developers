---
name: supabase-mobile-desktop-sync-debug
description: Debugging pattern for data visible in desktop app but missing in mobile app — covers RPC deployment, RLS policies, auth role checks, and consolidated SQL migrations.
source: auto-skill
extracted_at: '2026-07-06T17:15:00.000Z'
---

## Problem Pattern

Data (e.g., appeals, records) is **visible in the desktop Electron app** but **missing in the mobile app** (Flutter/Dart), even though both use the same Supabase backend.

## Why This Happens

Desktop and mobile apps often use **different data access paths**:

| Path | Desktop | Mobile |
|------|---------|--------|
| Primary access | IPC handlers → Supabase queries (service role key, bypasses RLS) | RPC functions or direct `.from()` queries (authenticated user key, subject to RLS) |
| Auth context | Main process service role | End-user JWT with RLS |
| Fallback | Direct Supabase query | 3-tier: RPC → alternate RPC → direct query |

Common root causes:
1. **RPC functions not deployed** — Mobile app calls `supabase.rpc('function_name')` but the function doesn't exist in Supabase yet
2. **Missing RLS policies** — Direct queries fail because the authenticated user lacks SELECT/UPDATE permission
3. **Auth role mismatch** — `ceo_mobile_is_ceo()` or similar helper checks `users.role = 'ceo'` but the row has wrong/missing role
4. **Missing columns** — Mobile RPC expects columns (e.g., `town_name`) that were never added via migration
5. **Silent failures** — Mobile app catches errors and returns empty arrays instead of showing errors

## Diagnostic Procedure

### Step 1: Identify the data access paths
- Find desktop IPC handlers (usually `ipc.js` or similar)
- Find mobile query code (look for `.rpc()`, `.from()`, and fallback chains)
- Note which RPC functions the mobile app depends on

### Step 2: Check if RPC functions exist in Supabase
```sql
SELECT proname, pronargs FROM pg_proc WHERE proname LIKE '%mobile%' ORDER BY proname;
```
If missing, the functions need to be deployed via SQL Editor.

### Step 3: Verify the authenticated user's role
```sql
SELECT id, email, role, is_active FROM public.users WHERE email = 'user-email';
```
If `role` is wrong or missing, the user can't pass `is_ceo()` or similar checks.

### Step 4: Test the RPC directly
```sql
SELECT * FROM public.ceo_mobile_get_appeals('pending', 10);
```
- Returns data → RPC works, issue is in mobile app error handling
- Returns empty `[]` → No matching data (check status values)
- Throws error → Function doesn't exist or has SQL errors

### Step 5: Diagnose auth context (as the mobile user)
```sql
SELECT * FROM public.ceo_mobile_diagnose_auth();
-- Should return: {"is_ceo": true, "role_in_db": "ceo", ...}
```

## Fix Strategy: Consolidated SQL Migration

Instead of deploying multiple scattered SQL files, create **one consolidated migration** that handles everything:

```sql
-- 1. ADD missing columns (IF NOT EXISTS for idempotency)
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS town_name TEXT;

-- 2. CREATE helper functions (OR REPLACE for idempotency)
CREATE OR REPLACE FUNCTION public.ceo_mobile_is_ceo() RETURNS boolean ...

-- 3. CREATE RLS policies (DROP IF EXISTS + CREATE for idempotency)
DROP POLICY IF EXISTS "CEO mobile read appeals inbox" ON public.appeals;
CREATE POLICY "CEO mobile read appeals inbox" ON public.appeals FOR SELECT ...

-- 4. CREATE RPC functions with GRANT EXECUTE
CREATE OR REPLACE FUNCTION public.ceo_mobile_get_appeals(...) ...
GRANT EXECUTE ON FUNCTION public.ceo_mobile_get_appeals TO authenticated;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

Always use:
- `ADD COLUMN IF NOT EXISTS` — safe reruns
- `CREATE OR REPLACE FUNCTION` — safe reruns
- `DROP POLICY IF EXISTS` + `CREATE POLICY` — avoids "policy already exists" errors
- `GRANT EXECUTE ... TO authenticated` — required for PostgREST to call the function
- `NOTIFY pgrst, 'reload schema'` — ensures PostgREST picks up new functions immediately

## 3-Tier Fallback Pattern (Mobile)

When designing mobile data fetching, use this pattern for resilience:

```dart
// Tier 1: Primary RPC (fastest, bypasses RLS)
try { return await supabase.rpc('ceo_mobile_get_appeals', params: {...}); }
catch (_) {}

// Tier 2: Alternate RPC (unified view, slightly slower)
try { return await supabase.rpc('ceo_mobile_review_inbox', params: {...}); }
catch (_) {}

// Tier 3: Direct query (last resort, subject to RLS)
try { return await supabase.from('appeals').select('*').eq('status', 'pending'); }
catch (_) {}

throw Exception('All query methods failed');
```

Run all three **in parallel** with `Future.wait` and use whichever returns first with data.

## Files to Check

| Location | What to look for |
|----------|------------------|
| `src/sql/` | SQL migration files — may be scattered across multiple files |
| `src/main/ipc.js` | Desktop IPC handlers — show how desktop accesses data |
| `ceo_mobile_app/lib/` | Mobile repository/service files — show RPC names and fallback chains |
| Supabase SQL Editor | Run verification queries to check actual DB state |
