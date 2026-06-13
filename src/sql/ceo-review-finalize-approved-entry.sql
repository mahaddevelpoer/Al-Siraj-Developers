-- Finalize CEO appeal review behavior.
-- Approved daily-entry appeals write a stable daily_entries row and, for
-- expenses, a matching expenses row so cloud sync-down can rebuild local Excel.
-- Rejected agent registrations keep the agent inactive.

CREATE OR REPLACE FUNCTION public.ceo_review_appeal(appeal_id UUID, new_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appeal_row public.appeals%ROWTYPE;
  rd JSONB;
  new_entry_id TEXT;
  entry_type TEXT;
  entry_town TEXT;
  entry_date DATE;
  entry_amount NUMERIC;
  entry_description TEXT;
  entry_category TEXT;
BEGIN
  IF NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Only CEO can review appeals';
  END IF;

  new_status := lower(trim(new_status));
  IF new_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: %', new_status;
  END IF;

  SELECT * INTO appeal_row
  FROM public.appeals
  WHERE id = appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found';
  END IF;

  IF COALESCE(appeal_row.status, 'pending') <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'status', appeal_row.status,
      'appeal_id', appeal_id,
      'message', 'already ' || appeal_row.status
    );
  END IF;

  UPDATE public.appeals
  SET status = new_status,
      reviewed_at = NOW(),
      reviewed_by_user_id = auth.uid(),
      otp_code = NULL,
      otp_expires_at = NULL
  WHERE id = appeal_id;

  IF appeal_row.appeal_type = 'agent_registration' THEN
    UPDATE public.users
    SET is_active = (new_status = 'approved'),
        updated_at = NOW()
    WHERE id = appeal_row.requested_by_user_id;
  END IF;

  IF new_status = 'approved'
     AND appeal_row.appeal_type IN ('backdated_daily_entry', 'future_daily_entry') THEN
    rd := COALESCE(appeal_row.requested_data, '{}'::jsonb);
    new_entry_id := 'APP-' || replace(appeal_row.id::text, '-', '');
    entry_town := COALESCE(rd->>'townName', rd->>'Town_Name', rd->>'town_name', '');
    IF btrim(entry_town) = '' THEN
      RAISE EXCEPTION 'Town name is required before approving this daily entry appeal';
    END IF;
    entry_date := COALESCE(NULLIF(rd->>'date', ''), CURRENT_DATE::text)::date;
    entry_type := COALESCE(rd->>'type', rd->>'Type', 'Expense');
    entry_category := COALESCE(rd->>'category', rd->>'Category', 'Daily');
    entry_amount := COALESCE(NULLIF(rd->>'amount', ''), '0')::numeric;
    entry_description := COALESCE(rd->>'description', rd->>'Description', '');

    INSERT INTO public.daily_entries (
      entry_id,
      town_name,
      date,
      type,
      category,
      amount,
      description,
      reference,
      created_by,
      review_status,
      reviewed_by,
      reviewed_at
    )
    VALUES (
      new_entry_id,
      entry_town,
      entry_date,
      entry_type,
      entry_category,
      entry_amount,
      entry_description,
      appeal_row.id::text,
      'CEO Review',
      'approved',
      auth.uid(),
      NOW()
    )
    ON CONFLICT (entry_id) DO UPDATE SET
      town_name = EXCLUDED.town_name,
      date = EXCLUDED.date,
      type = EXCLUDED.type,
      category = EXCLUDED.category,
      amount = EXCLUDED.amount,
      description = EXCLUDED.description,
      reference = EXCLUDED.reference,
      created_by = EXCLUDED.created_by,
      review_status = EXCLUDED.review_status,
      reviewed_by = EXCLUDED.reviewed_by,
      reviewed_at = EXCLUDED.reviewed_at;

    IF lower(entry_type) = 'expense' THEN
      INSERT INTO public.expenses (
        expense_id,
        town_name,
        expense_name,
        amount_pkr,
        description,
        category,
        date,
        added_by
      )
      VALUES (
        new_entry_id,
        entry_town,
        COALESCE(NULLIF(entry_description, ''), 'Daily Expense'),
        entry_amount,
        entry_description,
        entry_category,
        entry_date,
        'CEO Approved Daily Entry'
      )
      ON CONFLICT (expense_id) DO UPDATE SET
        town_name = EXCLUDED.town_name,
        expense_name = EXCLUDED.expense_name,
        amount_pkr = EXCLUDED.amount_pkr,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        date = EXCLUDED.date,
        added_by = EXCLUDED.added_by;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'status', new_status,
    'appeal_id', appeal_id,
    'message', CASE WHEN new_status = 'approved' THEN 'approved' ELSE 'rejected' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_review_appeal(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
