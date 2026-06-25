-- =============================================================
-- ZAMEEN KHATA — Business Data Tables for Supabase
-- Run this AFTER supabase-schema.sql in Supabase SQL Editor
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- 10. TOWNS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.towns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Town_Name VARCHAR(255) UNIQUE NOT NULL,
  Location VARCHAR(500),
  Commission_Rate NUMERIC DEFAULT 0,
  Town_Location VARCHAR(500),
  Latitude NUMERIC,
  Longitude NUMERIC,
  Plot_Price NUMERIC DEFAULT 0,
  Shop_Price NUMERIC DEFAULT 0,
  Plot_Cost NUMERIC DEFAULT 0,
  Shop_Cost NUMERIC DEFAULT 0,
  Total_Plots INTEGER DEFAULT 0,
  Total_Shops INTEGER DEFAULT 0,
  Total_Income_PKR NUMERIC DEFAULT 0,
  Total_Expenses_PKR NUMERIC DEFAULT 0,
  Profit_Loss NUMERIC DEFAULT 0,
  Status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 11. PROPERTIES TABLE (Plots + Shops unified)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Property_Type VARCHAR(10) NOT NULL CHECK (Property_Type IN ('Plot','Shop')),
  Property_Number VARCHAR(50) NOT NULL,
  Town_Name VARCHAR(255) NOT NULL,
  Property_Size VARCHAR(100),
  Marla NUMERIC,
  Per_Marla_Price NUMERIC,
  Road_Type VARCHAR(100),
  Road_Key VARCHAR(50),
  Total_Price NUMERIC DEFAULT 0,
  Owner_Name VARCHAR(255),
  Property_Category VARCHAR(100) DEFAULT 'Residential',
  Customer_Name VARCHAR(255),
  CNIC VARCHAR(20),
  Phone_Number VARCHAR(20),
  Sell_Date DATE,
  Total_Amount_PKR NUMERIC DEFAULT 0,
  Advance_Amount_PKR NUMERIC DEFAULT 0,
  Total_Installments INTEGER DEFAULT 0,
  Total_Period_Months INTEGER DEFAULT 0,
  Gap_Days INTEGER DEFAULT 0,
  Gap_Label VARCHAR(50),
  Monthly_Installment NUMERIC DEFAULT 0,
  Received_Amount NUMERIC DEFAULT 0,
  Remaining_Amount NUMERIC DEFAULT 0,
  Agent_Name VARCHAR(255),
  Commission_Rate NUMERIC DEFAULT 0,
  Commission_Amount NUMERIC DEFAULT 0,
  Expense_Total NUMERIC DEFAULT 0,
  Profit_Loss NUMERIC DEFAULT 0,
  Installment_Status VARCHAR(50),
  Resell_Status VARCHAR(50) DEFAULT 'No',
  Resell_Amount NUMERIC DEFAULT 0,
  Receipt_Number VARCHAR(100),
  File_Status VARCHAR(50) DEFAULT 'Not Delivered',
  File_Delivery_Image TEXT,
  Status VARCHAR(50) DEFAULT 'Available',
  UNIQUE(Property_Type, Property_Number, Town_Name)
);

