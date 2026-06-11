-- Pending Collections System
-- Run this in Supabase SQL Editor

-- Add received/remaining columns to all_sales
ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS Received_Amount NUMERIC DEFAULT 0;
ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS Remaining_Amount NUMERIC DEFAULT 0;

-- Collection payments ledger
CREATE TABLE IF NOT EXISTS public.collection_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.all_sales(id) ON DELETE CASCADE,
  property_type VARCHAR(10),
  plot_shop_number VARCHAR(50),
  town_name VARCHAR(255),
  customer_name VARCHAR(255),
  agent_name VARCHAR(255),
  amount NUMERIC DEFAULT 0,
  remaining_before NUMERIC DEFAULT 0,
  remaining_after NUMERIC DEFAULT 0,
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) DEFAULT 'Cash',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.collection_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO full access collection_payments" ON public.collection_payments;
DROP POLICY IF EXISTS "Agents read own collection_payments" ON public.collection_payments;

CREATE POLICY "CEO full access collection_payments"
  ON public.collection_payments FOR ALL
  USING (public.is_ceo())
  WITH CHECK (public.is_ceo());

CREATE POLICY "Agents read own collection_payments"
  ON public.collection_payments FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_collection_payments_sale ON public.collection_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_collection_payments_agent ON public.collection_payments(agent_name);
