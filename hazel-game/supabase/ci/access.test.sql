-- CI test for migration 0010 (access hardening). Any failed assertion raises
-- and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

do $$
begin
  -- A user created WITHOUT birth-date metadata (dashboard / invite / OAuth)
  -- must not fail sign-up; the app creates the profile on first load.
  insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000c1', '{}');
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
    'no profile row expected without a birth date';

  -- Junk metadata is skipped too, not a sign-up failure.
  insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000c2', '{"birth_year": "soon", "birth_month": 13}');
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
    'no profile row expected for invalid metadata';

  -- Normal sign-up still seeds the profile from the metadata.
  insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000c3', '{"birth_year": 2017, "birth_month": 4}');
  assert exists (select 1 from public.profiles
                  where id = '00000000-0000-0000-0000-0000000000c3'
                    and birth_year = 2017 and birth_month = 4),
    'profile row expected from sign-up metadata';

  -- The client reads/writes its own profile row (RLS limits it to the owner).
  assert has_table_privilege('authenticated', 'public.profiles', 'select,insert,update'),
    'authenticated needs select/insert/update on profiles';
  assert not has_table_privilege('anon', 'public.profiles', 'update'),
    'anon must not update profiles';

  -- Only the edge function (service role) may bump question counters.
  assert not has_function_privilege('anon', 'public.increment_question_usage(uuid[])', 'execute'),
    'anon must not execute increment_question_usage';
  assert not has_function_privilege('authenticated', 'public.increment_question_usage(uuid[])', 'execute'),
    'authenticated must not execute increment_question_usage';
  assert has_function_privilege('service_role', 'public.increment_question_usage(uuid[])', 'execute'),
    'service_role must execute increment_question_usage';
end $$;

rollback;
