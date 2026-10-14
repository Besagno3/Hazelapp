-- CI test for migration 0016 (reviewing questions for kids, B10): reports move
-- a question into review by the rules, the queue lists it, a review decides
-- it, and none of that is reachable from the app's roles. Any failed
-- assertion raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

-- Four families, each with one kid (an old-app sign-up: the kid has the login's id).
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '{"birth_year": 2017, "birth_month": 3}'),
  ('00000000-0000-0000-0000-0000000000b1', '{"birth_year": 2016, "birth_month": 5}'),
  ('00000000-0000-0000-0000-0000000000c1', '{"birth_year": 2018, "birth_month": 1}'),
  ('00000000-0000-0000-0000-0000000000d1', '{"birth_year": 2015, "birth_month": 9}');
insert into public.questions (id, topic, level, text, options, correct_index) values
  ('00000000-0000-0000-0000-00000000f001', 'history', 3, 'Q1?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000f002', 'math', 3, 'Q2?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000f003', 'science', 3, 'Q3?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000f004', 'math', 3, 'Q4?', '["a", "b", "c", "d"]', 0);
update public.questions set status = 'approved' where id = '00000000-0000-0000-0000-00000000f003';

do $$
begin
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f002') = 'active',
    'a question starts active';
end $$;

-- Reports, each as a family's grown-up through the API role.
create function pg_temp.report(who text, q text, why text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', who, true);
  execute 'set local role authenticated';
  insert into public.question_flags (question_id, profile_id, reason) values (q::uuid, who::uuid, why);
  execute 'reset role';
end $$;

-- Q1: one "not OK for kids" holds it back at once.
select pg_temp.report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'not_for_kids');
-- Q2: other reasons need three families (one family reporting twice is still one).
select pg_temp.report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f002', 'wrong_answer');
select pg_temp.report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f002', 'confusing');
select pg_temp.report('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f002', 'confusing');
do $$
begin
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f001') = 'review',
    '"not OK for kids" holds a question back at once';
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f002') = 'active',
    'two families'' reports are not enough';
end $$;
select pg_temp.report('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f002', 'difficulty');
-- Q3 (approved): one "not OK for kids" isn't enough; a second family's is.
select pg_temp.report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f003', 'not_for_kids');
do $$
begin
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f002') = 'review',
    'three families'' reports hold a question back';
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f003') = 'approved',
    'one family can''t pull an approved question';
end $$;
select pg_temp.report('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f003', 'not_for_kids');

-- (One transaction: now() never moves, so the reports so far are put an hour
-- back, before the reviews below.)
update public.question_flags set created_at = now() - interval '1 hour';

do $$
declare
  refused text;
begin
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f003') = 'review',
    'two families saying "not OK for kids" send an approved question back to review';
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f004') = 'active',
    'an unreported question is untouched';

  -- The queue: what's held back, "not OK for kids" first.
  assert (select count(*) from public.question_review_queue) = 3, 'three questions to look at';
  assert (select array_agg(id::text order by ord) from (
            select id, row_number() over () as ord from public.question_review_queue) x)
         = array['00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000f001',
                 '00000000-0000-0000-0000-00000000f002'],
    'the queue puts the most "not OK for kids" families first';
  assert (select families from public.question_review_queue where id = '00000000-0000-0000-0000-00000000f002') = 3,
    'the queue counts families, not reports';
  assert (select reports from public.question_review_queue where id = '00000000-0000-0000-0000-00000000f002') = 4,
    '…and every report';

  -- Decisions.
  perform public.review_question('00000000-0000-0000-0000-00000000f001', 'retired');
  perform public.review_question('00000000-0000-0000-0000-00000000f002', 'approved');
  assert (select status = 'retired' and reviewed_at is not null from public.questions
           where id = '00000000-0000-0000-0000-00000000f001'), 'a question can be retired';
  assert (select count(*) from public.question_review_queue) = 1, 'reviewed questions leave the queue';
  begin
    perform public.review_question('00000000-0000-0000-0000-00000000f004', 'review');
  exception when others then refused := sqlerrm;
  end;
  assert refused like 'status must be%', 'a review decides: active, approved or retired';
end $$;

-- A report after a review puts it back in the queue (approved: still served).
select pg_temp.report('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000f002', 'confusing');
update public.question_flags set created_at = now() + interval '1 second'
 where profile_id = '00000000-0000-0000-0000-0000000000d1';
do $$
begin
  assert exists (select 1 from public.question_review_queue where id = '00000000-0000-0000-0000-00000000f002' and reports = 1),
    'a new report after a review shows in the queue, counting only the new ones';
  assert (select status from public.questions where id = '00000000-0000-0000-0000-00000000f002') = 'approved',
    'one new report doesn''t pull an approved question';
end $$;

-- The question picker (0015, #134) follows the review rules (0016): only
-- active and approved questions, approved first, and a report hides a
-- question from the reporting family only. Family A gets a second kid, whose
-- report counts for their sibling; family D never reported anything.
insert into public.profiles (id, parent_id, display_name, birth_year, birth_month)
  values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Sib', 2019, 2);
insert into public.questions (id, topic, level, status, text, options, correct_index) values
  ('00000000-0000-0000-0000-00000000e001', 'space', 4, 'active',   'S1?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000e002', 'space', 4, 'approved', 'S2?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000e003', 'space', 4, 'review',   'S3?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000e004', 'space', 4, 'retired',  'S4?', '["a", "b", "c", "d"]', 0),
  ('00000000-0000-0000-0000-00000000e005', 'space', 4, 'active',   'S5?', '["a", "b", "c", "d"]', 0);
select pg_temp.report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000e005', 'confusing');
update public.question_flags set profile_id = '00000000-0000-0000-0000-0000000000a2'
 where question_id = '00000000-0000-0000-0000-00000000e005';

set local role service_role;
do $$
declare
  kid_a constant uuid := '00000000-0000-0000-0000-0000000000a1';
  kid_d constant uuid := '00000000-0000-0000-0000-0000000000d1';
  got text[];
begin
  for i in 1..5 loop
    select array_agg(right(id::text, 4) order by ord) into got
      from (select id, row_number() over () as ord
              from pick_cached_questions('space', 1, 10, null, kid_a, 100, interval '1 hour', 100)) x;
    assert got = array['e002', 'e001'],
      format('family A: approved first, then active; nothing in review or retired, nor what a sibling reported — got %s', got);
    select array_agg(right(id::text, 4) order by ord) into got
      from (select id, row_number() over () as ord
              from pick_cached_questions('space', 1, 10, null, kid_d, 100, interval '1 hour', 100)) x;
    assert got[1] = 'e002' and got[2:3] @> array['e001'] and got[2:3] @> array['e005'] and cardinality(got) = 3,
      format('another family still gets the question family A reported — got %s', got);
  end loop;
end $$;
reset role;

-- None of it is the app's to read or change.
do $$
begin
  assert not has_table_privilege('authenticated', 'public.question_review_queue', 'select'), 'grown-ups can''t read the queue';
  assert not has_table_privilege('anon', 'public.question_review_queue', 'select'), 'nor can anyone signed out';
  assert has_table_privilege('service_role', 'public.question_review_queue', 'select'), 'the owner can';
  assert not has_function_privilege('authenticated', 'public.review_question(uuid, text)', 'execute'), 'grown-ups can''t review';
  assert not has_function_privilege('anon', 'public.review_question(uuid, text)', 'execute'), 'nor can anyone signed out';
  assert not has_table_privilege('authenticated', 'public.questions', 'update'), 'nor change a question''s status';
end $$;

rollback;
