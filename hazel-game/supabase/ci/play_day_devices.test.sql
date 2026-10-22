-- CI test for migration 0027 (#179): two devices playing one kid on one day
-- add up. Each device's day is kept as its own part (play_day_parts: the
-- larger of what it had and what it sends, as 0026 merged a day), and the
-- day's play_days row is the SUM of its parts — XP and minutes capped,
-- topics added per id with r ≤ a and the level from the part that changed
-- last, noted if any part is. note_device_play writes a device's part;
-- note_play_history (an older app) writes the 'legacy' part; a day noted
-- before it had any part keeps what it held as its 'legacy' part. Parts are
-- tidied at 35 days like the days, go with the kid, and no API role can read
-- or write them; a day takes at most 8 devices' parts (a 9th new device is
-- counted out). The concurrency of two notes of one day:
-- play_day_devices_lock.test.sql. Any failed assertion raises and exits
-- non-zero under `psql -v ON_ERROR_STOP=1`.
--
-- Who's who: grown-up A (…c1) has Sam (…7a1a), Kit (…7a1b), Ivy (…7a1c),
-- Zoe (…7a1d) and Ada (…7a1e); grown-up B (…c2) has Bea (…7b1a). A acts
-- on the family device's sign-in with no 👪 window open: noting play is the
-- kid's play.
begin;
-- The test's dates are the server's (UTC), as the note functions' are.
set local timezone = 'UTC';

-- A day `n` days from today, as the app sends it (`YYYY-MM-DD`).
create function pg_temp.d(n integer) returns text language sql stable
  as $$ select to_char(current_date + n, 'YYYY-MM-DD') $$;
-- A kid's day `n` from today as play_days holds it (read as the owner, so a
-- block running as the family can check it).
create function pg_temp.day(p_kid uuid, n integer) returns jsonb language sql stable security definer
  as $$ select jsonb_build_object('xp', xp, 'minutes', minutes, 'topics', topics, 'noted', noted_play)
          from public.play_days where profile_id = p_kid and day = current_date + n $$;
-- …and its parts, by device.
create function pg_temp.parts(p_kid uuid, n integer) returns jsonb language sql stable security definer
  as $$ select coalesce(jsonb_object_agg(device, jsonb_build_object(
                 'xp', xp, 'minutes', minutes, 'topics', topics, 'noted', noted)), '{}'::jsonb)
          from public.play_day_parts where profile_id = p_kid and day = current_date + n $$;
-- One device's day, as the app sends it.
create function pg_temp.el(n integer, xp integer, minutes integer, topics jsonb, noted boolean) returns jsonb
  language sql immutable
  as $$ select jsonb_strip_nulls(jsonb_build_object('day', pg_temp.d(n), 'xp', xp, 'minutes', minutes,
                                                    'topics', topics, 'noted', case when noted then true end)) $$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000c2', '{"consent_version": "2026-10-draft"}');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-000000000dc1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-000000000dc2', '00000000-0000-0000-0000-0000000000c2');
-- Added by the table's owner (adding players is a grown-up action, tested in grown_ups_gate).
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000007a1a', '00000000-0000-0000-0000-0000000000c1', 'Sam', 'fox', 2017, 3),
  ('00000000-0000-0000-0000-000000007a1b', '00000000-0000-0000-0000-0000000000c1', 'Kit', 'frog', 2018, 5),
  ('00000000-0000-0000-0000-000000007a1c', '00000000-0000-0000-0000-0000000000c1', 'Ivy', 'owl', 2019, 1),
  ('00000000-0000-0000-0000-000000007a1d', '00000000-0000-0000-0000-0000000000c1', 'Zoe', 'cat', 2016, 9),
  ('00000000-0000-0000-0000-000000007a1e', '00000000-0000-0000-0000-0000000000c1', 'Ada', 'owl', 2017, 6),
  ('00000000-0000-0000-0000-000000007b1a', '00000000-0000-0000-0000-0000000000c2', 'Bea', 'bee', 2016, 7);

