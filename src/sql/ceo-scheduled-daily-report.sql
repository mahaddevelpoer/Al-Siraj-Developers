-- Create system_config table for secure database-level settings
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 1. Enable pg_cron (requires Supabase project with pg_cron enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old schedule if exists
    PERFORM cron.unschedule('ceo-daily-report');

    -- Schedule daily at 8PM Pakistan time (UTC+5)
    PERFORM cron.schedule(
      'ceo-daily-report',
      '0 15 * * *',  -- 8PM PKT = 15:00 UTC (during PKT = UTC+5)
      $cron_job$
        SELECT net.http_post(
          url := COALESCE((SELECT value FROM public.system_config WHERE key = 'edge_function_url'), 'https://wdislbdftnwmaexqtfmn.supabase.co') || '/functions/v1/scheduled-daily-report',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE((SELECT value FROM public.system_config WHERE key = 'service_role_key'), '')
          ),
          body := '{}'::jsonb
        );
      $cron_job$
    );
  END IF;
END $$;

-- 2. Create database function trigger_daily_report
CREATE OR REPLACE FUNCTION public.trigger_daily_report()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result text;
  edge_url text;
  service_key text;
BEGIN
  SELECT value INTO edge_url FROM public.system_config WHERE key = 'edge_function_url';
  SELECT value INTO service_key FROM public.system_config WHERE key = 'service_role_key';
  
  IF edge_url IS NULL THEN
    edge_url := 'https://wdislbdftnwmaexqtfmn.supabase.co';
  END IF;
  
  SELECT content::text INTO result
  FROM net.http_post(
    url := edge_url || '/functions/v1/scheduled-daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_key, '')
    ),
    body := '{}'::jsonb
  );

  RETURN result;
END $$;
