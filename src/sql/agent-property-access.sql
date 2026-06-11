-- =============================================================
-- ZAMEEN KHATA — Agent Property Access System
-- Run THIS AFTER supabase-business-tables.sql in Supabase SQL Editor
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. AGENT PROPERTY ACCESS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_property_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  property_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, property_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. ADD agent_towns COLUMN TO USERS TABLE
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_towns VARCHAR(1000);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_license_number VARCHAR(100);

-- ═══════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.agent_property_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO full access agent_property_access" ON public.agent_property_access;
DROP POLICY IF EXISTS "Agents read own property access" ON public.agent_property_access;

-- CEO can read/write all property access records
CREATE POLICY "CEO full access agent_property_access"
  ON public.agent_property_access FOR ALL
  USING (public.is_ceo())
  WITH CHECK (public.is_ceo());

-- Agents can read their own property access
CREATE POLICY "Agents read own property access"
  ON public.agent_property_access FOR SELECT
  USING (auth.uid() = agent_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_agent_property_access_agent
  ON public.agent_property_access(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_property_access_property
  ON public.agent_property_access(property_id);
