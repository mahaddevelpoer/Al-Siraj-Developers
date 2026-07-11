-- =============================================================
-- Locker Audit and Settings Toggles Schema
-- =============================================================

-- 1. Create audit_schedules table
CREATE TABLE IF NOT EXISTS public.audit_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  town_name VARCHAR(255) NOT NULL,
  scheduled_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(town_name, scheduled_date)
);

-- 2. Create locker_audits table
CREATE TABLE IF NOT EXISTS public.locker_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  town_name VARCHAR(255) NOT NULL,
  audit_date DATE NOT NULL,
  system_balance NUMERIC NOT NULL,
  physical_balance NUMERIC NOT NULL,
  discrepancy NUMERIC NOT NULL,
  audited_by VARCHAR(255) NOT NULL,
  audit_report JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Seed default system settings
INSERT INTO public.system_settings (key, value) VALUES ('file_tampering_check_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.system_settings (key, value) VALUES ('locker_audit_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.audit_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locker_audits ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if any
DROP POLICY IF EXISTS "CEO full access audit_schedules" ON public.audit_schedules;
DROP POLICY IF EXISTS "Public read audit_schedules" ON public.audit_schedules;
DROP POLICY IF EXISTS "CEO full access locker_audits" ON public.locker_audits;
DROP POLICY IF EXISTS "Public access locker_audits" ON public.locker_audits;
DROP POLICY IF EXISTS "CEO full access settings" ON public.system_settings;
DROP POLICY IF EXISTS "Public read settings" ON public.system_settings;

-- 6. Define policies
-- system_settings
CREATE POLICY "CEO full access settings" ON public.system_settings FOR ALL USING (public.is_ceo());
CREATE POLICY "Public read settings" ON public.system_settings FOR SELECT USING (true);

-- audit_schedules
CREATE POLICY "CEO full access audit_schedules" ON public.audit_schedules FOR ALL USING (public.is_ceo());
CREATE POLICY "Public read audit_schedules" ON public.audit_schedules FOR SELECT USING (true);

-- locker_audits
CREATE POLICY "CEO full access locker_audits" ON public.locker_audits FOR ALL USING (public.is_ceo());
CREATE POLICY "Public access locker_audits" ON public.locker_audits FOR ALL USING (true) WITH CHECK (true);

-- Grant privileges
GRANT ALL ON public.audit_schedules TO authenticated;
GRANT ALL ON public.locker_audits TO authenticated;
GRANT ALL ON public.system_settings TO authenticated;
