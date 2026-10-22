-- CI test for migration 0026 (#169, #170, #172, #173, #174, #181, #183):
-- each day a kid played keeps what was played on it — XP, active minutes,
-- answers per topic — noted only through note_play_history (the family's own
-- sign-in, its own kid, the last week), the larger total kept for a day,
-- values clamped and junk dropped, and a day sent with `noted: true` marked as
-- noted with its play (`noted_play` — never unmarked, never by
-- note_play_days); five weeks kept and readable (an
-- old tab's note_play_days included); the first day noted kept per kid
-- (play_history_since) for as long as the kid exists; and
-- `profiles.skill_starts`, the kid's play, keeps the first start for a topic
-- and drops junk, a start's age the kid's on the day it was noted (`on`, by
-- the row's birth date, corrected with it) — or, without `on`, as sent and
-- moved only by a grown-up's corrected birth date (kid_age_on, the app's
-- calcAge). 0025's own rules:
-- play_days.test.sql. Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.
--
-- Who's who: grown-up A (…aa) has Sam (…5a1a), Kit (…5a1b) and Ivy (…5a1c);
-- grown-up B (…ba) has Bea (…5b1a). A acts on the family device's sign-in
-- (…0d1a) with no 👪 window open: noting play and writing starts are the
-- kid's play. Rows seeded by hand keep the functions' own invariant (a kid's
-- first day noted is never after a day they have), so re-applying 0026 in
-- section 10 must change nothing.
begin;
-- The test's dates are the server's (UTC), as the note functions' are.
set local timezone = 'UTC';

-- A day `n` days from today, as the app sends it (`YYYY-MM-DD`).
create function pg_temp.d(n integer) returns text language sql stable
  as $$ select to_char(current_date + n, 'YYYY-MM-DD') $$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000aa', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000ba', '{"consent_version": "2026-10-draft"}');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-000000000d1a', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000d1b', '00000000-0000-0000-0000-0000000000ba');
-- Added by the table's owner (adding players is a grown-up action, tested in grown_ups_gate).
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a1a', '00000000-0000-0000-0000-0000000000aa', 'Sam', 'fox', 2017, 3),
  ('00000000-0000-0000-0000-000000005a1b', '00000000-0000-0000-0000-0000000000aa', 'Kit', 'frog', 2018, 5),
  ('00000000-0000-0000-0000-000000005a1c', '00000000-0000-0000-0000-0000000000aa', 'Ivy', 'owl', 2019, 1),
  ('00000000-0000-0000-0000-000000005b1a', '00000000-0000-0000-0000-0000000000ba', 'Bea', 'bee', 2016, 7);

-- 1) Applied over days noted before it: those rows read as nothing recorded
--    (zeros, no topics), and each kid's first day noted is backfilled from
--    the days kept — a re-run keeps the earlier one. (0026 is re-applied
--    here, in this transaction, as the bundle replays it on every run — and
--    0027 after it, as the bundle does, so the note functions below are the
--    ones a project runs: note_play_history writes a day's 'legacy' part, and
--    for one writer the day is that part — 0026's rules, #179.)
insert into public.play_days (profile_id, day) values
  ('00000000-0000-0000-0000-000000005a1a', current_date - 3),
  ('00000000-0000-0000-0000-000000005a1a', current_date - 20),
  ('00000000-0000-0000-0000-000000005a1a', current_date - 35),
  ('00000000-0000-0000-0000-000000005a1a', current_date - 36),
  ('00000000-0000-0000-0000-000000005b1a', current_date - 2);
insert into public.play_history_since (profile_id, since) values
  ('00000000-0000-0000-0000-000000005b1a', current_date - 20);
\ir ../migrations/0026_progress_history.sql
\ir ../migrations/0027_play_day_devices.sql
do $$
begin
  assert (select bool_and(xp = 0 and minutes = 0 and topics = '{}'::jsonb and not noted_play) from public.play_days),
    'a day noted before 0026 has zeros and no topics, and isn''t noted with its play (#181)';
  assert (select since from public.play_history_since where profile_id = '00000000-0000-0000-0000-000000005a1a') = current_date - 36,
    'Sam''s first day noted is his earliest day kept';
  assert (select since from public.play_history_since where profile_id = '00000000-0000-0000-0000-000000005b1a') = current_date - 20,
    'a re-run keeps an earlier first day (Bea''s)';
  assert not exists (select 1 from public.play_history_since
                      where profile_id in ('00000000-0000-0000-0000-000000005a1b', '00000000-0000-0000-0000-000000005a1c')),
    'Kit and Ivy have played no day yet: nothing to count from';
  assert (select skill_starts from public.profiles where id = '00000000-0000-0000-0000-000000005a1a') = '{}'::jsonb,
    'a kid starts with no starts noted';
end $$;

-- 2) The table holds only what the function would write (belt and braces).
do $$
declare
  stmts constant text[] := array[
    $s$insert into public.play_days (profile_id, day, xp) values ('00000000-0000-0000-0000-000000005a1b', current_date - 4, 100001)$s$,
    $s$insert into public.play_days (profile_id, day, xp) values ('00000000-0000-0000-0000-000000005a1b', current_date - 4, -1)$s$,
    $s$insert into public.play_days (profile_id, day, minutes) values ('00000000-0000-0000-0000-000000005a1b', current_date - 4, 1441)$s$,
    $s$insert into public.play_days (profile_id, day, minutes) values ('00000000-0000-0000-0000-000000005a1b', current_date - 4, -1)$s$,
    $s$insert into public.play_days (profile_id, day, topics) values ('00000000-0000-0000-0000-000000005a1b', current_date - 4, '[]')$s$,
    $s$insert into public.play_days (profile_id, day, topics) values ('00000000-0000-0000-0000-000000005a1b', current_date - 4, null)$s$
  ];
  s text;
  got text;
begin
  foreach s in array stmts loop
    got := null;
    begin
      execute s;
    exception when check_violation or not_null_violation then got := sqlstate;
    end;
    assert got in ('23514', '23502'), format('refused: %s', s);
  end loop;
  insert into public.play_days (profile_id, day, xp, minutes) values
    ('00000000-0000-0000-0000-000000005a1b', current_date - 4, 100000, 1440);
  delete from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a1b';
end $$;

