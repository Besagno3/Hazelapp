-- CI only: a minimal stand-in for what a Supabase project provides before the
-- app's migrations run (the API roles, auth.users, auth.sessions, auth.uid(),
-- auth.jwt()). Lets CI apply
-- supabase/migrations/*.sql to a plain Postgres and run supabase/ci/*.test.sql.
-- Never apply this to a real Supabase project.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
-- When the login last signed in (read by the 👪 Grown-ups unlock, 0024).
alter table auth.users add column if not exists last_sign_in_at timestamptz;
-- A login's sign-ins (Supabase keeps one row per session; 0024 checks a
-- session named to unlock is one of the caller's).
create table if not exists auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  not_after  timestamptz
);
-- As Supabase defines them: the caller's id (the old per-claim setting, or the
-- claims JSON PostgREST sets) and the whole token's claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
