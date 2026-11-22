-- সাংবাদিক আবেদন পোর্টালের জন্য একবার চালান
create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null default '',
  address text not null default '',
  reporter_post text not null default '',
  photo_url text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.registration_requests
  add column if not exists is_expatriate text not null default '',
  add column if not exists current_country text not null default '',
  add column if not exists coverage_area text not null default '',
  add column if not exists citizenship text not null default '';

alter table public.registration_requests
  add column if not exists address text not null default '',
  add column if not exists reporter_post text not null default '',
  add column if not exists photo_url text not null default '';

create table if not exists public.portal_reporters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  reporter_post text not null default '',
  photo_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.portal_reporters
  add column if not exists is_expatriate text not null default '',
  add column if not exists current_country text not null default '',
  add column if not exists coverage_area text not null default '',
  add column if not exists citizenship text not null default '';

alter table public.portal_reporters
  add column if not exists full_name text not null default '',
  add column if not exists email text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists address text not null default '',
  add column if not exists reporter_post text not null default '',
  add column if not exists photo_url text not null default '',
  add column if not exists active boolean not null default true;

alter table public.registration_requests enable row level security;
alter table public.portal_reporters enable row level security;

revoke all on public.registration_requests from anon, authenticated;
revoke all on public.portal_reporters from anon, authenticated;