-- 3) Read for five weeks: a day 35 back is read, 36 back never is.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000aa", "session_id": "00000000-0000-0000-0000-000000000d1a"}', true);
do $$
begin
  assert not public.grown_ups_unlocked(), 'no 👪 window on A''s sign-in';
  assert (select array_agg(day order by day) from public.play_days where day < current_date - 30) = array[current_date - 35],
    'A reads Sam''s day 35 back, not 36';
end $$;

-- 4) Noting a day's play (A, no window).
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a1a';
  kit constant uuid := '00000000-0000-0000-0000-000000005a1b';
  bea constant uuid := '00000000-0000-0000-0000-000000005b1a';
  kept integer;
  refused text;
  stmt text;
  t jsonb;
begin
  -- Inside the window (7 back to 1 ahead) noted; outside, or malformed,
  -- skipped and not counted — never an error.
  kept := public.note_play_history(kit, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(0), 'xp', 40, 'minutes', 12,
                       'topics', '{"math": {"a": 10, "r": 7, "l": 4}}'::jsonb),
    jsonb_build_object('day', pg_temp.d(-7), 'xp', 1),
    jsonb_build_object('day', pg_temp.d(1), 'minutes', 2),
    jsonb_build_object('day', pg_temp.d(-8), 'xp', 5),
    jsonb_build_object('day', pg_temp.d(2), 'xp', 5),
    jsonb_build_object('day', 'today', 'xp', 5),
    jsonb_build_object('day', replace(pg_temp.d(0), '-', '/'), 'xp', 5),
    jsonb_build_object('day', pg_temp.d(0) || 'T00:00:00Z', 'xp', 5),
    '{"day": "2026-02-30", "xp": 5}'::jsonb,
    jsonb_build_object('xp', 5),
    to_jsonb(pg_temp.d(-1)), to_jsonb(42), 'null'::jsonb, jsonb_build_array(pg_temp.d(-2))
  ));
  assert kept = 3, format('three days in the window (got %s)', kept);
  assert (select array_agg(day order by day) from public.play_days where profile_id = kit and day >= current_date - 8)
           = array[current_date - 7, current_date, current_date + 1],
    'a week back, today and a day ahead noted; nothing else';
  assert (select xp = 40 and minutes = 12 and topics = '{"math": {"a": 10, "r": 7, "l": 4}}'::jsonb
            from public.play_days where profile_id = kit and day = current_date), 'today''s play as sent';
  assert (select xp = 0 and minutes = 2 and topics = '{}'::jsonb
            from public.play_days where profile_id = kit and day = current_date + 1), 'a field left out is 0';

  -- The device re-sends a day as it grows: the larger total is kept, so a
  -- late or repeated send never lowers it.
  assert public.note_play_history(kit, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(0), 'xp', 30, 'minutes', 20))) = 1, 'today again: one day';
  assert (select xp = 40 and minutes = 20 from public.play_days where profile_id = kit and day = current_date),
    'the larger XP (40, not 30) and the larger minutes (20, not 12)';
  perform public.note_play_history(kit, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(0), 'xp', 45, 'minutes', 5)));
  assert (select xp = 45 and minutes = 20 from public.play_days where profile_id = kit and day = current_date),
    'each total on its own: more XP and fewer minutes keep 45 and 20';
  assert (select topics = '{"math": {"a": 10, "r": 7, "l": 4}}'::jsonb
            from public.play_days where profile_id = kit and day = current_date), 'topics left out keep theirs';

  -- Per topic, the tally with more answers; a tie takes the new one (its
  -- level is the later); a topic not sent keeps its tally.
  perform public.note_play_history(kit, jsonb_build_array(jsonb_build_object('day', pg_temp.d(0),
    'topics', '{"math": {"a": 8, "r": 8, "l": 5}, "words": {"a": 2, "r": 1, "l": 3}}'::jsonb)));
  t := (select topics from public.play_days where profile_id = kit and day = current_date);
  assert t = '{"math": {"a": 10, "r": 7, "l": 4}, "words": {"a": 2, "r": 1, "l": 3}}'::jsonb,
    format('fewer answers never replace more; a new topic joins (%s)', t);
  perform public.note_play_history(kit, jsonb_build_array(jsonb_build_object('day', pg_temp.d(0),
    'topics', '{"math": {"a": 10, "r": 9, "l": 5}}'::jsonb)));
  t := (select topics from public.play_days where profile_id = kit and day = current_date);
  assert t -> 'math' = '{"a": 10, "r": 9, "l": 5}'::jsonb, format('a tie takes the new tally (%s)', t);
  perform public.note_play_history(kit, jsonb_build_array(jsonb_build_object('day', pg_temp.d(0),
    'topics', '{"math": {"a": 12, "r": 11, "l": 6}}'::jsonb)));
  t := (select topics from public.play_days where profile_id = kit and day = current_date);
  assert t = '{"math": {"a": 12, "r": 11, "l": 6}, "words": {"a": 2, "r": 1, "l": 3}}'::jsonb,
    format('more answers replace the tally (%s)', t);

  -- A day sent twice in one call counts once and keeps the larger.
  assert public.note_play_history(kit, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(-1), 'xp', 9, 'topics', '{"math": {"a": 3, "r": 1}}'::jsonb),
    jsonb_build_object('day', pg_temp.d(-1), 'xp', 5, 'topics', '{"math": {"a": 2, "r": 2}}'::jsonb))) = 1,
    'a day twice in one call is one day';
  assert (select xp = 9 and topics = '{"math": {"a": 3, "r": 1}}'::jsonb
            from public.play_days where profile_id = kit and day = current_date - 1), 'and keeps the larger';

  -- Values are clamped; a field that isn't a number counts as 0.
  perform public.note_play_history(kit, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(-2), 'xp', 999999, 'minutes', 5000),
    jsonb_build_object('day', pg_temp.d(-3), 'xp', -5, 'minutes', 12.9),
    jsonb_build_object('day', pg_temp.d(-4), 'xp', 'lots', 'minutes', '{"m": 1}'::jsonb, 'topics', '[1, 2]'::jsonb)));
  assert (select array_agg(array[xp, minutes] order by day desc) from public.play_days
           where profile_id = kit and day between current_date - 4 and current_date - 2)
           = array[array[100000, 1440], array[0, 12], array[0, 0]],
    format('clamped: %s', (select array_agg(array[xp, minutes] order by day desc) from public.play_days
           where profile_id = kit and day between current_date - 4 and current_date - 2));
  assert (select topics from public.play_days where profile_id = kit and day = current_date - 4) = '{}'::jsonb,
    'topics that aren''t an object are none';

  -- Topics: ids of 1–24 lowercase letters; a 0–10000, r 0–a (fractions
  -- round down); l a whole 1–10 or dropped; a tally without numbers dropped.
  perform public.note_play_history(kit, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-5), 'topics', '{
      "math":      {"a": 6, "r": 4, "l": 10},
      "science":   {"a": 20000, "r": 30000, "l": 11},
      "history":   {"a": 5, "r": 9, "l": 0},
      "music":     {"a": -3, "r": -1, "l": 1},
      "geography": {"a": 4.7, "r": 2.2, "l": 2.5},
      "words":     {"a": 3, "r": 1, "l": "4", "extra": true},
      "nature":    {"a": "5", "r": 1},
      "creativity": {"a": 5},
      "space":     [1, 2],
      "engineering": 7,
      "Math":      {"a": 1, "r": 1},
      "ma th":     {"a": 1, "r": 1},
      "abcdefghijklmnopqrstuvwxy": {"a": 1, "r": 1}
    }'::jsonb)));
  t := (select topics from public.play_days where profile_id = kit and day = current_date - 5);
  assert t = '{"math": {"a": 6, "r": 4, "l": 10}, "science": {"a": 10000, "r": 10000},
               "history": {"a": 5, "r": 5}, "music": {"a": 0, "r": 0, "l": 1},
               "geography": {"a": 4, "r": 2}, "words": {"a": 3, "r": 1}}'::jsonb,
    format('topics cleaned (%s)', t);

  -- At most 16 topics a day: the first 16 by id; once there are 16, a new
  -- one isn't added (those already there stay).
  perform public.note_play_history(kit, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-6),
    'topics', (select jsonb_object_agg('t' || chr(96 + g), jsonb_build_object('a', 1, 'r', 1)) from generate_series(1, 20) g))));
  t := (select topics from public.play_days where profile_id = kit and day = current_date - 6);
  assert (select array_agg(k order by k) from jsonb_object_keys(t) k)
           = (select array_agg('t' || chr(96 + g) order by g) from generate_series(1, 16) g),
    format('the first 16 topics by id (%s)', t);
  perform public.note_play_history(kit, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-6),
    'topics', '{"aa": {"a": 1, "r": 1}, "ta": {"a": 3, "r": 2}}'::jsonb)));
  t := (select topics from public.play_days where profile_id = kit and day = current_date - 6);
  assert not t ? 'aa' and t -> 'ta' = '{"a": 3, "r": 2}'::jsonb and (select count(*) from jsonb_object_keys(t)) = 16,
    format('a 17th topic isn''t added; one already there still grows (%s)', t);

  -- Nothing to note.
  assert public.note_play_history(kit, null) = 0 and public.note_play_history(kit, '[]') = 0, 'nothing to note';

  -- Refusals: another family's kid, not a list, too many days.
  begin
    perform public.note_play_history(bea, jsonb_build_array(jsonb_build_object('day', pg_temp.d(0))));
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not your player', format('another family''s kid is refused (%s)', refused);
  foreach t in array array['{}'::jsonb, '"2026-10-21"'::jsonb, 'null'::jsonb, '3'::jsonb] loop
    refused := null;
    begin
      perform public.note_play_history(kit, t);
    exception when invalid_parameter_value then refused := sqlerrm;
    end;
    assert refused = 'days must be an array', format('%s is refused (%s)', t, refused);
  end loop;
  refused := null;
  begin
    perform public.note_play_history(kit,
      (select jsonb_agg(jsonb_build_object('day', pg_temp.d(0))) from generate_series(1, 32)));
  exception when invalid_parameter_value then refused := sqlerrm;
  end;
  assert refused = 'too many days', 'a huge batch is refused';
  assert public.note_play_history(kit,
      (select jsonb_agg(jsonb_build_object('day', pg_temp.d(0))) from generate_series(1, 31))) = 1, '31 is fine';

  -- Nobody writes either table directly through the API.
  foreach stmt in array array[
    $s$insert into public.play_days (profile_id, day, xp) values ('00000000-0000-0000-0000-000000005a1a', current_date - 5, 9)$s$,
    $s$update public.play_days set xp = 99999 where profile_id = '00000000-0000-0000-0000-000000005a1b'$s$,
    $s$delete from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a1b'$s$,
    $s$insert into public.play_history_since (profile_id, since) values ('00000000-0000-0000-0000-000000005a1b', current_date - 30)$s$,
    $s$update public.play_history_since set since = current_date - 30$s$,
    $s$delete from public.play_history_since$s$
  ] loop
    refused := null;
    begin
      execute stmt;
    exception when insufficient_privilege then refused := sqlerrm;
    end;
    assert refused like 'permission denied%', format('no direct write: %s', stmt);
  end loop;
