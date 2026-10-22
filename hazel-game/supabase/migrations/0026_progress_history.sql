-- Hazel Quest — a kid's play per day, and where each topic started, for the
-- parent dashboard (#169, #170, #172, #173, #174)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0025.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- 👪 Grown-ups → 📈 Progress could only say which days a kid played (0025).
-- Now each of those days also keeps what was played on it, as the kid's
-- device counted it:
--   * `xp`      — the XP earned that day (#169, "XP over time");
--   * `minutes` — active minutes: a visible tab with input in the last
--                 minute (#172, "how long they played");
--   * `topics`  — per topic id, answers asked (`a`) and right (`r`), bank
--                 questions only, and the topic's level at the day's end
--                 (`l`) (#173, "7 of 10 right", "up 1 since last week");
--   * `noted_play` — the day was noted with its play (#181), so a day
--                 really played for 0 XP, under a minute and no bank answer
--                 reads "0 XP", not "not recorded". Only a day sent with
--                 `noted: true` sets it — the app leaves that off a day an
--                 older app played too (its XP is lost), and nothing unsets it.
-- No times of day, no questions, no answers' text.
--
-- Who may do what (as 0025, with the new columns):
--   * read: a grown-up, their own kids' days of the last five weeks (RLS).
--     Reading needs no 👪 window (0024); the app only shows it inside 👪.
--   * write: only note_play_history(kid, days) (and 0025's note_play_days,
--     days only, for a tab still running an older app) — the family's own
--     sign-in, for one of its own kids, days from 7 back to 1 ahead of the
--     server's date, at most 31 a call. A day is a running total the device
--     re-sends as it grows, so the server keeps the LARGER of what it has
--     and what's sent (XP, minutes, and per topic the tally with more
--     answers): a late or repeated send never lowers a day, and two devices
--     on one day never add up to more than either counted (an undercount,
--     never an invented number). Nobody updates or deletes a day through the
--     API. It is the kid's play, so it needs no 👪 window.
--   * kept 35 days (was 14), for every kid: the page shows 4 weeks of XP and
--     compares this week with the last. Any note — either function, any
--     family — deletes up to 1,000 of every kid's oldest older days (0025's
--     bounded batch). note_play_days is redefined with the same 35, so a tab
--     still on the old app can't delete history at 14 days.
--   * the server's own calendar: both functions run in UTC, whatever time
--     zone a request asks for.
--
-- "Counted from" (#170): play_history_since keeps, per kid, the first day
-- ever noted (either function), so the page can say "earlier days weren't
-- recorded" instead of reading a gap as no play. Never deleted while the kid
-- exists (it goes with them, on delete cascade); backfilled from the days
-- kept now. Readable by the family; written only by the note functions.
--
-- Where each topic really started (#174): `profiles.skill_starts`, topic id
-- → {"level": 1–10, "age": 3–18, "on": "YYYY-MM-DD"}, noted by the app the
-- first time the topic's level is saved (it lived only in the save's
-- `topicStarts`, which a losing copy of the save could drop). The kid's
-- play: written with their other play columns, no 👪 window. A trigger
-- keeps the FIRST start for a topic (a later write never moves it or
-- removes it) and drops junk. Its age is the kid's (#183): a start that
-- says the day it was noted (`on`) takes the age the kid was that day by
-- the row's birth date — when it arrives, and again when a grown-up
-- corrects the birth date (a grown-up's column, so the 👪 gate has allowed
-- it), so it's exact whenever it reaches the row. A start without `on` (an
-- app or a save from before it) keeps the age it was sent with, and a
-- correction moves it by the change in the kid's age today — exact for the
-- year, maybe a year off for a month. Its level stays either way — the
-- level they really started at is still true. Levels aren't reset: the
-- family's devices keep cached copies that merge levels by the higher and
-- starts by union, so a reset on the server would be undone by the next
-- device that loads.
--
-- Backward compatible: an app from before this never reads the new columns
-- (its note_play_days still works, with the five-week tidy-up); this app
-- reads a database without them as "not recorded" and falls back to
-- note_play_days, keeping the rest on the device.

-- 1) The day's play, on 0025's rows. A row noted by note_play_days (or
--    before this) has zeros, no topics, and `noted_play` false: that it was
--    played is known, its play isn't. note_play_history sets `noted_play`
--    for a day sent with `noted: true` (#181); note_play_days never does.
alter table public.play_days
  add column if not exists xp integer not null default 0
    constraint play_days_xp_range check (xp between 0 and 100000);
alter table public.play_days
  add column if not exists minutes integer not null default 0
    constraint play_days_minutes_range check (minutes between 0 and 1440);
alter table public.play_days
  add column if not exists topics jsonb not null default '{}'::jsonb
    constraint play_days_topics_object check (jsonb_typeof(topics) = 'object');
alter table public.play_days
  add column if not exists noted_play boolean not null default false;

-- 2) Read for five weeks (was two).
drop policy if exists "Grown-ups read their kids' play days" on public.play_days;
create policy "Grown-ups read their kids' play days"
  on public.play_days for select
  using (
    day >= current_date - 35
    and exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid())
  );

-- 3) The first day noted for each kid (#170).
create table if not exists public.play_history_since (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  since      date not null
);

alter table public.play_history_since enable row level security;

drop policy if exists "Grown-ups read since when their kids' play is noted" on public.play_history_since;
create policy "Grown-ups read since when their kids' play is noted"
  on public.play_history_since for select
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.parent_id = auth.uid()));