-- ═══════════════════════════════════════════════════════════════
-- 12. ALL SALES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.all_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Sale_ID VARCHAR(50) UNIQUE NOT NULL,
  Plot_Shop_Number VARCHAR(50) NOT NULL,
  Type VARCHAR(10) NOT NULL CHECK (Type IN ('Plot','Shop')),
  Town_Name VARCHAR(255) NOT NULL,
  Customer_Name VARCHAR(255),
  CNIC VARCHAR(20),
  Phone_Number VARCHAR(20),
  Sell_Date DATE,
  Total_Amount_PKR NUMERIC DEFAULT 0,
  Advance_Amount_PKR NUMERIC DEFAULT 0,
  Total_Installments INTEGER DEFAULT 0,
  Total_Period_Months INTEGER DEFAULT 0,
  Gap_Days INTEGER DEFAULT 0,
  Gap_Label VARCHAR(50),
  Monthly_Installment NUMERIC DEFAULT 0,
  Agent_Name VARCHAR(255),
  Commission_Rate NUMERIC DEFAULT 0,
  Commission_Amount NUMERIC DEFAULT 0,
  Company_Income NUMERIC DEFAULT 0,
  Expense_Total NUMERIC DEFAULT 0,
  Profit_Loss NUMERIC DEFAULT 0,
  Receipt_Number VARCHAR(100),
  File_Status VARCHAR(50) DEFAULT 'Not Delivered',
  Status VARCHAR(50) DEFAULT 'Sold',
  Payment_Method VARCHAR(50) DEFAULT 'Cash',
  Cheque_Number VARCHAR(100),
  Cheque_Bank VARCHAR(255),
  Cheque_Image TEXT,
  Transaction_ID VARCHAR(100),
  Transfer_Bank VARCHAR(255),
  Transfer_Image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 13. INSTALLMENTS TRACKER TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Tracker_ID VARCHAR(50) UNIQUE NOT NULL,
  Plot_Shop_Number VARCHAR(50) NOT NULL,
  Type VARCHAR(10) NOT NULL CHECK (Type IN ('Plot','Shop')),
  Town_Name VARCHAR(255) NOT NULL,
  Customer_Name VARCHAR(255),
  Phone_Number VARCHAR(20),
  Monthly_Amount NUMERIC DEFAULT 0,
  Due_Date DATE,
  Status VARCHAR(50) DEFAULT 'Upcoming',
  Paid_Date DATE,
  Month_Number INTEGER,
  Total_Months INTEGER,
  Received_Amount NUMERIC DEFAULT 0,
  Remaining_Amount NUMERIC DEFAULT 0,
  Agent_Name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 14. EMPLOYEES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Employee_ID VARCHAR(50) UNIQUE NOT NULL,
  Employee_Name VARCHAR(255) NOT NULL,
  CNIC VARCHAR(20),
  Phone_Number VARCHAR(20),
  Designation VARCHAR(255),
  Base_Salary NUMERIC DEFAULT 0,
  Town_Name VARCHAR(255),
  Date_Added DATE DEFAULT CURRENT_DATE,
  Status VARCHAR(50) DEFAULT 'Active'
);

-- ═══════════════════════════════════════════════════════════════
-- 15. EXPENSES TABLE (All_Expenses)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Expense_ID VARCHAR(50) UNIQUE NOT NULL,
  Town_Name VARCHAR(255),
  Expense_Name VARCHAR(255),
  Amount_PKR NUMERIC DEFAULT 0,
  Description TEXT,
  Category VARCHAR(100) DEFAULT 'General',
  Date DATE DEFAULT CURRENT_DATE,
  Added_By VARCHAR(255)
);

-- ═══════════════════════════════════════════════════════════════
-- 16. CEO EXPENSES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ceo_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Expense_ID VARCHAR(50) UNIQUE NOT NULL,
  Town_Name VARCHAR(255),
  Expense_Name VARCHAR(255),
  Amount_PKR NUMERIC DEFAULT 0,
  Description TEXT,
  Category VARCHAR(100) DEFAULT 'General',
  Date DATE DEFAULT CURRENT_DATE,
  Town_Income NUMERIC DEFAULT 0,
  Expense_Limit NUMERIC DEFAULT 0,
  Is_Over_Limit BOOLEAN DEFAULT FALSE
);

-- ═══════════════════════════════════════════════════════════════
-- 17. CEO SALARY TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ceo_salary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Salary_ID VARCHAR(50) UNIQUE NOT NULL,
  Town_Name VARCHAR(255),
  Month_Year VARCHAR(50),
  Amount_PKR NUMERIC DEFAULT 0,
  Date_Recorded DATE DEFAULT CURRENT_DATE,
  Notes TEXT
);

-- ═══════════════════════════════════════════════════════════════
-- 18. SALARY RECORDS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Receipt_Number VARCHAR(100),
  Date DATE DEFAULT CURRENT_DATE,
  Month VARCHAR(50),
  Type VARCHAR(50),
  Name VARCHAR(255),
  Designation VARCHAR(255),
  Amount NUMERIC DEFAULT 0,
  Town_Name VARCHAR(255),
  Note TEXT,
  Paid_By VARCHAR(255),
  Advance_Deduction NUMERIC DEFAULT 0,
  New_Advance_Given NUMERIC DEFAULT 0,
  Salary_Amount NUMERIC DEFAULT 0,
  Salary_Gross_Amount NUMERIC DEFAULT 0,
  Cash_Disbursed_Amount NUMERIC DEFAULT 0,
  Salary_Paid_Amount NUMERIC DEFAULT 0,
  Salary_Paid_Before NUMERIC DEFAULT 0,
  Salary_Paid_After NUMERIC DEFAULT 0,
  Salary_Remaining_After NUMERIC DEFAULT 0,
  Is_Advance_Salary VARCHAR(10) DEFAULT 'No'
);