end $$;

-- 4b) A day noted with its play says so (#181): note_play_history marks a
--     day sent with `"noted": true` (JSON true, nothing else), zeros and
--     all; a day sent without it — the app's for a day an older app also
--     played, whose XP was never noted — leaves the flag as it was; nothing
--     unmarks a day, and note_play_days never marks one. So a day really
--     played for 0 XP, under a minute and no bank answer can be told from a
--     day noted without its play.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a1a';
  kit constant uuid := '00000000-0000-0000-0000-000000005a1b';
begin
  assert not (select bool_or(noted_play) from public.play_days where profile_id = kit),
    'Kit''s days were sent without "noted": their play is kept, the flag isn''t set';
  -- A 30-second typing day: nothing to count but the day.
  perform public.note_play_history(sam, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-2), 'xp', 0, 'minutes', 0, 'noted', true)));
  assert (select noted_play and xp = 0 and minutes = 0 and topics = '{}'::jsonb
            from public.play_days where profile_id = sam and day = current_date - 2), 'a real 0 XP day is noted with its play';
  -- An old tab's day alone, then this app's note of the same day, then the old tab's again.
  perform public.note_play_days(sam, array[current_date - 1]);
  assert not (select noted_play from public.play_days where profile_id = sam and day = current_date - 1),
    'note_play_days notes the day without its play';
  perform public.note_play_history(sam, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-1), 'noted', true)));
  assert (select noted_play from public.play_days where profile_id = sam and day = current_date - 1),
    'note_play_history on a day noted alone marks it (an update)';
  perform public.note_play_days(sam, array[current_date - 1, current_date - 2]);
  assert (select bool_and(noted_play) from public.play_days where profile_id = sam and day in (current_date - 1, current_date - 2)),
    'note_play_days never unmarks a day';
  -- A day an older app played too (its XP lost): sent without "noted", on a
  -- day noted alone and on a new day — its play kept, the flag left unset.
  perform public.note_play_history(sam, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(-3), 'xp', 15, 'minutes', 4),
    jsonb_build_object('day', pg_temp.d(-4), 'xp', 0)));
  assert (select not noted_play and xp = 15 and minutes = 4 from public.play_days where profile_id = sam and day = current_date - 3),
    'a day from before 0026 sent without "noted": its play kept, still not noted';
  assert not (select noted_play from public.play_days where profile_id = sam and day = current_date - 4),
    'a new day sent without "noted" isn''t noted';
  -- Only JSON true marks a day.
  perform public.note_play_history(sam, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(-3), 'noted', 'true'),
    jsonb_build_object('day', pg_temp.d(-4), 'noted', 1),
    jsonb_build_object('day', pg_temp.d(-5), 'noted', false)));
  assert not (select bool_or(noted_play) from public.play_days where profile_id = sam and day between current_date - 5 and current_date - 3),
    '"true", 1 and false don''t mark a day';
  -- A day noted before, sent again without "noted": it stays noted, the larger play kept.
  perform public.note_play_history(sam, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-2), 'xp', 30)));
  assert (select noted_play and xp = 30 from public.play_days where profile_id = sam and day = current_date - 2),
    'a day sent without "noted" never unmarks one';
  -- A day from before 0026, noted again with its play.
  perform public.note_play_history(sam, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-3), 'minutes', 4, 'noted', true)));
  assert (select noted_play and minutes = 4 from public.play_days where profile_id = sam and day = current_date - 3),
    'a day from before 0026 is marked once its play is noted';
