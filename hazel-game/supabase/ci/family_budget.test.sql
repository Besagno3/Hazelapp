-- CI test for migration 0018 (a question budget per family, Act I launch
-- review B9): a family's kids share a daily cap of fresh questions; removing
-- a kid keeps what they spent on the books; each request records its
-- grown-up. Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.
begin;

-- Grown-ups A and B, each with an old-app first kid (the kid has the login's id).
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', '{"birth_year": 2017, "birth_month": 3}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"birth_year": 2016, "birth_month": 9}');
-- A second kid for A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month)
  values ('00000000-0000-0000-0000-00000000a302', 'Kit', 'panda', 2019, 8);
reset role;

set local role service_role;
do $$
declare
  a_kid1 constant uuid := '00000000-0000-0000-0000-0000000000a3';
  a_kid2 constant uuid := '00000000-0000-0000-0000-00000000a302';
  b_kid  constant uuid := '00000000-0000-0000-0000-0000000000b3';
  r record;
begin
  -- Per kid 10, per family 15, project 1000.
  select * into r from public.begin_question_request(a_kid1, 100, 10, 1000, 15);
  assert r.allowed and r.fresh_allowance = 10, format('a fresh family: the kid''s own 10, got %s', r);
  assert (select parent_id from public.question_requests where id = r.request_id) = a_kid1,
    'the request records the kid''s grown-up';
  update public.question_requests set fresh_count = 10 where id = r.request_id;

  select * into r from public.begin_question_request(a_kid2, 100, 10, 1000, 15);
  assert r.allowed and r.fresh_allowance = 5, format('the sister shares the family''s 15: 5 left, got %s', r);
  select * into r from public.begin_question_request(b_kid, 100, 10, 1000, 15);
  assert r.allowed and r.fresh_allowance = 10, format('another family is untouched, got %s', r);

  -- No family cap passed (an older caller): per kid only.
  select * into r from public.begin_question_request(a_kid2, 100, 10, 1000);
  assert r.allowed and r.fresh_allowance = 10, format('without a family cap, the kid''s own 10, got %s', r);
end $$;
reset role;

-- Remove the kid who spent, add a new one: the spend still counts.
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month)
  values ('00000000-0000-0000-0000-00000000a303', 'New', 'owl', 2018, 1);
reset role;

set local role service_role;
do $$
declare
  a_kid3 constant uuid := '00000000-0000-0000-0000-00000000a303';
  r record;
begin
  assert exists (select 1 from public.question_requests
                  where profile_id is null and parent_id = '00000000-0000-0000-0000-0000000000a3' and fresh_count = 10),
    'a removed kid''s request stays, unlinked, with its grown-up and spend';
  select * into r from public.begin_question_request(a_kid3, 100, 10, 1000, 15);
  assert r.allowed and r.fresh_allowance = 5, format('remove-and-re-add doesn''t reset the family''s day, got %s', r);
  -- …nor the project's.
  select * into r from public.begin_question_request(a_kid3, 100, 10, 12, null);
  assert r.allowed and r.fresh_allowance = 2, format('the project still counts the removed kid''s 10, got %s', r);

  -- A day later it all rolls off.
  update public.question_requests set requested_at = now() - interval '2 days';
  select * into r from public.begin_question_request(a_kid3, 100, 10, 1000, 15);
  assert r.allowed and r.fresh_allowance = 10, format('the family''s budget resets after a day, got %s', r);
end $$;
reset role;

-- Removing the grown-up's login unlinks their requests too.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a3';
do $$
begin
  assert not exists (select 1 from public.question_requests where parent_id = '00000000-0000-0000-0000-0000000000a3'),
    'no request keeps a removed grown-up''s id';
  assert not has_function_privilege('anon', 'public.begin_question_request(uuid,integer,integer,integer,integer)', 'execute'),
    'anon must not execute begin_question_request';
  assert not has_function_privilege('authenticated', 'public.begin_question_request(uuid,integer,integer,integer,integer)', 'execute'),
    'authenticated must not execute begin_question_request';
  assert has_function_privilege('service_role', 'public.begin_question_request(uuid,integer,integer,integer,integer)', 'execute'),
    'service_role must execute begin_question_request';
end $$;

rollback;
