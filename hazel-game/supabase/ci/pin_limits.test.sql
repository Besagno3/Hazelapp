-- CI test for migration 0022 (#124c): the database limits PIN guesses.
-- 5 wrong tries in a row lock a PIN for 1, then 5, then 15, then 60 minutes;
-- a locked PIN refuses even the right one, uncounted; the right PIN, a new
-- PIN or a quiet day starts over; only the caller's own PINs are counted; no
-- client can read or change the counters. Any failed assertion raises and
-- exits non-zero under `psql -v ON_ERROR_STOP=1`.
--
-- Everything runs in one transaction, where now() stands still: a lock
-- running out is played by moving `locked_until` (or `last_failed_at`) back,
-- as the superuser.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', '{"consent_version": "2026-10-draft"}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"consent_version": "2026-10-draft"}');

-- Grown-up A, their kid Sam (PIN 4821), their own PIN 9090; Kit has no PIN.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005a02', 'Sam', 'fox', 2017, 3),
  ('00000000-0000-0000-0000-000000005a03', 'Kit', 'frog', 2018, 5);
select public.set_kid_pin('00000000-0000-0000-0000-000000005a02', '4821');
select public.set_parent_pin('9090');
reset role;

-- The checks write now: volatile, so the API never runs them read-only.
do $$
begin
  assert (select bool_and(provolatile = 'v') from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('try_kid_pin', 'try_parent_pin', 'check_kid_pin', 'check_parent_pin')),
    'every PIN check is volatile';
  assert (select count(*) from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('try_kid_pin', 'try_parent_pin', 'check_kid_pin', 'check_parent_pin')) = 4,
    'one of each PIN check (no overloads)';
end $$;

-- 1) The ladder, as grown-up A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a02';
  v jsonb;
begin
  for i in 1..4 loop
    v := public.try_kid_pin(sam, '0000');
    assert v ->> 'ok' = 'false', 'a wrong PIN is refused';
    assert (v ->> 'tries_left')::int = 5 - i, format('try %s leaves %s (got %s)', i, 5 - i, v);
    assert (v ->> 'wait_seconds')::int = 0, 'no wait before the fifth wrong try';
  end loop;
  v := public.try_kid_pin(sam, '1111');
  assert v ->> 'ok' = 'false' and (v ->> 'tries_left')::int = 0, 'the fifth wrong try locks';
  assert (v ->> 'wait_seconds')::int = 60, format('the first lock is a minute (got %s)', v);

  -- Locked: even the right PIN is refused, and says how long is left.
  v := public.try_kid_pin(sam, '4821');
  assert v ->> 'ok' = 'false', 'a locked PIN refuses the right one';
  assert (v ->> 'wait_seconds')::int between 1 and 60, format('it says how long is left (got %s)', v);
  assert not public.check_kid_pin(sam, '4821'), 'the old check reads a locked PIN as no';
end $$;
reset role;

do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a02';
  r public.kid_pins%rowtype;
begin
  select * into r from public.kid_pins where profile_id = sam;
  assert r.lockouts = 1 and r.failed_tries = 0, format('tries while locked are not counted (%s / %s)', r.lockouts, r.failed_tries);
  assert r.locked_until = now() + interval '60 seconds', 'locked for a minute by the database clock';
end $$;

-- Each lock in a row lasts longer: 5 minutes, 15, then an hour, and stays an hour.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a02';
  waits constant int[] := array[300, 900, 3600, 3600];
  v jsonb;
begin
  for n in 1..array_length(waits, 1) loop
    update public.kid_pins set locked_until = now() - interval '1 second' where profile_id = sam;
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
    set local role authenticated;
    for i in 1..4 loop
      v := public.try_kid_pin(sam, '0000');
      assert (v ->> 'wait_seconds')::int = 0, format('after lock %s: try %s is counted, not locked (%s)', n, i, v);
    end loop;
    v := public.try_kid_pin(sam, '0000');
    reset role;
    assert (v ->> 'wait_seconds')::int = waits[n], format('lock %s lasts %s s (got %s)', n + 1, waits[n], v);
  end loop;
end $$;

-- The right PIN, once the lock has run out, starts it all over.
update public.kid_pins set locked_until = now() - interval '1 second'
 where profile_id = '00000000-0000-0000-0000-000000005a02';
set local role authenticated;
do $$
declare
  v jsonb := public.try_kid_pin('00000000-0000-0000-0000-000000005a02', '4821');
begin
  assert v ->> 'ok' = 'true', format('the right PIN opens once the lock is over (%s)', v);
  assert (v ->> 'tries_left')::int = 5, 'and all five tries are back';
end $$;
reset role;
do $$
declare
  r public.kid_pins%rowtype;
begin
  select * into r from public.kid_pins where profile_id = '00000000-0000-0000-0000-000000005a02';
  assert r.failed_tries = 0 and r.lockouts = 0 and r.locked_until is null and r.last_failed_at is null,
    'a right PIN clears every counter';
end $$;

-- 2) A day without a wrong try starts the ladder over.
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a02';
  v jsonb;
