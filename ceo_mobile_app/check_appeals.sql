-- Last 24 hours: how many appeals per hour
SELECT
  date_trunc('hour', created_at) AS hour,
  count(*) AS appeals_created,
  count(*) FILTER (WHERE status = 'pending') AS pending
FROM public.appeals
WHERE created_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY 1 DESC;

-- Last 50 appeals with details
SELECT id, appeal_type, status, town_name, created_at, reason
FROM public.appeals
ORDER BY created_at DESC
LIMIT 50;
