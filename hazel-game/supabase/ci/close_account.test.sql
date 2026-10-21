-- CI test for migration 0023 (#124b): closing an account deletes the whole
-- family — kids, saves, seen questions, reports, PINs, consent, admin row —
-- and nothing of anyone else's; today's spent question budget stays, without
-- a name, so it still counts; only the service role may call it; and the
-- login's own delete afterwards goes through. Since 0024 (#167) the session
-- the app names must have 👪 Grown-ups open, or nothing goes, and the token
-- that asks (its session, `p_caller`) must be a password check — never a
-- sign-in the family's app runs on (#167 review round 1), and since review
-- round 2 one the database itself recorded opening that session (an
-- allow-list, not a note the app sends) — and not while a password changed
-- without a check waits out its day. Any failed assertion raises and exits
-- non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b4', '{"consent_version": "2026-10-draft"}');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a4');
insert into public.questions (id, topic, level, text, options, correct_index, reviewed_by) values
  ('00000000-0000-0000-0000-00000000f001', 'math', 3, 'What is 2 + 2?', '["4","3","5","6"]', 0,
   '00000000-0000-0000-0000-0000000000a4');

-- Grown-up A: two kids (one with a save, a seen question, a report), PINs.
-- 👪 Grown-ups is open on this session for every grown-up here (#167,
-- migration 0024): the grown-up actions below need it.
-- grown_ups_gate.test.sql tests the gate itself.
select set_config('request.jwt.claims', '{"session_id": "00000000-0000-0000-0000-00000000c167"}', true);
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until)
  select id, '00000000-0000-0000-0000-00000000c167', now() + interval '1 hour' from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a04', 'Sam', 'fox', 2017, 3),
  ('00000000-0000-0000-0000-000000005a05', 'Kit', 'frog', 2018, 5);
select public.set_kid_pin('00000000-0000-0000-0000-000000005a04', '4821');
select public.set_parent_pin('9090');
insert into public.saves (profile_id, data) values
  ('00000000-0000-0000-0000-000000005a04', '{"version": 3, "revision": 1}');
insert into public.question_flags (question_id, profile_id, reason) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000005a04', 'confusing');

-- Grown-up B: one kid, a save — none of it may go.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b4', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005b04', 'Bea', 'bee', 2016, 7);
select public.set_kid_pin('00000000-0000-0000-0000-000000005b04', '1357');
insert into public.saves (profile_id, data) values
  ('00000000-0000-0000-0000-000000005b04', '{"version": 3, "revision": 1}');
reset role;

-- Seen questions and the request log are written by the service side.
insert into public.question_views (profile_id, question_id) values
  ('00000000-0000-0000-0000-000000005a04', '00000000-0000-0000-0000-00000000f001'),
  ('00000000-0000-0000-0000-000000005b04', '00000000-0000-0000-0000-00000000f001');
insert into public.question_requests (profile_id, parent_id, fresh_count, requested_at) values
  -- Sam spent 6 today (counts for a day), 0 an hour ago, 3 two days ago.
  ('00000000-0000-0000-0000-000000005a04', '00000000-0000-0000-0000-0000000000a4', 6, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000005a04', '00000000-0000-0000-0000-0000000000a4', 0, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000005a04', '00000000-0000-0000-0000-0000000000a4', 3, now() - interval '2 days'),
  -- A kid A removed earlier: today's 5 still count, last week's 2 don't.
  (null, '00000000-0000-0000-0000-0000000000a4', 5, now() - interval '2 hours'),
  (null, '00000000-0000-0000-0000-0000000000a4', 2, now() - interval '7 days'),
  -- Bea's.
  ('00000000-0000-0000-0000-000000005b04', '00000000-0000-0000-0000-0000000000b4', 4, now() - interval '1 hour');

-- No signed-in grown-up can call it, not even on themselves.
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until)
  select id, '00000000-0000-0000-0000-00000000c167', now() + interval '1 hour' from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
do $$
declare
  refused text;
begin
  begin
    perform public.delete_family('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c167',
                                 '00000000-0000-0000-0000-0000000c4ec4');
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'a grown-up can''t call delete_family through the API';
end $$;
reset role;