-- Kit's yesterday was noted before 0027 (0026's note_play_history wrote the
-- row itself), and the day before by an old tab's note_play_days (zeros).
-- Ada's day 2 back too: a send whose answer never came back (0026 wrote it,
-- the app never heard, so it sends the record again).
insert into public.play_days (profile_id, day, xp, minutes, topics, noted_play) values
  ('00000000-0000-0000-0000-000000007a1b', current_date - 1, 30, 8, '{"math": {"a": 5, "r": 3, "l": 2}}', true),
  ('00000000-0000-0000-0000-000000007a1b', current_date - 2, 0, 0, '{}', false),
  ('00000000-0000-0000-0000-000000007a1e', current_date - 2, 50, 10, '{}', true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "session_id": "00000000-0000-0000-0000-000000000dc1"}', true);

-- 1) Two devices on one day add up; a device re-sending its growing day
--    never counts it twice; the topic's level is the latest change's.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000007a1a';
  v jsonb;
begin
  assert not public.grown_ups_unlocked(), 'no 👪 window on A''s sign-in';
  assert public.note_device_play(sam, 'tab-1', jsonb_build_array(
    pg_temp.el(0, 40, 10, '{"math": {"a": 10, "r": 7, "l": 4}}', true))) = 1, 'one day noted';
  assert public.note_device_play(sam, 'lap-1', jsonb_build_array(
    pg_temp.el(0, 25, 5, '{"math": {"a": 4, "r": 4, "l": 5}, "words": {"a": 2, "r": 1, "l": 3}}', true))) = 1,
    'the laptop''s day';
  v := pg_temp.day(sam, 0);
  assert v = '{"xp": 65, "minutes": 15, "noted": true, "topics": {"math": {"a": 14, "r": 11, "l": 5}, "words": {"a": 2, "r": 1, "l": 3}}}'::jsonb,
    format('two devices sum: XP, minutes and answers added, the laptop''s later level (%s)', v);
  assert (select count(*) from jsonb_object_keys(pg_temp.parts(sam, 0))) = 2, 'one part each';

  -- The tablet re-sends its whole day, grown: its part grows, the day by the difference.
  perform public.note_device_play(sam, 'tab-1', jsonb_build_array(
    pg_temp.el(0, 50, 12, '{"math": {"a": 12, "r": 8, "l": 4}}', true)));
  v := pg_temp.day(sam, 0);
  assert v -> 'xp' = '75' and v -> 'minutes' = '17' and v -> 'topics' -> 'math' = '{"a": 16, "r": 12, "l": 4}'::jsonb,
    format('a growing day replaces its part, never adds to it; the tablet changed last, so its level (%s)', v);

  -- Re-sent unchanged (a hidden tab, a profile load): nothing moves — not
  -- even whose level is the latest.
  perform public.note_device_play(sam, 'tab-1', jsonb_build_array(
    pg_temp.el(0, 50, 12, '{"math": {"a": 12, "r": 8, "l": 4}}', true)));
  perform public.note_device_play(sam, 'lap-1', jsonb_build_array(
    pg_temp.el(0, 25, 5, '{"math": {"a": 4, "r": 4, "l": 5}, "words": {"a": 2, "r": 1, "l": 3}}', true)));
  v := pg_temp.day(sam, 0);
  assert v -> 'xp' = '75' and v -> 'topics' -> 'math' = '{"a": 16, "r": 12, "l": 4}'::jsonb,
    format('an unchanged re-send changes nothing, its level isn''t the latest (%s)', v);

  -- A late, smaller send never lowers a part (nor its topic's tally).
  perform public.note_device_play(sam, 'lap-1', jsonb_build_array(
    pg_temp.el(0, 10, 1, '{"math": {"a": 1, "r": 1, "l": 6}}', false)));
  v := pg_temp.day(sam, 0);
  assert v = '{"xp": 75, "minutes": 17, "noted": true, "topics": {"math": {"a": 16, "r": 12, "l": 4}, "words": {"a": 2, "r": 1, "l": 3}}}'::jsonb,
    format('a smaller send lowers nothing (%s)', v);

  -- The laptop moves on (more answers, a new level): its level is the day's now.
  perform public.note_device_play(sam, 'lap-1', jsonb_build_array(
    pg_temp.el(0, 25, 5, '{"math": {"a": 6, "r": 5, "l": 6}}', true)));
  assert pg_temp.day(sam, 0) -> 'topics' -> 'math' = '{"a": 18, "r": 13, "l": 6}'::jsonb,
    format('the part that changed last gives the level (%s)', pg_temp.day(sam, 0));

  -- One day twice in one call merges with itself (the larger kept).
  assert public.note_device_play(sam, 'lap-1', jsonb_build_array(
    pg_temp.el(0, 30, 0, null, false), pg_temp.el(0, 20, 0, null, false))) = 1, 'a day twice in a call is one day';
  assert pg_temp.day(sam, 0) -> 'xp' = '80', format('50 + the larger 30 (%s)', pg_temp.day(sam, 0));
end $$;

-- 2) A day noted before it had any part keeps what it held as its 'legacy'
--    part; a day noted alone (zeros) has nothing to keep.
do $$
declare
  kit constant uuid := '00000000-0000-0000-0000-000000007a1b';
  v jsonb;
