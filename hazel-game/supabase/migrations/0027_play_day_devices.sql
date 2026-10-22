-- Hazel Quest — two devices playing one kid on one day add up (#179)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0026.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- 0026 kept, for a day, the LARGER of what it had and what a device sent:
-- each device re-sends its whole day as it grows, so adding the sends up
-- would count a day again on every send. So a kid on a tablet in the morning
-- and a laptop in the afternoon showed the bigger device's day, not both.
-- Now each device's day is kept on its own — a part — and the day is the SUM
-- of its parts:
--   * play_day_parts (kid, day, device): what one device counted that day
--     (xp, minutes, topics, noted), merged as 0026 merges a day — the larger
--     total, per topic the tally with more answers, noted once noted — so a
--     device re-sending its growing day never counts it twice. `device` is a
--     random id the app makes once per browser (`hazel-device-id`: the tabs
--     of one browser share it, as they share their day records), 1–64
--     letters, digits or dashes; 'legacy' is the part of a write that names
--     no device. `updated_at` is when the part's play last changed (a
--     re-send that changes nothing leaves it).
--   * play_days (what 📈 reads, as before) holds the day's sum, worked out
--     again from its parts on every note: XP and minutes added (capped at
--     100,000 and 1,440, the table's limits); per topic `a` and `r` added
--     (a ≤ 10,000, r ≤ a) and `l` from the part that changed most recently
--     among those with one; `noted_play` if any part was noted with its play.
--     At most 16 topics, those already on the day first (as 0026 merges).
--   * note_device_play(kid, device, days): the app's writer from now on —
--     note_play_history's rules (the family's own sign-in and kid, the window
--     of 7 days back to 1 ahead, at most 31 a call, values clamped, topics
--     cleaned, `noted`), into that device's part.
--   * note_play_history(kid, days), same signature: a tab still on the last
--     app writes its days into the 'legacy' part, so it adds to the devices'
--     parts instead of replacing them. A day noted before it had any part
--     (by 0025 / 0026, or note_play_history before this) keeps what it holds
--     as its 'legacy' part the first time a part is written for it, so the
--     sum drops nothing already recorded. note_play_days (days only, 0026)
--     is as it was.
--   * Nobody reads or writes the parts through the API (RLS on, no policy,
--     no grant): only the note functions. The dashboard reads play_days.
--     Kept 35 days like the days, tidied by the same notes (play_days_tidy,
--     at most 1,000 of each a note, skip locked); removing a kid or closing
--     the account deletes them (cascade).
--   * Two notes of one day at once (two devices) take turns on the day's
--     row, so each sum sees the other's part.
--
-- Backward compatible both ways: an app from before this calls
-- note_play_history (kept, as above) or note_play_days; this app calls
-- note_device_play and, on a database without it, note_play_history as
-- before (a day it sent that way stays in the 'legacy' part).

-- 1) Each device's part of a kid's day.
create table if not exists public.play_day_parts (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  device     text not null
    constraint play_day_parts_device check (device ~ '^[A-Za-z0-9-]{1,64}$'),
  xp         integer not null default 0
    constraint play_day_parts_xp_range check (xp between 0 and 100000),
  minutes    integer not null default 0
    constraint play_day_parts_minutes_range check (minutes between 0 and 1440),
  topics     jsonb not null default '{}'::jsonb
    constraint play_day_parts_topics_object check (jsonb_typeof(topics) = 'object'),
  noted      boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, day, device)
);

-- The tidy-up finds old parts by date, across every kid.
create index if not exists play_day_parts_day_idx on public.play_day_parts (day);

-- No policy: no API role reads or writes a part (the note functions run as
-- the owner).
alter table public.play_day_parts enable row level security;
revoke all on public.play_day_parts from public, anon, authenticated;
grant select, insert, delete on public.play_day_parts to service_role;

-- 2) The tidy-up (0026's, the same 35 days): every kid's old days, and now
--    their old parts — at most 1,000 of each a note, the oldest first, rows
--    another note is deleting left to it.
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
  delete from public.play_day_parts
   where ctid = any (array(
     select o.ctid from public.play_day_parts o
      where o.day < current_date - 35
      order by o.day
      limit 1000
        for update skip locked));
$$;

-- 3) The note functions' shared steps. Internal: only the note functions
--    (security definer, run as the owner) call them.

