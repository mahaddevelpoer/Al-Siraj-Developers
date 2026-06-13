-- Fix CEO mobile notification floods caused by bulk Sync to Cloud.
-- Keep push only for CEO review tables. Bulk sales/properties/installments/expenses
-- still sync to Supabase, but they no longer create Android push notifications.

DROP TRIGGER IF EXISTS all_sales_ceo_mobile_push ON public.all_sales;
DROP TRIGGER IF EXISTS properties_ceo_mobile_push ON public.properties;
DROP TRIGGER IF EXISTS installments_ceo_mobile_push ON public.installments;
DROP TRIGGER IF EXISTS expenses_ceo_mobile_push ON public.expenses;

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
CREATE TRIGGER notifications_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;
CREATE TRIGGER daily_entries_ceo_mobile_push
AFTER INSERT OR UPDATE ON public.daily_entries
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

NOTIFY pgrst, 'reload schema';