begin
  perform public.note_device_play(kit, 'tab-1', jsonb_build_array(
    pg_temp.el(-1, 10, 2, '{"math": {"a": 2, "r": 2, "l": 3}}', true)));
  v := pg_temp.day(kit, -1);
  assert v = '{"xp": 40, "minutes": 10, "noted": true, "topics": {"math": {"a": 7, "r": 5, "l": 3}}}'::jsonb,
    format('what was recorded stays, and this device''s play adds to it (%s)', v);
  v := pg_temp.parts(kit, -1);
  assert v -> 'legacy' = '{"xp": 30, "minutes": 8, "noted": true, "topics": {"math": {"a": 5, "r": 3, "l": 2}}}'::jsonb,
    format('the day''s old values are its legacy part (%s)', v);
  -- A second device later: no second carry-over.
  perform public.note_device_play(kit, 'lap-1', jsonb_build_array(pg_temp.el(-1, 5, 0, null, true)));
  assert pg_temp.day(kit, -1) -> 'xp' = '45' and pg_temp.parts(kit, -1) -> 'legacy' -> 'xp' = '30',
    format('the legacy part is kept once (%s)', pg_temp.parts(kit, -1));

  -- The day an old tab noted alone: zeros, nothing to keep.
  perform public.note_device_play(kit, 'tab-1', jsonb_build_array(pg_temp.el(-2, 5, 1, null, true)));
  assert pg_temp.day(kit, -2) = '{"xp": 5, "minutes": 1, "noted": true, "topics": {}}'::jsonb,
    format('a day noted alone takes this device''s play (%s)', pg_temp.day(kit, -2));
  assert not pg_temp.parts(kit, -2) ? 'legacy', 'no legacy part for a day that held nothing';
end $$;

-- 3) An older app's note_play_history writes the 'legacy' part: it adds to
--    the devices' parts, and its re-sends never count twice.
do $$
declare
  kit constant uuid := '00000000-0000-0000-0000-000000007a1b';
  v jsonb;
