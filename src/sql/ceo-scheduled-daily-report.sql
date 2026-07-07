-- Scheduled Daily Report for CEO Mobile
-- Run this SQL in Supabase SQL Editor after deploying the Edge Function
-- This sets up a pg_cron job that triggers the Edge Function at 8PM daily
-- If pg_cron is not available, use Supabase Dashboard → Database → Scheduled Functions

-- 1. Enable pg_cron (requires Supabase project with pg_cron enabled)
--    If pg_cron is not available, skip to step 2.

-- Check if pg_cron extension is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old schedule if exists
    PERFORM cron.unschedule('ceo-daily-report');

    -- Schedule daily at 8PM Pakistan time (UTC+5)
    PERFORM cron.schedule(
      'ceo-daily-report',
      '0 15 * * *',  -- 8PM PKT = 15:00 UTC (during PKT = UTC+5)
      $$
        SELECT net.http_post(
          url := current_setting('app.settings.edge_function_url') || '/functions/v1/scheduled-daily-report',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body := '{}'::jsonb
        );
      $$
    );
  END IF;
END $$;

-- 2. Alternative: Create a database function that Supabase Scheduled Functions can call
--    Use this if using Supabase Dashboard's "Database → Scheduled Functions" UI

CREATE OR REPLACE FUNCTION public.trigger_daily_report()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_url text;
  result text;
BEGIN
  -- Get the Edge Function URL from app settings
  edge_url := current_setting('app.settings.edge_function_url', true);
  IF edge_url IS NULL THEN
    edge_url := 'https://wdislbdftnwmaexqtfmn.supabase.co';
  END IF;

  SELECT content::text INTO result
  FROM net.http_post(
    url := edge_url || '/functions/v1/scheduled-daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );

  RETURN result;
END $$;

-- 3. Set app settings (replace with your actual values)
-- These must be set in Supabase Dashboard → Project Settings → API
-- or via SQL:
-- SELECT set_config('app.settings.edge_function_url',
--   'https://wdislbdftnwmaexqtfmn.supabase.co', false);
-- SELECT set_config('app.settings.service_role_key',
--   'your_service_role_key_here', false);