revoke all on public.play_history_since from public, anon, authenticated;
grant select on public.play_history_since to authenticated;
grant select, insert, delete on public.play_history_since to service_role;

-- The days kept now are the earliest anyone can know of (0025 deleted days
-- older than two weeks). Re-running keeps the earlier of the two.
insert into public.play_history_since (profile_id, since)
select d.profile_id, min(d.day) from public.play_days d group by d.profile_id
on conflict (profile_id) do update
  set since = excluded.since
  where excluded.since < public.play_history_since.since;

-- 4) The note functions' shared steps. Internal: only the note functions
--    (security definer, run as the owner) call them.

-- `p_kid` played on `p_day` (the earliest day a note just noted): their
-- first day noted is the earlier of the two. A later day writes nothing (no
-- row rewritten on every note).
create or replace function public.play_history_note_since(p_kid uuid, p_day date)
returns void
language sql
set search_path = ''
as $$
  insert into public.play_history_since (profile_id, since)
  select p_kid, p_day where p_day is not null
  on conflict (profile_id) do update
    set since = excluded.since
    where excluded.since < public.play_history_since.since;
$$;

-- Kept for 35 days (the page shows 4 weeks, and compares with the week
-- before) — every kid's, so a kid who stops playing doesn't keep theirs for
-- ever. At most 1,000 of the oldest a note, found by the index on `day`, so
-- no note risks the API's statement timeout (0025 review round 2); rows
-- another note is deleting are left to it. Old rows waiting their turn
-- can't be read (the read policy stops at 35 days too).
create or replace function public.play_days_tidy()
returns void
language sql
set search_path = ''
set timezone = 'UTC'
as $$
  delete from public.play_days
   where ctid = any (array(
     select o.ctid from public.play_days o
      where o.day < current_date - 35
      order by o.day
      limit 1000
        for update skip locked));
$$;

