-- Run this SQL once in Supabase SQL Editor before testing the updated journalist application form.
ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS citizenship_country text,
  ADD COLUMN IF NOT EXISTS is_expatriate boolean,
  ADD COLUMN IF NOT EXISTS current_country text;

ALTER TABLE public.portal_reporters
  ADD COLUMN IF NOT EXISTS citizenship_country text,
  ADD COLUMN IF NOT EXISTS is_expatriate boolean,
  ADD COLUMN IF NOT EXISTS current_country text;