begin
  perform public.note_device_play(kit, 'tab-1', jsonb_build_array(pg_temp.el(0, 20, 4, null, true)));
  assert public.note_play_history(kit, jsonb_build_array(pg_temp.el(0, 7, 1, '{"music": {"a": 1, "r": 1}}', false))) = 1,
    'the old writer still answers with the days noted';
  v := pg_temp.day(kit, 0);
  assert v = '{"xp": 27, "minutes": 5, "noted": true, "topics": {"music": {"a": 1, "r": 1}}}'::jsonb,
    format('an old tab''s day adds as the legacy part (%s)', v);
  assert pg_temp.parts(kit, 0) -> 'legacy' = '{"xp": 7, "minutes": 1, "noted": false, "topics": {"music": {"a": 1, "r": 1}}}'::jsonb,
    format('the legacy part (%s)', pg_temp.parts(kit, 0));
  perform public.note_play_history(kit, jsonb_build_array(pg_temp.el(0, 9, 1, null, false)));
  assert pg_temp.day(kit, 0) -> 'xp' = '29', format('its re-send grows the legacy part: 20 + 9, not 36 (%s)', pg_temp.day(kit, 0));
  -- An old tab re-sending a day whose old values were carried over: the
  -- larger of the two, never both.
  perform public.note_play_history(kit, jsonb_build_array(pg_temp.el(-1, 12, 3, null, false)));
  assert pg_temp.day(kit, -1) -> 'xp' = '45', format('the carried 30 stays the legacy part''s (%s)', pg_temp.day(kit, -1));
end $$;

-- 3b) A send whose answer was lost (review round 1): 0026 wrote the record,
--     the app never heard and sends it again, grown — to the legacy part,
--     where it was decided to go before the first send. The larger of the
--     two, never both.
do $$
declare
  ada constant uuid := '00000000-0000-0000-0000-000000007a1e';
begin
  assert public.note_play_history(ada, jsonb_build_array(pg_temp.el(-2, 52, 11, null, true))) = 1, 'the record again';
  assert pg_temp.day(ada, -2) = '{"xp": 52, "minutes": 11, "noted": true, "topics": {}}'::jsonb,
    format('the lost send and its re-send are one record: 52 XP, 11 minutes — not 102 and 21 (%s)', pg_temp.day(ada, -2));
  assert (select count(*) from jsonb_object_keys(pg_temp.parts(ada, -2))) = 1, 'one part, the legacy one';
end $$;

-- 3c) At most 8 devices' parts a day (review round 1): a 9th new device's
--     day is counted out, never an error; the legacy part isn't a device's;
--     a device with a part that day still adds to it; the cap is per day.
do $$
declare
  ada constant uuid := '00000000-0000-0000-0000-000000007a1e';
  v jsonb;
begin
  assert public.note_play_history(ada, jsonb_build_array(pg_temp.el(0, 7, 0, null, false))) = 1, 'an old tab''s day first';
  for i in 1..8 loop
    assert public.note_device_play(ada, 'dev-' || i, jsonb_build_array(pg_temp.el(0, 10, 1, null, true))) = 1,
      format('device %s of 8 is noted, the legacy part beside them', i);
  end loop;
  assert public.note_device_play(ada, 'dev-9', jsonb_build_array(pg_temp.el(0, 10, 1, null, true), pg_temp.el(-1, 4, 1, null, true))) = 1,
    'a 9th device: its today counted out, its yesterday noted';
  v := pg_temp.parts(ada, 0);
  assert not v ? 'dev-9' and (select count(*) from jsonb_object_keys(v)) = 9, format('8 devices and the legacy part (%s)', v);
  assert pg_temp.day(ada, 0) -> 'xp' = '87' and pg_temp.day(ada, 0) -> 'minutes' = '8',
    format('the day is the 8 devices'' and the legacy part''s: 87 XP (%s)', pg_temp.day(ada, 0));
  assert pg_temp.parts(ada, -1) ? 'dev-9', 'the cap is per day';
  assert public.note_device_play(ada, 'dev-3', jsonb_build_array(pg_temp.el(0, 25, 2, null, true))) = 1,
    'a device with a part that day still notes';
  assert public.note_play_history(ada, jsonb_build_array(pg_temp.el(0, 9, 0, null, false))) = 1, 'and so does the legacy part';
  assert pg_temp.day(ada, 0) -> 'xp' = '104', format('80 + 15 more from dev-3 + the legacy part''s 9 (%s)', pg_temp.day(ada, 0));
  assert public.note_device_play(ada, 'dev-10', jsonb_build_array(pg_temp.el(0, 10, 1, null, true))) = 0, 'still no 9th device';
  assert not pg_temp.parts(ada, 0) ? 'dev-10', 'nor its part';
  -- 8 devices first, then an old tab: its legacy part joins them.
  perform public.note_device_play(ada, 'dev-' || i, jsonb_build_array(pg_temp.el(-3, 1, 0, null, true)))
     from generate_series(1, 8) i;
  assert public.note_play_history(ada, jsonb_build_array(pg_temp.el(-3, 5, 0, null, false))) = 1, 'the old tab''s day is noted';
  assert pg_temp.day(ada, -3) -> 'xp' = '13',
    format('an old tab''s day joins 8 devices: the legacy part isn''t a 9th device (%s)', pg_temp.day(ada, -3));
