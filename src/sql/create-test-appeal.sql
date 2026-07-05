-- Create a test pending appeal for verification
-- Uses an existing user as the requester

DO $$
DECLARE
  requester_id UUID;
  new_id UUID;
BEGIN
  -- Pick any non-CEO user who has created appeals before, or any accountant
  SELECT id INTO requester_id
  FROM public.users
  WHERE role IN ('accountant', 'agent')
  ORDER BY created_at DESC
  LIMIT 1;

  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'No accountant/agent user found to create test appeal';
  END IF;

  INSERT INTO public.appeals (
    requested_by_user_id,
    requested_by_role,
    appeal_type,
    entity_type,
    entity_id,
    status,
    town_name,
    reason,
    requested_data,
    created_at
  )
  VALUES (
    requester_id,
    'accountant',
    'date_change',
    'installment',
    'test-' || extract(epoch from now())::BIGINT,
    'pending',
    'Lahore',
    'TEST APPEAL — please verify it shows in CEO apps',
    jsonb_build_object(
      'townName', 'Lahore',
      'accountant_name', 'Test',
      'amount', 1000,
      'date', CURRENT_DATE::TEXT
    ),
    NOW()
  )
  RETURNING id INTO new_id;

  RAISE NOTICE 'Created test appeal with id: %', new_id;
END $$;

SELECT id, status, appeal_type, created_at
FROM public.appeals
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 5;
