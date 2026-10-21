-- CI test for migration 0024's password rule (#167 review rounds 1–2). The
-- auth service lets a sign-in change the login's password without the
-- current one (unless the project asks for it — and even then not from a
-- sign-in made by an email link), and a new password is a fresh sign-in that
-- could open 👪 Grown-ups. So every password change is noted (a trigger on
-- auth.users, run as the auth service's transaction ends): one the app said
-- was coming, for the sign-in that makes it (allow_password_change — a
-- password check naming the device, which that check just opened; or the
-- reset link's own sign-in, tied to the reset email the auth service
-- recorded), is fine; any other starts a day in which no password opens
-- 👪 Grown-ups ("password_changed", SQLSTATE HQ002, DETAIL = when it ends).
-- The grown-up PIN still does, and a new password set from a reset link ends
-- the wait. Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.
--
-- The auth service is played as it really behaves (supabase/auth): with the
-- app's implicit flow an emailed reset link signs in with the amr method
-- "otp" (not "recovery"); sending the email sets recovery_token and
-- recovery_sent_at, opening its link empties recovery_token, and a password
-- change empties both and — in the same transaction — ends every other
-- sign-in of the login (all of them for a change made outside a sign-in).
--
-- Who's who: grown-up A (…a7) has kid Sam with a PIN and a grown-up PIN;
-- their sign-ins are the family device (…d7, noted by the app), password
-- checks (…c7, …c8, made just now; …c9, two minutes ago), a kid's tablet
-- signed in to the same login an hour ago (…f7) and the email-link sign-ins
-- of section 3. E (…e8) is still setting up (no consent), signed in on …d8.
begin;

insert into auth.users (id, raw_user_meta_data, last_sign_in_at, encrypted_password, recovery_token) values
  ('00000000-0000-0000-0000-0000000000a7', '{"consent_version": "2026-10-draft"}', now(), 'hash-1', ''),
  ('00000000-0000-0000-0000-0000000000e8', '{}', now(), 'hash-e', '');
insert into auth.sessions (id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000a7', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000a7', now()),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000a7', now()),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000a7', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000a7', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000e8', now());
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
-- A's password changed by the auth service, as it does it: the new hash with
-- the pending tokens emptied, every other sign-in ended in the same
-- transaction (`p_caller` null: all of them — the dashboard, the admin API),
-- then the transaction's end, where the deferred trigger runs. The ended
-- sign-ins come back afterwards, so later sections keep their fixtures.
create temp table ended (like auth.sessions);
create function pg_temp.gotrue_change(p_hash text, p_caller uuid) returns void
language plpgsql as $$
begin
  update auth.users
     set encrypted_password = p_hash, recovery_token = '', recovery_sent_at = null
   where id = '00000000-0000-0000-0000-0000000000a7';
  delete from ended;
  with gone as (
    delete from auth.sessions
     where user_id = '00000000-0000-0000-0000-0000000000a7' and id is distinct from p_caller
    returning *
  )
  insert into ended select * from gone;
  set constraints all immediate;
  set constraints all deferred;
  insert into auth.sessions select * from ended;
end;
$$;
grant execute on function pg_temp.as_a(text, text, integer) to authenticated;
grant execute on function pg_temp.try(text) to authenticated;

-- 1) A change nobody checked: the device's own sign-in sets a new password
--    with no current password asked. A change made outside any sign-in (the
--    dashboard) is unchecked too. The trigger runs as the change's
--    transaction ends, never before.
update auth.users set encrypted_password = 'hash-1b' where id = '00000000-0000-0000-0000-0000000000a7';
do $$
begin
  assert not exists (select 1 from public.grown_up_password_changes where user_id = '00000000-0000-0000-0000-0000000000a7'),
    'nothing is noted until the change''s transaction ends (the trigger is deferred)';
