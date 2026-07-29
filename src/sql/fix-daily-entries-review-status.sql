-- Fix stale daily_entries that were incorrectly set to review_status = 'pending'
-- by the column DEFAULT when the app didn't explicitly set it.
--
-- Rule:
--   - Entries whose entry_id starts with 'APP-' were created via the CEO approval
--     RPC and already have review_status = 'approved' — leave them alone.
--   - All OTHER entries that currently show 'pending' were submitted by accountants
--     for today's date (normal entries) and should be 'approved'.
--   - Entries that are genuinely pending (sent via appeal flow and not yet reviewed)
--     will have a matching row in public.appeals with status = 'pending' — keep those.

UPDATE public.daily_entries
SET review_status = 'approved'
WHERE lower(coalesce(review_status, 'pending')) = 'pending'
  AND entry_id NOT LIKE 'APP-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.appeals a
    WHERE a.entity_id = daily_entries.entry_id
      AND lower(coalesce(a.status, 'pending')) = 'pending'
  );

-- Also fix entries inserted by the RPC that somehow ended up with NULL (defensive)
UPDATE public.daily_entries
SET review_status = 'approved'
WHERE entry_id LIKE 'APP-%'
  AND lower(coalesce(review_status, 'pending')) = 'pending';

-- Confirm results
SELECT
  review_status,
  count(*) as count
FROM public.daily_entries
GROUP BY review_status
ORDER BY count DESC;
