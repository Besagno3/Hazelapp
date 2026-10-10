-- CI test for migration 0012 (parent accounts, #118): a grown-up's kids and
-- everything they own are that grown-up's alone. Any failed assertion raises
-- and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

-- Grown-up A agreed on the sign-up form; B signed up with an app from before
-- parent accounts (a birth date, no consent); C sent a junk consent version.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b1', '{"birth_year": 2016, "birth_month": 5}'),
  ('00000000-0000-0000-0000-0000000000c1', '{"consent_version": "x; drop table parents"}');
insert into public.questions (id, topic, level, text, options, correct_index)
  values ('00000000-0000-0000-0000-00000000f001', 'math', 3, '2 + 2?', '["3", "4", "5", "6"]', 1);

do $$
begin
  assert (select consent_at is not null and consent_version = '2026-10-draft'
            from public.parents where id = '00000000-0000-0000-0000-0000000000a1'),
    'agreeing at sign-up is recorded';
  assert not exists (select 1 from public.profiles where parent_id = '00000000-0000-0000-0000-0000000000a1'),
    'a grown-up signs up with no kids';
  assert (select consent_at is null from public.parents where id = '00000000-0000-0000-0000-0000000000b1'),
    'an old-app sign-up has not agreed yet';
  assert exists (select 1 from public.profiles
                  where id = '00000000-0000-0000-0000-0000000000b1'
                    and parent_id = '00000000-0000-0000-0000-0000000000b1' and birth_year = 2016),
    'an old-app sign-up still gets its first kid, with the login''s id';
  assert (select consent_at is null and consent_version is null
            from public.parents where id = '00000000-0000-0000-0000-0000000000c1'),
    'a junk consent version is not recorded';
end $$;

-- From here on, act as grown-up A through the API role.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

-- A adds two kids; their ids and parent_id come from the defaults.
insert into public.profiles (display_name, icon, picture_password, birth_year, birth_month)
  values ('Sam', 'fox', 'rocket', 2017, 3), ('Kit', 'panda', 'apple', 2019, 8);

do $$
declare
  sam uuid := (select id from public.profiles where display_name = 'Sam');
  b_kid uuid := '00000000-0000-0000-0000-0000000000b1';
  refused text;
begin
  assert (select count(*) from public.profiles) = 2, 'A sees exactly their own two kids';
  assert (select parent_id from public.profiles where id = sam) = auth.uid(),
    'a new kid belongs to whoever added them';
  assert sam <> auth.uid(), 'a kid has their own id, not the login''s';

  -- A kid can't be put under someone else.
  begin
    insert into public.profiles (parent_id, display_name, birth_year, birth_month)
      values (b_kid, 'Sneaky', 2017, 1);
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%row-level security%', 'a kid can''t be added to another grown-up';

  -- B's kid can't be changed, removed, saved to or flagged as (the update and
  -- delete quietly match nothing; checked as the table owner below).
  update public.profiles set xp = 999 where id = b_kid;
  delete from public.profiles where id = b_kid;
  refused := null;
  begin
    insert into public.saves (profile_id, data) values (b_kid, '{"version": 2}');
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%row-level security%', 'no saving to another grown-up''s kid';
  refused := null;
  begin
    insert into public.question_flags (question_id, profile_id)
      values ('00000000-0000-0000-0000-00000000f001', b_kid);
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%row-level security%', 'no flagging as another grown-up''s kid';

  -- A's own kid: save, save again, read it back, flag a question as them.
  insert into public.saves (profile_id, data) values (sam, '{"version": 2, "coins": 5}');
  update public.saves set data = '{"version": 2, "coins": 6}' where profile_id = sam;
  assert (select (data ->> 'coins')::int from public.saves where profile_id = sam) = 6,
    'a grown-up saves for their own kid';
  insert into public.question_flags (question_id, profile_id)
    values ('00000000-0000-0000-0000-00000000f001', sam);

  -- A nickname is 1–20 characters.
  refused := null;
  begin
    update public.profiles set display_name = '   ' where id = sam;
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%profiles_display_name_length%', 'a blank nickname is refused';

  -- Consent: A sees only their own row and can't backdate it by hand.
  assert (select count(*) from public.parents) = 1, 'A sees only their own grown-up row';
  refused := null;
  begin
    update public.parents set consent_at = '2000-01-01' where id = auth.uid();
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'consent can''t be written by hand';

  -- Removing a kid takes their save with them.
  delete from public.profiles where id = sam;
  assert not exists (select 1 from public.saves where profile_id = sam), 'a removed kid''s save goes too';
  assert (select count(*) from public.profiles) = 1, 'the other kid stays';
end $$;

-- Grown-up B (the old account) agrees at their next sign-in.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.record_consent('2026-10-draft');
do $$
begin
  assert (select count(*) from public.profiles) = 1, 'B sees their one kid';
  assert (select consent_version = '2026-10-draft' and consent_at is not null from public.parents),
    'B''s consent is recorded, stamped by the server';
end $$;

reset role;
do $$
begin
  assert (select xp from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 0,
    'A could not change B''s kid';
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
    'A could not remove B''s kid';
  assert not has_function_privilege('anon', 'public.record_consent(text)', 'execute'),
    'only a signed-in grown-up records consent';
end $$;

-- A login from before parent accounts with no kid (so no row from the
-- backfill) gets its row when it agrees.
delete from public.parents where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.record_consent('2026-10-draft');
do $$
begin
  assert (select consent_at is not null from public.parents), 'a login with no row gets one on agreeing';
end $$;
reset role;

rollback;
