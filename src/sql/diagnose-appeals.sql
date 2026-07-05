-- AL SIRAJ DEVELOPERS
-- Diagnose why appeals are not showing in CEO apps despite FCM notifications.
-- Run in Supabase SQL Editor as a logged-in CEO user.
--
-- Part 1: Appeal count and creation frequency
-- Part 2: RLS policy audit
-- Part 3: CEO's own user profile check
-- Part 4: Test appeal query with CEO auth

-- === PART 1: Appeal overview ===
SELECT
  id,
  status,
  appeal_type,
  requested_by_user_id,
  created_at,
  town_name,
  reason
FROM public.appeals
ORDER BY created_at DESC
LIMIT 50;

-- Count by status and hour (last 24h)
SELECT
  status,
  date_trunc('hour', created_at) AS hour_bucket,
  count(*) AS cnt
FROM public.appeals
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status, hour_bucket
ORDER BY hour_bucket DESC, status;

-- === PART 2: RLS policy audit ===
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'appeals'
ORDER BY policyname;

-- === PART 3: CEO user profile ===
SELECT id, email, role, is_active, full_name
FROM public.users
WHERE id = auth.uid();

-- === PART 4: Test query (same shape as desktop & mobile) ===
-- This tests whether the CEO can actually SELECT from appeals:
SELECT id, status, appeal_type, created_at
FROM public.appeals
WHERE lower(coalesce(status, 'pending')) = 'pending'
ORDER BY created_at DESC
LIMIT 20;

-- === PART 5: Test FK embedding (desktop bug) ===
-- Uncomment and run this to see if FK embedding fails:
-- SELECT id, status, appeal_type,
--   requested_by_user_id,
--   (SELECT row_to_json(u.*) FROM public.users u WHERE u.id = appeals.requested_by_user_id) AS user_profile
-- FROM public.appeals
-- LIMIT 5;