end $$;

-- 5) The first day noted (#170): set by either note function, the earliest
--    kept; a note with no day in the window changes nothing.
do $$
declare
  kit constant uuid := '00000000-0000-0000-0000-000000005a1b';
  ivy constant uuid := '00000000-0000-0000-0000-000000005a1c';
begin
  assert (select since from public.play_history_since where profile_id = kit) = current_date - 7,
    'Kit''s first note set it to its earliest day in the window (7 back), not a skipped one';

  perform public.note_play_history(ivy, jsonb_build_array(jsonb_build_object('day', pg_temp.d(-30))));
  assert not exists (select 1 from public.play_history_since where profile_id = ivy),
    'a day outside the window isn''t noted, so it isn''t counted from';
  perform public.note_play_history(ivy, jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(0)), jsonb_build_object('day', pg_temp.d(-3))));
  assert (select since from public.play_history_since where profile_id = ivy) = current_date - 3, 'the earliest day noted';
  perform public.note_play_history(ivy, jsonb_build_array(jsonb_build_object('day', pg_temp.d(0))));
  assert (select since from public.play_history_since where profile_id = ivy) = current_date - 3, 'a later day never moves it';
  perform public.note_play_days(ivy, array[current_date - 5]);
  assert (select since from public.play_history_since where profile_id = ivy) = current_date - 5,
    'an old tab''s note_play_days moves it earlier too';
end $$;

-- 6) An old tab (note_play_days) keeps five weeks too, and never touches a
--    day's play; both functions tidy every kid's days older than 35.
reset role;
-- Sam's day 20 back had its play noted then; Bea's old days are another
-- family's, left over (her first day noted is long gone with them, so none
-- of them outlives this section).
update public.play_days set xp = 50, minutes = 15
 where profile_id = '00000000-0000-0000-0000-000000005a1a' and day = current_date - 20;
insert into public.play_days (profile_id, day, xp, minutes) values
  ('00000000-0000-0000-0000-000000005b1a', current_date - 36, 7, 1),
  ('00000000-0000-0000-0000-000000005b1a', current_date - 50, 7, 1);
set local role authenticated;
do $$
begin
  perform public.note_play_days('00000000-0000-0000-0000-000000005a1b', array[current_date]);
end $$;
reset role;
do $$
begin
  assert (select xp = 50 and minutes = 15 from public.play_days
           where profile_id = '00000000-0000-0000-0000-000000005a1a' and day = current_date - 20),
    'an old tab''s note keeps a 20-day-old day and its play';
  assert (select xp = 45 and minutes = 20 from public.play_days
           where profile_id = '00000000-0000-0000-0000-000000005a1b' and day = current_date),
    'note_play_days on a day with play leaves it as it was';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a1a' and day = current_date - 35),
    'the 35th day back is kept';
  assert not exists (select 1 from public.play_days where day < current_date - 35),
    'every kid''s days older than 35 went (Sam''s 36th, another family''s)';
  assert (select since from public.play_history_since where profile_id = '00000000-0000-0000-0000-000000005a1a') = current_date - 36,
    'the tidy-up never deletes a first day noted (Sam''s, though that day went)';
end $$;
-- note_play_history tidies the same way, at most 1,000 a note, the oldest first.
insert into public.play_days (profile_id, day)
select '00000000-0000-0000-0000-000000005b1a', current_date - 36 - g from generate_series(0, 1199) g;
set local role authenticated;
do $$
begin
  perform public.note_play_history('00000000-0000-0000-0000-000000005a1a', jsonb_build_array(jsonb_build_object('day', pg_temp.d(0))));
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.play_days where day < current_date - 35) = 200,
    format('one note deletes 1,000 old days (left %s)', (select count(*) from public.play_days where day < current_date - 35));
  assert (select min(day) from public.play_days) = current_date - 36 - 199, 'the oldest go first';
end $$;
delete from public.play_days where day < current_date - 35;

