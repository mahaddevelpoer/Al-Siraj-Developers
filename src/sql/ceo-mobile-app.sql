-- CEO Mobile App review fields.
-- Run this once in Supabase SQL Editor before using Daily Entry approve/reject.
-- Existing rows stay unchanged; new columns are nullable/default-only.

ALTER TABLE public.daily_entries
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_entries_review_status
  ON public.daily_entries (review_status);

CREATE INDEX IF NOT EXISTS idx_daily_entries_date
  ON public.daily_entries (Date DESC);
