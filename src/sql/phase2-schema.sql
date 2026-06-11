-- ============================================================
-- PHASE 2: Financial Accuracy Schema Updates
-- Run this in Supabase SQL Editor
-- ============================================================

-- Update all_sales with received_amount fields
ALTER TABLE all_sales
ADD COLUMN IF NOT EXISTS received_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'advance_only',
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'Cash',
ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS property_category VARCHAR(20) DEFAULT 'Residential';

-- Update properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'available',
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS sale_id UUID,
ADD COLUMN IF NOT EXISTS installment_active BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS property_category VARCHAR(20) DEFAULT 'Residential';

-- Commissions table (NEW)
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) NOT NULL,
  sale_id UUID,
  town_name VARCHAR(255),
  property_number VARCHAR(100),
  total_price NUMERIC,
  commission_percent NUMERIC,
  commission_amount NUMERIC,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE
);

-- Agent property access (verify exists)
CREATE TABLE IF NOT EXISTS agent_property_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  property_id UUID NOT NULL,
  town_name VARCHAR(255),
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, property_id)
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20),
  installment_due_days INTEGER DEFAULT 3,
  receive_appeal_alerts BOOLEAN DEFAULT TRUE,
  receive_installment_alerts BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id)
);

-- Enable RLS on new tables
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_property_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Properties: CEO sees all, Agent sees own towns, Accountant sees all
DROP POLICY IF EXISTS "role_based_properties" ON properties;
CREATE POLICY "role_based_properties" ON properties FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'ceo'
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'accountant'
  OR town_name IN (
    SELECT unnest(string_to_array(agent_towns, ','))
    FROM users WHERE id = auth.uid()
  )
);

-- Sales: CEO all, Accountant all, Agent own sales only
DROP POLICY IF EXISTS "role_based_sales" ON all_sales;
CREATE POLICY "role_based_sales" ON all_sales FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('ceo', 'accountant')
  OR agent_id = auth.uid()
);

-- Installments: CEO all, Accountant all, Agent own
DROP POLICY IF EXISTS "role_based_installments" ON installments;
CREATE POLICY "role_based_installments" ON installments FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('ceo', 'accountant')
  OR sale_id IN (
    SELECT id FROM all_sales WHERE agent_id = auth.uid()
  )
);

-- Commissions: CEO all, Agent own only
DROP POLICY IF EXISTS "role_based_commissions" ON commissions;
CREATE POLICY "role_based_commissions" ON commissions FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'ceo'
  OR agent_id = auth.uid()
);

-- Agent property access: CEO manages, Agent reads own
-- Realtime publication: ensure tables broadcast changes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'appeals' AND schemaname = 'public') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appeals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'commissions' AND schemaname = 'public') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commissions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'installments' AND schemaname = 'public') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.installments;
  END IF;
END $$;
DROP POLICY IF EXISTS "agent_reads_own_access" ON agent_property_access;
CREATE POLICY "agent_reads_own_access" ON agent_property_access FOR SELECT USING (
  agent_id = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'ceo'
);