-- A day's topic tallies, cleaned: at most 16 topics (the first by id), ids
-- of 1–24 lowercase letters, each {a: 0–10000, r: 0–a, l: 1–10}. A topic
-- whose `a` or `r` isn't a number is dropped; a bad `l` is dropped alone.
-- Counts are clamped (a fraction rounds down), a level must be whole.
create or replace function public.play_topics_clean(p_topics jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.key, jsonb_strip_nulls(jsonb_build_object(
           'a', t.a, 'r', least(t.r, t.a), 'l', t.l))), '{}'::jsonb)
    from (
      select e.key,
             least(greatest(trunc((e.value ->> 'a')::numeric), 0), 10000)::integer as a,
             least(greatest(trunc((e.value ->> 'r')::numeric), 0), 10000)::integer as r,
             case when jsonb_typeof(e.value -> 'l') = 'number' and (e.value ->> 'l') ~ '^\d{1,2}$'
                  then case when (e.value ->> 'l')::integer between 1 and 10
                            then (e.value ->> 'l')::integer end end as l
        from jsonb_each(case when jsonb_typeof(p_topics) = 'object' then p_topics else '{}'::jsonb end) e
       where e.key ~ '^[a-z]{1,24}$'
         and jsonb_typeof(e.value) = 'object'
         and jsonb_typeof(e.value -> 'a') = 'number'
         and jsonb_typeof(e.value -> 'r') = 'number'
       order by e.key
       limit 16
    ) t;
$$;

-- What a day keeps when a note sends its topics again: per topic, the tally
-- with more answers, the topics already there first if they'd be more than
-- 16. A tie takes the new tally whole — its `r` and its `l` with its `a`,
-- never mixed: one device re-sending its day has the same answers counted
-- later (and its later level); two devices with the same number of answers
-- that day keep the one sent last, its right count included (one device's
-- real tally either way — never a mix, never more right than asked; #179).
create or replace function public.play_topics_merge(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(m.k, m.v), '{}'::jsonb)
    from (
      select coalesce(n.key, o.key) as k,
             case when n.key is null then o.value
                  when o.key is null then n.value
                  when (n.value ->> 'a')::integer >= (o.value ->> 'a')::integer then n.value
                  else o.value end as v,
             o.key is not null as had
        from jsonb_each(public.play_topics_clean(p_old)) o
        full join jsonb_each(public.play_topics_clean(p_new)) n on n.key = o.key
       order by had desc, k
       limit 16
    ) m;
$$;

revoke execute on function public.play_history_note_since(uuid, date) from public, anon, authenticated;
revoke execute on function public.play_days_tidy() from public, anon, authenticated;
revoke execute on function public.play_topics_clean(jsonb) from public, anon, authenticated;
revoke execute on function public.play_topics_merge(jsonb, jsonb) from public, anon, authenticated;

-- 5) note_play_days (0025), the same function for a tab still running an
--    older app: kept 35 days now, and the first day noted is kept.
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
  v_first date;
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

  select count(distinct d), min(d) into v_kept, v_first
    from unnest(p_days) as d
   where d between current_date - 7 and current_date + 1;

  insert into public.play_days (profile_id, day)
  select distinct p_kid, d
    from unnest(p_days) as d
   where d between current_date - 7 and current_date + 1
  on conflict (profile_id, day) do nothing;

  perform public.play_history_note_since(p_kid, v_first);
  perform public.play_days_tidy();

  return v_kept;
end;
$$;

revoke execute on function public.note_play_days(uuid, date[]) from public, anon;
grant execute on function public.note_play_days(uuid, date[]) to authenticated;

