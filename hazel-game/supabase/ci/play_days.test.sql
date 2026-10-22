-- CI test for migration 0025 (#29, the parent dashboard): the days each kid
-- played are their family's to read and nobody else's; only note_play_days
-- writes them — the family's own sign-in, for its own kid, adding days from
-- the last week only — and nothing can be changed or deleted through the API.
-- Kept for every kid (review round 1): any note deletes every family's older
-- days, and nobody can read one meanwhile — a bounded batch per note, the
-- oldest first (review round 2). Five weeks (35 days) since migration 0026
-- (#169: 4 weeks of XP on the page); it was two. 0026's own rules (the day's
-- play, the first day noted, skill starts): progress_history.test.sql.
-- Any failed assertion raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;
-- The test's dates are the server's (UTC), as note_play_days' are.
set local timezone = 'UTC';

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b9', '{"consent_version": "2026-10-draft"}');

-- Two families, a kid each, plus a second kid for A (added by the table's
-- owner: adding players is a grown-up action, tested in grown_ups_gate).
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a09', '00000000-0000-0000-0000-0000000000a9', 'Sam', 'fox', 2017, 3),
  ('00000000-0000-0000-0000-000000005a10', '00000000-0000-0000-0000-0000000000a9', 'Kit', 'frog', 2018, 5),
  ('00000000-0000-0000-0000-000000005b09', '00000000-0000-0000-0000-0000000000b9', 'Bea', 'bee', 2016, 7);

-- Bea already played yesterday — and 40 days ago, and she never notes a day
-- again here; Sam has a day from long ago; Kit's oldest day is 36 days back
-- and his next-oldest exactly 35 (the last day kept). Any note tidies away
-- every kid's day older than five weeks, whoever's family notes it.
insert into public.play_days (profile_id, day) values
  ('00000000-0000-0000-0000-000000005b09', current_date - 1),
  ('00000000-0000-0000-0000-000000005b09', current_date - 40),
  ('00000000-0000-0000-0000-000000005a09', current_date - 50),
  ('00000000-0000-0000-0000-000000005a10', current_date - 36),
  ('00000000-0000-0000-0000-000000005a10', current_date - 35);

-- Before any note: an old day is there, but nobody reads one older than five
-- weeks (the read policy stops there), not even its own family.
do $$
begin
  assert (select count(*) from public.play_days) = 5, 'the owner sees all five rows';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$
begin
  assert (select count(*) from public.play_days) = 1, 'B reads Bea''s yesterday, never her day 40 days ago';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);
do $$
begin
  assert (select array_agg(day order by day) from public.play_days) = array[current_date - 35],
    'A reads Kit''s day 35 days back (still kept), not his 36 or Sam''s 50';
end $$;
reset role;

-- From here on, act as grown-up A through the API role. No 👪 window is open:
-- noting and reading a kid's days are play, not grown-up actions.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a09';
  kit constant uuid := '00000000-0000-0000-0000-000000005a10';
  bea constant uuid := '00000000-0000-0000-0000-000000005b09';
  kept integer;
  refused text;
begin
  -- Today, yesterday and today again are kept once each; a day a month ago
  -- and one a week in the future are skipped (no error: an old backlog clears).
  kept := public.note_play_days(sam, array[current_date, current_date - 1, current_date,
                                           current_date - 30, current_date + 5]);
  assert kept = 2, format('two days in the window (got %s)', kept);
  assert (select count(*) from public.play_days where profile_id = sam) = 2,
    'today and yesterday noted, nothing else';
  assert exists (select 1 from public.play_days where profile_id = sam and day = current_date), 'today is there';
  assert not exists (select 1 from public.play_days where profile_id = sam and day = current_date - 50),
    'a day older than five weeks is deleted by the next note';

  -- Noting again changes nothing; the window's edges are kept.
  assert public.note_play_days(sam, array[current_date]) = 1, 'today again: still one day kept';
  assert (select count(*) from public.play_days where profile_id = sam) = 2, 'no duplicate day';
  assert public.note_play_days(kit, array[current_date - 7, current_date + 1, current_date - 8, current_date + 2]) = 2,
    'a week back and a day ahead (a time zone ahead of the server) are the edges';
  assert public.note_play_days(kit, null) = 0 and public.note_play_days(kit, '{}') = 0, 'nothing to note';

  -- A sees their own kids' days, never another family's (Kit's day 35 days
  -- back is still kept).
  assert (select count(*) from public.play_days) = 5, format('A sees their five rows (got %s)',
    (select count(*) from public.play_days));
  assert not exists (select 1 from public.play_days where profile_id = bea), 'B''s kid''s days are hidden';

  -- …and can't note a day for B's kid.
  begin
    perform public.note_play_days(bea, array[current_date]);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not your player', format('another family''s kid is refused (%s)', refused);

  -- Nobody writes the table directly through the API: no insert, update or delete.
  refused := null;
  begin
    insert into public.play_days (profile_id, day) values (sam, current_date - 3);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'no direct insert';
  refused := null;
  begin
    update public.play_days set day = current_date - 3 where profile_id = sam;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'no update';
  refused := null;
  begin
    delete from public.play_days where profile_id = sam;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'no delete';

  -- At most 31 days in one call.
  refused := null;
  begin
    perform public.note_play_days(sam, array(select current_date from generate_series(1, 32)));
  exception when invalid_parameter_value then refused := sqlerrm;
  end;
  assert refused = 'too many days', 'a huge batch is refused';