end $$;
set constraints all immediate;
set constraints all deferred;
do $$
begin
  assert (select unchecked_at = now() and changed_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'as it commits, the login''s first change is noted unchecked';
end $$;
select pg_temp.gotrue_change('hash-2', '00000000-0000-0000-0000-0000000000d7');
do $$
begin
  assert (select unchecked_at = now() and changed_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'the change is noted as unchecked';
  -- Writing the same hash back (a no-op update) notes nothing new.
  update public.grown_up_password_changes set unchecked_at = now() - interval '1 minute'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  perform pg_temp.gotrue_change('hash-2', '00000000-0000-0000-0000-0000000000d7');
  assert (select unchecked_at = now() - interval '1 minute' from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'an unchanged hash notes nothing';
  perform pg_temp.gotrue_change('hash-2b', null);
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a dashboard change is unchecked too';
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
  -- The device asks for a check first, as the app does.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
  perform public.ask_grown_up_check();
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c7');
  got := pg_temp.try($s$select public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d7')$s$);
  assert got like 'HQ002 password_changed%', format('a password can''t open it (%s)', got);
  assert got like '%|' || to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    format('the refusal says when the wait ends (%s)', got);
  got := pg_temp.try($s$select public.allow_password_change('00000000-0000-0000-0000-0000000000d7')$s$);
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
-- (A's unchecked change five minutes back, before anyone asks for a reset.)
update public.grown_up_password_changes
   set changed_at = now() - interval '5 minutes', unchecked_at = now() - interval '5 minutes'
 where user_id = '00000000-0000-0000-0000-0000000000a7';

-- 3) "Forgot password?" ends the wait — played as the auth service really
--    does it (review round 2: with the implicit flow the link signs in as
--    "otp", which round 1's rule refused, so every reset STARTED the wait).
--    First, email-link sign-ins that are NOT that reset: …a1, a device
--    signed in by an email link (a sign-up confirmation, a magic link) two
--    minutes before the reset email went out; …a2, one signed in just now by
--    such a link while the reset email still waits unopened (someone asked
--    for it, nobody opened it); …a3, a token whose email-link time isn't its
--    sign-in's own.
update auth.users set recovery_token = 'pkce_or_plain_token', recovery_sent_at = now() - interval '30 seconds'
 where id = '00000000-0000-0000-0000-0000000000a7';
insert into auth.sessions (id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a7', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a7', now() - interval '10 seconds'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a7', now() - interval '2 hours');
set local role authenticated;
do $$
declare
  got text;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000a1', 'otp', -120);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('an email-link sign-in from before the reset email is no reset (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000a2', 'otp', -10);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('nor one while the reset email waits unopened (%s)', got);
  -- The device's own password sign-in can't say it either (it's no reset link).
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7', 'password', -20);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('a password sign-in is no reset link (%s)', got);
end $$;
reset role;
-- The grown-up opens the link: the auth service empties the token and signs
-- in a new session (…e7) with the amr method "otp".
update auth.users set recovery_token = '' where id = '00000000-0000-0000-0000-0000000000a7';
insert into auth.sessions (id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7', now() - interval '20 seconds');
set local role authenticated;
do $$
declare
  got text;
  v jsonb;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000a3', 'otp', -20);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('an email-link time that isn''t the sign-in''s own is no proof (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000a1', 'otp', -120);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('the email-link device from before the email still isn''t the reset (%s)', got);
  -- The reset page's own sign-in, as the auth service signs it in (otp): allowed.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'otp', -20);
  v := public.allow_password_change();
  assert v ->> 'by' = 'recovery' and (v ->> 'seconds')::int = 60, format('the reset link''s otp sign-in says a change is coming (%s)', v);
  -- The PKCE flow's "recovery" method counts the same.
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'recovery', -20);
  v := public.allow_password_change();
  assert v ->> 'by' = 'recovery', format('a PKCE reset sign-in too (%s)', v);
end $$;
reset role;
do $$
begin
  assert (select allowed_session = '00000000-0000-0000-0000-0000000000e7' and allowed_until = now() + interval '60 seconds'
            from public.grown_up_password_changes where user_id = '00000000-0000-0000-0000-0000000000a7'),
    'the allowance is for the reset page''s sign-in, for a minute';
end $$;
select pg_temp.gotrue_change('hash-3', '00000000-0000-0000-0000-0000000000e7');
do $$
begin
  assert (select unchecked_at is null and allowed_until is null and allowed_session is null and changed_at = now()
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
  -- A link is good for one change: the same sign-in, after it, is refused
  -- (the change cleared recovery_sent_at, as the auth service does).
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000e7', 'otp', -20);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('one change per reset link (%s)', got);
end $$;
reset role;
-- A link opened over an hour ago is no use either (its email went out earlier still).
update auth.users set recovery_token = '', recovery_sent_at = now() - interval '2 hours'
 where id = '00000000-0000-0000-0000-0000000000a7';
update auth.sessions set created_at = now() - interval '3700 seconds' where id = '00000000-0000-0000-0000-0000000000a3';
update public.grown_up_password_changes set changed_at = now() - interval '3 hours'
 where user_id = '00000000-0000-0000-0000-0000000000a7';
set local role authenticated;
do $$
declare
  got text;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000a3', 'otp', -3700);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('a link opened over an hour ago is no proof (%s)', got);
end $$;
reset role;
-- Nor a link opened before a password change the auth service made without
-- clearing the reset email's record (a hash it upgrades on sign-in).
update auth.users set recovery_token = '', recovery_sent_at = now() - interval '30 seconds'
 where id = '00000000-0000-0000-0000-0000000000a7';
update auth.sessions set created_at = now() - interval '20 seconds' where id = '00000000-0000-0000-0000-0000000000a3';
update public.grown_up_password_changes set changed_at = now() - interval '10 seconds'
 where user_id = '00000000-0000-0000-0000-0000000000a7';
set local role authenticated;
do $$
declare
  got text;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000a3', 'otp', -20);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('a link opened before the last password change is no proof (%s)', got);
end $$;
reset role;
update auth.users set recovery_sent_at = null where id = '00000000-0000-0000-0000-0000000000a7';

-- 4) The app's change-password page: the device asks, a check signs in, opens
--    the device (unlock) and names it as the sign-in that will change the
--    password — that change starts no wait. A sign-in the app never noted
--    (…b7, a password typed 20 s ago on the family device) can't say it,
--    for itself or naming the device (it was made before the ask) — the
--    server's own rule (review round 2); nor can the device, a check two
--    minutes old, or a check that never opened the device. The allowance is
--    good for one change, from that sign-in, for a minute; a failed change
--    and leaving 👪 Grown-ups drop it.
insert into auth.sessions (id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000a7', now() - interval '20 seconds');
set local role authenticated;
do $$
declare
  got text;
  v jsonb;
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
  perform public.ask_grown_up_check();
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000b7', 'password', -20);
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('an un-noted fresh device sign-in can''t, for itself (%s)', got);
  got := pg_temp.try($s$select public.allow_password_change('00000000-0000-0000-0000-0000000000d7')$s$);
  assert got like 'HQ002 reauth_required%', format('nor naming the device (it was made before the ask) (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
  got := pg_temp.try('select public.allow_password_change()');
  assert got like 'HQ002 reauth_required%', format('the device''s own sign-in can''t (%s)', got);
  got := pg_temp.try($s$select public.allow_password_change('00000000-0000-0000-0000-0000000000d7')$s$);
  assert got like 'HQ002 reauth_required%', format('nor naming itself (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c9');
  got := pg_temp.try($s$select public.allow_password_change('00000000-0000-0000-0000-0000000000d7')$s$);
  assert got like 'HQ002 reauth_required%', format('nor a sign-in two minutes old (%s)', got);
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c8');
  got := pg_temp.try($s$select public.allow_password_change('00000000-0000-0000-0000-0000000000d7')$s$);
  assert got like 'HQ002 reauth_required%', format('nor a check that hasn''t opened the device (%s)', got);
  perform public.unlock_grown_ups('00000000-0000-0000-0000-0000000000d7');
  v := public.allow_password_change('00000000-0000-0000-0000-0000000000d7');
  assert v ->> 'by' = 'password' and (v ->> 'seconds')::int = 60, format('a check that opened the device can (%s)', v);
end $$;
reset role;
-- Another sign-in of the login (the kid's tablet, …f7) changes the password
-- within that minute: the device's allowance isn't its own (the auth service
-- ended the device's sign-in in that change), so it's unchecked — and the
-- allowance is spent.
select pg_temp.gotrue_change('hash-4k', '00000000-0000-0000-0000-0000000000f7');
do $$
begin
  assert (select unchecked_at = now() and allowed_until is null from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'an allowance is for its own sign-in only';
  update public.grown_up_password_changes set unchecked_at = null where user_id = '00000000-0000-0000-0000-0000000000a7';
end $$;
set local role authenticated;
do $$
begin
  perform pg_temp.as_a('00000000-0000-0000-0000-0000000000c8');
  perform public.allow_password_change('00000000-0000-0000-0000-0000000000d7');
end $$;
reset role;
select pg_temp.gotrue_change('hash-4', '00000000-0000-0000-0000-0000000000d7');
do $$
begin
  assert (select unchecked_at is null and allowed_until is null from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'the checked change, by the device, starts no wait';
  -- One change: the next, with nothing said, is unchecked.
  perform pg_temp.gotrue_change('hash-5', '00000000-0000-0000-0000-0000000000d7');
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'an allowance is good for one change';
  -- A password allowance doesn't end a wait that's running: a link must.
  update public.grown_up_password_changes
     set allowed_until = now() + interval '30 seconds', allowed_by = 'password',
         allowed_session = '00000000-0000-0000-0000-0000000000d7'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  perform pg_temp.gotrue_change('hash-6', '00000000-0000-0000-0000-0000000000d7');
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a checked change leaves a running wait as it was';
  update public.grown_up_password_changes set unchecked_at = null where user_id = '00000000-0000-0000-0000-0000000000a7';
  -- Run out: an allowance past its minute is no use.
  update public.grown_up_password_changes
     set allowed_until = now() - interval '1 second', allowed_by = 'password',
         allowed_session = '00000000-0000-0000-0000-0000000000d7'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  perform pg_temp.gotrue_change('hash-7', '00000000-0000-0000-0000-0000000000d7');
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a run-out allowance is no use';
  update public.grown_up_password_changes set unchecked_at = null where user_id = '00000000-0000-0000-0000-0000000000a7';
  -- A change made outside any sign-in ends them all: no allowance survives it.
  update public.grown_up_password_changes
     set allowed_until = now() + interval '30 seconds', allowed_by = 'password',
         allowed_session = '00000000-0000-0000-0000-0000000000d7'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
  perform pg_temp.gotrue_change('hash-7b', null);
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a dashboard change uses no allowance';
  update public.grown_up_password_changes
     set unchecked_at = null, allowed_until = now() + interval '30 seconds', allowed_by = 'password',
         allowed_session = '00000000-0000-0000-0000-0000000000d7'
   where user_id = '00000000-0000-0000-0000-0000000000a7';
end $$;
-- The app's change failed (a weak password, the network): it drops the
-- allowance — only the sign-in it was for can.
set local role authenticated;
select pg_temp.as_a('00000000-0000-0000-0000-0000000000f7');
select public.drop_password_change();
reset role;
do $$
begin
  assert (select allowed_until is not null from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'another sign-in can''t drop it';
end $$;
set local role authenticated;
select pg_temp.as_a('00000000-0000-0000-0000-0000000000d7');
select public.drop_password_change();
reset role;
do $$
begin
  assert (select allowed_until is null and allowed_session is null from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'the device drops its own';
end $$;
select pg_temp.gotrue_change('hash-8', '00000000-0000-0000-0000-0000000000d7');
do $$
begin
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a dropped allowance is no use';
  update public.grown_up_password_changes
     set unchecked_at = null, allowed_until = now() + interval '30 seconds', allowed_by = 'password',
         allowed_session = '00000000-0000-0000-0000-0000000000d7'
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
select pg_temp.gotrue_change('hash-9', '00000000-0000-0000-0000-0000000000d7');
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

-- 6) The trigger is a deferred constraint trigger on the hash column, its
--    function the database's own — and it works when the auth service's own
--    role (no rights on public) writes the change.
do $$
begin
  assert exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_password_changed'
                    and p.proname = 'grown_up_note_password_change' and t.tgenabled <> 'D'
                    and t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred),
    'the password trigger is on auth.users, deferred to the change''s commit';
  assert (select prosecdef from pg_proc where oid = 'public.grown_up_note_password_change()'::regprocedure),
    'it writes as its owner (the auth service can''t touch public tables)';
  assert not has_table_privilege('authenticated', 'public.grown_up_password_changes', 'select'), 'nobody reads the notes';
end $$;
create role ci_auth_admin_stand_in nologin;
grant usage on schema auth to ci_auth_admin_stand_in;
grant select, update, delete on auth.users, auth.sessions to ci_auth_admin_stand_in;
update public.grown_up_password_changes set unchecked_at = null where user_id = '00000000-0000-0000-0000-0000000000a7';
set local role ci_auth_admin_stand_in;
update auth.users set encrypted_password = 'hash-10' where id = '00000000-0000-0000-0000-0000000000a7';
set constraints all immediate;
set constraints all deferred;
reset role;
do $$
begin
  assert not has_table_privilege('ci_auth_admin_stand_in', 'public.grown_up_password_changes', 'select'),
    'the stand-in has no rights on the notes';
  assert (select unchecked_at = now() from public.grown_up_password_changes
           where user_id = '00000000-0000-0000-0000-0000000000a7'), 'a change by the auth service''s role is noted';
end $$;

rollback;