-- 7) Who reads what: each family its own kids' days and first days; signed
--    out, nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000ba", "session_id": "00000000-0000-0000-0000-000000000d1b"}', true);
do $$
begin
  assert (select array_agg(distinct profile_id) from public.play_days) = array['00000000-0000-0000-0000-000000005b1a'::uuid],
    'B reads only Bea''s days';
  assert (select array_agg(profile_id) from public.play_history_since) = array['00000000-0000-0000-0000-000000005b1a'::uuid],
    'B reads only Bea''s first day';
end $$;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000aa", "session_id": "00000000-0000-0000-0000-000000000d1a"}', true);
do $$
begin
  assert (select count(*) from public.play_history_since) = 3
     and not exists (select 1 from public.play_history_since where profile_id = '00000000-0000-0000-0000-000000005b1a'),
    'A reads Sam''s, Kit''s and Ivy''s first days, not Bea''s';
end $$;
select set_config('request.jwt.claims', '', true);
do $$
declare
  refused text;
begin
  assert (select count(*) from public.play_history_since) = 0 and (select count(*) from public.play_days) = 0,
    'no sign-in, no rows';
  begin
    perform public.note_play_history('00000000-0000-0000-0000-000000005a1a', '[]');
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not signed in', 'no sign-in, no note';
end $$;

-- 8) The server's calendar, whatever time zone the caller asks for: with the
--    session's date a day off UTC's, the window's edges are still UTC's.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000ba", "session_id": "00000000-0000-0000-0000-000000000d1b"}', true);
do $$
declare
  utc date := (now() at time zone 'UTC')::date;
  bea constant uuid := '00000000-0000-0000-0000-000000005b1a';
  was constant text := current_setting('timezone');
begin
  perform set_config('timezone',
    case when (now() at time zone 'Etc/GMT-14')::date <> utc then 'Etc/GMT-14' else 'Etc/GMT+12' end, true);
  assert current_date <> utc, 'the session''s date is a day off UTC''s';
  assert public.note_play_history(bea, (select jsonb_agg(jsonb_build_object('day', to_char(utc + g, 'YYYY-MM-DD'), 'xp', 1))
                                          from unnest(array[-8, -7, 1, 2]) g)) = 2,
    'a week back and a day ahead of UTC''s date are kept, never the session''s edges';
  perform set_config('timezone', was, true);
end $$;
reset role;

-- 9) Where each topic started (#174): written as the kid's play (no 👪
--    window), the first start kept, junk dropped.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000aa", "session_id": "00000000-0000-0000-0000-000000000d1a"}', true);
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a1a';
  s jsonb;
  got text;
begin
  assert not public.grown_ups_unlocked(), 'still no 👪 window';
  update public.profiles set skill_starts = '{"math": {"level": 4, "age": 9}}', skill_levels = '{"math": 4}', updated_at = now()
   where id = sam;
  assert (select skill_starts from public.profiles where id = sam) = '{"math": {"level": 4, "age": 9}}'::jsonb,
    'a start is written without 👪 (the kid''s play)';

  -- The first start is kept; a new topic joins.
  update public.profiles set skill_starts = '{"math": {"level": 6, "age": 11}, "words": {"level": 3, "age": 9}}' where id = sam;
  s := (select skill_starts from public.profiles where id = sam);
  assert s = '{"math": {"level": 4, "age": 9}, "words": {"level": 3, "age": 9}}'::jsonb,
    format('math keeps its first start, words joins (%s)', s);

  -- A write that leaves a topic out (or sends nothing usable) removes nothing.
  foreach got in array array['{}', 'null', '[1]', '"math"'] loop
    execute format('update public.profiles set skill_starts = %L::jsonb where id = %L', got, sam);
    assert (select skill_starts from public.profiles where id = sam) = s, format('%s removes nothing', got);
  end loop;
  update public.profiles set skill_starts = null where id = sam;
  assert (select skill_starts from public.profiles where id = sam) = s, 'nor does a SQL null (no error either)';
  update public.profiles set xp = xp + 5 where id = sam;
  assert (select skill_starts from public.profiles where id = sam) = s, 'another play write leaves the starts';

  -- Junk is dropped: only {level: whole 1–10, age: whole 3–18} under a
  -- topic id, and only those two fields kept.
  update public.profiles set skill_starts = '{
      "science":   {"level": 0, "age": 9},
      "history":   {"level": 11, "age": 9},
      "music":     {"level": 5, "age": 2},
      "nature":    {"level": 5, "age": 19},
      "space":     {"level": 4.5, "age": 9},
      "geography": {"level": "4", "age": 9},
      "creativity": [4, 9],
      "Engineering": {"level": 4, "age": 9},
      "x1":        {"level": 4, "age": 9},
      "engineering": {"level": 10, "age": 18, "extra": true}
    }' where id = sam;
  s := (select skill_starts from public.profiles where id = sam);
  assert s = '{"math": {"level": 4, "age": 9}, "words": {"level": 3, "age": 9}, "engineering": {"level": 10, "age": 18}}'::jsonb,
    format('only the good start joins, without its extra field (%s)', s);
  update public.profiles set skill_starts = '{"nature": {"level": 1, "age": 3}}' where id = sam;
  assert (select skill_starts -> 'nature' from public.profiles where id = sam) = '{"level": 1, "age": 3}'::jsonb,
    'the lowest level and age are fine';

  -- A start rides along with the rest of the play; a grown-up's column in
  -- the same write is still refused.
  update public.profiles set xp = xp + 1, skill_levels = '{"math": 5, "space": 2}',
         skill_starts = '{"space": {"level": 2, "age": 9}}' where id = sam;
  assert (select skill_starts ? 'space' from public.profiles where id = sam), 'with XP and levels';
  got := null;
  begin
    update public.profiles set display_name = 'Samuel', skill_starts = '{"music": {"level": 2, "age": 9}}' where id = sam;
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ001 grown_ups_locked%', format('a nickname with it is a grown-up''s (%s)', got);
  assert not (select skill_starts ? 'music' from public.profiles where id = sam), 'nothing of it saved';
end $$;
reset role;

do $$
declare
  kit constant uuid := '00000000-0000-0000-0000-000000005a1b';
  s jsonb;
  got text;