end $$;

-- 4) The caps: XP 100,000, minutes 1,440, a ≤ 10,000 with r ≤ a, at most
--    16 topics (those already on the day first).
do $$
declare
  ivy constant uuid := '00000000-0000-0000-0000-000000007a1c';
  v jsonb;
begin
  perform public.note_device_play(ivy, dev, jsonb_build_array(pg_temp.el(0, 60000, 1000, null, true)))
     from unnest(array['dev-a', 'dev-b', 'dev-c']) dev;
  v := pg_temp.day(ivy, 0);
  assert v -> 'xp' = '100000' and v -> 'minutes' = '1440', format('XP and minutes capped (%s)', v);
  perform public.note_device_play(ivy, 'dev-a', jsonb_build_array(
    pg_temp.el(0, 0, 0, '{"math": {"a": 6000, "r": 6000}, "science": {"a": 3, "r": 3}}', true)));
  perform public.note_device_play(ivy, 'dev-b', jsonb_build_array(
    pg_temp.el(0, 0, 0, '{"math": {"a": 6000, "r": 5000}, "science": {"a": 2, "r": 0}}', true)));
  v := pg_temp.day(ivy, 0) -> 'topics';
  assert v = '{"math": {"a": 10000, "r": 10000}, "science": {"a": 5, "r": 3}}'::jsonb,
    format('answers capped at 10,000, right never more than asked (%s)', v);

  perform public.note_device_play(ivy, 'dev-c', jsonb_build_array(pg_temp.el(-1, 0, 0,
    (select jsonb_object_agg('t' || chr(96 + g), jsonb_build_object('a', 1, 'r', 1)) from generate_series(1, 16) g), true)));
  perform public.note_device_play(ivy, 'dev-d', jsonb_build_array(pg_temp.el(-1, 0, 0,
    '{"aa": {"a": 1, "r": 1}, "ta": {"a": 2, "r": 1}}', true)));
  v := pg_temp.day(ivy, -1) -> 'topics';
  assert (select array_agg(k order by k) from jsonb_object_keys(v) k)
           = (select array_agg('t' || chr(96 + g) order by g) from generate_series(1, 16) g),
    format('16 topics: those already on the day, never a 17th (%s)', v);
  assert v -> 'ta' = '{"a": 3, "r": 2}'::jsonb, format('one already there still adds (%s)', v -> 'ta');
end $$;