begin
  -- Three locks ago and four wrong tries in, but the last wrong try was yesterday.
  update public.kid_pins
     set failed_tries = 4, lockouts = 3, locked_until = null, last_failed_at = now() - interval '25 hours'
   where profile_id = sam;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  set local role authenticated;
  v := public.try_kid_pin(sam, '0000');
  assert (v ->> 'tries_left')::int = 4 and (v ->> 'wait_seconds')::int = 0, format('yesterday''s tries are forgotten (%s)', v);
  for i in 1..4 loop v := public.try_kid_pin(sam, '0000'); end loop;
  reset role;
  assert (v ->> 'wait_seconds')::int = 60, format('and the next lock is a minute again (%s)', v);

  -- Within the day, the ladder holds.
  update public.kid_pins
     set failed_tries = 4, lockouts = 2, locked_until = null, last_failed_at = now() - interval '23 hours'
   where profile_id = sam;
  set local role authenticated;
  v := public.try_kid_pin(sam, '0000');
  reset role;
  assert (v ->> 'wait_seconds')::int = 900, format('a wrong try within the day climbs on (%s)', v);
end $$;

-- 3) A new PIN unlocks at once (a grown-up helping a locked-out kid).
set local role authenticated;
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a02';
  v jsonb;
begin
  assert (public.try_kid_pin(sam, '4821') ->> 'wait_seconds')::int > 0, 'Sam is locked';
  perform public.set_kid_pin(sam, '4821');
  v := public.try_kid_pin(sam, '4821');
  assert v ->> 'ok' = 'true', format('setting a PIN (even the same one) unlocks it (%s)', v);
end $$;

-- A kid with no PIN: nothing to guess, nothing counted.
do $$
declare
  v jsonb := public.try_kid_pin('00000000-0000-0000-0000-000000005a03', '1234');
begin
  assert v ->> 'ok' = 'false' and v -> 'tries_left' = 'null'::jsonb and (v ->> 'wait_seconds')::int = 0,
    format('a kid with no PIN is a plain no (%s)', v);
end $$;
reset role;

-- 4) Grown-up B can't count tries against A's kid or A's grown-up PIN.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
set local role authenticated;
do $$
declare
  sam constant uuid := '00000000-0000-0000-0000-000000005a02';
  v jsonb;
begin
  for i in 1..12 loop
    v := public.try_kid_pin(sam, lpad(i::text, 4, '0'));
    assert v ->> 'ok' = 'false' and v -> 'tries_left' = 'null'::jsonb, format('someone else''s kid is a plain no (%s)', v);
  end loop;
  assert not public.check_kid_pin(sam, '4821'), 'another grown-up''s check never opens my kid';
  v := public.try_parent_pin('9090');
  assert v ->> 'ok' = 'false' and v -> 'tries_left' = 'null'::jsonb, 'B has no grown-up PIN; A''s is A''s';
end $$;
reset role;
do $$
begin
  assert (select failed_tries = 0 and lockouts = 0 and locked_until is null
            from public.kid_pins where profile_id = '00000000-0000-0000-0000-000000005a02'),
    'another family''s tries are counted nowhere';
end $$;

-- 5) The grown-up PIN climbs the same ladder.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
set local role authenticated;
do $$
declare
  v jsonb;
begin
  for i in 1..5 loop v := public.try_parent_pin('1234'); end loop;
  assert (v ->> 'wait_seconds')::int = 60, format('five wrong grown-up PINs lock it for a minute (%s)', v);
  v := public.try_parent_pin('9090');
  assert v ->> 'ok' = 'false' and (v ->> 'wait_seconds')::int > 0, 'a locked grown-up PIN refuses the right one';
  assert not public.check_parent_pin('9090'), 'the old check reads it as no';
  perform public.set_parent_pin('9090');
  assert public.check_parent_pin('9090'), 'a new grown-up PIN unlocks it, and the old check still works';
end $$;
reset role;
do $$
begin
  assert (select failed_tries = 0 and lockouts = 0 and locked_until is null
            from public.parent_pins where id = '00000000-0000-0000-0000-0000000000a3'),
    'the right grown-up PIN clears its counters';
end $$;

-- 6) No client reads or changes the counters, or calls the helpers.
set local role authenticated;
do $$
declare
  refused text;
begin
  begin
    perform failed_tries from public.kid_pins;
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'kid PIN counters can''t be read';
  refused := null;
  begin
    update public.kid_pins set locked_until = null, failed_tries = 0;
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'kid PIN counters can''t be reset by hand';
  refused := null;
  begin
    update public.parent_pins set locked_until = null;
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'grown-up PIN counters can''t be reset by hand';
  refused := null;
  begin
    perform public.pin_try_step(true, 0, 0, null);
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'the counting helper is not the API''s';
  refused := null;
  begin
    perform public.pin_lock_seconds(1);
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'the ladder is not the API''s';
end $$;
reset role;

set local role anon;
do $$
declare
  refused text;
begin
  begin
    perform public.try_kid_pin('00000000-0000-0000-0000-000000005a02', '4821');
  exception when others then refused := sqlerrm;
  end;
  assert refused like '%permission denied%', 'a signed-out caller can''t try a PIN';
end $$;
reset role;

rollback;
