-- CI test for migration 0024 (#167): 👪 Grown-ups is enforced by the
-- database. A kid holding the family's sign-in (no grown-up window open on
-- it) can't add, change or remove players, set PINs, change consent or run
-- the owner's review — and can still play: XP, saves, 🚩 reports, seen
-- questions, their own PIN. The right grown-up PIN (also through the old
-- check_parent_pin), or unlock_grown_ups() on a password typed just now,
-- opens it for 15 minutes on one sign-in; it runs out, lock_grown_ups()
-- shuts it, and another sign-in's or another family's window never counts.
-- Since review round 1: only a real password check names a sign-in (made
-- within the minute, live, never the device's own — note_device_session —
-- and one sign-in each; since round 2 only a sign-in made just AFTER the
-- named one asked for a check — ask_grown_up_check — the server's own rule,
-- not the app's note), a right PIN on an ended sign-in opens nothing, and
-- every profiles column is classified (the kid's play listed, the rest a
-- grown-up's). Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.
--
-- Who's who: grown-up A (…a6) has kid Sam with a PIN, a grown-up PIN and is
-- an admin; their sign-ins are the family device (…d0) and a password check
-- (…cc), plus one that ran out (…01d). Grown-up B (…b6) is another family
-- (sign-in …bb). C (…c6) has just signed up (no player yet), D (…d6) has no
-- consent and no player. Claims are set the way PostgREST sets them
-- (`request.jwt.claims`: sub, session_id, amr).
begin;

insert into auth.users (id, raw_user_meta_data, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000a6', '{"consent_version": "2026-10-draft"}', now()),
  ('00000000-0000-0000-0000-0000000000b6', '{"consent_version": "2026-10-draft"}', now()),
  ('00000000-0000-0000-0000-0000000000c6', '{"consent_version": "2026-10-draft"}', now()),
  ('00000000-0000-0000-0000-0000000000d6', '{}', now());
insert into auth.sessions (id, user_id, not_after) values
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000a6', null),
  ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000a6', null),
  ('00000000-0000-0000-0000-00000000001d', '00000000-0000-0000-0000-0000000000a6', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b6', null),
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000c6', null),
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000d6', null);
-- A's family, set up by hand (as the database's owner, so no gate applies).
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month, has_pin) values
  ('00000000-0000-0000-0000-000000005a06', '00000000-0000-0000-0000-0000000000a6', 'Sam', 'fox', 2017, 3, true),
  ('00000000-0000-0000-0000-000000005b06', '00000000-0000-0000-0000-0000000000b6', 'Bea', 'bee', 2016, 7, true);
insert into public.kid_pins (profile_id, pin_hash) values
  ('00000000-0000-0000-0000-000000005a06', extensions.crypt('4821', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000005b06', extensions.crypt('1357', extensions.gen_salt('bf')));
insert into public.parent_pins (id, pin_hash) values
  ('00000000-0000-0000-0000-0000000000a6', extensions.crypt('9090', extensions.gen_salt('bf')));
update public.parents set has_pin = true where id = '00000000-0000-0000-0000-0000000000a6';
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a6');
insert into public.questions (id, topic, level, text, options, correct_index, status) values
  ('00000000-0000-0000-0000-00000000f006', 'math', 3, 'What is 3 + 3?', '["6","5","7","8"]', 0, 'review');

-- 1) A kid on the family device: the family's sign-in, a password sign-in an
--    hour old, no window. Every grown-up action is refused, in words.
set local role authenticated;
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a06';
  q constant uuid := '00000000-0000-0000-0000-00000000f006';
  stmts constant text[] := array[
    $s$insert into public.profiles (display_name, icon, birth_year, birth_month) values ('Kit', 'frog', 2018, 5)$s$,
    $s$delete from public.profiles where id = '00000000-0000-0000-0000-000000005a06'$s$,
    $s$update public.profiles set display_name = 'Samuel' where id = '00000000-0000-0000-0000-000000005a06'$s$,
    $s$update public.profiles set icon = 'lion' where id = '00000000-0000-0000-0000-000000005a06'$s$,
    $s$update public.profiles set birth_year = 2010 where id = '00000000-0000-0000-0000-000000005a06'$s$,
    $s$update public.profiles set birth_month = 9 where id = '00000000-0000-0000-0000-000000005a06'$s$,
    $s$update public.profiles set has_pin = false where id = '00000000-0000-0000-0000-000000005a06'$s$,
    $s$select public.set_kid_pin('00000000-0000-0000-0000-000000005a06', '0000')$s$,
    $s$select public.set_parent_pin('1111')$s$,
    $s$select public.record_consent('2026-10-draft')$s$,
    $s$select * from public.admin_review_queue()$s$,
    $s$select public.admin_review_question('00000000-0000-0000-0000-00000000f006', 'retired')$s$
  ];
  s text;
  got text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6',
    'session_id', '00000000-0000-0000-0000-0000000000d0',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 3600))
  )::text, true);
  assert not public.grown_ups_unlocked(), 'no window yet';

  foreach s in array stmts loop
    got := null;
    begin
      execute s;
    exception when others then got := sqlstate || ' ' || sqlerrm;
    end;
    assert got like 'HQ001 grown_ups_locked%', format('locked: %s (got %s)', s, coalesce(got, 'no refusal'));
  end loop;

  assert (select display_name || icon || birth_year || birth_month || has_pin from public.profiles where id = sam) = 'Samfox20173true',
    'nothing about Sam changed';
  assert (select count(*) from public.profiles where parent_id = '00000000-0000-0000-0000-0000000000a6') = 1, 'no player added or removed';

  -- The kid's own play needs no grown-up.
  update public.profiles set xp = xp + 10, level = 2, level_xp = 5, skill_levels = '{"math": 4}'::jsonb,
         power_ups = '{"strike": 1}'::jsonb, current_streak = 2, longest_streak = 2, last_played_on = current_date,
         updated_at = now()
   where id = sam;
  -- The app's push-back of a merged profile sets every column, unchanged ones too.
  update public.profiles set id = sam, birth_year = 2017, birth_month = 3, xp = xp + 1 where id = sam;
  assert (select xp from public.profiles where id = sam) = 11, 'XP saved';
  insert into public.saves (profile_id, data) values (sam, '{"version": 3, "revision": 1}');
  update public.saves set data = '{"version": 3, "revision": 2}' where profile_id = sam;
  assert (select (data ->> 'revision')::int from public.saves where profile_id = sam) = 2, 'the game saved';
  insert into public.question_flags (question_id, profile_id, reason) values (q, sam, 'confusing');
  perform public.mark_questions_seen(sam, array[q]);
  assert (public.try_kid_pin(sam, '4821') ->> 'ok')::boolean, 'a kid tries their own PIN';
  perform public.pin_lock_status();
  assert public.is_admin(), 'is_admin still answers (it only shows the page)';