begin
  assert 'skill_starts' = any (public.profiles_kid_play_columns()), 'skill_starts is on the kid''s play list';

  -- Whoever writes (here the table's owner): junk dropped on insert too, and
  -- at most 16 topics — those already there first.
  insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month, skill_starts) values
    ('00000000-0000-0000-0000-000000005a1d', '00000000-0000-0000-0000-0000000000aa', 'Ada', 'cat', 2019, 1,
     '{"math": {"level": 2, "age": 7}, "words": {"level": 12, "age": 7}}');
  assert (select skill_starts from public.profiles where id = '00000000-0000-0000-0000-000000005a1d')
           = '{"math": {"level": 2, "age": 7}}'::jsonb, 'a new kid''s junk start is dropped';
  update public.profiles set skill_starts = '{"math": {"level": 3, "age": 8}, "zz": {"level": 3, "age": 8}}' where id = kit;
  update public.profiles
     set skill_starts = (select jsonb_object_agg('t' || chr(96 + g), jsonb_build_object('level', 5, 'age', 10))
                           from generate_series(1, 20) g)
   where id = kit;
  s := (select skill_starts from public.profiles where id = kit);
  assert (select count(*) from jsonb_object_keys(s)) = 16 and s ? 'math' and s ? 'zz' and s ? 'tn' and not s ? 'to',
    format('16 at most: the two there, then the first 14 new by id (%s)', s);
  update public.profiles set skill_starts = '{"math": {"level": 9, "age": 15}}' where id = kit;
  assert (select skill_starts -> 'math' from public.profiles where id = kit) = '{"level": 3, "age": 8}'::jsonb,
    'the owner''s write keeps the first start too';

  -- The column is always an object, even with the trigger off.
  alter table public.profiles disable trigger profiles_keep_skill_starts;
  begin
    update public.profiles set skill_starts = '[1]' where id = kit;
  exception when check_violation then got := sqlstate;
  end;
  assert got = '23514', 'skill_starts is a JSON object';
  alter table public.profiles enable trigger profiles_keep_skill_starts;
end $$;

-- 9b) A birth date corrected (#183). The ages kid_age_on gives — the app's
--     calcAge (src/lib/age.ts) gives the same: `age.test` reads these rows —
--     as birth year, birth month, the day, the age.
do $$
declare
  c record;
begin
  for c in select * from (values -- age cases
    (2016, 3, '2026-02-28', 9),
    (2016, 3, '2026-03-01', 10),
    (2016, 3, '2026-12-31', 10),
    (2016, 12, '2026-11-30', 9),
    (2016, 12, '2026-12-01', 10),
    (2016, 1, '2026-01-01', 10),
    (2019, 1, '2026-10-22', 7),
    (2008, 6, '2026-10-22', 18),
    (2000, 6, '2026-10-22', 26),
    (2026, 11, '2026-10-22', 0),
    (2027, 5, '2026-10-22', 0)
  ) as cases (y, m, on_day, age) loop
    assert public.kid_age_on(c.y, c.m, c.on_day::date) = c.age,
      format('born %s-%s, on %s: %s (got %s)', c.y, c.m, c.on_day, c.age, public.kid_age_on(c.y, c.m, c.on_day::date));
  end loop;
end $$;

-- Ivy's birth date was typed as January 2009 (17 today) when she's really
-- January 2019's (7): three starts noted from the wrong age, as her play.
update public.profiles set birth_year = 2009 where id = '00000000-0000-0000-0000-000000005a1c';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000aa", "session_id": "00000000-0000-0000-0000-000000000d1a"}', true);
do $$
declare
  ivy constant uuid := '00000000-0000-0000-0000-000000005a1c';
  s jsonb;
  got text;
begin
  update public.profiles
     set skill_starts = '{"math": {"level": 6, "age": 17}, "words": {"level": 5, "age": 16},
                          "space": {"level": 1, "age": 12}, "history": {"level": 6, "age": 18}}'
   where id = ivy;
  s := (select skill_starts from public.profiles where id = ivy);
  -- Her own play can't move an age: a start sent again with another age
  -- keeps the first, and a birth date in a play write is a grown-up's.
  update public.profiles set skill_starts = '{"math": {"level": 6, "age": 7}}', xp = xp + 1 where id = ivy;
  assert (select skill_starts from public.profiles where id = ivy) = s, 'a play write moves no age';
  begin
    update public.profiles set birth_year = 2019, xp = xp + 1 where id = ivy;
  exception when others then got := sqlstate;
  end;
  assert got = 'HQ001', format('a birth date without 👪 is refused (%s)', got);
  assert (select skill_starts from public.profiles where id = ivy) = s, 'and moves no age';
end $$;
reset role;
-- A opens 👪 on the family device's sign-in.
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000d1a', now() + interval '15 minutes');
set local role authenticated;
do $$
declare
  ivy constant uuid := '00000000-0000-0000-0000-000000005a1c';
  s jsonb;
  shift integer;
begin
  assert public.grown_ups_unlocked(), '👪 open';
  -- Corrected: 17 → 7 today, so every start 10 years younger, never under 3; the levels as they were.
  update public.profiles set birth_year = 2019, updated_at = now() where id = ivy;
  s := (select skill_starts from public.profiles where id = ivy);
  assert s = '{"math": {"level": 6, "age": 7}, "words": {"level": 5, "age": 6},
               "space": {"level": 1, "age": 3}, "history": {"level": 6, "age": 8}}'::jsonb,
    format('ages down by 10 (space''s 2 kept at 3), levels kept (%s)', s);
  -- Corrected the other way (7 → 18), with a new start in the same write:
  -- the starts already there 11 years older, never over 18; the new one as sent.
  update public.profiles set birth_year = 2008, skill_starts = '{"nature": {"level": 3, "age": 9}, "math": {"level": 2, "age": 4}}'
   where id = ivy;
  s := (select skill_starts from public.profiles where id = ivy);
  assert s = '{"math": {"level": 6, "age": 18}, "words": {"level": 5, "age": 17}, "space": {"level": 1, "age": 14},
               "history": {"level": 6, "age": 18}, "nature": {"level": 3, "age": 9}}'::jsonb,
    format('ages up by 11 (history''s 19 kept at 18), a new start as sent, math''s first kept (%s)', s);
  -- A write that leaves the birth date as it was (a nickname, the same year sent again) moves nothing.
  update public.profiles set display_name = 'Ivy-May', birth_year = 2008, birth_month = 1 where id = ivy;
  assert (select skill_starts from public.profiles where id = ivy) = s, 'the same birth date moves no age';
  -- The month counts as the app counts it: December 2008 is a year younger
  -- today unless it's December.
  shift := public.kid_age_on(2008, 1, (now() at time zone 'UTC')::date) - public.kid_age_on(2008, 12, (now() at time zone 'UTC')::date);
  update public.profiles set birth_month = 12 where id = ivy;
  assert (select (skill_starts -> 'words' ->> 'age')::integer from public.profiles where id = ivy) = 17 - shift
     and (select (skill_starts -> 'words' ->> 'level')::integer from public.profiles where id = ivy) = 5,
    format('a month that changes the age today moves it by that (%s)', shift);
