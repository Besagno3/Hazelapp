-- CI test for migration 0024's password rule (#167 review round 1). The auth
-- service lets a sign-in change the login's password without the current
-- one (unless the project asks for it), and a new password is a fresh
-- sign-in that could open 👪 Grown-ups. So every password change is noted
-- (a trigger on auth.users): one the app said was coming
-- (allow_password_change — a password check made just now, or a reset link
-- opened within the hour) is fine; any other starts a day in which no
-- password opens 👪 Grown-ups ("password_changed", SQLSTATE HQ002, DETAIL =
-- when it ends). The grown-up PIN still does, and a new password set from a
-- reset link ends the wait. Any failed assertion raises and exits non-zero
-- under `psql -v ON_ERROR_STOP=1`.
--
-- Who's who: grown-up A (…a7) has kid Sam with a PIN and a grown-up PIN;
-- their sign-ins are the family device (…d7, noted by the app), password
-- checks (…c7, …c8, …c9) and a reset link's sign-in (…e7). E (…e8) is still
-- setting up (no consent), signed in on …d8.
begin;

insert into auth.users (id, raw_user_meta_data, last_sign_in_at, encrypted_password) values
  ('00000000-0000-0000-0000-0000000000a7', '{"consent_version": "2026-10-draft"}', now(), 'hash-1'),
  ('00000000-0000-0000-0000-0000000000e8', '{}', now(), 'hash-e');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000a7'),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000a7'),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000a7'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000a7'),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7'),
  ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000e8');
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month, has_pin) values
  ('00000000-0000-0000-0000-000000005a07', '00000000-0000-0000-0000-0000000000a7', 'Sam', 'fox', 2017, 3, true);
insert into public.kid_pins (profile_id, pin_hash) values
  ('00000000-0000-0000-0000-000000005a07', extensions.crypt('4821', extensions.gen_salt('bf')));
insert into public.parent_pins (id, pin_hash) values
  ('00000000-0000-0000-0000-0000000000a7', extensions.crypt('9090', extensions.gen_salt('bf')));
update public.parents set has_pin = true where id = '00000000-0000-0000-0000-0000000000a7';
insert into public.grown_up_sessions (user_id, session_id, kind) values
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000d7', 'device');

-- Claims for A's sign-in `s`, with an amr entry `method` at now + `at_offset_s`.
create function pg_temp.as_a(s text, method text default 'password', at_offset_s integer default 0) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000a7', 'session_id', s,
    'amr', jsonb_build_array(jsonb_build_object('method', method,
                                                'timestamp', extract(epoch from now())::bigint + at_offset_s))
  )::text, true);
end;
$$;
-- What a call raised ('ok' when it didn't): SQLSTATE, message, and DETAIL.
create function pg_temp.try(stmt text) returns text
language plpgsql as $$
declare
  v_state text;
  v_msg   text;
  v_detail text;
begin
  execute stmt;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
  return v_state || ' ' || v_msg || ' |' || coalesce(v_detail, '');
end;
$$;
grant execute on function pg_temp.as_a(text, text, integer) to authenticated;
grant execute on function pg_temp.try(text) to authenticated;

-- 1) A change nobody checked: the device's own sign-in sets a new password
--    with no current password asked (the auth service writes the hash).
update auth.users set encrypted_password = 'hash-2' where id = '00000000-0000-0000-0000-0000000000a7';
do $$
begin
  assert (select unchecked_at = now() and changed_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'the change is noted as unchecked';
  -- Writing the same hash back (a no-op update) notes nothing new.
  update public.grown_up_password_changes set unchecked_at = now() - interval '1 minute'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  update auth.users set encrypted_password = 'hash-2' where id = '00000000-0000-0000-0000-0000000000a7';
  assert (select unchecked_at = now() - interval '1 minute' from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'an unchanged hash notes nothing';
  update public.grown_up_password_changes set unchecked_at = now()
   where user_id = '00000000-0000-0000-0000-0000000000a7';
end $$;

-- 2) For a day, a password opens nothing: the check that would open the
--    device is refused with when it ends; so is a password check asking to
--    change it again (the password itself is in doubt). The grown-up PIN
--    still opens it. E, still setting up, is not affected by A's change.
set local role authenticated;
do $$
declare
  got text;
  v jsonb;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c7');
  got := pg_temp.try($s$select public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d7')$s$);
  assert got like 'HQ002 password_changed%', format('a password can''t open it (%s)', got);
  assert got like '%|' || to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    format('the refusal says when the wait ends (%s)', got);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 password_changed%', format('nor ask to change it again (%s)', got);
  -- The device's own PIN does.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
  v := public.try_parent_pin('9090');
  assert (v ->> 'grown_ups_seconds')::int = 900, format('the grown-up PIN still opens it (%s)', v);
  assert public.grown_ups_unlocked(), 'open by PIN';
  perform public.lock_grown_ups();
end $$;
reset role;

-- …nor does a first-run self-open (a fresh sign-in with the new password on
-- a family still being set up).
update public.grown_up_password_changes set unchecked_at = null;
insert into public.grown_up_password_changes (user_id, changed_at, unchecked_at)
  values ('00000000-0000-0000-0000-0000000000e8', now(), now());
set local role authenticated;
do $$
declare
  got text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000e8', 'session_id', '00000000-0000-0000-0000-0000000000d8',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))
  )::text, true);
  got := pg_temp.try('select public.unlock_grown_ups()');
  assert got like 'HQ002 password_changed%', format('a first run waits too (%s)', got);