-- ═══════════════════════════════════════════════════════════════
-- 19. RESELL HISTORY TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.resell_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Resell_ID VARCHAR(50) UNIQUE NOT NULL,
  Plot_Shop_Number VARCHAR(50) NOT NULL,
  Type VARCHAR(10) NOT NULL CHECK (Type IN ('Plot','Shop')),
  Town_Name VARCHAR(255) NOT NULL,
  Original_Customer VARCHAR(255),
  Original_Sell_Date DATE,
  Original_Amount NUMERIC DEFAULT 0,
  Resell_Amount NUMERIC DEFAULT 0,
  Refund_Amount NUMERIC DEFAULT 0,
  Resell_Date DATE DEFAULT CURRENT_DATE,
  Receipt_Number VARCHAR(100),
  Agent_Name VARCHAR(255),
  Profit_Loss NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 20. DAILY ENTRIES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Entry_ID VARCHAR(50) UNIQUE NOT NULL,
  Town_Name VARCHAR(255),
  Date DATE DEFAULT CURRENT_DATE,
  Type VARCHAR(50) CHECK (Type IN ('Income','Expense')),
  Category VARCHAR(100),
  Amount NUMERIC DEFAULT 0,
  Description TEXT,
  Reference VARCHAR(255),
  Created_By VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 21. NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Notification_ID VARCHAR(50) UNIQUE NOT NULL,
  Type VARCHAR(50),
  Message TEXT,
  Plot_Shop_Number VARCHAR(50),
  Town_Name VARCHAR(255),
  Customer_Name VARCHAR(255),
  Due_Date DATE,
  Created_Date DATE DEFAULT CURRENT_DATE,
  Status VARCHAR(50) DEFAULT 'Active',
  Dismissed VARCHAR(10) DEFAULT 'No'
);

-- ═══════════════════════════════════════════════════════════════
-- 22. USER ACTIVITY LOG
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 23. RECEIPT LOG TABLE (all printed receipts)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.receipt_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Receipt_Number VARCHAR(100) NOT NULL,
  Type VARCHAR(50) NOT NULL,
  Reference_ID VARCHAR(100),
  Town_Name VARCHAR(255),
  Customer_Name VARCHAR(255),
  Amount NUMERIC DEFAULT 0,
  Printed_By VARCHAR(255),
  Printed_At TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 24. SYSTEM SETTINGS TABLE (for online/local toggle etc.)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.system_settings (key, value) VALUES ('db_mode', '"local"') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.system_settings (key, value) VALUES ('last_sync_at', 'null') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.system_settings (key, value) VALUES ('app_version', '"1.0.0"') ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_properties_town ON public.properties(Town_Name);
CREATE INDEX IF NOT EXISTS idx_properties_status ON public.properties(Status);
CREATE INDEX IF NOT EXISTS idx_sales_town ON public.all_sales(Town_Name);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON public.all_sales(Agent_Name);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.all_sales(Sell_Date);
CREATE INDEX IF NOT EXISTS idx_installments_town ON public.installments(Town_Name);
CREATE INDEX IF NOT EXISTS idx_installments_agent ON public.installments(Agent_Name);
CREATE INDEX IF NOT EXISTS idx_installments_status ON public.installments(Status);
CREATE INDEX IF NOT EXISTS idx_installments_due ON public.installments(Due_Date);
CREATE INDEX IF NOT EXISTS idx_expenses_town ON public.expenses(Town_Name);
CREATE INDEX IF NOT EXISTS idx_employees_town ON public.employees(Town_Name);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.user_activity(created_at);

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.all_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_salary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resell_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- CEO can read/write all business tables
CREATE POLICY "CEO full access properties" ON public.properties FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access sales" ON public.all_sales FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access installments" ON public.installments FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access employees" ON public.employees FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access expenses" ON public.expenses FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access ceo_expenses" ON public.ceo_expenses FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access ceo_salary" ON public.ceo_salary FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access salary_records" ON public.salary_records FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access resell_history" ON public.resell_history FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access daily_entries" ON public.daily_entries FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access notifications" ON public.notifications FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access activity" ON public.user_activity FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access receipt_log" ON public.receipt_log FOR ALL USING (public.is_ceo());
CREATE POLICY "CEO full access settings" ON public.system_settings FOR ALL USING (public.is_ceo());

