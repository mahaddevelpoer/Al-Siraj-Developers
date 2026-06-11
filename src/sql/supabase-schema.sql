-- =============================================================
-- ZAMEEN KHATA — Supabase Database Schema (FINAL FIX)
-- Run ALL queries in Supabase SQL Editor
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- HELPER: Security definer function — bypasses RLS recursion
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_ceo()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo');
$$;

-- ═══════════════════════════════════════════════════════════════
-- 1. USERS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  full_name VARCHAR(255),
  phone_number VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'agent',
  agent_town VARCHAR(255),
  agent_license_number VARCHAR(100),
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 2. APPEALS TABLE (OTP / registration approvals)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id UUID REFERENCES public.users(id) NOT NULL,
  requested_by_role VARCHAR(20) NOT NULL,
  appeal_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  original_data JSONB,
  requested_data JSONB,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_user_id UUID REFERENCES public.users(id),
  contact_requested BOOLEAN DEFAULT FALSE,
  otp_code VARCHAR(10),
  otp_expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(requested_by_user_id, entity_id, appeal_type)
);

-- ═══════════════════════════════════════════════════════════════
-- 3. APPEAL NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.appeal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID REFERENCES public.appeals(id) ON DELETE CASCADE NOT NULL,
  ceo_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 4. ACCOUNTANT INVITATIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.accountant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR NOT NULL,
  full_name VARCHAR NOT NULL,
  phone_number VARCHAR,
  created_by_ceo_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  status VARCHAR DEFAULT 'pending',
  invitation_code VARCHAR UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY — USERS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "CEO can read all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "CEO can create users" ON public.users;

-- Registration: anyone can insert a profile (desktop app, anon key already exposed)
CREATE POLICY "Anyone can create profile" ON public.users
  FOR INSERT WITH CHECK (true);

-- Users can read own profile
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- CEO can read ALL users (uses SECURITY DEFINER helper to avoid recursion)
CREATE POLICY "CEO can read all users" ON public.users
  FOR SELECT USING (public.is_ceo());

-- Users can update own profile
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- CEO can create users (invites)
CREATE POLICY "CEO can create users" ON public.users
  FOR INSERT WITH CHECK (public.is_ceo());

-- ═══════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY — APPEALS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own appeals" ON public.appeals;
DROP POLICY IF EXISTS "CEO can read all appeals" ON public.appeals;
DROP POLICY IF EXISTS "Users can create appeals" ON public.appeals;
DROP POLICY IF EXISTS "CEO can update appeals" ON public.appeals;
DROP POLICY IF EXISTS "Public full access appeals" ON public.appeals;

CREATE POLICY "Public full access appeals" ON public.appeals
  FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 7. ROW LEVEL SECURITY — APPEAL NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.appeal_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO can read own notifications" ON public.appeal_notifications;

CREATE POLICY "CEO can read own notifications" ON public.appeal_notifications
  FOR SELECT USING (public.is_ceo());

-- ═══════════════════════════════════════════════════════════════
-- 8. ROW LEVEL SECURITY — ACCOUNTANT INVITATIONS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.accountant_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO can manage accountant invitations" ON public.accountant_invitations;

CREATE POLICY "CEO can manage accountant invitations" ON public.accountant_invitations
  FOR ALL USING (public.is_ceo());

-- ═══════════════════════════════════════════════════════════════
-- 9. SEED CEO USER (run AFTER creating CEO in Auth dashboard)
-- ═══════════════════════════════════════════════════════════════
-- Step 1: Go to Authentication → Users → Add User manually with email/password
-- Step 2: Copy the user's UUID, then run:
--
-- INSERT INTO public.users (id, email, full_name, role, is_active)
-- VALUES ('<UUID>', 'mahadb847@gmail.com', 'CEO', 'ceo', TRUE)
-- ON CONFLICT (id) DO NOTHING;
