-- Guardrail: appeal approval/rejection must only happen from a CEO session.
-- This blocks old desktop/mobile builds from approving a daily-ledger appeal
-- directly from accountant-side OTP screens.

CREATE OR REPLACE FUNCTION public.prevent_non_ceo_appeal_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  old_status := lower(trim(COALESCE(OLD.status, 'pending')));
  new_status := lower(trim(COALESCE(NEW.status, 'pending')));

  IF new_status IN ('approved', 'rejected')
     AND new_status IS DISTINCT FROM old_status
     AND NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Only CEO can approve or reject appeals';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_non_ceo_appeal_review ON public.appeals;
CREATE TRIGGER prevent_non_ceo_appeal_review
BEFORE UPDATE OF status ON public.appeals
FOR EACH ROW
EXECUTE FUNCTION public.prevent_non_ceo_appeal_review();

NOTIFY pgrst, 'reload schema';