-- Agents can read/write their own related data
CREATE POLICY "Agents read properties" ON public.properties FOR SELECT USING (true);
CREATE POLICY "Agents read sales" ON public.all_sales FOR SELECT USING (true);
CREATE POLICY "Agents insert sales" ON public.all_sales FOR INSERT WITH CHECK (true);
CREATE POLICY "Agents read installments" ON public.installments FOR SELECT USING (true);
CREATE POLICY "Agents read employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Agents read expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Agents read notifications" ON public.notifications FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 25. EMPLOYEES V2 TABLE (per-town EmployeeDB)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.employees_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Employee_ID VARCHAR(50) UNIQUE NOT NULL,
  Employee_Name VARCHAR(255) NOT NULL,
  CNIC VARCHAR(20),
  Phone VARCHAR(20),
  Town_Name VARCHAR(255),
  Role VARCHAR(100),
  Salary NUMERIC DEFAULT 0,
  Status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 26. ADVANCE SALARIES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.advance_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Advance_ID VARCHAR(50) UNIQUE NOT NULL,
  Employee_Name VARCHAR(255),
  Town_Name VARCHAR(255),
  Amount NUMERIC DEFAULT 0,
  Date DATE DEFAULT CURRENT_DATE,
  Month VARCHAR(50),
  Status VARCHAR(50) DEFAULT 'Pending',
  Notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 27. SALARY PAYMENTS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Payment_ID VARCHAR(50) UNIQUE NOT NULL,
  Employee_Name VARCHAR(255),
  Town_Name VARCHAR(255),
  Amount NUMERIC DEFAULT 0,
  Month VARCHAR(50),
  Payment_Date DATE DEFAULT CURRENT_DATE,
  Payment_Method VARCHAR(50),
  Notes TEXT,
  Recorded_By VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_employees_v2_town ON public.employees_v2(Town_Name);
CREATE INDEX IF NOT EXISTS idx_advance_salaries_employee ON public.advance_salaries(Employee_Name);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON public.salary_payments(Employee_Name);

-- RLS for new tables
ALTER TABLE public.employees_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO full access employees_v2" ON public.employees_v2;
DROP POLICY IF EXISTS "CEO full access advance_salaries" ON public.advance_salaries;
DROP POLICY IF EXISTS "CEO full access salary_payments" ON public.salary_payments;
DROP POLICY IF EXISTS "Agents read employees_v2" ON public.employees_v2;
DROP POLICY IF EXISTS "Agents read advance_salaries" ON public.advance_salaries;
DROP POLICY IF EXISTS "Accountant read employees_v2" ON public.employees_v2;
DROP POLICY IF EXISTS "Accountant read advance_salaries" ON public.advance_salaries;

DROP POLICY IF EXISTS "Public full access employees_v2" ON public.employees_v2;
DROP POLICY IF EXISTS "Public full access advance_salaries" ON public.advance_salaries;
DROP POLICY IF EXISTS "Public full access salary_payments" ON public.salary_payments;

CREATE POLICY "Public full access employees_v2" ON public.employees_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access advance_salaries" ON public.advance_salaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access salary_payments" ON public.salary_payments FOR ALL USING (true) WITH CHECK (true);

-- Accountants can read/write expenses
CREATE POLICY "Accountant full expenses" ON public.expenses FOR ALL USING (true);
CREATE POLICY "Accountant read sales" ON public.all_sales FOR SELECT USING (true);
CREATE POLICY "Accountant read properties" ON public.properties FOR SELECT USING (true);
CREATE POLICY "Accountant read installments" ON public.installments FOR SELECT USING (true);