end $$;
reset role;
delete from public.grown_up_unlocks;

-- 9c) A start's day (#183): a start noted with `on` takes the kid's age that
--     day by the row's birth date — as it arrives, from whoever sends it
--     and whatever age it carries, and again on a correction, so a month
--     corrected moves each start by its own day's difference (here 1 for a
--     June start, 0 for an October one), not today's. A start without
--     `on` keeps the old rule. An `on` that isn't a real day from 2020 to a
--     day ahead is dropped alone. Zed was typed in as born September 2016;
--     he's really March 2016's.
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month, skill_starts) values
  ('00000000-0000-0000-0000-000000005a1e', '00000000-0000-0000-0000-0000000000aa', 'Zed', 'fox', 2016, 9,
   '{"maps": {"level": 2, "age": 12, "on": "2025-06-15"}}');
do $$
begin
  assert (select skill_starts from public.profiles where id = '00000000-0000-0000-0000-000000005a1e')
           = '{"maps": {"level": 2, "age": 8, "on": "2025-06-15"}}'::jsonb,
    'a new kid''s start with a day takes the age that day (8 on 15 June 2025 for September 2016), not the 12 sent';
end $$;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000aa", "session_id": "00000000-0000-0000-0000-000000000d1a"}', true);
do $$
declare
  zed constant uuid := '00000000-0000-0000-0000-000000005a1e';
  tomorrow constant text := to_char((now() at time zone 'UTC')::date + 1, 'YYYY-MM-DD');
  later constant text := to_char((now() at time zone 'UTC')::date + 2, 'YYYY-MM-DD');
  s jsonb;
begin
  assert not public.grown_ups_unlocked(), 'no 👪 window: the kid''s play';
  update public.profiles
     set skill_starts = jsonb_build_object(
           'math',  '{"level": 3, "age": 15, "on": "2025-06-15"}'::jsonb,
           'words', '{"level": 4, "age": 9, "on": "2025-10-15"}'::jsonb,
           'space', '{"level": 3, "age": 8}'::jsonb,
           'early', '{"level": 1, "age": 5, "on": "2020-01-01"}'::jsonb,
           'soon',  jsonb_build_object('level', 5, 'age', 9, 'on', tomorrow),
           'febxx', '{"level": 2, "age": 7, "on": "2025-02-30"}'::jsonb,
           'olden', '{"level": 2, "age": 7, "on": "2019-12-31"}'::jsonb,
           'ahead', jsonb_build_object('level', 2, 'age', 7, 'on', later),
           'numbr', '{"level": 2, "age": 7, "on": 20250615}'::jsonb,
           'short', '{"level": 2, "age": 7, "on": "2025-6-15"}'::jsonb,
           'zeros', '{"level": 2, "age": 7, "on": "0000-01-01"}'::jsonb,
           'stamp', '{"level": 2, "age": 7, "on": "2025-06-15T00:00:00Z"}'::jsonb)
   where id = zed;
  s := (select skill_starts from public.profiles where id = zed);
  assert s -> 'math' = '{"level": 3, "age": 8, "on": "2025-06-15"}'::jsonb, format('June 2025: 8, the sent 15 ignored (%s)', s -> 'math');
  assert s -> 'words' = '{"level": 4, "age": 9, "on": "2025-10-15"}'::jsonb, format('October 2025: 9 (%s)', s -> 'words');
  assert s -> 'space' = '{"level": 3, "age": 8}'::jsonb, 'no day: the age as sent';
  assert s -> 'early' = '{"level": 1, "age": 3, "on": "2020-01-01"}'::jsonb, format('the first day taken, 2020 (%s)', s -> 'early');
  assert s -> 'soon' ->> 'on' = tomorrow, 'a day ahead is taken (a device''s calendar runs ahead)';
  assert (select bool_and(s -> k = '{"level": 2, "age": 7}'::jsonb)
            from unnest(array['febxx', 'olden', 'ahead', 'numbr', 'short', 'zeros', 'stamp']) k),
    format('a day that isn''t one is dropped alone, the age as sent (%s)', s);
  -- Sent again with another age (another device, a stale copy): the first stays.
  update public.profiles set skill_starts = '{"math": {"level": 6, "age": 11, "on": "2025-07-01"}}' where id = zed;
  assert (select skill_starts -> 'math' from public.profiles where id = zed) = s -> 'math', 'keep-first, day and all';
end $$;
reset role;
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000d1a', now() + interval '15 minutes');
set local role authenticated;
do $$
declare
  zed constant uuid := '00000000-0000-0000-0000-000000005a1e';
  today constant date := (now() at time zone 'UTC')::date;
  shift integer;
  s jsonb;
begin
  assert public.grown_ups_unlocked(), '👪 open';
  -- The month corrected: each start with a day moves by its own day's
  -- difference; the one without by today's.
  shift := public.kid_age_on(2016, 9, today) - public.kid_age_on(2016, 3, today);
  update public.profiles set birth_month = 3 where id = zed;
  s := (select skill_starts from public.profiles where id = zed);
  assert s -> 'math' = '{"level": 3, "age": 9, "on": "2025-06-15"}'::jsonb, format('June 2025, born March: 9 (%s)', s -> 'math');
  assert s -> 'words' = '{"level": 4, "age": 9, "on": "2025-10-15"}'::jsonb, format('October 2025: still 9 (%s)', s -> 'words');
  assert s -> 'early' = '{"level": 1, "age": 3, "on": "2020-01-01"}'::jsonb, format('January 2020, born March 2016: 3 (%s)', s -> 'early');
  assert (s -> 'space' ->> 'age')::integer = least(18, greatest(3, 8 - shift)) and (s -> 'space' ->> 'level')::integer = 3,
    format('no day: moved by today''s difference, %s (%s)', shift, s -> 'space');
  assert s -> 'febxx' = jsonb_build_object('level', 2, 'age', least(18, greatest(3, 7 - shift))),
    format('a dropped day stays dropped: the start moves as one without a day (%s)', s -> 'febxx');