end $$;

reset role;
do $$
begin
  assert exists (select 1 from public.question_views where profile_id = '00000000-0000-0000-0000-000000005a06'),
    'the kid''s seen question was written';
  assert exists (select 1 from public.question_flags where profile_id = '00000000-0000-0000-0000-000000005a06'),
    'and their report';
end $$;
set local role authenticated;

-- 2) The grown-up PIN: a wrong one opens nothing; the right one opens this
--    sign-in for 15 minutes, and then every grown-up action works.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a06';
  v jsonb;
  kit uuid;
begin
  v := public.try_parent_pin('0000');
  assert not (v ->> 'ok')::boolean and v ->> 'grown_ups_seconds' is null, 'a wrong grown-up PIN opens nothing';
  assert not public.grown_ups_unlocked(), 'still shut after a wrong PIN';
  v := public.try_parent_pin('9090');
  assert (v ->> 'ok')::boolean and (v ->> 'grown_ups_seconds')::int = 900, format('the right PIN opens it for 900 s (%s)', v);
  assert public.grown_ups_unlocked(), 'open now';

  update public.profiles set display_name = 'Samuel', icon = 'lion' where id = sam;
  perform public.set_kid_pin(sam, '2468');
  insert into public.profiles (display_name, icon, birth_year, birth_month) values ('Kit', 'frog', 2018, 5) returning id into kit;
  delete from public.profiles where id = kit;
  perform public.set_parent_pin('9090');
  perform public.record_consent('2026-10-draft');
  perform * from public.admin_review_queue();
  perform public.admin_review_question('00000000-0000-0000-0000-00000000f006', 'approved');
  assert (select display_name from public.profiles where id = sam) = 'Samuel', 'a grown-up changed Sam';

  -- Only this sign-in: A's password-check sign-in isn't open, nor is B on a
  -- session with the same id.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6', 'session_id', '00000000-0000-0000-0000-0000000000cc')::text, true);
  assert not public.grown_ups_unlocked(), 'another of A''s sign-ins stays shut';
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000b6', 'session_id', '00000000-0000-0000-0000-0000000000d0')::text, true);
  assert not public.grown_ups_unlocked(), 'another family''s window never counts';
  begin
    update public.profiles set display_name = 'Bee' where id = '00000000-0000-0000-0000-000000005b06';
    assert false, 'B changed a kid without a window';
  exception when sqlstate 'HQ001' then null;
  end;
  -- A token without a session never opens anything.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000a6')::text, true);
  assert not public.grown_ups_unlocked(), 'no session_id, no window';
