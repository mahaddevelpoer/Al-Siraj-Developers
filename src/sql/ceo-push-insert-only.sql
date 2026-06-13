-- Make CEO Android pushes insert-only.
-- Approval/rejection updates stay silent so CEO does not receive a second
-- "approved" notification after acting on an appeal or daily entry.

DROP TRIGGER IF EXISTS appeals_ceo_mobile_push ON public.appeals;
CREATE TRIGGER appeals_ceo_mobile_push
AFTER INSERT ON public.appeals
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS notifications_ceo_mobile_push ON public.notifications;
CREATE TRIGGER notifications_ceo_mobile_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

DROP TRIGGER IF EXISTS daily_entries_ceo_mobile_push ON public.daily_entries;
CREATE TRIGGER daily_entries_ceo_mobile_push
AFTER INSERT ON public.daily_entries
FOR EACH ROW EXECUTE FUNCTION public.notify_ceo_mobile_push();

NOTIFY pgrst, 'reload schema';
