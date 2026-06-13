-- #37: per-player JRPG save files (also resolves #12 — progress tied to the
-- user, not the browser). One row per profile, whole save as JSONB.

create table if not exists public.saves (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "Players read their own save"
  on public.saves for select
  using (auth.uid() = profile_id);

create policy "Players create their own save"
  on public.saves for insert
  with check (auth.uid() = profile_id);

create policy "Players update their own save"
  on public.saves for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Mirror 0005's explicit grants — this project's public-schema default
-- privileges are tightened, so RLS alone isn't enough.
grant select, insert, update on public.saves to authenticated;
grant select, insert, update on public.saves to service_role;
