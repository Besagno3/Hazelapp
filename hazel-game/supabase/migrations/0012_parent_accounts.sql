-- Hazel Quest — parent accounts (#118, ISSUES #89)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0011.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- A login now belongs to a grown-up, who adds their kids. Each kid is a row in
-- `profiles` with its own id and `parent_id` = the grown-up's login; a kid's
-- save and flags are reachable only through that grown-up. Kids never get an
-- email or a login of their own.
--
-- Accounts from before this become a grown-up with one kid: the profile keeps
-- its id (= the login's id), so its save, its seen questions and the app's
-- local caches all still match. Their `parents` row has no consent yet, so the
-- app asks a grown-up for it at the next sign-in.
--
-- Backward compatible: the app from before this keeps working (its profile is
-- still found by the login's id, and its sign-up still makes that first kid).

-- 1) Grown-ups and their consent.
create table if not exists public.parents (
  id              uuid        primary key references auth.users (id) on delete cascade,
  -- When, and to which wording, the grown-up agreed (null = not yet: the app asks).
  consent_at      timestamptz,
  consent_version text,
  created_at      timestamptz not null default now()
);

alter table public.parents enable row level security;

drop policy if exists "Grown-ups read their own row" on public.parents;
create policy "Grown-ups read their own row"
  on public.parents for select
  using (auth.uid() = id);

grant select on public.parents to authenticated;
grant select, insert, update on public.parents to service_role;

-- The app writes this table only through here: consent is stamped with the
-- server's clock (the client can't backdate it), and a login from before this
-- with no kid — so no row from step 2 — gets its row on agreeing.
create or replace function public.record_consent(p_version text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.parents (id, consent_at, consent_version)
  values (auth.uid(), now(), left(p_version, 40))
  on conflict (id) do update
    set consent_at = now(), consent_version = left(p_version, 40);
$$;
revoke execute on function public.record_consent(text) from public, anon;
grant execute on function public.record_consent(text) to authenticated;

-- 2) Kids: a profile gets a grown-up, a nickname, a tile picture and a secret
--    picture (what a kid taps to open their own profile on a shared device —
--    a lock against a sibling's slip, not a password: the grown-up's session
--    can read it).
alter table public.profiles
  add column if not exists parent_id        uuid references auth.users (id) on delete cascade,
  add column if not exists display_name     text,
  add column if not exists icon             text,
  add column if not exists picture_password text;

-- Profiles from before this are their own login's first kid.
update public.profiles set parent_id = id where parent_id is null;
alter table public.profiles alter column parent_id set not null;
-- A kid added by the app belongs to whoever is signed in (an app from before
-- this, creating a missing profile, gets the same).
alter table public.profiles alter column parent_id set default auth.uid();
create index if not exists profiles_parent_idx on public.profiles (parent_id);

-- A kid isn't a login: new kids get their own id. (An existing kid keeps
-- theirs; deleting the login still removes them, through parent_id.)
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(btrim(display_name)) between 1 and 20);

-- Every grown-up who already has a kid gets their row (no consent yet).
insert into public.parents (id)
  select distinct parent_id from public.profiles
  on conflict (id) do nothing;

-- 3) Kids belong to their grown-up: read, add, change and remove them.
drop policy if exists "Profiles are viewable by their owner" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

drop policy if exists "Grown-ups see their kids" on public.profiles;
create policy "Grown-ups see their kids"
  on public.profiles for select
  using (auth.uid() = parent_id);

drop policy if exists "Grown-ups add kids" on public.profiles;
create policy "Grown-ups add kids"
  on public.profiles for insert
  with check (auth.uid() = parent_id);

drop policy if exists "Grown-ups update their kids" on public.profiles;
create policy "Grown-ups update their kids"
  on public.profiles for update
  using (auth.uid() = parent_id)
  with check (auth.uid() = parent_id);

-- Removing a kid removes their save, seen questions and flags with them
-- (each references profiles on delete cascade).
drop policy if exists "Grown-ups remove kids" on public.profiles;
create policy "Grown-ups remove kids"
  on public.profiles for delete
  using (auth.uid() = parent_id);

grant delete on public.profiles to authenticated;

-- A kid's save: their grown-up's to read and write.
drop policy if exists "Players read their own save" on public.saves;
drop policy if exists "Players create their own save" on public.saves;
drop policy if exists "Players update their own save" on public.saves;

drop policy if exists "Grown-ups read their kids' saves" on public.saves;
create policy "Grown-ups read their kids' saves"
  on public.saves for select
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()));

drop policy if exists "Grown-ups create their kids' saves" on public.saves;
create policy "Grown-ups create their kids' saves"
  on public.saves for insert
  with check (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()));

drop policy if exists "Grown-ups update their kids' saves" on public.saves;
create policy "Grown-ups update their kids' saves"
  on public.saves for update
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()));

-- A flag is sent as one of the grown-up's kids.
drop policy if exists "users insert their own flags" on public.question_flags;
drop policy if exists "Grown-ups flag as their kids" on public.question_flags;
create policy "Grown-ups flag as their kids"
  on public.question_flags for insert
  to authenticated
  with check (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()));

-- 4) Sign-up: every new login is a grown-up. Agreeing on the sign-up form
--    (`consent_version` in the metadata) is stamped now; without it the app
--    asks before anyone plays. An app from before this still sends a birth
--    date and no consent: that login gets its first kid, as old accounts did.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year    text := new.raw_user_meta_data ->> 'birth_year';
  v_month   text := new.raw_user_meta_data ->> 'birth_month';
  v_consent text := new.raw_user_meta_data ->> 'consent_version';
begin
  if v_consent !~ '^[A-Za-z0-9._-]{1,40}$' then
    v_consent := null;
  end if;
  insert into public.parents (id, consent_at, consent_version)
  values (new.id, case when v_consent is not null then now() end, v_consent)
  on conflict (id) do nothing;

  if v_year ~ '^\d{4}$' and v_month ~ '^\d{1,2}$' and v_month::int between 1 and 12 then
    insert into public.profiles (id, parent_id, birth_year, birth_month)
    values (new.id, new.id, v_year::smallint, v_month::smallint)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
