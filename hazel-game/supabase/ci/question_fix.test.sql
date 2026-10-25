-- CI test for migration 0028: only an admin with 👪 Grown-ups open fixes a
-- question or browses the bank; a fix is checked like screenQuestion would
-- check it, approves the question and records who; browsing filters, pages
-- and leaves retired questions out. Any failed assertion raises and exits
-- non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000aa', '{"consent_version": "2026-10-draft"}'), -- the owner
  ('00000000-0000-0000-0000-0000000000ba', '{"consent_version": "2026-10-draft"}'); -- a family
insert into public.profiles (id, parent_id, display_name, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005ba1', '00000000-0000-0000-0000-0000000000ba', 'Eli', 2017, 4);
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000aa');

insert into public.questions (id, topic, level, age, text, options, correct_index, explanation, status, review_note, checked_version, checked_at, created_at) values
  ('00000000-0000-0000-0000-0000000f0001', 'fixit', 3, 8, 'What is 7 + 5?', '["11","12","13","10"]', 0, 'Count on.', 'review', 'report check: wrong answer', 3, now(), now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-0000000f0002', 'fixit', 4, 8, '100% sure?',     '["a","b","c","d"]',    1, null,        'active', null, 3, now(), now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000f0003', 'fixit', 3, 8, 'Gone?',          '["a","b","c","d"]',    2, null,        'retired', null, 3, now(), now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000f0004', 'other', 3, 8, 'Elsewhere?',     '["a","b","c","d"]',    3, null,        'approved', null, 3, now(), now());
insert into public.question_flags (question_id, profile_id, reason)
  values ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-000000005ba1', 'wrong_answer');

select set_config('request.jwt.claims', '{"session_id": "00000000-0000-0000-0000-00000000c168"}', true);

-- A family (👪 Grown-ups open): not an admin.
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until)
  values ('00000000-0000-0000-0000-0000000000ba', '00000000-0000-0000-0000-00000000c168', now() + interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ba', true);
do $$
declare
  refused text;
begin
  begin
    perform public.admin_fix_question('00000000-0000-0000-0000-0000000f0001', 'Hacked?', '["a","b","c","d"]', 0, null);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not an admin', format('a family can''t fix a question: %s', refused);
  refused := null;
  begin
    perform * from public.admin_browse_questions();
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not an admin', format('a family can''t browse the bank: %s', refused);
end $$;
reset role;

-- The owner, 👪 Grown-ups still shut: refused with the gate's code.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
do $$
declare
  code text;
begin
  begin
    perform public.admin_fix_question('00000000-0000-0000-0000-0000000f0001', 'What is 7 + 5?', '["11","12","13","10"]', 1, null);
  exception when others then code := sqlstate;
  end;
  assert code = 'HQ001', format('fixing needs 👪 Grown-ups open: %s', code);
  code := null;
  begin
    perform * from public.admin_browse_questions();
  exception when others then code := sqlstate;
  end;
  assert code = 'HQ001', format('browsing needs 👪 Grown-ups open: %s', code);
end $$;
reset role;

do $$
begin
  assert (select correct_index = 0 and status = 'review' from public.questions where id = '00000000-0000-0000-0000-0000000f0001'),
    'the refused fixes changed nothing';
end $$;

-- The owner with 👪 Grown-ups open.
insert into public.grown_up_unlocks (user_id, session_id, unlocked_until)
  values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000c168', now() + interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
do $$
declare
  q constant uuid := '00000000-0000-0000-0000-0000000f0001';
  refused text;
  ids uuid[];
begin
  -- What screenQuestion would never serve is refused.
  begin perform public.admin_fix_question(q, '  ', '["11","12","13","10"]', 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused = 'the question needs words', format('no text: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, repeat('x', 221), '["11","12","13","10"]', 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused like 'the question is too long%', format('text too long: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', '["11","12","13"]', 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused = 'a question needs exactly four answers', format('three options: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', '["11","12",13,"10"]', 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused = 'a question needs exactly four answers', format('a number for an option: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', '["11"," ","13","10"]', 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused = 'every answer needs words', format('an empty option: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', jsonb_build_array('11', repeat('y', 81), '13', '10'), 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused like 'an answer is too long%', format('option too long: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', '["Twelve","twelve ","13","10"]', 1, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused = 'two answers are the same', format('same option twice: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', '["11","12","13","10"]', 4, null);
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused = 'pick the right answer', format('no right answer: %s', refused);
  refused := null;
  begin perform public.admin_fix_question(q, 'What is 7 + 5?', '["11","12","13","10"]', 1, repeat('z', 281));
  exception when invalid_parameter_value then refused := sqlerrm; end;
  assert refused like 'the explanation is too long%', format('explanation too long: %s', refused);
  refused := null;
  begin perform public.admin_fix_question('00000000-0000-0000-0000-0000000f0003', 'Gone?', '["a","b","c","d"]', 0, null);
  exception when no_data_found then refused := sqlerrm; end;
  assert refused = 'no such question', format('a retired question stays retired: %s', refused);
  refused := null;
  begin perform public.admin_fix_question('00000000-0000-0000-0000-0000000fffff', 'Who?', '["a","b","c","d"]', 0, null);
  exception when no_data_found then refused := sqlerrm; end;
  assert refused = 'no such question', format('an unknown question: %s', refused);

  -- The fix.
  perform public.admin_fix_question(q, ' What is 7 + 5? ', '[" 11","12 ","13","10"]', 1, '  ');
  assert not exists (select 1 from public.admin_review_queue() r where r.id = q), 'a fixed question leaves the queue';

  -- Browsing.
  select array_agg(b.id order by ord) into ids
    from (select r.id, row_number() over () as ord from public.admin_browse_questions(p_topic => 'fixit') r) b;
  assert ids = array['00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0001']::uuid[],
    format('a topic, newest first, retired left out: %s', ids);
  assert (select r.correct_index = 1 and r.options = '["11","12","13","10"]' and r.reports = 1 and r.status = 'approved'
            from public.admin_browse_questions(p_topic => 'fixit') r where r.id = q),
    'with the right answer and its reports';
  assert (select count(*) from public.admin_browse_questions(p_status => 'retired')) >= 1, 'retired ones on asking';
  assert (select array_agg(r.id) from public.admin_browse_questions(p_topic => 'fixit', p_level => 4) r)
           = array['00000000-0000-0000-0000-0000000f0002']::uuid[], 'by level';
  assert (select array_agg(r.id) from public.admin_browse_questions(p_search => '100%') r)
           = array['00000000-0000-0000-0000-0000000f0002']::uuid[], 'words in the question, % as itself';
  assert not exists (select 1 from public.admin_browse_questions(p_search => '_00%')), 'and _ as itself';
  assert (select array_agg(r.id) from public.admin_browse_questions(p_topic => 'fixit', p_limit => 1, p_offset => 1) r)
           = array['00000000-0000-0000-0000-0000000f0001']::uuid[], 'a page at a time';
  assert (select count(*) from public.admin_browse_questions(p_limit => 0)) = 1, 'at least one a page';
end $$;
reset role;

do $$
begin
  assert (select text = 'What is 7 + 5?' and options = '["11","12","13","10"]' and correct_index = 1
                 and explanation is null and status = 'approved' and reviewed_at is not null
                 and reviewed_by = '00000000-0000-0000-0000-0000000000aa'
                 and review_note like '% fixed by the owner'
                 and checked_version is null and checked_at is null
            from public.questions where id = '00000000-0000-0000-0000-0000000f0001'),
    'fixed: trimmed, approved, by whom, and due a recheck';
  assert not has_function_privilege('anon', 'public.admin_fix_question(uuid,text,jsonb,integer,text)', 'execute'),
    'anon can''t fix';
  assert not has_function_privilege('anon', 'public.admin_browse_questions(text,integer,text,text,integer,integer)', 'execute'),
    'anon can''t browse';
end $$;

rollback;
