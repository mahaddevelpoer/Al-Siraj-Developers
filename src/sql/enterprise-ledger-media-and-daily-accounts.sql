-- Enterprise ledger media archive + daily entry account fields
-- Safe to run more than once in Supabase SQL editor.

ALTER TABLE IF EXISTS public.daily_entries
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_type text;

CREATE TABLE IF NOT EXISTS public.media_library (
  media_id text PRIMARY KEY,
  town_name text,
  type text,
  title text,
  file_path text,
  pdf_path text,
  excel_path text,
  html_path text,
  account_name text,
  property_number text,
  receipt_number text,
  report_date date,
  from_date date,
  to_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_media_library_town_type
  ON public.media_library (town_name, type, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_library_account
  ON public.media_library (town_name, account_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_library_property
  ON public.media_library (town_name, property_number)
  WHERE deleted_at IS NULL;

ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_library_read_all ON public.media_library;
CREATE POLICY media_library_read_all
  ON public.media_library FOR SELECT
  USING (true);

DROP POLICY IF EXISTS media_library_write_all ON public.media_library;
CREATE POLICY media_library_write_all
  ON public.media_library FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'media_library'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.media_library;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
