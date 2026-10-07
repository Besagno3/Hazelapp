-- CI test for migration 0009 (begin_question_request). Run after the stub and
-- every migration have been applied; any failed assertion raises and exits
-- non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

-- Birth-date metadata is required by the 0001 sign-up trigger.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"birth_year": 2017, "birth_month": 3}'),
  ('00000000-0000-0000-0000-00000000000b', '{"birth_year": 2016, "birth_month": 9}');

set local role service_role;

do $$
declare
  p1 constant uuid := '00000000-0000-0000-0000-00000000000a';
  p2 constant uuid := '00000000-0000-0000-0000-00000000000b';
  r record;
begin
  -- Rate limit: 3 calls per minute pass, the 4th is refused.
  for i in 1..3 loop
    select * into r from begin_question_request(p1, 3, 10, 15);
    assert r.allowed and r.fresh_allowance = 10 and r.request_id is not null,
      format('call %s should pass with allowance 10, got %s', i, r);
  end loop;
  select * into r from begin_question_request(p1, 3, 10, 15);
  assert not r.allowed and r.fresh_allowance = 0 and r.request_id is null,
    format('4th call in a minute must be refused, got %s', r);

  -- Per-player daily budget: 12 fresh already used against a cap of 10.
  update question_requests set fresh_count = 4 where profile_id = p1;
  select * into r from begin_question_request(p1, 100, 10, 15);
  assert r.allowed and r.fresh_allowance = 0,
    format('player over daily budget gets 0 fresh, got %s', r);

  -- Project-wide budget: 12 of 15 used overall, so a fresh player gets 3.
  select * into r from begin_question_request(p2, 100, 10, 15);
  assert r.allowed and r.fresh_allowance = 3,
    format('global budget should leave 3 fresh, got %s', r);

  -- Windows roll: calls older than a day stop counting.
  update question_requests set requested_at = now() - interval '2 days';
  select * into r from begin_question_request(p1, 3, 10, 15);
  assert r.allowed and r.fresh_allowance = 10,
    format('budget should reset after a day, got %s', r);
end $$;

reset role;

-- Clients must never call it (they could burn someone else's quota).
do $$
begin
  assert not has_function_privilege('anon', 'public.begin_question_request(uuid,integer,integer,integer)', 'execute'),
    'anon must not execute begin_question_request';
  assert not has_function_privilege('authenticated', 'public.begin_question_request(uuid,integer,integer,integer)', 'execute'),
    'authenticated must not execute begin_question_request';
  assert has_function_privilege('service_role', 'public.begin_question_request(uuid,integer,integer,integer)', 'execute'),
    'service_role must execute begin_question_request';
end $$;

rollback;