end $$;
reset role;
delete from public.grown_up_unlocks;
set local role authenticated;
do $$
declare
  zed constant uuid := '00000000-0000-0000-0000-000000005a1e';
begin
  -- After the correction, a start noted on a device that still had the old
  -- birth date (or carried from a save, or played while the row was unread)
  -- arrives with the old age: it lands with the right one.
  update public.profiles set skill_starts = '{"late": {"level": 5, "age": 8, "on": "2025-06-15"}}' where id = zed;
  assert (select skill_starts -> 'late' from public.profiles where id = zed) = '{"level": 5, "age": 9, "on": "2025-06-15"}'::jsonb,
    'a start reaching the row after the correction gets the corrected age';
end $$;
reset role;
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000d1a', now() + interval '15 minutes');
set local role authenticated;
do $$
declare
  zed constant uuid := '00000000-0000-0000-0000-000000005a1e';
  s jsonb;
begin
  -- The year corrected, and the clamps: born 2019, January 2020 is 0 → 3;
  -- born 2000, June 2025 is 25 → 18. Levels never move.
  update public.profiles set birth_year = 2019 where id = zed;
  s := (select skill_starts from public.profiles where id = zed);
  assert s -> 'math' = '{"level": 3, "age": 6, "on": "2025-06-15"}'::jsonb and s -> 'early' = '{"level": 1, "age": 3, "on": "2020-01-01"}'::jsonb,
    format('born March 2019: June 2025 is 6, January 2020 kept at 3 (%s)', s);
  update public.profiles set birth_year = 2000 where id = zed;
  s := (select skill_starts from public.profiles where id = zed);
  assert s -> 'math' = '{"level": 3, "age": 18, "on": "2025-06-15"}'::jsonb and s -> 'early' = '{"level": 1, "age": 18, "on": "2020-01-01"}'::jsonb,
    format('born March 2000: kept at 18 (%s)', s);
  update public.profiles set birth_year = 2016 where id = zed;
  assert (select skill_starts -> 'math' from public.profiles where id = zed) = '{"level": 3, "age": 9, "on": "2025-06-15"}'::jsonb,
    'and back: the day keeps it exact (no shift lost to a clamp)';
end $$;
reset role;
delete from public.grown_up_unlocks;

-- 10) Re-applying 0026 and 0027 (the bundle replays every migration)
--     changes no data.
create temp table before_rerun as
  select (select jsonb_agg(to_jsonb(d) order by profile_id, day) from public.play_days d) as days,
         (select jsonb_agg(to_jsonb(s) order by profile_id) from public.play_history_since s) as since,
         (select jsonb_object_agg(id, skill_starts) from public.profiles) as starts,
         (select jsonb_agg(to_jsonb(p) order by profile_id, day, device) from public.play_day_parts p) as parts;
\ir ../migrations/0026_progress_history.sql
\ir ../migrations/0027_play_day_devices.sql
do $$
begin
  assert (select days from before_rerun) = (select jsonb_agg(to_jsonb(d) order by profile_id, day) from public.play_days d),
    'the days and their play are as they were';
  assert (select since from before_rerun) = (select jsonb_agg(to_jsonb(s) order by profile_id) from public.play_history_since s),
    'the first days are as they were';
  assert (select starts from before_rerun) = (select jsonb_object_agg(id, skill_starts) from public.profiles),
    'the starts are as they were';
  assert (select parts from before_rerun)
           = (select jsonb_agg(to_jsonb(p) order by profile_id, day, device) from public.play_day_parts p),
    'the days'' parts are as they were (0027)';
end $$;

-- 11) Grants and settings.
do $$
declare
  f text;
begin
  assert not has_function_privilege('anon', 'public.note_play_history(uuid, jsonb)', 'execute'),
    'only a signed-in family notes play';
  assert has_function_privilege('authenticated', 'public.note_play_history(uuid, jsonb)', 'execute'), 'the app may note play';
  assert (select prosecdef from pg_proc where oid = 'public.note_play_history(uuid, jsonb)'::regprocedure),
    'it writes as the table''s owner';
  assert (select proconfig from pg_proc where oid = 'public.note_play_history(uuid, jsonb)'::regprocedure)
           = array['search_path=""', 'TimeZone=UTC'], 'with an empty search path, in UTC';
  assert has_function_privilege('authenticated', 'public.kid_age_on(integer, integer, date)', 'execute')
     and has_function_privilege('authenticated', 'public.topic_start_day(text, date)', 'execute'),
    'the starts trigger runs as the caller: kid_age_on and topic_start_day are anyone''s';
  foreach f in array array['public.play_days_tidy()', 'public.play_history_note_since(uuid, date)',
                           'public.play_topics_clean(jsonb)', 'public.play_topics_merge(jsonb, jsonb)'] loop
    assert not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'),
      format('%s is internal', f);
  end loop;
  assert not has_table_privilege('anon', 'public.play_history_since', 'select'), 'anon reads no first days';
  assert has_table_privilege('authenticated', 'public.play_history_since', 'select'), 'the family reads theirs (RLS)';
  assert (select relrowsecurity from pg_class where oid = 'public.play_history_since'::regclass), 'under RLS';
end $$;

-- 12) Removing a kid (and closing the account, which removes every kid)
--     takes their days and first day with them; a sibling's stay.
do $$
begin
  delete from public.profiles where id = '00000000-0000-0000-0000-000000005a1b';
  assert not exists (select 1 from public.play_history_since where profile_id = '00000000-0000-0000-0000-000000005a1b'),
    'a removed kid''s first day goes';
  assert not exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a1b'),
    'and their days';
  assert not exists (select 1 from public.play_day_parts where profile_id = '00000000-0000-0000-0000-000000005a1b'),
    'and their days'' parts (0027)';
  assert exists (select 1 from public.play_history_since where profile_id = '00000000-0000-0000-0000-000000005a1a'),
    'their brother''s stays';
end $$;

rollback;
