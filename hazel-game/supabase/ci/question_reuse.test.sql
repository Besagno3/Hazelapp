-- CI test for migration 0015 (#134): the bank is sampled whole, leaning to
-- less-asked questions; questions written for older kids, flagged ones and
-- ones this kid saw lately in the topic are held back; a delivery not shown
-- yet is held back only for a while; the app marks shown questions for its
-- own kids only. Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"consent_version": "2026-10-draft"}');
-- Grown-up A's kid Sam, grown-up B's kid Kit.
insert into public.profiles (id, parent_id, display_name, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-0000000000a3', 'Sam', 2016, 3),
  ('00000000-0000-0000-0000-000000005b03', '00000000-0000-0000-0000-0000000000b3', 'Kit', 2016, 3);

insert into public.questions (id, topic, level, age, text, options, correct_index) values
  ('00000000-0000-0000-0000-00000000c003', 'math',    3, null, 'L3, no age',       '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c005', 'math',    5, 9,    'L5, age 9',        '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c007', 'math',    7, 10,   'L7, age 10',       '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c008', 'math',    8, null, 'L8, out of band',  '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c0a1', 'math',    5, 14,   'written for 14',   '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c0f1', 'math',    5, null, 'flagged',          '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c051', 'math',    5, null, 'Sam saw it last',  '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c052', 'math',    5, null, 'Sam saw it before','["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c0d1', 'math',    5, null, 'handed, not shown','["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c0d2', 'math',    5, null, 'handed long ago',  '["a","b","c","d"]', 0),
  ('00000000-0000-0000-0000-00000000c5c1', 'science', 5, null, 'science',          '["a","b","c","d"]', 0);

insert into public.question_flags (question_id, profile_id, reason)
  values ('00000000-0000-0000-0000-00000000c0f1', '00000000-0000-0000-0000-000000005b03', 'not_for_kids');

-- Sam's views: two math questions shown (c051 the newer, shown three times in
-- one battle — it must count once), five science views shown after both
-- (another topic: they must not push math out of the window), one math
-- question handed over just now, one two hours ago.
insert into public.question_views (profile_id, question_id, shown, seen_at) values
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c052', true,  now() - interval '50 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c051', true,  now() - interval '42 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c051', true,  now() - interval '41 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c051', true,  now() - interval '40 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c5c1', true,  now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c5c1', true,  now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c5c1', true,  now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c5c1', true,  now() - interval '5 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c5c1', true,  now() - interval '1 minute'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c0d1', false, now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c0d2', false, now() - interval '2 hours');

set local role service_role;

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a03';
  kit constant uuid := '00000000-0000-0000-0000-000000005b03';
  got uuid[];
  seen_ids uuid[];
  last_unseen integer;
  first_seen integer;
begin
  -- A level-5 kid aged 9 (band 3–7, questions written for up to age 10),
  -- holding back the last 1 shown math question, deliveries for an hour.
  create temp table pick on commit drop as
    select row_number() over () as n, * from pick_cached_questions('math', 3, 7, 10, sam, 1, interval '1 hour', 200);

  select array_agg(id order by id) into got from pick;
  assert got = array[
    '00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000c005',
    '00000000-0000-0000-0000-00000000c007', '00000000-0000-0000-0000-00000000c051',
    '00000000-0000-0000-0000-00000000c052', '00000000-0000-0000-0000-00000000c0d1',
    '00000000-0000-0000-0000-00000000c0d2'
  ]::uuid[],
    format('band, topic, age and flags: got %s', got);

  select array_agg(id order by id) into seen_ids from pick where seen;
  assert seen_ids = array['00000000-0000-0000-0000-00000000c051', '00000000-0000-0000-0000-00000000c0d1']::uuid[],
    format('held back: the last shown math question (science views don''t count) and a fresh delivery; got %s', seen_ids);

  select max(n) into last_unseen from pick where not seen;
  select min(n) into first_seen from pick where seen;
  assert last_unseen < first_seen, 'unseen questions come first';

  -- A window of 2 reaches the older math question too: c051's repeats count once.
  assert (select seen from pick_cached_questions('math', 3, 7, 10, sam, 2, interval '1 hour', 200)
           where id = '00000000-0000-0000-0000-00000000c052'),
    'a window of 2 holds back both shown math questions, however often one was shown';

  -- Another kid saw none of them.
  assert not exists (select 1 from pick_cached_questions('math', 3, 7, 10, kit, 200, interval '1 hour', 200) where seen),
    'views are per kid';

  -- No age limit: the question written for a 14-year-old comes back.
  assert exists (select 1 from pick_cached_questions('math', 3, 7, null, sam, 1, interval '1 hour', 200)
                  where id = '00000000-0000-0000-0000-00000000c0a1'),
    'no age limit lets every age through';

  assert (select count(*) from pick_cached_questions('math', 3, 7, 10, sam, 1, interval '1 hour', 3)) = 3,
    'p_limit caps the rows';
end $$;

-- The window reads only the kid's latest 10 × p_seen_limit shown views (of
-- any topic), so a call costs the same however long they've played: ten
-- newer science views push math's c051 out of a window of 1, not out of 2.
reset role;
insert into public.question_views (profile_id, question_id, shown, seen_at)
  select '00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-00000000c5c1', true,
         now() - make_interval(secs => g)
    from generate_series(1, 10) g;
