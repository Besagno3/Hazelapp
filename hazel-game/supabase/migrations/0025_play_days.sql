-- Hazel Quest — the days each kid played, for the parent dashboard (#29)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0024.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- 👪 Grown-ups → 📈 Progress shows a kid's last 7 days: which of them they
-- played. `profiles` only holds the last day played and the streak, which
-- can't say "Monday and Wednesday", so each day played becomes one tiny row
-- here — the day and the kid, nothing else (no times, no XP, no answers).
--
-- Who may do what:
--   * read: a grown-up, their own kids' days (RLS, like `saves`). Reading is
--     not a grown-up *action*, so it needs no 👪 window (0024), but the app
--     only shows it inside 👪 Grown-ups.
--   * write: only through note_play_days(kid, days) — the family's own
--     sign-in, for one of its own kids (kids have no login of their own: the
--     family's sign-in plays as them, as it saves their game). It only ADDS
--     days, only days from the last week (7 days back, for a game played
--     offline; 1 ahead, for a time zone ahead of the server's clock), at most
--     31 at once. Nobody updates or deletes a day through the API. It is the
--     kid's play, so like their save it needs no 👪 window.
--   * kept 14 days: each note deletes that kid's days older than that (the
--     page shows 7). Removing a kid or closing the account deletes them with
--     the kid (on delete cascade from `profiles`).
--
-- Backward compatible: an app from before this never calls it; this app
-- treats a database without it as "no days to show" (the page leaves the
-- 7 days out) and keeps unsent days on the device until it can send them.

create table if not exists public.play_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  primary key (profile_id, day)
);

alter table public.play_days enable row level security;

drop policy if exists "Grown-ups read their kids' play days" on public.play_days;
create policy "Grown-ups read their kids' play days"
  on public.play_days for select
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()));

revoke all on public.play_days from public, anon, authenticated;
grant select on public.play_days to authenticated;
grant select, insert, delete on public.play_days to service_role;

-- Note the days a kid played (their device's own calendar days). Returns how
-- many of `p_days` were inside the window (noted now or already there); the
-- rest are skipped, never an error, so a device's old backlog clears itself.
-- Refusals: 42501 "not signed in" / "not your player"; 22023 "too many days".
create or replace function public.note_play_days(p_kid uuid, p_days date[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_kept integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_kid and p.parent_id = v_user) then
    raise exception 'not your player' using errcode = '42501';
  end if;
  if p_days is null or cardinality(p_days) = 0 then
    return 0;
  end if;
  if cardinality(p_days) > 31 then
    raise exception 'too many days' using errcode = '22023';
  end if;

  select count(distinct d) into v_kept
    from unnest(p_days) as d
   where d between current_date - 7 and current_date + 1;

  insert into public.play_days (profile_id, day)
  select distinct p_kid, d
    from unnest(p_days) as d
   where d between current_date - 7 and current_date + 1
  on conflict (profile_id, day) do nothing;

  -- Kept for 14 days: the page shows the last 7.
  delete from public.play_days where profile_id = p_kid and day < current_date - 14;

  return v_kept;
end;
$$;

revoke execute on function public.note_play_days(uuid, date[]) from public, anon;
grant execute on function public.note_play_days(uuid, date[]) to authenticated;
