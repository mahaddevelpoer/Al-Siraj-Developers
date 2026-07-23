-- Fix notifications table customer_name column length error
-- Run this in your Supabase SQL Editor to resolve the sync blocking issue.
ALTER TABLE public.notifications ALTER COLUMN customer_name TYPE TEXT;
ALTER TABLE public.notifications ALTER COLUMN "Customer_Name" TYPE TEXT;
