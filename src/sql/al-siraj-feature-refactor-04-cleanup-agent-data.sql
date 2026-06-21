DELETE FROM public.agent_property_access;

DELETE FROM public.commissions;

DELETE FROM public.appeals
WHERE requested_by_role = 'agent'
   OR appeal_type IN ('agent_registration','property_access_request');

DELETE FROM public.users
WHERE role = 'agent';

NOTIFY pgrst, 'reload schema';
