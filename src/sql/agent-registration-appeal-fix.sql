-- Ensure agent registration always creates a pending CEO appeal with town context.

CREATE OR REPLACE FUNCTION public.create_agent_registration_appeal(
  p_user_id UUID,
  p_otp_code TEXT,
  p_otp_expires_at TIMESTAMP WITHOUT TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_appeal_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = p_user_id
      AND role = 'agent'
  ) THEN
    RAISE EXCEPTION 'Agent profile not found';
  END IF;

  INSERT INTO public.appeals (
    requested_by_user_id,
    requested_by_role,
    appeal_type,
    entity_type,
    entity_id,
    status,
    otp_code,
    otp_expires_at,
    requested_data,
    reason
  )
  VALUES (
    p_user_id,
    'agent',
    'agent_registration',
    'agent',
    p_user_id::text,
    'pending',
    p_otp_code,
    p_otp_expires_at,
    (
      SELECT jsonb_build_object(
        'townName', COALESCE(NULLIF(agent_town, ''), NULLIF(agent_towns, '')),
        'agent_town', agent_town,
        'agent_towns', agent_towns,
        'email', email,
        'full_name', full_name
      )
      FROM public.users
      WHERE id = p_user_id
    ),
    'Agent registration approval request'
  )
  ON CONFLICT (requested_by_user_id, entity_id, appeal_type)
  DO UPDATE SET
    status = 'pending',
    otp_code = EXCLUDED.otp_code,
    otp_expires_at = EXCLUDED.otp_expires_at,
    requested_data = EXCLUDED.requested_data,
    reason = EXCLUDED.reason,
    reviewed_at = NULL,
    reviewed_by_user_id = NULL
  RETURNING id INTO new_appeal_id;

  RETURN jsonb_build_object('success', TRUE, 'id', new_appeal_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_agent_registration_appeal(UUID, TEXT, TIMESTAMP WITHOUT TIME ZONE) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