-- 6) Note a kid's play, a day at a time (their device's own calendar days):
--    `p_days` is a JSON array of {day: "YYYY-MM-DD", xp, minutes, topics,
--    noted} (the app's PlayDayRecord, and `noted` below). Returns how many
--    days were inside the window (noted now or already there); a day outside
--    it, or an element that isn't
--    an object with such a day, is skipped — never an error, so a device's
--    old backlog clears itself. A value out of range is clamped, a field
--    that isn't a number counts as 0 (it can't lower a day), and the topics
--    are cleaned (play_topics_clean). A day sent with `"noted": true` (JSON
--    true, nothing else) is `noted_play` from then on (#181): all its play
--    was noted, zeros included. Without it the flag stays as it was — the
--    app sends a day an older app also played (its XP never noted) that way,
--    so it still reads "XP not recorded" — and nothing ever unsets it.
--    Refusals: 42501 "not signed in" / "not your player"; 22023 "too many
--    days" (over 31) / "days must be an array".
create or replace function public.note_play_history(p_kid uuid, p_days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_user uuid := auth.uid();
  v_el jsonb;
  v_day date;
  v_noted date[] := '{}';
  v_kept integer;
  v_first date;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_kid and p.parent_id = v_user) then
    raise exception 'not your player' using errcode = '42501';
  end if;
  if p_days is null then
    return 0;
  end if;
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'days must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_days) > 31 then
    raise exception 'too many days' using errcode = '22023';
  end if;

  -- One day at a time: a day sent twice in one call merges with itself
  -- like any other repeat.
  for v_el in select e from jsonb_array_elements(p_days) as e loop
    continue when jsonb_typeof(v_el) <> 'object';
    -- Only the 9 days of the window, by their exact text: anything else
    -- (another date, another format, not a date) is outside it.
    v_day := (select current_date + g from generate_series(-7, 1) as g
               where to_char(current_date + g, 'YYYY-MM-DD') = v_el ->> 'day');
    continue when v_day is null;

    insert into public.play_days as p (profile_id, day, xp, minutes, topics, noted_play)
    values (
      p_kid,
      v_day,
      case when jsonb_typeof(v_el -> 'xp') = 'number'
           then least(greatest(trunc((v_el ->> 'xp')::numeric), 0), 100000)::integer else 0 end,
      case when jsonb_typeof(v_el -> 'minutes') = 'number'
           then least(greatest(trunc((v_el ->> 'minutes')::numeric), 0), 1440)::integer else 0 end,
      public.play_topics_clean(v_el -> 'topics'),
      coalesce(v_el -> 'noted' = 'true'::jsonb, false)
    )
    on conflict (profile_id, day) do update
      set xp         = greatest(p.xp, excluded.xp),
          minutes    = greatest(p.minutes, excluded.minutes),
          topics     = public.play_topics_merge(p.topics, excluded.topics),
          noted_play = p.noted_play or excluded.noted_play;

    v_noted := v_noted || v_day;
  end loop;

  select count(distinct d), min(d) into v_kept, v_first from unnest(v_noted) as d;

  perform public.play_history_note_since(p_kid, v_first);
  perform public.play_days_tidy();

  return v_kept;
end;
$$;

revoke execute on function public.note_play_history(uuid, jsonb) from public, anon;
grant execute on function public.note_play_history(uuid, jsonb) to authenticated;

-- 7) Where each topic started (#174): the kid's play, like skill_levels.
alter table public.profiles
  add column if not exists skill_starts jsonb not null default '{}'::jsonb
    constraint profiles_skill_starts_object check (jsonb_typeof(skill_starts) = 'object');

-- 0024's list of the columns a kid's own play writes, with skill_starts.
create or replace function public.profiles_kid_play_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['xp', 'level', 'level_xp', 'skill_levels', 'skill_starts', 'power_ups',
               'current_streak', 'longest_streak', 'last_played_on', 'updated_at'];
$$;

-- A kid's age in whole years on `p_on`, from their birth year and month —
-- as the app works it out (`calcAge`, src/lib/age.ts; `age.test` checks
-- both against the cases progress_history.test.sql checks this one with):
-- the years since, less one before this year's birth month; never below 0.
-- Callable by anyone (plain arithmetic): the trigger below runs as the caller.
create or replace function public.kid_age_on(p_birth_year integer, p_birth_month integer, p_on date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0, extract(year from p_on)::integer - p_birth_year
                     - case when extract(month from p_on)::integer < p_birth_month then 1 else 0 end);
$$;

-- The day a topic start was noted (#183), from its `on`: a real
-- `YYYY-MM-DD` day from 2020 to a day after `p_today` (a device's calendar
-- can run ahead of the server's); anything else is null. No cast that can
-- fail: the day is built from its parts and must read back the same.
-- Callable by anyone (plain arithmetic): the trigger below runs as the caller.
create or replace function public.topic_start_day(p_day text, p_today date)
returns date
language sql
immutable
set search_path = ''
as $$
  select v.d
    from (select case when p_day ~ '^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
                      then make_date(substr(p_day, 1, 4)::integer, substr(p_day, 6, 2)::integer, 1)
                           + (substr(p_day, 9, 2)::integer - 1) end as d) v
   where to_char(v.d, 'YYYY-MM-DD') = p_day
     and v.d between date '2020-01-01' and p_today + 1;
$$;

-- Keep the first start and drop junk, on every write (whoever writes): an
-- entry that isn't {level: whole 1–10, age: whole 3–18} under a topic id
-- (1–24 lowercase letters) is dropped, and on an update the starts already
-- there win — a write never moves a start, and one that leaves a topic out
-- never removes it. At most 16 topics (those already there first). An `on`
-- that isn't a day topic_start_day takes is dropped alone; nothing else
-- but `level`, `age` and `on` is kept.
-- The age (#183): a start with `on` takes the kid's age that day by the
-- row's birth date (kid_age_on, within 3–18) — every start with one, on
-- every write, so one sent with a stale age (a device holding the old birth
-- date, a save's copy, a start played while the row was unread) lands
-- right, and a corrected birth date moves it exactly. A start without `on`
-- keeps its age, except that a birth date corrected — an update that
-- changes `birth_year` or `birth_month`, which only a grown-up with 👪 open
-- may make (0024's gate runs first) — moves one already there by the change
-- in the kid's age today (the server's date, UTC): the old birth date's age
-- less the new one's, within 3–18. A level never moves. Runs as the
-- caller, so it calls nothing an API role can't (kid_age_on and
-- topic_start_day, callable by anyone).
-- To correct a start by hand (the SQL editor, as the owner): disable this
-- trigger for that one update — a start with `on` takes its age from the
-- birth date again on the next write, so correct the birth date instead.
create or replace function public.profiles_keep_skill_starts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.skill_starts end;
  v_today date := (now() at time zone 'UTC')::date;
  v_shift integer := 0;
  v_kept jsonb;
begin
  if tg_op = 'UPDATE' and (new.birth_year, new.birth_month) is distinct from (old.birth_year, old.birth_month) then
    v_shift := public.kid_age_on(old.birth_year, old.birth_month, v_today)
             - public.kid_age_on(new.birth_year, new.birth_month, v_today);
  end if;
  with entries as (
    select src.had, e.key, e.value
      from (values (true, v_old), (false, new.skill_starts)) as src (had, starts)
     cross join lateral jsonb_each(
       case when jsonb_typeof(src.starts) = 'object' then src.starts else '{}'::jsonb end) as e
  ), valid as (
    select had, key, (value ->> 'level')::integer as level, (value ->> 'age')::integer as age,
           case when jsonb_typeof(value -> 'on') = 'string'
                then public.topic_start_day(value ->> 'on', v_today) end as on_day
      from entries
     where key ~ '^[a-z]{1,24}$'
       and case when jsonb_typeof(value) = 'object'
                 and jsonb_typeof(value -> 'level') = 'number' and (value ->> 'level') ~ '^\d{1,2}$'
                 and jsonb_typeof(value -> 'age') = 'number' and (value ->> 'age') ~ '^\d{1,2}$'
                then (value ->> 'level')::integer between 1 and 10
                 and (value ->> 'age')::integer between 3 and 18
                else false end
  ), clean as (
    select had, key,
           jsonb_strip_nulls(jsonb_build_object(
             'level', level,
             'age', case when on_day is not null
                         then least(18, greatest(3, public.kid_age_on(new.birth_year, new.birth_month, on_day)))
                         when had then least(18, greatest(3, age - v_shift))
                         else age end,
             'on', to_char(on_day, 'YYYY-MM-DD'))) as start
      from valid
  ), firsts as (
    select distinct on (key) had, key, start from clean order by key, had desc
  )
  select coalesce(jsonb_object_agg(f.key, f.start), '{}'::jsonb) into v_kept
    from (select key, start from firsts order by had desc, key limit 16) f;
  new.skill_starts := v_kept;
  return new;
end;
$$;

drop trigger if exists profiles_keep_skill_starts on public.profiles;
create trigger profiles_keep_skill_starts
  before insert or update of skill_starts, birth_year, birth_month on public.profiles
  for each row execute function public.profiles_keep_skill_starts();
