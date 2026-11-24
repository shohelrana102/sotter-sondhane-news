-- Public news submission must go through the authenticated journalist API.
-- That API verifies the Supabase user and active journalist profile before inserting.
-- Disable the legacy SECURITY DEFINER RPC for every client role.
REVOKE ALL ON FUNCTION public.submit_news(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
