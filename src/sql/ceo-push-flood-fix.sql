-- Fix CEO mobile notification floods caused by bulk Sync to Cloud.
-- Keep Android FCM push only for fresh CEO approval requests. Business rows
-- still sync to Supabase DB/Realtime, but they do not create banners.

DROP TRIGGER IF EXISTS all_sales_ceo_mobile_push ON public.all_sales;
DROP TRIGGER IF EXISTS properties_ceo_mobile_push ON public.properties;
DROP TRIGGER IF EXISTS installments_ceo_mobile_push ON public.installments;
DROP TRIGGER IF EXISTS expenses_ceo_mobile_push ON public.expenses;

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;

NOTIFY pgrst, 'reload schema';
