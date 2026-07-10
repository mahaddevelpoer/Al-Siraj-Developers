-- PHASE 4: DAILY EOD REPORTS
-- Description: Creates the table to store historical 8 PM End-Of-Day snapshot reports.

DROP TABLE IF EXISTS public.daily_reports CASCADE;

CREATE TABLE IF NOT EXISTS public.daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Report_ID" TEXT UNIQUE NOT NULL,
    "Town_Name" TEXT NOT NULL,
    "Date" DATE NOT NULL,
    "Generated_At" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "Total_Received" NUMERIC DEFAULT 0,
    "Total_Expenses" NUMERIC DEFAULT 0,
    "Daily_Entries" NUMERIC DEFAULT 0,
    "Net_Balance" NUMERIC DEFAULT 0,
    "Properties_Sold" NUMERIC DEFAULT 0,
    "Report_Data" JSONB, -- The full JSON snapshot of the report (ledgers, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Ensure HELPER FUNCTIONS exist
CREATE OR REPLACE FUNCTION public.is_accountant()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'accountant'
    AND COALESCE(is_active, true) = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.accountant_town()
RETURNS text AS $$
DECLARE
  v_town text;
BEGIN
  SELECT assigned_town INTO v_town
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
  
  RETURN v_town;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- CEO Policies (Full Access)
DROP POLICY IF EXISTS "CEO full access daily_reports" ON public.daily_reports;
CREATE POLICY "CEO full access daily_reports" ON public.daily_reports FOR ALL USING (public.is_ceo());

-- Accountant Policies (Read/Write for their Assigned Town)
DROP POLICY IF EXISTS "Accountant access daily_reports" ON public.daily_reports;
CREATE POLICY "Accountant access daily_reports" ON public.daily_reports FOR ALL
USING (public.is_accountant() AND "Town_Name" = public.accountant_town());