set local role service_role;

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a03';
begin
  assert not (select seen from pick_cached_questions('math', 3, 7, 10, sam, 1, interval '1 hour', 200)
               where id = '00000000-0000-0000-0000-00000000c051'),
    'a window of 1 reads only the latest 10 shown views';
  assert (select seen from pick_cached_questions('math', 3, 7, 10, sam, 2, interval '1 hour', 200)
           where id = '00000000-0000-0000-0000-00000000c051'),
    'a window of 2 reads the latest 20 and finds it';
end $$;

-- The whole band is sampled: 400 more level-6 questions, 30 calls of 10.
-- The old lookup (LIMIT with no ORDER BY) returned the same rows every time.
reset role;
insert into public.questions (topic, level, text, options, correct_index)
  select 'math', 6, 'bulk-' || g, '["a","b","c","d"]', 0 from generate_series(1, 400) g;
insert into public.questions (topic, level, times_asked, text, options, correct_index) values
  ('lean-test', 5, 0,  'asked never',      '["a","b","c","d"]', 0),
  ('lean-test', 5, 99, 'asked 99 times',   '["a","b","c","d"]', 0);
set local role service_role;

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a03';
  distinct_ids integer;
  newest integer;
  low_first integer := 0;
begin
  create temp table draws (id uuid, text text) on commit drop;
  for i in 1..30 loop
    insert into draws select id, text from pick_cached_questions('math', 4, 8, 10, sam, 200, interval '1 hour', 10);
  end loop;
  select count(distinct id) into distinct_ids from draws;
  assert distinct_ids > 100, format('30 draws of 10 should cover the band, got %s distinct', distinct_ids);
  select count(distinct id) into newest from draws where text like 'bulk-%' and substr(text, 6)::int > 300;
  assert newest > 0, 'the newest questions in the band come up too';

  -- Leaning to less-asked: weight 1 vs 0.1, so the never-asked one comes first
  -- about 91% of the time.
  for i in 1..400 loop
    if (select text from pick_cached_questions('lean-test', 1, 10, null, sam, 200, interval '1 hour', 1)) = 'asked never' then
      low_first := low_first + 1;
    end if;
  end loop;
  assert low_first between 300 and 399, format('the less-asked question should usually win, won %s of 400', low_first);
end $$;

-- Grown-up A marks questions shown for their own kid only.
reset role;
select array_agg(id)::text as bulk25
  from (select id from public.questions where text like 'bulk-%' order by text limit 25) b \gset
-- The next 50 as a 25×2 array: PostgREST turns nested JSON arrays into one.
select array_agg(pair)::text as bulk2d
  from (select array[a.id, b.id] as pair
          from (select id, row_number() over (order by text) n from public.questions
                 where text like 'bulk-%' order by text offset 25 limit 50) a
          join (select id, row_number() over (order by text) n from public.questions
                 where text like 'bulk-%' order by text offset 25 limit 50) b on b.n = a.n + 1
         where a.n % 2 = 1) p \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
select public.mark_questions_seen('00000000-0000-0000-0000-000000005a03',
  array['00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000c003',
        '00000000-0000-0000-0000-0000deadbeef']::uuid[]);
select public.mark_questions_seen('00000000-0000-0000-0000-000000005b03',
  array['00000000-0000-0000-0000-00000000c005']::uuid[]);
select public.mark_questions_seen('00000000-0000-0000-0000-000000005a03', :'bulk25'::uuid[]);
select public.mark_questions_seen('00000000-0000-0000-0000-000000005a03', :'bulk2d'::uuid[]);
select public.mark_questions_seen('00000000-0000-0000-0000-000000005a03',
  array['00000000-0000-0000-0000-00000000c003']::uuid[]);
reset role;

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a03';
  kit constant uuid := '00000000-0000-0000-0000-000000005b03';
begin
  assert (select count(*) from public.question_views
           where profile_id = sam and question_id = '00000000-0000-0000-0000-00000000c003' and shown) = 1,
    'a question marked twice in one call, then again in the same half hour, is one view';
  assert not exists (select 1 from public.question_views
                      where question_id = '00000000-0000-0000-0000-0000deadbeef'),
    'an id not in the bank is ignored';
  assert not exists (select 1 from public.question_views where profile_id = kit),
    'another grown-up''s kid gets nothing';
  assert (select count(*) from public.question_views v join public.questions q on q.id = v.question_id
           where v.profile_id = sam and q.text like 'bulk-%') = 40,
    'at most 20 questions a call — a 25-id list and a 25×2 nested array each write 20';
  assert (select seen from pick_cached_questions('math', 3, 7, 10, sam, 200, interval '1 hour', 1000)
           where id = '00000000-0000-0000-0000-00000000c003'),
    'a question marked shown is held back from that kid';
end $$;

-- Who may call what (the picker's signature since 0017, #146).
do $$
begin
  assert not has_function_privilege('anon',
    'public.pick_cached_questions(text,integer,integer,integer,uuid,integer,interval,integer,integer,integer,integer)', 'execute'),
    'anon must not read the bank';
  assert not has_function_privilege('authenticated',
    'public.pick_cached_questions(text,integer,integer,integer,uuid,integer,interval,integer,integer,integer,integer)', 'execute'),
    'a signed-in client must not read the bank';
  assert has_function_privilege('service_role',
    'public.pick_cached_questions(text,integer,integer,integer,uuid,integer,interval,integer,integer,integer,integer)', 'execute'),
    'the edge function reads the bank';
  assert not has_function_privilege('anon', 'public.mark_questions_seen(uuid,uuid[])', 'execute'),
    'anon must not mark questions seen';
  assert has_function_privilege('authenticated', 'public.mark_questions_seen(uuid,uuid[])', 'execute'),
    'the app marks questions seen';
end $$;

rollback;
