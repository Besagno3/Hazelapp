-- CI test for migration 0013 (#118): PINs are 4 digits, hashed, hidden, and
-- only the caller's; the question budget is per kid; a family has at most 8
-- players. Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b2', '{"consent_version": "2026-10-draft"}');

-- Grown-up A and their kid Sam.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month)
  values ('00000000-0000-0000-0000-000000005a01', 'Sam', 'fox', 2017, 3);

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a01';
  refused text;
begin
  assert not (select has_pin from public.profiles where id = sam), 'a new kid has no PIN yet';

  begin
    perform public.set_kid_pin(sam, '12a4');
  exception when others then refused := sqlerrm;
  end;
  assert refused like 'pin_format%', 'a PIN is digits';
  refused := null;
  begin
    perform public.set_kid_pin(sam, '12345');
  exception when others then refused := sqlerrm;
  end;
  assert refused like 'pin_format%', 'a PIN is exactly 4 digits';

  perform public.set_kid_pin(sam, '4821');
  assert (select has_pin from public.profiles where id = sam), 'setting a PIN marks the kid';
  assert public.check_kid_pin(sam, '4821'), 'the right PIN opens';
  assert not public.check_kid_pin(sam, '1234'), 'a wrong PIN does not';
  perform public.set_kid_pin(sam, '1234');
  assert public.check_kid_pin(sam, '1234') and not public.check_kid_pin(sam, '4821'), 'a new PIN replaces the old';

  -- The API role can't read or write the hashes.
  refused := null;
  begin
    perform 1 from public.kid_pins;
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'kid PINs can''t be read';
  refused := null;
  begin
    insert into public.kid_pins (profile_id, pin_hash) values (sam, 'x');
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'kid PINs can''t be written by hand';

  -- The grown-up's own PIN.
  assert not (select has_pin from public.parents), 'no grown-up PIN yet';
  perform public.set_parent_pin('9090');
  assert (select has_pin from public.parents), 'the grown-up has a PIN now';
  assert public.check_parent_pin('9090') and not public.check_parent_pin('0909'), 'the grown-up PIN checks';
  refused := null;
  begin
    perform 1 from public.parent_pins;
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'grown-up PINs can''t be read';
end $$;

-- Grown-up B can't check or set A's kid's PIN, or pass A's grown-up PIN.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a01';
  refused text;
begin
  assert not public.check_kid_pin(sam, '1234'), 'another grown-up''s check never opens my kid';
  begin
    perform public.set_kid_pin(sam, '0000');
  exception when others then refused := sqlerrm;
  end;
  assert refused like 'not_your_kid%', 'another grown-up can''t set my kid''s PIN';
  assert not public.check_parent_pin('9090'), 'A''s grown-up PIN is A''s alone';

  -- A family has at most 8 players.
  for i in 1..8 loop
    insert into public.profiles (display_name, birth_year, birth_month) values ('Kid ' || i, 2016, 1);
  end loop;
  refused := null;
  begin
    insert into public.profiles (display_name, birth_year, birth_month) values ('Kid 9', 2016, 1);
  exception when others then refused := sqlerrm;
  end;
  assert refused like 'kid_limit%', 'a ninth player is refused';
end $$;
reset role;

-- The question budget is per kid (the edge function sends the kid's id).
set local role service_role;
do $$
declare
  k1 uuid := (select id from public.profiles where display_name = 'Kid 1');
  k2 uuid := (select id from public.profiles where display_name = 'Kid 2');
  r record;
  refused text;
begin
  perform public.begin_question_request(k1, 2, 10, 100);
  perform public.begin_question_request(k1, 2, 10, 100);
  select * into r from public.begin_question_request(k1, 2, 10, 100);
  assert not r.allowed, 'kid 1 used up their own per-minute calls';
  select * into r from public.begin_question_request(k2, 2, 10, 100);
  assert r.allowed and r.fresh_allowance = 10, 'kid 2 has their own budget';

  begin
    perform public.begin_question_request('00000000-0000-0000-0000-00000000dead', 2, 10, 100);
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%question_requests_kid_fkey%', 'only a kid has a budget';
end $$;
reset role;

do $$
declare
  k1 uuid := (select id from public.profiles where display_name = 'Kid 1');
begin
  delete from public.profiles where id = k1;
  assert not exists (select 1 from public.question_requests where profile_id = k1), 'a removed kid''s requests go too';
  assert not exists (select 1 from public.kid_pins k left join public.profiles p on p.id = k.profile_id where p.id is null),
    'no PIN outlives its kid';
end $$;

rollback;