-- 5) A topic's level from the latest part that has one; noted if any part
--    is, never unset.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000007a1a';
begin
  perform public.note_device_play(sam, 'old-1', jsonb_build_array(pg_temp.el(-3, 0, 0, '{"music": {"a": 2, "r": 1, "l": 3}}', false)));
  perform public.note_device_play(sam, 'new-1', jsonb_build_array(pg_temp.el(-3, 0, 0, '{"music": {"a": 1, "r": 1}}', false)));
  assert pg_temp.day(sam, -3) -> 'topics' -> 'music' = '{"a": 3, "r": 2, "l": 3}'::jsonb,
    format('the level from the part that has one, though another changed later (%s)', pg_temp.day(sam, -3));
  assert not (pg_temp.day(sam, -3) ->> 'noted')::boolean, 'no part noted: the day isn''t';
  perform public.note_device_play(sam, 'new-1', jsonb_build_array(pg_temp.el(-3, 0, 0, null, true)));
  assert (pg_temp.day(sam, -3) ->> 'noted')::boolean, 'one part noted: the day is';
  perform public.note_device_play(sam, dev, jsonb_build_array(pg_temp.el(-3, 0, 0, null, false)))
     from unnest(array['new-1', 'old-1']) dev;
  assert (pg_temp.day(sam, -3) ->> 'noted')::boolean
     and (pg_temp.parts(sam, -3) -> 'new-1' ->> 'noted')::boolean,
    format('a part sent again without "noted" stays noted (%s)', pg_temp.parts(sam, -3));
end $$;

-- 6) The window, the call's limits, and the refusals.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000007a1a';
  bea constant uuid := '00000000-0000-0000-0000-000000007b1a';
  refused text;
  t jsonb;
  dev text;
