ALTER TABLE public.town_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_full_town_agents" ON public.town_agents;
CREATE POLICY "office_full_town_agents" ON public.town_agents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_investors" ON public.investors;
CREATE POLICY "office_full_investors" ON public.investors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_investor_transactions" ON public.investor_transactions;
CREATE POLICY "office_full_investor_transactions" ON public.investor_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_construction_projects" ON public.construction_projects;
CREATE POLICY "office_full_construction_projects" ON public.construction_projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_construction_payments" ON public.construction_payments;
CREATE POLICY "office_full_construction_payments" ON public.construction_payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_commission_receipts" ON public.commission_receipts;
CREATE POLICY "office_full_commission_receipts" ON public.commission_receipts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_full_money_ledger" ON public.money_ledger;
CREATE POLICY "office_full_money_ledger" ON public.money_ledger FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