end $$;
reset role;

do $$
begin
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f006') = 'approved',
    'the admin decided while it was open';
  assert (select unlocked_until from public.grown_up_unlocks
           where user_id = '00000000-0000-0000-0000-0000000000a6' and session_id = '00000000-0000-0000-0000-0000000000d0')
         = now() + interval '900 seconds', 'the window is 15 minutes from the unlock';
  -- It runs out.
  update public.grown_up_unlocks set unlocked_until = now() - interval '1 second'
   where user_id = '00000000-0000-0000-0000-0000000000a6';
end $$;

set local role authenticated;
do $$
declare
  got text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6', 'session_id', '00000000-0000-0000-0000-0000000000d0')::text, true);
  assert not public.grown_ups_unlocked(), 'a window that ran out is shut';
  begin
    perform public.set_kid_pin('00000000-0000-0000-0000-000000005a06', '1234');
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ001 grown_ups_locked%', 'locked again once it ran out';

  -- 3) The old app's check opens it too (check_parent_pin goes through
  --    try_parent_pin), and lock_grown_ups() shuts this sign-in only.
  assert public.check_parent_pin('9090'), 'the old check still answers true';
  assert public.grown_ups_unlocked(), 'and opens 👪 Grown-ups';
end $$;
reset role;
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until) values
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000cc', now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000bb', now() + interval '10 minutes');
set local role authenticated;
do $$
begin
  perform public.lock_grown_ups();
  assert not public.grown_ups_unlocked(), 'leaving 👪 Grown-ups shuts it';
end $$;
reset role;
do $$
begin
  assert exists (select 1 from public.grown_up_unlocks where user_id = '00000000-0000-0000-0000-0000000000a6'
                  and session_id = '00000000-0000-0000-0000-0000000000cc'), 'A''s other sign-in keeps its window';
  assert exists (select 1 from public.grown_up_unlocks where user_id = '00000000-0000-0000-0000-0000000000b6'),
    'B''s window is untouched';
  delete from public.grown_up_unlocks;
end $$;