-- 👪 Grown-ups must be open on the session the app names (#167): with none
-- named, one that isn't open, one that ran out, or one only open for another
-- family, nothing goes. (B has a session of their own open.) And the asking
-- token's session must be a password check: none named (an old function) or
-- one the family's app runs on (the device's own fresh sign-in, noted by
-- note_device_session) is refused even with the window open.
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until) values
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-00000000b0b0', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000a01d', now() - interval '1 second');
insert into public.grown_up_sessions (user_id, session_id, kind) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c167', 'device');
set local role service_role;
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000000a4';
  chk constant uuid := '00000000-0000-0000-0000-0000000c4ec4';
  refused text;
  tries constant uuid[] := array[
    null,
    '00000000-0000-0000-0000-00000000dead',  -- not open
    '00000000-0000-0000-0000-00000000a01d',  -- ran out a second ago
    '00000000-0000-0000-0000-00000000b0b0'   -- open, but B's
  ]::uuid[];
  t uuid;
begin
  foreach t in array tries loop
    refused := null;
    begin
      perform public.delete_family(a, t, chk);
    exception when others then refused := sqlstate || ' ' || sqlerrm;
    end;
    assert refused like 'HQ001 grown_ups_locked%', format('session %s: refused as locked (%s)', t, refused);
  end loop;
  -- The window is open on c167, but the asker isn't a password check.
  foreach t in array array[null, '00000000-0000-0000-0000-00000000c167']::uuid[] loop
    refused := null;
    begin
      perform public.delete_family(a, '00000000-0000-0000-0000-00000000c167', t);
    exception when others then refused := sqlstate || ' ' || sqlerrm;
    end;
    assert refused like 'HQ002 reauth_required%', format('asked from %s: refused (%s)', t, refused);
  end loop;
  refused := null;
  begin
    perform public.delete_family(a, '00000000-0000-0000-0000-00000000c167');
  exception when others then refused := sqlstate || ' ' || sqlerrm;
  end;
  assert refused like 'HQ002 reauth_required%', 'a two-argument call (the first draft''s function) is refused';
  -- Review round 2: a fresh sign-in the app never noted (an old tab, a note
  -- that failed) is no check either: the database never recorded it opening
  -- c167.
  refused := null;
  begin
    perform public.delete_family(a, '00000000-0000-0000-0000-00000000c167', chk);
  exception when others then refused := sqlstate || ' ' || sqlerrm;
  end;
  assert refused like 'HQ002 reauth_required%', format('a caller never recorded opening c167: refused (%s)', refused);
  assert (select count(*) from public.profiles where parent_id = a) = 2, 'nothing of A''s went';
end $$;
reset role;

-- The checks the database recorded (unlock_grown_ups writes these as a
-- password check opens a sign-in): c4ec4 opened c167; c0de opened another.
insert into public.grown_up_sessions (user_id, session_id, kind, target) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000c4ec4', 'check', '00000000-0000-0000-0000-00000000c167'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c0de', 'check', '00000000-0000-0000-0000-00000000beef');
set local role service_role;
do $$
declare
  refused text;
begin
  begin
    perform public.delete_family('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c167',
                                 '00000000-0000-0000-0000-00000000c0de');
  exception when others then refused := sqlstate || ' ' || sqlerrm;
  end;
  assert refused like 'HQ002 reauth_required%', format('a check that opened another sign-in can''t close it (%s)', refused);
  assert (select count(*) from public.profiles where parent_id = '00000000-0000-0000-0000-0000000000a4') = 2, 'nothing went';
end $$;
reset role;

-- Review round 2: a password changed without a check (the wait, 0024 §9) —
-- that password is the one in doubt, so it can't close the account for its
-- day, however 👪 Grown-ups was opened. Nothing goes; the refusal says when.
insert into public.grown_up_password_changes (user_id, changed_at, unchecked_at)
  values ('00000000-0000-0000-0000-0000000000a4', now(), now());
set local role service_role;
do $$
declare
  refused text;
  detail text;
begin
  begin
    perform public.delete_family('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c167',
                                 '00000000-0000-0000-0000-0000000c4ec4');
  exception when others then
    get stacked diagnostics refused = returned_sqlstate, detail = pg_exception_detail;
    refused := refused || ' ' || sqlerrm;
  end;
  assert refused like 'HQ002 password_changed%', format('closing during the wait is refused (%s)', refused);
  assert detail = to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    format('and says when the wait ends (%s)', detail);
  assert (select count(*) from public.profiles where parent_id = '00000000-0000-0000-0000-0000000000a4') = 2,
    'nothing of A''s went during the wait';
