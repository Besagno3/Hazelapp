-- Hazel Quest — PINs and a question budget per kid (#118)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0012.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- The owner's calls (2026-10-10): every kid opens their profile with a
-- 4-digit PIN (replacing 0012's secret picture); 👪 Grown-ups opens with the
-- grown-up's own PIN or their password; the question budget is per kid.
--
-- PINs are stored hashed (bcrypt, pgcrypto) in tables no client can read or
-- write; the app sets and checks them only through the functions below, which
-- also check the kid is the caller's.

-- pgcrypto: already in `extensions` on Supabase; created here for plain Postgres (CI).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1) Kid PINs.
create table if not exists public.kid_pins (
  profile_id uuid        primary key references public.profiles (id) on delete cascade,
  pin_hash   text        not null,
  updated_at timestamptz not null default now()
);
-- RLS on and no policies, no grants: only the security-definer functions get in.
alter table public.kid_pins enable row level security;
revoke all on public.kid_pins from anon, authenticated;

-- What the app may know: whether a kid has a PIN (not the PIN).
alter table public.profiles add column if not exists has_pin boolean not null default false;

-- The secret picture is replaced by the PIN.
alter table public.profiles drop column if exists picture_password;

create or replace function public.set_kid_pin(p_kid uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'pin_format: a PIN is 4 digits';
  end if;
  if not exists (select 1 from public.profiles where id = p_kid and parent_id = auth.uid()) then
    raise exception 'not_your_kid: that player belongs to another account';
  end if;
  insert into public.kid_pins (profile_id, pin_hash)
  values (p_kid, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (profile_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
  update public.profiles set has_pin = true where id = p_kid;
end;
$$;

create or replace function public.check_kid_pin(p_kid uuid, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.kid_pins k
      join public.profiles p on p.id = k.profile_id
     where k.profile_id = p_kid
       and p.parent_id = auth.uid()
       and k.pin_hash = extensions.crypt(p_pin, k.pin_hash)
  );
$$;

-- 2) The grown-up's own PIN (optional: their password always works too).
create table if not exists public.parent_pins (
  id         uuid        primary key references auth.users (id) on delete cascade,
  pin_hash   text        not null,
  updated_at timestamptz not null default now()
);
alter table public.parent_pins enable row level security;
revoke all on public.parent_pins from anon, authenticated;

-- Readable by the grown-up (`parents` has no update grant, so only
-- set_parent_pin changes it).
alter table public.parents add column if not exists has_pin boolean not null default false;

create or replace function public.set_parent_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'pin_format: a PIN is 4 digits';
  end if;
  insert into public.parent_pins (id, pin_hash)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (id) do update set pin_hash = excluded.pin_hash, updated_at = now();
  insert into public.parents (id, has_pin) values (auth.uid(), true)
  on conflict (id) do update set has_pin = true;
end;
$$;

create or replace function public.check_parent_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parent_pins
     where id = auth.uid() and pin_hash = extensions.crypt(p_pin, pin_hash)
  );
$$;

revoke execute on function public.set_kid_pin(uuid, text) from public, anon;
revoke execute on function public.check_kid_pin(uuid, text) from public, anon;
revoke execute on function public.set_parent_pin(text) from public, anon;
revoke execute on function public.check_parent_pin(text) from public, anon;
grant execute on function public.set_kid_pin(uuid, text) to authenticated;
grant execute on function public.check_kid_pin(uuid, text) to authenticated;
grant execute on function public.set_parent_pin(text) to authenticated;
grant execute on function public.check_parent_pin(text) to authenticated;

-- 3) The question budget is per kid: begin_question_request's p_profile is
--    now the kid's id (the edge function sends it). Requests point at the kid
--    and go when the kid is removed. NOT VALID: rows logged under a login
--    before this are left as they are (they age out of every window in a day).
alter table public.question_requests drop constraint if exists question_requests_profile_id_fkey;
alter table public.question_requests drop constraint if exists question_requests_kid_fkey;
alter table public.question_requests add constraint question_requests_kid_fkey
  foreign key (profile_id) references public.profiles (id) on delete cascade not valid;

-- A per-kid budget would grow with every kid added, so a family has at most 8.
create or replace function public.profiles_kid_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.profiles where parent_id = new.parent_id) >= 8 then
    raise exception 'kid_limit: a family account can have up to 8 players';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_kid_limit on public.profiles;
create trigger profiles_kid_limit
  before insert on public.profiles
  for each row execute function public.profiles_kid_limit();