-- The caller is signed in, and `p_kid` is one of their kids.
create or replace function public.play_days_check_kid(p_kid uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_kid and p.parent_id = auth.uid()) then
    raise exception 'not your player' using errcode = '42501';
  end if;
end;
$$;

-- One device's part of a kid's day, cleaned already: merged into the part
-- as 0026 merges a day, then the day worked out again from all its parts.
create or replace function public.play_day_add_part(
  p_kid uuid, p_day date, p_device text, p_xp integer, p_minutes integer, p_topics jsonb, p_noted boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_had jsonb;
  v_xp integer;
  v_minutes integer;
  v_noted boolean;
  v_topics jsonb;
begin
  -- The day's row first, locked: two notes of one day take turns, so each
  -- sum below sees the other's part.
  insert into public.play_days (profile_id, day) values (p_kid, p_day)
  on conflict (profile_id, day) do nothing;
  select d.topics into v_had from public.play_days d
   where d.profile_id = p_kid and d.day = p_day
     for update;

  -- A day noted before it had any part: what it holds is its 'legacy' part,
  -- so the sum drops nothing already recorded. (A day noted alone, zeros and
  -- not noted, has nothing to keep.) Changed before any device's part.
  insert into public.play_day_parts (profile_id, day, device, xp, minutes, topics, noted, updated_at)
  select d.profile_id, d.day, 'legacy', d.xp, d.minutes, public.play_topics_clean(d.topics), d.noted_play, now()
    from public.play_days d
   where d.profile_id = p_kid and d.day = p_day
     and (d.xp > 0 or d.minutes > 0 or d.topics <> '{}'::jsonb or d.noted_play)
     and not exists (select 1 from public.play_day_parts q where q.profile_id = p_kid and q.day = p_day)
  on conflict (profile_id, day, device) do nothing;

  -- This device's part: the larger of what it had and what's sent (a device
  -- re-sends its whole day as it grows).
  insert into public.play_day_parts as p (profile_id, day, device, xp, minutes, topics, noted, updated_at)
  values (p_kid, p_day, p_device, p_xp, p_minutes, p_topics, p_noted, clock_timestamp())
  on conflict (profile_id, day, device) do update
    set xp         = greatest(p.xp, excluded.xp),
        minutes    = greatest(p.minutes, excluded.minutes),
        topics     = public.play_topics_merge(p.topics, excluded.topics),
        noted      = p.noted or excluded.noted,
        updated_at = case when (greatest(p.xp, excluded.xp), greatest(p.minutes, excluded.minutes),
                                public.play_topics_merge(p.topics, excluded.topics), p.noted or excluded.noted)
                               is distinct from (p.xp, p.minutes, p.topics, p.noted)
                          then excluded.updated_at
                          else p.updated_at end;

  -- The day: the sum of its parts.
  select least(sum(q.xp), 100000)::integer, least(sum(q.minutes), 1440)::integer, bool_or(q.noted)
    into v_xp, v_minutes, v_noted
    from public.play_day_parts q
   where q.profile_id = p_kid and q.day = p_day;

  -- Per topic: answers added, capped at 10,000 — right too, which stays ≤
  -- asked since each part's does (cleaned); the level from the part whose
  -- play changed last among those with one (a tie: a device's over the
  -- legacy part).
  select coalesce(jsonb_object_agg(t.key, jsonb_strip_nulls(jsonb_build_object('a', t.a, 'r', t.r, 'l', t.l))), '{}'::jsonb)
    into v_topics
    from (
      select e.key,
             least(sum((e.value ->> 'a')::integer), 10000)::integer as a,
             least(sum((e.value ->> 'r')::integer), 10000)::integer as r,
             (array_agg((e.value ->> 'l')::integer order by q.updated_at desc, q.device = 'legacy', q.device)
                filter (where e.value ? 'l'))[1] as l
        from public.play_day_parts q
       cross join lateral jsonb_each(q.topics) e
       where q.profile_id = p_kid and q.day = p_day
       group by e.key
       order by coalesce(v_had ? e.key, false) desc, e.key
       limit 16
    ) t;

  update public.play_days d
     set xp = v_xp, minutes = v_minutes, topics = v_topics, noted_play = v_noted
   where d.profile_id = p_kid and d.day = p_day;
end;
$$;

-- Note a kid's play into one part (`p_device`), a day at a time — the rules
-- of 0026's note_play_history: `p_days` is a JSON array of {day:
-- "YYYY-MM-DD", xp, minutes, topics, noted}; returns how many days were
-- inside the window (7 back to 1 ahead of the server's date, by their exact
-- text); a day outside it, or an element that isn't an object with such a
-- day, is skipped — never an error. A value out of range is clamped, a field
-- that isn't a number counts as 0, the topics are cleaned
-- (play_topics_clean), and a day sent with `"noted": true` (JSON true,
-- nothing else) makes its part noted. Refusals: 22023 "too many days" (over
-- 31) / "days must be an array". The days go in date order (a day sent twice
-- in one call in the order sent), so two notes of the same days lock them in
-- the same order. The kid's first day noted is kept, and every kid's old
-- days and parts tidied.
create or replace function public.play_days_note(p_kid uuid, p_device text, p_days jsonb)
returns integer
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_el jsonb;
  v_day date;
  v_noted date[] := '{}';
  v_kept integer;
  v_first date;