end $$;
reset role;
delete from public.grown_up_password_changes where user_id = '00000000-0000-0000-0000-0000000000e8';
update public.grown_up_password_changes set unchecked_at = now() where user_id = '00000000-0000-0000-0000-0000000000a7';

-- 3) A reset link ends the wait: its sign-in (amr "recovery", opened just
--    after the change) says a change is coming, and the change it makes
--    clears the wait. The device's own sign-in, even noted, may do this —
--    the link proved the inbox.
set local role authenticated;
do $$
declare
  got text;
  v jsonb;
begin
  -- A link opened before the last change, or over an hour ago, doesn't count;
  -- it falls back to the password-check rule, which the wait refuses.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'recovery', -5);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002%', format('a link from before the change is no proof (%s)', got);
end $$;
reset role;
-- (The change two hours back, so only the link's own age can refuse the next one.)
update public.grown_up_password_changes set changed_at = now() - interval '2 hours'
 where user_id = '00000000-0000-0000-0000-0000000000a7';
set local role authenticated;
do $$
declare
  got text;
  v jsonb;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'recovery', -3700);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002%', format('a link over an hour old is no proof (%s)', got);
  -- Opened just after the change: allowed.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'recovery', 1);
  v := public.allow_password_change();
  assert v ->> 'by' = 'recovery' and (v ->> 'seconds')::int = 600, format('a reset link says a change is coming (%s)', v);
end $$;
reset role;
update auth.users set encrypted_password = 'hash-3' where id = '00000000-0000-0000-0000-0000000000a7';
do $$
begin
  assert (select unchecked_at is null and allowed_until is null and changed_at = now()
            from public.grown_up_password_changes where user_id = '00000000-0000-0000-0000-0000000000a7'),
    'the reset link''s change ends the wait and uses up the allowance';
end $$;
set local role authenticated;
do $$
declare
  got text;
begin
  -- Now a password check opens the device again.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c7');
  perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d7');
  -- A link is good for one change: the same sign-in, after it, is refused.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'recovery', -1);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002%', format('one change per reset link (%s)', got);
end $$;
reset role;

-- 4) The app's change-password page: the current password typed again (a
--    check) says a change is coming, and that change starts no wait. The
--    device's own sign-in can't say it, a check made two minutes ago can't,
--    and it's good for one change and ten minutes — leaving 👪 Grown-ups
--    drops it.
update auth.sessions set created_at = now() - interval '2 minutes' where id = '00000000-0000-0000-0000-0000000000c9';
set local role authenticated;
do $$
declare
  got text;
  v jsonb;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('the device''s own sign-in can''t (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c9');
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('nor a sign-in two minutes old (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c8');
  v := public.allow_password_change();
  assert v ->> 'by' = 'password', format('a check can (%s)', v);
end $$;
reset role;
update auth.users set encrypted_password = 'hash-4' where id = '00000000-0000-0000-0000-0000000000a7';
do $$
begin
  assert (select unchecked_at is null and allowed_until is null from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'the checked change starts no wait';
  -- One change: the next, with nothing said, is unchecked.
  update auth.users set encrypted_password = 'hash-5' where id = '00000000-0000-0000-0000-0000000000a7';
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'an allowance is good for one change';
  -- A password allowance doesn't end a wait that's running: a link must.
  update public.grown_up_password_changes set allowed_until = now() + interval '5 minutes', allowed_by = 'password'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  update auth.users set encrypted_password = 'hash-6' where id = '00000000-0000-0000-0000-0000000000a7';
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a checked change leaves a running wait as it was';
  update public.grown_up_password_changes set unchecked_at = null where user_id = '00000000-0000-0000-0000-0000000000a7';
  -- Run out: an allowance from eleven minutes ago is no use.
  update public.grown_up_password_changes set allowed_until = now() - interval '1 minute', allowed_by = 'password'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  update auth.users set encrypted_password = 'hash-7' where id = '00000000-0000-0000-0000-0000000000a7';
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a run-out allowance is no use';
  update public.grown_up_password_changes set unchecked_at = null where user_id = '00000000-0000-0000-0000-0000000000a7';
  update public.grown_up_password_changes set allowed_until = now() + interval '5 minutes', allowed_by = 'password'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
end $$;
-- Leaving 👪 Grown-ups (the device locks it) drops an allowance not used.
set local role authenticated;
do $$
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
  perform public.lock_grown_ups();
end $$;
reset role;
update auth.users set encrypted_password = 'hash-8' where id = '00000000-0000-0000-0000-0000000000a7';
do $$
begin
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'leaving 👪 Grown-ups drops the allowance';
end $$;

-- 5) The wait ends after a day.
update public.grown_up_password_changes set unchecked_at = now() - interval '25 hours'
 where user_id = '00000000-0000-0000-0000-0000000000a7';
delete from public.grown_up_sessions where kind = 'check';
set local role authenticated;
do $$
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c7');
  perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d7');
end $$;
reset role;

-- 6) The trigger is on the hash column, and its function is the database's own.
do $$
begin
  assert exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_password_changed'
                    and p.proname = 'grown_up_note_password_change' and t.tgenabled <> 'D'),
    'the password trigger is on auth.users';
  assert (select prosecdef from pg_proc where oid = 'public.grown_up_note_password_change()'::regprocedure),
    'it writes as its owner (the auth service can''t touch public tables)';
  assert not has_table_privilege('authenticated', 'public.grown_up_password_changes', 'select'), 'nobody reads the notes';
end $$;

rollback;
