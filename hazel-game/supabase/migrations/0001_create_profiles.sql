-- Hazel Quest — profiles table
-- Run in the Supabase SQL Editor (or `supabase db push`).
--
-- Stores each player's birth year/month (for age-based difficulty) and a
-- per-topic skill level. One row per auth user, created automatically on
-- sign-up from the metadata passed to supabase.auth.signUp().

create table if not exists public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  birth_year    smallint    not null,
  birth_month   smallint    not null check (birth_month between 1 and 12),
  -- { "math": 3, "science": 1, ... } — per-topic skill level (integers).
  skill_levels  jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Row Level Security: a user may only see and change their own profile.
alter table public.profiles enable row level security;

create policy "Profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up. Reads birth_year /
-- birth_month from the sign-up metadata (raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, birth_year, birth_month)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'birth_year')::smallint,
    (new.raw_user_meta_data ->> 'birth_month')::smallint
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
