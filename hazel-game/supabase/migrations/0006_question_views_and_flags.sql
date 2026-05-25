-- Hazel Quest — per-player view history + flag-a-question
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0005.
--
-- question_views: every question a profile is served. The edge function reads
-- the most recent 100 per profile to exclude from the cache pool (#24 dedupe).
-- question_flags: a kid (or parent) can flag a question — any single flag
-- quarantines that question from the cache pool until manual review (#26).

create table if not exists public.question_views (
  id          uuid        primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  question_id uuid        not null references public.questions(id) on delete cascade,
  seen_at     timestamptz not null default now()
);

-- Lookup pattern: most recent N views for a single profile.
create index if not exists question_views_profile_seen_idx
  on public.question_views (profile_id, seen_at desc);

alter table public.question_views enable row level security;

-- Only the edge function (service role) reads / writes views. No client policy.
grant select, insert on public.question_views to service_role;

create table if not exists public.question_flags (
  id          uuid        primary key default gen_random_uuid(),
  question_id uuid        not null references public.questions(id) on delete cascade,
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

-- Lookup pattern: "is this question flagged?" — by question_id.
create index if not exists question_flags_question_idx
  on public.question_flags (question_id);

alter table public.question_flags enable row level security;

-- Authenticated users may insert flags only for themselves. They cannot read
-- flags from the client; the edge function uses the service role to quarantine.
create policy "users insert their own flags"
  on public.question_flags
  for insert
  to authenticated
  with check (profile_id = auth.uid());

grant insert on public.question_flags to authenticated;
grant select, insert on public.question_flags to service_role;