-- 4) unlock_grown_ups(): only a sign-in made just now, and only for the
--    caller's own live sign-ins.
set local role authenticated;
do $$
declare
  a constant text := '00000000-0000-0000-0000-0000000000a6';
  dev constant uuid := '00000000-0000-0000-0000-0000000000d0';
  chk constant text := '00000000-0000-0000-0000-0000000000cc';
  now_s constant bigint := extract(epoch from now())::bigint;
  got text;
  v jsonb;
  -- (claims, session to open, what must happen: 'ok' or the refusal's start)
  cases constant jsonb := jsonb_build_array(
    -- No amr at all says nothing about how it signed in.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk), dev, 'HQ002 reauth_required'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk, 'amr', '[]'::jsonb), dev, 'HQ002 reauth_required'),
    -- A password two minutes old, a refresh, a time in the future.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s - 120))), dev, 'HQ002 reauth_required'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'token_refresh', 'timestamp', now_s))), dev, 'HQ002 reauth_required'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s + 3600))), dev, 'HQ002 reauth_required'),
    -- Bare names (a custom hook): a password, then the login's last sign-in
    -- must be just now (it is: set above); any other name is refused.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk, 'amr', '["otp"]'::jsonb), dev, 'HQ002 reauth_required'),
    -- An email link opened just now (a magic link, a reset link) is no
    -- password check: it names nothing.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', now_s - 5))), dev, 'HQ002 reauth_required'),
    -- A fresh password, but the device's own sign-in opening itself once the
    -- family is set up: the minute after a real sign-in is no proof.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', dev,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s))), null, 'HQ002 reauth_required'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', dev,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s))), dev, 'HQ002 reauth_required'),
    -- Naming a sign-in that isn't one of the caller's live ones.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s))),
      '00000000-0000-0000-0000-00000000dead', 'HQ002 no_session'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s))),
      '00000000-0000-0000-0000-0000000000bb', 'HQ002 no_session'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s))),
      '00000000-0000-0000-0000-00000000001d', 'HQ002 no_session'),
    -- No session in the token at all.
    jsonb_build_array(jsonb_build_object('sub', a,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s))), dev, 'HQ002 no_session'),
    -- The 👪 gate's check: a password typed just now on its own sign-in,
    -- opening the device's.
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s - 5))), dev, 'ok'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk, 'amr', '["password"]'::jsonb), dev, 'ok'),
    jsonb_build_array(jsonb_build_object('sub', a, 'session_id', chk, 'amr', '["pwd"]'::jsonb), dev, 'ok')
  );
  c jsonb;
begin
  -- The device asks for a check first, as the app does before every password
  -- check (review round 2); the cases below are sign-ins made after it.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', dev)::text, true);
  perform public.ask_grown_up_check();
  for c in select * from jsonb_array_elements(cases) loop
    perform set_config('request.jwt.claims', (c -> 0)::text, true);
    got := null;
    begin
      v := public.unlock_grown_ups(nullif(c ->> 1, '')::uuid);
      got := 'ok';
    exception when others then got := sqlstate || ' ' || sqlerrm;
    end;
    assert got like (c ->> 2) || '%', format('%s → %s, wanted %s', c -> 0, got, c ->> 2);
  end loop;
  assert (v ->> 'seconds')::int = 900, 'unlock says how long';
end $$;
reset role;
do $$
begin
  assert exists (select 1 from public.grown_up_unlocks where user_id = '00000000-0000-0000-0000-0000000000a6'
                  and session_id = '00000000-0000-0000-0000-0000000000d0' and unlocked_until > now()),
    'the gate''s check opened the device''s sign-in';
  assert not exists (select 1 from public.grown_up_unlocks where session_id = '00000000-0000-0000-0000-0000000000cc'),
    'and not its own throwaway one';
  -- A bare "password" needs the last sign-in just now.
  update auth.users set last_sign_in_at = now() - interval '10 minutes' where id = '00000000-0000-0000-0000-0000000000a6';
end $$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6', 'session_id', '00000000-0000-0000-0000-0000000000cc',
    'amr', '["password"]'::jsonb)::text, true);
  begin
    perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d0');
    assert false, 'a bare "password" with an old last sign-in opened it';
  exception when sqlstate 'HQ002' then null;
  end;
end $$;

