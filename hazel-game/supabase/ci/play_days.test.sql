-- CI test for migration 0025 (#29, the parent dashboard): the days each kid
-- played are their family's to read and nobody else's; only note_play_days
-- writes them — the family's own sign-in, for its own kid, adding days from
-- the last week only — and nothing can be changed or deleted through the API.
-- Any failed assertion raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b9', '{"consent_version": "2026-10-draft"}');

-- Two families, a kid each, plus a second kid for A (added by the table's
-- owner: adding players is a grown-up action, tested in grown_ups_gate).
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a09', '00000000-0000-0000-0000-0000000000a9', 'Sam', 'fox', 2017, 3),
  ('00000000-0000-0000-0000-000000005a10', '00000000-0000-0000-0000-0000000000a9', 'Kit', 'frog', 2018, 5),
  ('00000000-0000-0000-0000-000000005b09', '00000000-0000-0000-0000-0000000000b9', 'Bea', 'bee', 2016, 7);

-- Bea already played yesterday; Sam has a day from long ago (the next note
-- tidies it away).
insert into public.play_days (profile_id, day) values
  ('00000000-0000-0000-0000-000000005b09', current_date - 1),
  ('00000000-0000-0000-0000-000000005a09', current_date - 20);

-- From here on, act as grown-up A through the API role. No 👪 window is open:
-- noting and reading a kid's days are play, not grown-up actions.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a09';
  kit constant uuid := '00000000-0000-0000-0000-000000005a10';
  bea constant uuid := '00000000-0000-0000-0000-000000005b09';
  kept integer;
  refused text;
begin
  -- Today, yesterday and today again are kept once each; a day a month ago
  -- and one a week in the future are skipped (no error: an old backlog clears).
  kept := public.note_play_days(sam, array[current_date, current_date - 1, current_date,
                                           current_date - 30, current_date + 5]);
  assert kept = 2, format('two days in the window (got %s)', kept);
  assert (select count(*) from public.play_days where profile_id = sam) = 2,
    'today and yesterday noted, nothing else';
  assert exists (select 1 from public.play_days where profile_id = sam and day = current_date), 'today is there';
  assert not exists (select 1 from public.play_days where profile_id = sam and day = current_date - 20),
    'a day older than two weeks is deleted by the next note';

  -- Noting again changes nothing; the window's edges are kept.
  assert public.note_play_days(sam, array[current_date]) = 1, 'today again: still one day kept';
  assert (select count(*) from public.play_days where profile_id = sam) = 2, 'no duplicate day';
  assert public.note_play_days(kit, array[current_date - 7, current_date + 1, current_date - 8, current_date + 2]) = 2,
    'a week back and a day ahead (a time zone ahead of the server) are the edges';
  assert public.note_play_days(kit, null) = 0 and public.note_play_days(kit, '{}') = 0, 'nothing to note';

  -- A sees their own kids' days, never another family's.
  assert (select count(*) from public.play_days) = 4, format('A sees their four rows (got %s)',
    (select count(*) from public.play_days));
  assert not exists (select 1 from public.play_days where profile_id = bea), 'B''s kid''s days are hidden';

  -- …and can't note a day for B's kid.
  begin
    perform public.note_play_days(bea, array[current_date]);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not your player', format('another family''s kid is refused (%s)', refused);

  -- Nobody writes the table directly through the API: no insert, update or delete.
  refused := null;
  begin
    insert into public.play_days (profile_id, day) values (sam, current_date - 3);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'no direct insert';
  refused := null;
  begin
    update public.play_days set day = current_date - 3 where profile_id = sam;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'no update';
  refused := null;
  begin
    delete from public.play_days where profile_id = sam;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused like 'permission denied%', 'no delete';

  -- At most 31 days in one call.
  refused := null;
  begin
    perform public.note_play_days(sam, array(select current_date from generate_series(1, 32)));
  exception when invalid_parameter_value then refused := sqlerrm;
  end;
  assert refused = 'too many days', 'a huge batch is refused';
end $$;

-- Grown-up B sees Bea's day only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$
begin
  assert (select count(*) from public.play_days) = 1, 'B sees only Bea''s day';
end $$;

-- Signed out: nothing to see, nothing to note.
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  refused text;
begin
  assert (select count(*) from public.play_days) = 0, 'no sign-in, no rows';
  begin
    perform public.note_play_days('00000000-0000-0000-0000-000000005a09', array[current_date]);
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  assert refused = 'not signed in', 'no sign-in, no note';
end $$;
reset role;

do $$
begin
  assert not has_function_privilege('anon', 'public.note_play_days(uuid, date[])', 'execute'),
    'only a signed-in family notes days';
  assert has_function_privilege('authenticated', 'public.note_play_days(uuid, date[])', 'execute'),
    'the app may note days';
  assert not has_table_privilege('anon', 'public.play_days', 'select'), 'anon reads nothing';
  assert (select prosecdef from pg_proc where oid = 'public.note_play_days(uuid, date[])'::regprocedure),
    'it writes as the table''s owner';
  assert (select proconfig from pg_proc where oid = 'public.note_play_days(uuid, date[])'::regprocedure)
           = array['search_path=""'], 'with an empty search path';

  -- Removing a kid (and closing the account, which removes every kid) takes
  -- their days with them.
  delete from public.profiles where id = '00000000-0000-0000-0000-000000005a09';
  assert not exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a09'),
    'a removed kid''s days go too';
  assert exists (select 1 from public.play_days where profile_id = '00000000-0000-0000-0000-000000005a10'),
    'their brother''s stay';
end $$;

rollback;