begin
  assert public.note_device_play(sam, 'tab-1', jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(-8), 'xp', 1), jsonb_build_object('day', pg_temp.d(-7), 'xp', 1),
    jsonb_build_object('day', pg_temp.d(1), 'xp', 1), jsonb_build_object('day', pg_temp.d(2), 'xp', 1),
    jsonb_build_object('day', 'today', 'xp', 1), to_jsonb(42))) = 2, 'a week back and a day ahead; the rest skipped';
  assert pg_temp.day(sam, -8) is null and pg_temp.day(sam, 2) is null, 'nothing outside the window';
  assert public.note_device_play(sam, 'tab-1', null) = 0 and public.note_device_play(sam, 'tab-1', '[]') = 0, 'nothing to note';
  foreach t in array array['{}'::jsonb, '"2026-10-21"'::jsonb] loop
    refused := null;
    begin
      perform public.note_device_play(sam, 'tab-1', t);
    exception when invalid_parameter_value then refused := sqlerrm;
    end;
    assert refused = 'days must be an array', format('%s is refused (%s)', t, refused);
  end loop;
  refused := null;
  begin
    perform public.note_device_play(sam, 'tab-1', (select jsonb_agg(jsonb_build_object('day', pg_temp.d(0))) from generate_series(1, 32)));
  exception when invalid_parameter_value then refused := sqlerrm;
  end;
  assert refused = 'too many days', 'more than 31 a call is refused';
  -- Values clamped, as 0026 clamps them.
  perform public.note_device_play(sam, 'clamp-1', jsonb_build_array(
    jsonb_build_object('day', pg_temp.d(-5), 'xp', 999999, 'minutes', -3, 'topics', '[1]'::jsonb)));
  assert pg_temp.parts(sam, -5) -> 'clamp-1' = '{"xp": 100000, "minutes": 0, "noted": false, "topics": {}}'::jsonb,
    format('a part''s values clamped (%s)', pg_temp.parts(sam, -5));

  -- Another family's kid.
  refused := null;
  begin
    perform public.note_device_play(bea, 'tab-1', jsonb_build_array(pg_temp.el(0, 1, 0, null, true)));
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not your player', format('another family''s kid is refused (%s)', refused);
  refused := null;
  begin
    perform public.note_device_play(bea, 'legacy', '[]');
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not your player', 'the kid is checked before the device';

  -- A device id: 1–64 letters, digits or dashes, never 'legacy'.
  foreach dev in array array['', 'legacy', 'LEGACY', 'Legacy', 'has space', 'a/b', 'é', 'a_b', repeat('a', 65)] loop
    refused := null;
    begin
      perform public.note_device_play(sam, dev, jsonb_build_array(pg_temp.el(0, 1, 0, null, true)));
    exception when invalid_parameter_value then refused := sqlerrm;
    end;
    assert refused = 'bad device', format('device %L is refused (%s)', dev, refused);
  end loop;
  refused := null;
  begin
    perform public.note_device_play(sam, null, jsonb_build_array(pg_temp.el(0, 1, 0, null, true)));
  exception when invalid_parameter_value then refused := sqlerrm;
  end;
  assert refused = 'bad device', 'no device is refused';
  assert public.note_device_play(sam, repeat('a', 64), jsonb_build_array(pg_temp.el(-6, 1, 0, null, true))) = 1
     and public.note_device_play(sam, 'a1B2-c3D4', jsonb_build_array(pg_temp.el(-6, 1, 0, null, true))) = 1,
    '64 characters, and a mix of letters, digits and dashes, are fine';

  -- Nobody reads or writes the parts through the API.
  foreach t in array array[
    to_jsonb($s$select count(*) from public.play_day_parts$s$::text),
    to_jsonb($s$insert into public.play_day_parts (profile_id, day, device, xp) values ('00000000-0000-0000-0000-000000007a1a', current_date, 'x', 9)$s$::text),
    to_jsonb($s$update public.play_day_parts set xp = 99999$s$::text),
    to_jsonb($s$delete from public.play_day_parts$s$::text)
  ] loop
    refused := null;
    begin
      execute t #>> '{}';
    exception when insufficient_privilege then refused := sqlerrm;
    end;
    assert refused like 'permission denied%', format('no direct access: %s', t #>> '{}');
  end loop;
end $$;

-- Signed out: no note. anon: no access at all.
select set_config('request.jwt.claims', '', true);
do $$
declare
  refused text;
begin
  begin
    perform public.note_device_play('00000000-0000-0000-0000-000000007a1a', 'tab-1', '[]');
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not signed in', 'no sign-in, no note';
end $$;
reset role;
set local role anon;
do $$
declare
  refused text;
begin
  begin
    perform count(*) from public.play_day_parts;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'anon reads no parts';
end $$;
reset role;

-- 7) The first day noted (#170) is kept by the new writer too.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "session_id": "00000000-0000-0000-0000-000000000dc1"}', true);
do $$
declare
  zoe constant uuid := '00000000-0000-0000-0000-000000007a1d';
begin
  perform public.note_device_play(zoe, 'tab-1', jsonb_build_array(pg_temp.el(0, 1, 0, null, true), pg_temp.el(-3, 1, 0, null, true)));
  assert (select since from public.play_history_since where profile_id = zoe) = current_date - 3, 'the earliest day noted';
  perform public.note_device_play(zoe, 'tab-1', jsonb_build_array(pg_temp.el(-5, 1, 0, null, true)));
  assert (select since from public.play_history_since where profile_id = zoe) = current_date - 5, 'an earlier day moves it';
end $$;
reset role;

-- 8) Parts are tidied at 35 days with the days — by any note, an old tab's
--    note_play_days too — at most 1,000 a note, the oldest first.
insert into public.play_day_parts (profile_id, day, device, xp) values
  ('00000000-0000-0000-0000-000000007b1a', current_date - 35, 'tab-9', 3),
  ('00000000-0000-0000-0000-000000007b1a', current_date - 36, 'tab-9', 3),
  ('00000000-0000-0000-0000-000000007b1a', current_date - 50, 'tab-9', 3);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "session_id": "00000000-0000-0000-0000-000000000dc1"}', true);
select public.note_device_play('00000000-0000-0000-0000-000000007a1a', 'tab-1', jsonb_build_array(pg_temp.el(0, 1, 0, null, true)));
reset role;
do $$
begin
  assert exists (select 1 from public.play_day_parts where day = current_date - 35), 'the 35th day back is kept';
  assert not exists (select 1 from public.play_day_parts where day < current_date - 35),
    'every kid''s parts older than 35 went (another family''s too)';