-- 5) The first-run flow: right after signing up (or in) the sign-in may open
--    itself while the family is being set up — by a password or an email
--    link opened just now — and not once it's set up.
do $$
declare
  c constant text := '00000000-0000-0000-0000-0000000000c6';
  c_sess constant text := '00000000-0000-0000-0000-0000000000c0';
  now_s constant bigint := extract(epoch from now())::bigint;
  kid uuid;
  got text;
begin
  -- Not just now (two minutes ago, a reload): even a family being set up isn't opened.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'session_id', c_sess,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s - 120)))::text, true);
  begin
    perform public.unlock_grown_ups();
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 reauth_required%', format('a first run opens only on a sign-in made just now (%s)', got);
  got := null;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'session_id', c_sess,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s - 3)))::text, true);
  perform public.unlock_grown_ups();
  assert public.grown_ups_unlocked(), 'a new family''s fresh sign-in opens itself';
  insert into public.profiles (display_name, icon, birth_year, birth_month) values ('Ada', 'owl', 2017, 1) returning id into kid;
  perform public.set_kid_pin(kid, '4321');
  -- Set up now: the same fresh sign-in can't open itself again.
  begin
    perform public.unlock_grown_ups();
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 reauth_required%', format('a set-up family''s sign-in can''t open itself (%s)', got);

  -- A first-run sign-in that has ended (signed out, or ended by a password
  -- change elsewhere — its token lives on) opens nothing (#167 review round 1).
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000d6', 'session_id', '00000000-0000-0000-0000-0000000000de',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s - 3)))::text, true);
  got := null;
  begin
    perform public.unlock_grown_ups();
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 no_session%', format('an ended first-run sign-in opens nothing (%s)', got);

  -- D: no consent yet, signed in from a sign-up confirmation link a moment ago.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000d6', 'session_id', '00000000-0000-0000-0000-0000000000dd',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', now_s - 10)))::text, true);
  perform public.unlock_grown_ups();
  perform public.record_consent('2026-10-draft');
  assert (select consent_at is not null from public.parents where id = '00000000-0000-0000-0000-0000000000d6'),
    'a new family agrees right after the email link';
end $$;
reset role;

-- 6) No client reads or writes the windows, or calls the helpers; the insert
--    policy and the players' trigger both ask for the window.
do $$
declare
  f text;
begin
  foreach f in array array['public.grown_up_unlocks', 'public.grown_up_sessions', 'public.grown_up_password_changes'] loop
    assert not has_table_privilege('authenticated', f, 'select'), f || ' can''t be read';
    assert not has_table_privilege('authenticated', f, 'insert'), f || ' can''t be written';
    assert not has_table_privilege('authenticated', f, 'update'), f || ' can''t be changed';
    assert not has_table_privilege('anon', f, 'select'), f || ': not by anon either';
  end loop;
  foreach f in array array['public.grown_up_open(uuid, uuid)', 'public.require_grown_up()', 'public.grown_up_first_run(uuid)',
                           'public.grown_up_signed_in_freshly()', 'public.jwt_session_id()', 'public.delete_family(uuid, uuid, uuid)',
                           'public.grown_up_session_live(uuid, uuid)', 'public.grown_up_password_wait(uuid)',
                           'public.grown_up_refuse_password_wait(timestamptz)', 'public.grown_up_check_refusal(uuid)',
                           'public.grown_up_reset_sign_in()',
                           'public.grown_up_password_wait_seconds()', 'public.grown_up_note_password_change()'] loop
    assert not has_function_privilege('authenticated', f, 'execute'), f || ' is the database''s own';
  end loop;
  foreach f in array array['public.unlock_grown_ups(uuid)', 'public.lock_grown_ups()', 'public.grown_ups_unlocked()',
                           'public.note_device_session()', 'public.ask_grown_up_check()',
                           'public.allow_password_change(uuid)', 'public.drop_password_change()'] loop
    assert not has_function_privilege('anon', f, 'execute'), f || ' needs a sign-in';
    assert has_function_privilege('authenticated', f, 'execute'), f || ' is the app''s';
  end loop;
  assert (select with_check from pg_policies where schemaname = 'public' and tablename = 'profiles'
           and policyname = 'Grown-ups add kids') like '%grown_ups_unlocked()%', 'adding a player asks for the window';
  assert exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
                  and tgname = 'profiles_grown_up_gate' and tgenabled <> 'D'), 'the players'' gate is on';
  assert (select prosecdef from pg_proc where oid = 'public.grown_ups_unlocked()'::regprocedure), 'the check reads the table as its owner';
  assert (select proconfig from pg_proc where oid = 'public.grown_ups_unlocked()'::regprocedure) = array['search_path=""'],
    'with its search path pinned';