begin
  if p_days is null then
    return 0;
  end if;
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'days must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_days) > 31 then
    raise exception 'too many days' using errcode = '22023';
  end if;

  for v_el in select a.e from jsonb_array_elements(p_days) with ordinality as a (e, n)
               order by a.e ->> 'day', a.n loop
    continue when jsonb_typeof(v_el) <> 'object';
    v_day := (select current_date + g from generate_series(-7, 1) as g
               where to_char(current_date + g, 'YYYY-MM-DD') = v_el ->> 'day');
    continue when v_day is null;

    perform public.play_day_add_part(
      p_kid,
      v_day,
      p_device,
      case when jsonb_typeof(v_el -> 'xp') = 'number'
           then least(greatest(trunc((v_el ->> 'xp')::numeric), 0), 100000)::integer else 0 end,
      case when jsonb_typeof(v_el -> 'minutes') = 'number'
           then least(greatest(trunc((v_el ->> 'minutes')::numeric), 0), 1440)::integer else 0 end,
      public.play_topics_clean(v_el -> 'topics'),
      coalesce(v_el -> 'noted' = 'true'::jsonb, false));

    v_noted := v_noted || v_day;
  end loop;

  select count(distinct d), min(d) into v_kept, v_first from unnest(v_noted) as d;

  perform public.play_history_note_since(p_kid, v_first);
  perform public.play_days_tidy();

  return v_kept;
end;
$$;

revoke execute on function public.play_days_check_kid(uuid) from public, anon, authenticated;
revoke execute on function public.play_day_add_part(uuid, date, text, integer, integer, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.play_days_note(uuid, text, jsonb) from public, anon, authenticated;

-- 4) The app's writer: one device's days. Refusals: 42501 "not signed in" /
--    "not your player"; 22023 "bad device" (not 1–64 letters, digits or
--    dashes, or the reserved 'legacy'), and play_days_note's.
create or replace function public.note_device_play(p_kid uuid, p_device text, p_days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
begin
  perform public.play_days_check_kid(p_kid);
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{1,64}$' or lower(p_device) = 'legacy' then
    raise exception 'bad device' using errcode = '22023';
  end if;
  return public.play_days_note(p_kid, p_device, p_days);
end;
$$;

revoke execute on function public.note_device_play(uuid, text, jsonb) from public, anon;
grant execute on function public.note_device_play(uuid, text, jsonb) to authenticated;

-- 5) 0026's writer, same signature, for a tab still on the last app: its
--    days go into the 'legacy' part, so they add to the devices' parts.
create or replace function public.note_play_history(p_kid uuid, p_days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
begin
  perform public.play_days_check_kid(p_kid);
  return public.play_days_note(p_kid, 'legacy', p_days);
end;
$$;

revoke execute on function public.note_play_history(uuid, jsonb) from public, anon;
grant execute on function public.note_play_history(uuid, jsonb) to authenticated;
