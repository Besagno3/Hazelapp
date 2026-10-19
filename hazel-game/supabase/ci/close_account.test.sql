-- CI test for migration 0023 (#124b): closing an account deletes the whole
-- family — kids, saves, seen questions, reports, PINs, consent, admin row —
-- and nothing of anyone else's; today's spent question budget stays, without
-- a name, so it still counts; only the service role may call it; and the
-- login's own delete afterwards goes through. Any failed assertion raises and
-- exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b4', '{"consent_version": "2026-10-draft"}');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a4');
insert into public.questions (id, topic, level, text, options, correct_index, reviewed_by) values
  ('00000000-0000-0000-0000-00000000f001', 'math', 3, 'What is 2 + 2?', '["4","3","5","6"]', 0,
   '00000000-0000-0000-0000-0000000000a4');

-- Grown-up A: two kids (one with a save, a seen question, a report), PINs.
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
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
do $$
declare
  refused text;
begin
  begin
    perform public.delete_family('00000000-0000-0000-0000-0000000000a4');
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'a grown-up can''t call delete_family through the API';
end $$;
reset role;

-- The edge function, as the service role.
set local role service_role;
do $$
declare
  v jsonb := public.delete_family('00000000-0000-0000-0000-0000000000a4');
begin
  assert (v ->> 'kids')::int = 2, format('both kids removed (%s)', v);
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

-- Calling it again (a retry after the login delete failed) is harmless.
set local role service_role;
do $$
begin
  assert (public.delete_family('00000000-0000-0000-0000-0000000000a4') ->> 'kids')::int = 0, 'a second run finds nothing';
end $$;
reset role;

rollback;
