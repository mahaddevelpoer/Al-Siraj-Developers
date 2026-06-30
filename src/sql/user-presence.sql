-- AL SIRAJ DEVELOPERS - realtime user presence for CEO Android app.
-- Run once in Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS online_status TEXT DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_label TEXT,
  ADD COLUMN IF NOT EXISTS last_active_context TEXT;

CREATE INDEX IF NOT EXISTS users_presence_role_idx
  ON public.users (role, town_name, online_status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS users_presence_last_seen_idx
  ON public.users (last_seen_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'users'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;

-- Existing policies normally already allow users to update their own profile
-- and CEO to read all users. Keep this policy idempotent for older databases.
DROP POLICY IF EXISTS "Users can update own presence" ON public.users;
CREATE POLICY "Users can update own presence" ON public.users
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

NOTIFY pgrst, 'reload schema';