end $$;
set local role authenticated;
do $$
declare
  got text;
begin
  begin
    perform 1 from public.grown_up_unlocks;
  exception when others then got := sqlerrm;
  end;
  assert got like '%permission denied%', 'a kid can''t read the windows';
  got := null;
  begin
    insert into public.grown_up_unlocks (user_id, session_id, unlocked_until)
      values ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000d0', now() + interval '1 day');
  exception when others then got := sqlerrm;
  end;
  assert got like '%permission denied%', 'nor open one by hand';
end $$;
reset role;

-- 7) Only a real password check names a sign-in (#167 review round 1). The
--    family's app notes the sign-in it runs on (note_device_session, as it
--    loads the family): that sign-in can't name another — however fresh,
--    so the minute after a grown-up signs in on the family device can't be
--    used to open a second live sign-in (another browser) or close the
--    account. A check is a session made within the minute that is still
--    live, and it names one sign-in.
insert into auth.sessions (id, user_id, created_at, not_after) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a6', now(), null),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a6', now(), null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a6', now() - interval '2 minutes', null);
delete from public.grown_up_unlocks;
set local role authenticated;
do $$
declare
  a constant text := '00000000-0000-0000-0000-0000000000a6';
  dev constant uuid := '00000000-0000-0000-0000-0000000000d0';
  other constant uuid := '00000000-0000-0000-0000-0000000000e2';
  now_s constant bigint := extract(epoch from now())::bigint;
  fresh jsonb;
  got text;
  -- (session the token belongs to, session it names, what must happen)
  cases constant jsonb := jsonb_build_array(
    -- The device's own sign-in, a password typed this second, noted by the app: no.
    jsonb_build_array('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000e2', 'HQ002 reauth_required'),
    -- A new check names the other sign-in…
    jsonb_build_array('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e2', 'ok'),
    -- …the same one again is fine (a retry)…
    jsonb_build_array('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e2', 'ok'),
    -- …but not a second one.
    jsonb_build_array('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d0', 'HQ002 reauth_required'),
    -- Section 4's check already opened the device: it can't open another.
    jsonb_build_array('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000e2', 'HQ002 reauth_required'),
    -- A sign-in made two minutes ago, however its token reads, is no check.
    jsonb_build_array('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000d0', 'HQ002 reauth_required'),
    -- Nor one that has been signed out (gone from auth.sessions), or that ran out.
    jsonb_build_array('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000d0', 'HQ002 reauth_required'),
    jsonb_build_array('00000000-0000-0000-0000-00000000001d', '00000000-0000-0000-0000-0000000000d0', 'HQ002 reauth_required')
  );
  c jsonb;