end $$;
reset role;
update public.grown_up_password_changes set unchecked_at = now() - interval '25 hours'
 where user_id = '00000000-0000-0000-0000-0000000000a4';

-- The edge function, as the service role, naming the open session.
set local role service_role;
do $$
declare
  v jsonb := public.delete_family('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c167',
                                  '00000000-0000-0000-0000-0000000c4ec4');
begin
  assert (v ->> 'kids')::int = 2, format('both kids removed (%s)', v);
  -- Calling it again (a retry after the login delete failed) is harmless:
  -- the window is still open and there's nothing left to delete.
  assert (public.delete_family('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c167',
                               '00000000-0000-0000-0000-0000000c4ec4') ->> 'kids')::int = 0,
    'a second run finds nothing';
end $$;
reset role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000000a4';
  sam constant uuid := '00000000-0000-0000-0000-000000005a04';
  kit constant uuid := '00000000-0000-0000-0000-000000005a05';
begin
  assert not exists (select 1 from public.profiles where parent_id = a), 'no kid of A''s is left';
  assert not exists (select 1 from public.saves where profile_id in (sam, kit)), 'their saves are gone';
  assert not exists (select 1 from public.kid_pins where profile_id in (sam, kit)), 'their PINs are gone';
  assert not exists (select 1 from public.question_views where profile_id in (sam, kit)), 'their seen questions are gone';
  assert not exists (select 1 from public.question_flags where profile_id in (sam, kit)), 'their reports are gone';
  assert not exists (select 1 from public.parent_pins where id = a), 'the grown-up PIN is gone';
  assert not exists (select 1 from public.parents where id = a), 'the consent row is gone';
  assert not exists (select 1 from public.admins where user_id = a), 'the admin row is gone';
  assert (select reviewed_by is null from public.questions where id = '00000000-0000-0000-0000-00000000f001'),
    'their name is off the questions they reviewed (the question stays)';

  -- Today's spend stays, nameless, and still counts; the rest went.
  assert not exists (select 1 from public.question_requests where profile_id in (sam, kit)), 'no request names a removed kid';
  assert (select coalesce(sum(fresh_count), 0) from public.question_requests where parent_id = a) = 11,
    format('only today''s 6 + 5 spent stay (got %s)',
           (select coalesce(sum(fresh_count), 0) from public.question_requests where parent_id = a));
  assert (select count(*) from public.question_requests where parent_id = a) = 2, 'nothing-spent and old rows went';
end $$;

-- Grown-up B's family is untouched.
do $$
declare
  b constant uuid := '00000000-0000-0000-0000-0000000000b4';
  bea constant uuid := '00000000-0000-0000-0000-000000005b04';
begin
  assert exists (select 1 from public.profiles where id = bea and parent_id = b), 'B''s kid stays';
  assert exists (select 1 from public.saves where profile_id = bea), 'B''s save stays';
  assert exists (select 1 from public.kid_pins where profile_id = bea), 'B''s kid''s PIN stays';
  assert exists (select 1 from public.question_views where profile_id = bea), 'B''s seen questions stay';
  assert exists (select 1 from public.parents where id = b), 'B''s consent stays';
  assert (select sum(fresh_count) from public.question_requests where parent_id = b) = 4, 'B''s request log stays';
end $$;

-- Then the login itself goes (the admin API's delete): nothing blocks it, and
-- the day's spend stays, unlinked from anyone.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a4';
do $$
begin
  assert (select coalesce(sum(fresh_count), 0) from public.question_requests
           where parent_id is null and profile_id is null and requested_at > now() - interval '1 day') >= 11,
    'today''s spend still counts toward the project''s day, with no name on it';
end $$;

-- …and A's 👪 windows went with the login.
do $$
begin
  assert not exists (select 1 from public.grown_up_unlocks where user_id = '00000000-0000-0000-0000-0000000000a4'),
    'no 👪 window outlives the login';
  assert not exists (select 1 from public.grown_up_sessions where user_id = '00000000-0000-0000-0000-0000000000a4'),
    'nor a note of its sign-ins';
end $$;

rollback;
