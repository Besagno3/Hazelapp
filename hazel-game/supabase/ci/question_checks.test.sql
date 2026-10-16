-- CI test for migration 0018 (#146): a report claims a question for one check —
-- only the reporting family's report since the last check counts, retired
-- questions never, and a family over its daily cap waits; the sweep (no
-- family) takes any unchecked report with no cap; pending_report_checks lists
-- what's left; none of it is reachable from the app's roles. Any failed
-- assertion raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a8', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b8', '{"consent_version": "2026-10-draft"}');
-- Family A has two kids, family B one.
insert into public.profiles (id, parent_id, display_name, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a81', '00000000-0000-0000-0000-0000000000a8', 'Ari', 2016, 2),
  ('00000000-0000-0000-0000-000000005a82', '00000000-0000-0000-0000-0000000000a8', 'Bo',  2018, 6),
  ('00000000-0000-0000-0000-000000005b81', '00000000-0000-0000-0000-0000000000b8', 'Cy',  2015, 9);

insert into public.questions (id, topic, level, age, text, options, correct_index, explanation, status) values
  ('00000000-0000-0000-0000-0000000c0001', 'checks', 4, 9,    'Q1?', '["a","b","c","d"]', 2, 'Because.', 'active'),
  ('00000000-0000-0000-0000-0000000c0002', 'checks', 4, null, 'Q2?', '["a","b","c","d"]', 0, null,       'retired'),
  ('00000000-0000-0000-0000-0000000c0003', 'checks', 4, null, 'Q3?', '["a","b","c","d"]', 1, 'So.',      'active');

do $$
begin
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'questions'
             and column_name in ('checked_version', 'checked_at', 'report_checked_at')) = 3,
    'the three new columns';
end $$;

set local role service_role;
do $$
declare
  fam_a constant uuid := '00000000-0000-0000-0000-0000000000a8';
  q1 constant uuid := '00000000-0000-0000-0000-0000000c0001';
begin
  assert not exists (select 1 from claim_report_check(q1, fam_a, 20)),
    'no report, nothing to claim';
end $$;

-- A's younger kid reports Q1 ("confusing" leaves the status alone, 0016).
reset role;
insert into public.question_flags (question_id, profile_id, reason)
  values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000005a82', 'confusing');
set local role service_role;

do $$
declare
  fam_a constant uuid := '00000000-0000-0000-0000-0000000000a8';
  fam_b constant uuid := '00000000-0000-0000-0000-0000000000b8';
  q1 constant uuid := '00000000-0000-0000-0000-0000000c0001';
  r record;
begin
  assert (select array_agg(id) from pending_report_checks(100)) = array[q1],
    'Q1 waits for a check';
  assert not exists (select 1 from claim_report_check(q1, fam_b, 20)),
    'family B never reported it, so B can''t start a check';
  select * into r from claim_report_check(q1, fam_a, 20);
  assert r.id = q1 and r.correct_index = 2 and r.age = 9 and r.explanation = 'Because.'
         and r.options = '["a","b","c","d"]'::jsonb,
    'the reporting family claims Q1, with what the check needs';
  assert not exists (select 1 from claim_report_check(q1, fam_a, 20)),
    'the same report doesn''t check it twice';
  assert not exists (select 1 from pending_report_checks(100)),
    'nothing waits once checked';
end $$;

-- Later: family B reports Q1 too, and A reports the retired Q2 and Q3.
reset role;
insert into public.question_flags (question_id, profile_id, reason, created_at) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000005b81', 'wrong_answer', now() + interval '1 second'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-000000005a81', 'confusing',    now() + interval '1 second'),
  ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-000000005a81', 'difficulty',   now() + interval '1 second');
set local role service_role;

do $$
declare
  fam_a constant uuid := '00000000-0000-0000-0000-0000000000a8';
  fam_b constant uuid := '00000000-0000-0000-0000-0000000000b8';
  q1 constant uuid := '00000000-0000-0000-0000-0000000c0001';
  q2 constant uuid := '00000000-0000-0000-0000-0000000c0002';
  q3 constant uuid := '00000000-0000-0000-0000-0000000c0003';
begin
  assert (select array_agg(id order by id) from pending_report_checks(100)) = array[q1, q3],
    'Q1 and Q3 wait (a retired question never does)';
  assert not exists (select 1 from claim_report_check(q1, fam_a, 20)),
    'A''s report was checked already; B''s new one is B''s to start';
  assert exists (select 1 from claim_report_check(q1, fam_b, 20)),
    'B''s new report starts a new check';
  assert not exists (select 1 from claim_report_check(q2, fam_a, 20)),
    'a retired question is never checked';
  -- A has made 3 reports today: over a cap of 2, the check waits for the sweep.
  assert not exists (select 1 from claim_report_check(q3, fam_a, 2)),
    'a family over its daily cap waits';
  assert (select array_agg(id) from pending_report_checks(100)) = array[q3],
    '…and Q3 still waits';
  -- The sweep: any family's report, no cap.
  assert exists (select 1 from claim_report_check(q3, null, 0)),
    'the sweep claims Q3';
  assert not exists (select 1 from pending_report_checks(100)),
    'nothing left';
  assert (select count(*) from pending_report_checks(0)) = 0, 'p_limit caps the rows';
end $$;

-- Who may call what.
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.claim_report_check(uuid,uuid,integer)', 'execute'),
    'anon must not claim checks';
  assert not has_function_privilege('authenticated', 'public.claim_report_check(uuid,uuid,integer)', 'execute'),
    'a signed-in client must not claim checks';
  assert has_function_privilege('service_role', 'public.claim_report_check(uuid,uuid,integer)', 'execute'),
    'the edge function claims checks';
  assert not has_function_privilege('authenticated', 'public.pending_report_checks(integer)', 'execute'),
    'a signed-in client must not list pending checks';
  assert has_function_privilege('service_role', 'public.pending_report_checks(integer)', 'execute'),
    'the recheck script lists them';
end $$;

rollback;