end $$;

-- Grown-up B sees Bea's day only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$
begin
  assert (select count(*) from public.play_days) = 1, 'B sees only Bea''s day';
end $$;

-- A's notes tidied every family's old days away: Bea's 40-day-old one (her
-- family never noted again) and Kit's 36-day-old one — not his 35th.
reset role;
do $$
begin
  assert not exists (select 1 from public.play_days where day < current_date - 35),
    'no kid keeps a day older than five weeks once anyone notes a day';
  assert not exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005b09' and day = current_date - 40),
    'another family''s kid who stopped playing loses their old day too';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a10' and day = current_date - 35),
    'a day exactly 35 days back is kept';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005b09' and day = current_date - 1),
    'Bea''s recent day stays';
end $$;

-- A big backlog (review round 2): a note deletes at most 1,000 old days, the
-- oldest first, so no call ever pays for a whole day's crossing (one unbounded
-- delete outlasted the API's timeout at scale, rolling the note back with it).
-- 2,500 of Kit's days older than five weeks: three notes clear them, the
-- 35th day back stays, and the note itself is kept each time.
reset role;
insert into public.play_days (profile_id, day)
select '00000000-0000-0000-0000-000000005a10', current_date - 36 - g from generate_series(0, 2499) g;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);
do $$ begin perform public.note_play_days('00000000-0000-0000-0000-000000005a09', array[current_date - 2]); end $$;
reset role;
do $$
begin
  assert (select count(*) from public.play_days where day < current_date - 35) = 1500,
    format('one note deletes 1,000 old days, no more (left %s)', (select count(*) from public.play_days where day < current_date - 35));
  assert (select min(day) from public.play_days) = current_date - 36 - 1499, 'the oldest go first';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a09' and day = current_date - 2),
    'the note is kept';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);
do $$ begin perform public.note_play_days('00000000-0000-0000-0000-000000005a09', array[current_date - 3]); end $$;
do $$ begin perform public.note_play_days('00000000-0000-0000-0000-000000005a09', array[current_date - 4]); end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.play_days where day < current_date - 35), 'three notes clear the backlog';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a10' and day = current_date - 35),
    'the 35th day back is still kept';
  assert (select count(*) from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a09' and day in (current_date - 3, current_date - 4)) = 2,
    'every note is kept';
end $$;

-- The server's calendar, whatever time zone the caller asks for (PostgREST
-- passes `Prefer: timezone=` on): with the session's date a day off UTC's,
-- the week's edges are still UTC's. One of the two zones is a day off at any
-- hour (UTC+14 from 10:00, UTC−12 before 12:00).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$
declare
  utc date := (now() at time zone 'UTC')::date;
  bea constant uuid := '00000000-0000-0000-0000-000000005b09';
  was constant text := current_setting('timezone');
begin
  perform set_config('timezone',
    case when (now() at time zone 'Etc/GMT-14')::date <> utc then 'Etc/GMT-14' else 'Etc/GMT+12' end, true);
  assert current_date <> utc, 'the session''s date is a day off UTC''s';
  perform public.note_play_days(bea, array[utc - 8, utc - 7, utc + 1, utc + 2]);
  assert (select array_agg(day order by day) from public.play_days
           where profile_id = bea and day in (utc - 8, utc - 7, utc + 1, utc + 2)) = array[utc - 7, utc + 1],
    'a week back and a day ahead of UTC''s date are kept, never the session''s edges';
  perform set_config('timezone', was, true);
end $$;

-- Signed out: nothing to see, nothing to note.
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  refused text;
begin
  assert (select count(*) from public.play_days) = 0, 'no sign-in, no rows';
  begin
    perform public.note_play_days('00000000-0000-0000-0000-000000005a09', array[current_date]);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not signed in', 'no sign-in, no note';
end $$;
reset role;

do $$
begin
  assert not has_function_privilege('anon', 'public.note_play_days(uuid, date[])', 'execute'),
    'only a signed-in family notes days';
  assert has_function_privilege('authenticated', 'public.note_play_days(uuid, date[])', 'execute'),
    'the app may note days';
  assert not has_table_privilege('anon', 'public.play_days', 'select'), 'anon reads nothing';
  assert (select prosecdef from pg_proc where oid = 'public.note_play_days(uuid, date[])'::regprocedure),
    'it writes as the table''s owner';
  assert (select proconfig from pg_proc where oid = 'public.note_play_days(uuid, date[])'::regprocedure)
           = array['search_path=""', 'TimeZone=UTC'], 'with an empty search path, in UTC';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'play_days' and indexdef like '%(day)'),
    'old days are found by date';

  -- Removing a kid (and closing the account, which removes every kid) takes
  -- their days with them.
  delete from public.profiles where id = '00000000-0000-0000-0000-000000005a09';
  assert not exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a09'),
    'a removed kid''s days go too';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a10'),
    'their brother''s stay';
end $$;

rollback;
