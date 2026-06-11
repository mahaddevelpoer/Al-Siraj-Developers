-- ============================================================
-- FILE MANIFEST: Tracks Excel file hashes for cloud storage sync
-- Run this in Supabase SQL Editor (or use Setup DB button)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.file_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  md5_hash VARCHAR(32) NOT NULL,
  file_size BIGINT,
  last_modified TIMESTAMP WITH TIME ZONE,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(file_path)
);

ALTER TABLE public.file_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_file_manifest" ON public.file_manifest;
CREATE POLICY "anon_read_file_manifest" ON public.file_manifest
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ceo_write_file_manifest" ON public.file_manifest;
CREATE POLICY "ceo_write_file_manifest" ON public.file_manifest
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "ceo_update_file_manifest" ON public.file_manifest;
CREATE POLICY "ceo_update_file_manifest" ON public.file_manifest
  FOR UPDATE USING (true) WITH CHECK (true);

-- Create storage bucket (run once)
-- Go to Storage → Create bucket → name: 'zameenkhata-files', public: true
-- Files are stored inside this bucket under folder: zameen-khata/
-- Or run via Supabase Management API

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('zameenkhata-files', 'zameenkhata-files', true, 52428800, ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "read_zameenkhata_files" ON storage.objects;
CREATE POLICY "read_zameenkhata_files" ON storage.objects
  FOR SELECT USING (bucket_id = 'zameenkhata-files');

DROP POLICY IF EXISTS "insert_zameenkhata_files" ON storage.objects;
CREATE POLICY "insert_zameenkhata_files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'zameenkhata-files' AND name LIKE 'zameen-khata/%');

DROP POLICY IF EXISTS "update_zameenkhata_files" ON storage.objects;
CREATE POLICY "update_zameenkhata_files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'zameenkhata-files' AND name LIKE 'zameen-khata/%')
  WITH CHECK (bucket_id = 'zameenkhata-files' AND name LIKE 'zameen-khata/%');

DROP POLICY IF EXISTS "delete_zameenkhata_files" ON storage.objects;
CREATE POLICY "delete_zameenkhata_files" ON storage.objects
  FOR DELETE USING (bucket_id = 'zameenkhata-files' AND name LIKE 'zameen-khata/%');