begin
  fresh := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', dev, 'amr', fresh)::text, true);
  perform public.note_device_session();
  -- The other browser asks for a check before each case's sign-in.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', other)::text, true);
  perform public.ask_grown_up_check();
  for c in select * from jsonb_array_elements(cases) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', c ->> 0, 'amr', fresh)::text, true);
    got := null;
    begin
      perform public.unlock_grown_ups((c ->> 1)::uuid);
      got := 'ok';
    exception when others then got := sqlstate || ' ' || sqlerrm;
    end;
    assert got like (c ->> 2) || '%', format('%s naming %s → %s, wanted %s', c ->> 0, c ->> 1, got, c ->> 2);
  end loop;
  -- The device's own sign-in still opens itself only in the first run (A is set up).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', dev, 'amr', fresh)::text, true);
  begin
    perform public.unlock_grown_ups();
    assert false, 'a set-up family''s noted device opened itself';
  exception when sqlstate 'HQ002' then null;
  end;
  -- A no-session token notes nothing (and doesn't fail).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a)::text, true);
  perform public.note_device_session();
end $$;
reset role;
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000000a6';
begin
  assert (select kind from public.grown_up_sessions where user_id = a and session_id = '00000000-0000-0000-0000-0000000000d0') = 'device',
    'the device''s sign-in is noted';
  assert (select target from public.grown_up_sessions where user_id = a and session_id = '00000000-0000-0000-0000-0000000000c2')
         = '00000000-0000-0000-0000-0000000000e2', 'the check remembers the one sign-in it opened';
  assert exists (select 1 from public.grown_up_unlocks where user_id = a and session_id = '00000000-0000-0000-0000-0000000000e2'),
    'the check opened the other sign-in';
  assert not exists (select 1 from public.grown_up_unlocks where user_id = a and session_id = '00000000-0000-0000-0000-0000000000d0'),
    'nothing here opened the device';
  -- The check signs out; the next family load tidies its note away.
  delete from auth.sessions where id = '00000000-0000-0000-0000-0000000000c2';
end $$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6', 'session_id', '00000000-0000-0000-0000-0000000000d0')::text, true);
  perform public.note_device_session();
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.grown_up_sessions where session_id = '00000000-0000-0000-0000-0000000000c2'),
    'a signed-out check''s note is tidied';
  assert exists (select 1 from public.grown_up_sessions where session_id = '00000000-0000-0000-0000-0000000000d0'),
    'the live device''s stays';
end $$;

-- 7c) Review round 2: a check is a sign-in made just AFTER the sign-in it
--     names asked for one (ask_grown_up_check) — a rule the database keeps
--     with its own clock, so a device's sign-in the app never noted (an old
--     tab, a note that failed) still can't pass for a check: it was made
--     before any ask. …u1 is such a sign-in: a password typed 20 s ago, never
--     noted. …a1 is a live sign-in that never asks; …e3 asked over a minute ago.
insert into auth.sessions (id, user_id, created_at, not_after) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a6', now() - interval '20 seconds', null),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a6', now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a6', now(), null);
insert into public.grown_up_sessions (user_id, session_id, kind, asked_at) values
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000e3', 'device', now() - interval '61 seconds');
delete from public.grown_up_sessions where session_id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated;
do $$
declare
  a constant text := '00000000-0000-0000-0000-0000000000a6';
  now_s constant bigint := extract(epoch from now())::bigint;
  got text;
  t uuid;
begin
  -- The other browser (…e2) asks now; the un-noted sign-in …e1 was made 20 s
  -- before, with a password typed then: it can't open …e2.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', '00000000-0000-0000-0000-0000000000e2')::text, true);
  perform public.ask_grown_up_check();
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', '00000000-0000-0000-0000-0000000000e1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s - 20)))::text, true);
  got := null;
  begin
    perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000e2');
    got := 'ok';
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 reauth_required%', format('a sign-in made before the ask is no check, noted or not (%s)', got);
  -- A fresh check naming a sign-in that never asked, or asked over a minute ago.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', '00000000-0000-0000-0000-0000000000c5',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s)))::text, true);
  foreach t in array array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3']::uuid[] loop
    got := null;
    begin
      perform public.unlock_grown_ups(t);
      got := 'ok';
    exception when others then got := sqlstate || ' ' || sqlerrm;
    end;
    assert got like 'HQ002 reauth_required%', format('naming %s, which asked for no check just now (%s)', t, got);
  end loop;
  -- …c5 opens …e2 (which asked); then it asks itself, so it's a device's
  -- now and opens nothing more, not even …e2 again.
  perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000e2');
  perform public.ask_grown_up_check();
  got := null;
  begin
    perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000e2');
    got := 'ok';
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 reauth_required%', format('a check that asks is a device''s from then on (%s)', got);
  -- A sign-in that has ended can't ask.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', '00000000-0000-0000-0000-00000000001d')::text, true);
  got := null;
  begin
    perform public.ask_grown_up_check();
    got := 'ok';
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 no_session%', format('an ended sign-in can''t ask (%s)', got);
  -- Asking makes a sign-in a device's: …e2, which asked, is no check itself.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'session_id', '00000000-0000-0000-0000-0000000000e2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', now_s)))::text, true);
  got := null;
  begin
    perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d0');
    got := 'ok';
  exception when others then got := sqlstate || ' ' || sqlerrm;
  end;
  assert got like 'HQ002 reauth_required%', format('a sign-in that asked is no check (%s)', got);
