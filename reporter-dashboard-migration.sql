-- সাংবাদিকদের আলাদা লগইন পোর্টাল ও নিজের নিউজের রেকর্ড
alter table public.news
  add column if not exists reporter_id uuid references public.portal_reporters(user_id) on delete set null;

create index if not exists news_reporter_created_idx
  on public.news(reporter_id, created_at desc);

-- সাংবাদিকের প্রোফাইল তথ্য শুধু সার্ভার-সাইড API দিয়ে পড়া/পরিবর্তন হবে।
alter table public.portal_reporters enable row level security;
revoke all on public.portal_reporters from anon, authenticated;
