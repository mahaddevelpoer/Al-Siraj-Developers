-- Make CEO Android pushes appeal-only and insert-only.
-- Business rows still sync through Supabase DB/Realtime, but FCM only alerts
-- the CEO for fresh approval requests so the app never floods old entries.

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;

NOTIFY pgrst, 'reload schema';