end $$;
insert into public.play_day_parts (profile_id, day, device)
select '00000000-0000-0000-0000-000000007b1a', current_date - 36 - g, 'tab-9' from generate_series(0, 1199) g;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "session_id": "00000000-0000-0000-0000-000000000dc1"}', true);
select public.note_play_days('00000000-0000-0000-0000-000000007a1a', array[current_date]);
reset role;
do $$
begin
  assert (select count(*) from public.play_day_parts where day < current_date - 35) = 200,
    format('an old tab''s note tidies parts too, 1,000 at most (left %s)',
           (select count(*) from public.play_day_parts where day < current_date - 35));
  assert (select min(day) from public.play_day_parts) = current_date - 36 - 199, 'the oldest go first';
end $$;
delete from public.play_day_parts where day < current_date - 35;

-- 9) Re-applying 0027 (the bundle replays every migration, after 0026)
--    changes no data.
create temp table before_rerun as
  select (select jsonb_agg(to_jsonb(d) order by profile_id, day) from public.play_days d) as days,
         (select jsonb_agg(to_jsonb(p) - 'updated_at' order by profile_id, day, device) from public.play_day_parts p) as parts;
\ir ../migrations/0026_progress_history.sql
\ir ../migrations/0027_play_day_devices.sql
do $$
begin
  assert (select days from before_rerun) = (select jsonb_agg(to_jsonb(d) order by profile_id, day) from public.play_days d),
    'the days are as they were';
  assert (select parts from before_rerun)
           = (select jsonb_agg(to_jsonb(p) - 'updated_at' order by profile_id, day, device) from public.play_day_parts p),
    'the parts are as they were';
end $$;

-- 10) Grants and settings.
do $$
declare
  f text;
begin
  assert not has_function_privilege('anon', 'public.note_device_play(uuid, text, jsonb)', 'execute'),
    'only a signed-in family notes play';
  assert has_function_privilege('authenticated', 'public.note_device_play(uuid, text, jsonb)', 'execute'), 'the app may';
  foreach f in array array['public.note_device_play(uuid, text, jsonb)', 'public.note_play_history(uuid, jsonb)'] loop
    assert (select prosecdef from pg_proc where oid = f::regprocedure), format('%s writes as the owner', f);
    assert (select proconfig from pg_proc where oid = f::regprocedure) = array['search_path=""', 'TimeZone=UTC'],
      format('%s: an empty search path, UTC', f);
  end loop;
  foreach f in array array['public.play_days_check_kid(uuid)', 'public.play_days_note(uuid, text, jsonb)',
                           'public.play_day_add_part(uuid, date, text, integer, integer, jsonb, boolean)',
                           'public.play_days_tidy()'] loop
    assert not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'),
      format('%s is internal', f);
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'public.play_day_parts'::regclass), 'parts under RLS';
  assert not exists (select 1 from pg_policies where tablename = 'play_day_parts'), 'with no policy for any API role';
  foreach f in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(f, 'public.play_day_parts', 'select')
       and not has_table_privilege(f, 'public.play_day_parts', 'insert')
       and not has_table_privilege(f, 'public.play_day_parts', 'update')
       and not has_table_privilege(f, 'public.play_day_parts', 'delete'),
      format('%s has no grant on the parts', f);
  end loop;
end $$;

-- 11) Removing a kid (and closing the account, which removes every kid —
--     close_account.test.sql) takes their parts with them; a sibling's stay.
do $$
begin
  delete from public.profiles where id = '00000000-0000-0000-0000-000000007a1b';
  assert not exists (select 1 from public.play_day_parts where profile_id = '00000000-0000-0000-0000-000000007a1b'),
    'a removed kid''s parts go';
  assert exists (select 1 from public.play_day_parts where profile_id = '00000000-0000-0000-0000-000000007a1a'),
    'their brother''s stay';
end $$;

rollback;
