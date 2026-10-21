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
--   * read: a grown-up, their own kids' days of the last two weeks (RLS,
--     like `saves`). Reading is not a grown-up *action*, so it needs no 👪
--     window (0024), but the app only shows it inside 👪 Grown-ups.
--   * write: only through note_play_days(kid, days) — the family's own
--     sign-in, for one of its own kids (kids have no login of their own: the
--     family's sign-in plays as them, as it saves their game). It only ADDS
--     days, only days from the last week (7 days back, for a game played
--     offline; 1 ahead, for a time zone ahead of the server's clock), at most
--     31 at once. Nobody updates or deletes a day through the API. It is the
--     kid's play, so like their save it needs no 👪 window.
--   * kept 14 days, for every kid (the page shows 7): a day older than that
--     can't be read by anyone through the API (the read policy stops at two
--     weeks), and each note — any family's — deletes up to 1,000 of every
--     kid's oldest older days, so a kid who stops playing loses theirs too
--     (#29 review round 1: it used to be only the noting kid's; round 2: a
--     bounded batch, so a note never risks the API's statement timeout).
--     Removing a kid or closing the account deletes them with the kid (on
--     delete cascade from `profiles`).
--   * the server's own calendar: the function runs in UTC, whatever time zone
--     a request asks for, so no caller can move the week or the two weeks.
--
-- Backward compatible: an app from before this never calls it; this app
-- treats a database without it as "no days to show" (the page leaves the
-- 7 days out) and keeps unsent days on the device until it can send them.

create table if not exists public.play_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  primary key (profile_id, day)
);

-- The tidy-up finds old days by date, across every kid.
create index if not exists play_days_day_idx on public.play_days (day);

alter table public.play_days enable row level security;

drop policy if exists "Grown-ups read their kids' play days" on public.play_days;
create policy "Grown-ups read their kids' play days"
  on public.play_days for select
  using (
    day >= current_date - 14
    and exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid())
  );

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
set timezone = 'UTC'
as $$
declare
  v_user uuid := auth.uid();
  v_kept integer;
  -- How many old days one note deletes at most (see the tidy-up below).
  v_purge constant integer := 1000;
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

  -- Kept for 14 days (the page shows the last 7) — every kid's, not just
  -- this one's, so a kid who stops playing doesn't keep theirs for ever. A
  -- few at a time (#29 review round 2): at most v_purge of the oldest, found
  -- by the index on `day`, so no note ever pays for a whole day's crossing
  -- (one statement over every family's old rows outlasted the API's timeout
  -- at scale, and the note itself was rolled back with it); every note trims
  -- a little more. Rows another note is deleting right now are left to it
  -- (no waiting on locks). Old rows waiting their turn can't be read anyway
  -- (the read policy stops at two weeks).
  delete from public.play_days
   where ctid = any (array(
     select o.ctid from public.play_days o
      where o.day < current_date - 14
      order by o.day
      limit v_purge
        for update skip locked));

  return v_kept;
end;
$$;

revoke execute on function public.note_play_days(uuid, date[]) from public, anon;
grant execute on function public.note_play_days(uuid, date[]) to authenticated;