end $$;
reset role;
do $$
begin
  assert (select asked_at = now() and kind = 'device' from public.grown_up_sessions
           where session_id = '00000000-0000-0000-0000-0000000000e2'), 'the ask is noted on the device''s row';
  assert not exists (select 1 from public.grown_up_unlocks where session_id in
           ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3')),
    'nothing opened a sign-in that didn''t ask';
end $$;

-- 7b) The right grown-up PIN on a sign-in that has ended (a password change
--     elsewhere signs the others out; its token lives on for up to an hour)
--     opens nothing, and says so; the try still counts.
set local role authenticated;
do $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6', 'session_id', '00000000-0000-0000-0000-00000000005e')::text, true);
  v := public.try_parent_pin('9090');
  assert (v ->> 'ok')::boolean and (v ->> 'signed_out')::boolean and v ->> 'grown_ups_seconds' is null,
    format('a right PIN on an ended sign-in: ok, signed out, nothing opened (%s)', v);
  assert not public.grown_ups_unlocked(), 'nothing opened';
end $$;
reset role;

-- 8) Every profiles column is classified (#167 review round 1): the gate
--    lists the kid's play columns, so anything else is a grown-up's. A new
--    column fails here until it's put on one list — profiles_kid_play_columns()
--    in the migration, or the grown-up list below.
do $$
declare
  grown_up constant text[] := array['id', 'parent_id', 'display_name', 'icon', 'birth_year', 'birth_month', 'has_pin', 'created_at'];
  cols text[];
  listed text[];
begin
  select array_agg(column_name::text order by column_name::text) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'profiles';
  select array_agg(c order by c) into listed from unnest(public.profiles_kid_play_columns() || grown_up) c;
  assert cols = listed,
    format('every profiles column must be kid play (profiles_kid_play_columns) or a grown-up''s (this test): table %s, listed %s', cols, listed);
  assert not (public.profiles_kid_play_columns() && grown_up), 'no column is on both lists';
end $$;
-- …and one added later is a grown-up's until someone lists it.
alter table public.profiles add column screen_minutes integer;
delete from public.grown_up_unlocks;
set local role authenticated;
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a06';
  s text;
  got text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a6', 'session_id', '00000000-0000-0000-0000-0000000000d0')::text, true);
  foreach s in array array[
    'update public.profiles set screen_minutes = 600 where id = ''00000000-0000-0000-0000-000000005a06''',
    'update public.profiles set created_at = now() - interval ''1 year'' where id = ''00000000-0000-0000-0000-000000005a06'''
  ] loop
    got := null;
    begin
      execute s;
    exception when others then got := sqlstate || ' ' || sqlerrm;
    end;
    assert got like 'HQ001 grown_ups_locked%', format('a kid can''t: %s (got %s)', s, coalesce(got, 'no refusal'));
  end loop;
  -- Play still saves with the new column there.
  update public.profiles set xp = xp + 1, updated_at = now() where id = sam;
end $$;
reset role;

rollback;
