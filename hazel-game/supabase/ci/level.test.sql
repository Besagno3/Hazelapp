-- CI test for migration 0012 (saved player level). Any failed assertion
-- raises and exits non-zero under `psql -v ON_ERROR_STOP=1`.
begin;

do $$
begin
  -- A new player starts at level 1 with no XP into it.
  insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000d1', '{"birth_year": 2016, "birth_month": 5}');
  assert exists (select 1 from public.profiles
                  where id = '00000000-0000-0000-0000-0000000000d1'
                    and level = 1 and level_xp = 0),
    'new profile should start at level 1, 0 XP into it';
end $$;

rollback;
