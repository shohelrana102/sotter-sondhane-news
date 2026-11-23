-- Admin journalist controls and database-wide duplicate protection
-- Run once in Supabase SQL Editor. Published news is retained if a journalist account is deleted.

alter table public.portal_reporters
  add column if not exists can_submit boolean not null default true;

alter table public.news
  add column if not exists reporter_id uuid references public.portal_reporters(user_id) on delete set null;

create index if not exists news_reporter_created_idx
  on public.news(reporter_id, created_at desc);

create extension if not exists pg_trgm with schema extensions;

create or replace function public.guard_news_duplicates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming text;
  found_title text;
begin
  if new.status = 'rejected' then
    return new;
  end if;

  -- Serialize inserts/status approvals so simultaneous requests cannot race past the check.
  perform pg_advisory_xact_lock(918273645);

  incoming := lower(regexp_replace(trim(coalesce(new.title,'') || ' ' || coalesce(new.body,'')), '[[:space:][:punct:]]+', ' ', 'g'));

  select n.title into found_title
  from public.news n
  where n.id is distinct from new.id
    and n.status <> 'rejected'
    and n.created_at > now() - interval '180 days'
    and (
      lower(regexp_replace(trim(coalesce(n.title,'') || ' ' || coalesce(n.body,'')), '[[:space:][:punct:]]+', ' ', 'g')) = incoming
      or extensions.similarity(
        lower(regexp_replace(trim(coalesce(n.title,'') || ' ' || coalesce(n.body,'')), '[[:space:][:punct:]]+', ' ', 'g')),
        incoming
      ) >= 0.78
    )
  order by n.created_at desc
  limit 1;

  if found_title is not null then
    raise exception 'সম্ভাব্য ডুপ্লিকেট/কপি সংবাদ শনাক্ত হয়েছে। মিল পাওয়া শিরোনাম: %', found_title
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists news_duplicate_guard on public.news;
create trigger news_duplicate_guard
before insert or update of title, body, status on public.news
for each row execute function public.guard_news_duplicates();

-- Reporter submissions require a logged-in, approved, enabled journalist account.
create or replace function public.submit_news(
 p_title text, p_body text, p_author text,
 p_phone text default '', p_image_url text default ''
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  reporter public.portal_reporters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'সংবাদ জমা দিতে সাংবাদিক অ্যাকাউন্টে লগইন করুন।';
  end if;

  select * into reporter
  from public.portal_reporters
  where user_id = auth.uid() and active = true and can_submit = true;

  if not found then
    raise exception 'আপনার সাংবাদিক অনুমোদন নেই অথবা সংবাদ জমা সাময়িক বন্ধ।';
  end if;

  if p_title is null or char_length(trim(p_title)) < 5 or char_length(p_title) > 180
     or p_body is null or char_length(trim(p_body)) < 20 or char_length(p_body) > 12000 then
    raise exception 'শিরোনাম ও বিস্তারিত সঠিকভাবে দিন।';
  end if;

  insert into public.news(title,body,author,phone,image_url,status,reporter_id)
  values(trim(p_title),trim(p_body),reporter.full_name,coalesce(left(reporter.phone,30),''),coalesce(left(p_image_url,500),''),'pending',auth.uid());

  return jsonb_build_object('ok',true,'message','নিউজ জমা হয়েছে। অ্যাডমিন অনুমোদনের পর প্রকাশিত হবে।');
end;
$$;

revoke all on function public.submit_news(text,text,text,text,text) from public;
grant execute on function public.submit_news(text,text,text,text,text) to authenticated;
