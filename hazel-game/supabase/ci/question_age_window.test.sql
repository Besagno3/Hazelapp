-- CI test for migration 0017 (#147): saved questions are reused within a year
-- of the age they were written for, both ways, and one written for an older
-- child only at or below the kid's level; without the new parameters the
-- picker behaves as 0016's; the review queue lists a question held back by the
-- bank recheck (no reports), with its note. Any failed assertion raises and
-- exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a7', '{"consent_version": "2026-10-draft"}');
insert into public.profiles (id, parent_id, display_name, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a07', '00000000-0000-0000-0000-0000000000a7', 'Ada', 2015, 1);

insert into public.questions (id, topic, level, age, text, options, correct_index) values
  ('00000000-0000-0000-0000-0000000a9007', 'agewin',  9,  7,    'L9 for a 7',            '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a9010', 'agewin',  9,  10,   'L9 for a 10',           '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a9011', 'agewin',  9,  11,   'L9 for an 11',          '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a9012', 'agewin',  9,  12,   'L9 for a 12',           '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a0012', 'agewin',  10, 12,   'L10 for a 12',          '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a00ff', 'agewin',  10, null, 'L10, saved before ages', '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a0011', 'agewin',  10, 11,   'L10 for an 11',         '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-0000000a9013', 'agewin',  9,  13,   'L9 for a 13',           '["a","b","c","d"]', 0);

set local role service_role;

do $$
declare
  ada constant uuid := '00000000-0000-0000-0000-000000005a07';
  got uuid[];
begin
  -- An 11-year-old at level 9: band 7–11, written for ages 10–12, and a
  -- 12-year-old's question only at level 9 or below.
  select array_agg(id order by id) into got
    from pick_cached_questions('agewin', 7, 11, 12, ada, 100, interval '1 hour', 100, 10, 11, 9);
  assert not ('00000000-0000-0000-0000-0000000a9007'::uuid = any(got)),
    'a question written for a 7-year-old is not reused for an 11-year-old';
  assert not ('00000000-0000-0000-0000-0000000a9013'::uuid = any(got)),
    'nor one written for a 13-year-old';
  assert not ('00000000-0000-0000-0000-0000000a0012'::uuid = any(got)),
    'a 12-year-old''s question above the kid''s level stays out';
  assert got = array[
    '00000000-0000-0000-0000-0000000a0011', '00000000-0000-0000-0000-0000000a00ff',
    '00000000-0000-0000-0000-0000000a9010', '00000000-0000-0000-0000-0000000a9011',
    '00000000-0000-0000-0000-0000000a9012'
  ]::uuid[],
    format('ages 10–12, an older child''s at or below level 9, and the ones saved before ages: got %s', got);

  -- The edge function calls by name (PostgREST); the same through named arguments.
  assert (select count(*) from pick_cached_questions(
            p_topic => 'agewin', p_min_level => 7, p_max_level => 11, p_max_age => 12, p_profile => ada,
            p_seen_limit => 100, p_reserve => interval '1 hour', p_limit => 100,
            p_min_age => 10, p_age => 11, p_level => 9)) = 5,
    'named arguments give the same five';

  -- Without the new parameters it's 0016's picker: only the upper age edge.
  select array_agg(id order by id) into got
    from pick_cached_questions('agewin', 7, 11, 12, ada, 100, interval '1 hour', 100);
  assert got = array[
    '00000000-0000-0000-0000-0000000a0011', '00000000-0000-0000-0000-0000000a0012',
    '00000000-0000-0000-0000-0000000a00ff', '00000000-0000-0000-0000-0000000a9007',
    '00000000-0000-0000-0000-0000000a9010', '00000000-0000-0000-0000-0000000a9011',
    '00000000-0000-0000-0000-0000000a9012'
  ]::uuid[],
    format('an edge function from before 0017 gets 0016''s answer: got %s', got);
end $$;

-- The picker has one signature now (0016's is gone), callable by the edge function only.
reset role;
do $$
begin
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'pick_cached_questions') = 1,
    'one pick_cached_questions';
  assert not has_function_privilege('anon',
    'public.pick_cached_questions(text,integer,integer,integer,uuid,integer,interval,integer,integer,integer,integer)', 'execute'),
    'anon must not read the bank';
  assert not has_function_privilege('authenticated',
    'public.pick_cached_questions(text,integer,integer,integer,uuid,integer,interval,integer,integer,integer,integer)', 'execute'),
    'a signed-in client must not read the bank';
end $$;

-- The review queue: a question the recheck held back (no reports) shows with
-- its note; an active question with an old note doesn't; a reported question
-- held back by the recheck lists both reasons.
insert into public.questions (id, topic, level, text, options, correct_index, status, review_note) values
  ('00000000-0000-0000-0000-00000000e001', 'agewin', 3, 'held by the recheck', '["a","b","c","d"]', 0,
   'review', 'check: two options could be right'),
  ('00000000-0000-0000-0000-00000000e002', 'agewin', 3, 'put back to active',   '["a","b","c","d"]', 0,
   'active', 'explanation: says option B'),
  ('00000000-0000-0000-0000-00000000e003', 'agewin', 3, 'held and reported',    '["a","b","c","d"]', 0,
   'review', 'explanation: unkind');
insert into public.question_flags (question_id, profile_id, reason)
  values ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000005a07', 'confusing');

set local role service_role;
do $$
begin
  assert (select reports = 0 and families = 0
               and reasons = array['recheck: check: two options could be right']
               and last_report is null
            from public.question_review_queue where id = '00000000-0000-0000-0000-00000000e001'),
    'a question held back with no reports is in the queue, its note among the reasons';
  assert not exists (select 1 from public.question_review_queue where id = '00000000-0000-0000-0000-00000000e002'),
    'an active question with no reports isn''t, note or not';
  assert (select reports = 1 and reasons = array['confusing', 'recheck: explanation: unkind']
            from public.question_review_queue where id = '00000000-0000-0000-0000-00000000e003'),
    'a reported question held back by the recheck lists both reasons';
  assert (select array_agg(id::text order by ord) from (
            select id, row_number() over () as ord from public.question_review_queue
             where id::text like '00000000-0000-0000-0000-00000000e00%') x)
         = array['00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e001'],
    'reported questions come before ones with only a note';
end $$;

rollback;
