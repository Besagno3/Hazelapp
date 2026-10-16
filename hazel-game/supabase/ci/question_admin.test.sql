-- CI test for migration 0019 (#147): only an admin reads the review queue and
-- decides questions through the API; the decision records who made it; nobody
-- can read or change who's an admin through the API. Any failed assertion
-- raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', '{"consent_version": "2026-10-draft"}'), -- the owner
  ('00000000-0000-0000-0000-0000000000b9', '{"consent_version": "2026-10-draft"}'); -- a family
insert into public.profiles (id, parent_id, display_name, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005b91', '00000000-0000-0000-0000-0000000000b9', 'Dee', 2017, 4);
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a9');

insert into public.questions (id, topic, level, age, text, options, correct_index, status, review_note) values
  ('00000000-0000-0000-0000-0000000d0001', 'admin', 3, 8,    'Held?', '["a","b","c","d"]', 0, 'review', 'report check (Haiku): check: two answers fit'),
  ('00000000-0000-0000-0000-0000000d0002', 'admin', 3, null, 'Live?', '["a","b","c","d"]', 1, 'active', null);
insert into public.question_flags (question_id, profile_id, reason)
  values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-000000005b91', 'confusing');

-- A grown-up who isn't an admin.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$
declare
  refused text;
begin
  assert not public.is_admin(), 'a family isn''t an admin';
  begin
    perform * from public.admin_review_queue();
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not an admin', format('the queue refuses a family: %s', refused);
  refused := null;
  begin
    perform public.admin_review_question('00000000-0000-0000-0000-0000000d0001', 'active');
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not an admin', 'a family can''t decide a question';
  refused := null;
  begin
    insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000b9');
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused is not null, 'a family can''t make itself an admin';
  refused := null;
  begin
    perform 1 from public.admins;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused is not null, 'a family can''t see who the admins are';
end $$;
reset role;

do $$
begin
  assert (select status from public.questions where id = '00000000-0000-0000-0000-0000000d0001') = 'review',
    'the refused decision changed nothing';
end $$;

-- The owner.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);
do $$
declare
  ids uuid[];
  refused text;
begin
  assert public.is_admin(), 'the owner is an admin';
  select array_agg(q.id order by ord) into ids
    from (select r.id, row_number() over () as ord from public.admin_review_queue() r where r.topic = 'admin') q;
  assert ids = array['00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002']::uuid[],
    format('held first, then the live one with a report: %s', ids);
  assert (select r.age = 8 and r.reasons = array['recheck: report check (Haiku): check: two answers fit'] and r.reports = 0
            from public.admin_review_queue() r where r.id = '00000000-0000-0000-0000-0000000d0001'),
    'with its age and what the checks found';
  assert (select r.reports = 1 and r.families = 1 and r.reasons = array['confusing']
            from public.admin_review_queue() r where r.id = '00000000-0000-0000-0000-0000000d0002'),
    'the live one with its report';

  perform public.admin_review_question('00000000-0000-0000-0000-0000000d0001', 'active');
  begin
    perform public.admin_review_question('00000000-0000-0000-0000-0000000d0002', 'review');
  exception when others then refused := sqlerrm;
  end;
  assert refused like 'status must be%', 'only active, approved or retired';
  refused := null;
  begin
    perform public.admin_review_question('00000000-0000-0000-0000-0000000dffff', 'retired');
  exception when others then refused := sqlerrm;
  end;
  assert refused = 'no such question', 'an unknown question is refused';
  assert not exists (select 1 from public.admin_review_queue() r where r.id = '00000000-0000-0000-0000-0000000d0001'),
    'a decided question leaves the queue';
end $$;
reset role;

do $$
begin
  assert (select status = 'active' and reviewed_at is not null
                 and reviewed_by = '00000000-0000-0000-0000-0000000000a9'
            from public.questions where id = '00000000-0000-0000-0000-0000000d0001'),
    'released, with when and by whom';
  assert not has_function_privilege('anon', 'public.is_admin()', 'execute'), 'anon can''t ask';
  assert not has_function_privilege('anon', 'public.admin_review_queue()', 'execute'), 'anon can''t read the queue';
  assert not has_function_privilege('anon', 'public.admin_review_question(uuid,text)', 'execute'), 'anon can''t decide';
  assert not has_table_privilege('authenticated', 'public.admins', 'select'), 'no API reads of admins';
  assert not has_table_privilege('authenticated', 'public.admins', 'insert'), 'no API writes to admins';
end $$;

rollback;
