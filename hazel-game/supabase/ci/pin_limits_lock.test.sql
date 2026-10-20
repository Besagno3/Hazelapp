-- CI test for migration 0022's row lock (#124c review round 1): two PIN tries
-- at the same moment are counted one after the other, never over each other.
-- try_kid_pin / try_parent_pin read a PIN's counters `for update`; without it
-- a burst of parallel calls each reads the same count and writes the same
-- "one more", so many more than 5 guesses get checked before the lock (a
-- 30-call burst checked 10). The other SQL tests run in one session and can't
-- see this, so this one opens two more sessions with dblink:
--   A tries a wrong PIN and keeps its transaction open;
--   B tries another wrong PIN at the same moment — it must wait for A;
--   A commits; B's answer must count A's try too (3 left, not 4).
-- Without the row lock B reads the count from before A and answers 4 left.
--
-- Unlike the other tests this one must COMMIT its family (the other sessions
-- only see committed rows), so it uses its own ids and deletes them again.
-- dblink lives in its own schema and is dropped at the end, so no other test
-- sees its functions. Any failed assertion raises and exits non-zero under
-- `psql -v ON_ERROR_STOP=1`.

create schema if not exists ci_dblink;
create extension if not exists dblink schema ci_dblink;

-- The extra sessions log in like this one: over the server's own socket
-- (trusted in CI's postgres:16 and a local cluster), with this client's
-- password too when it has one (psql 15+'s \getenv).
\set pgpass ''
\getenv pgpass PGPASSWORD
select set_config('ci.pgpass', :'pgpass', false);

-- A leftover from a run that stopped halfway goes first.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c4';

begin;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c4', '{"consent_version": "2026-10-draft"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', true);
insert into public.profiles (id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000005c01', 'Ada', 'owl', 2017, 3);
select public.set_kid_pin('00000000-0000-0000-0000-000000005c01', '4821');
select public.set_parent_pin('9090');
commit;

do $$
declare
  -- This server's own socket and port, so the extra sessions reach the same
  -- database as this one (CI's postgres:16 and a local cluster alike).
  cs constant text := format('host=%s port=%s dbname=%s user=%s',
    split_part(current_setting('unix_socket_directories'), ',', 1),
    current_setting('port'), current_database(), current_user)
    -- (a connection string quotes with '…' and escapes with a backslash)
    || coalesce(' password=''' || replace(replace(nullif(current_setting('ci.pgpass'), ''), '\', '\\'), '''', '\''') || '''', '');
  ada constant uuid := '00000000-0000-0000-0000-000000005c01';
  who constant text := 'set "request.jwt.claim.sub" = ''00000000-0000-0000-0000-0000000000c4''';
  v jsonb;
  waited int;
begin
  perform ci_dblink.dblink_connect('a', cs);
  perform ci_dblink.dblink_connect('b', cs);
  -- Both sessions are grown-up C, as the API runs a signed-in call.
  perform ci_dblink.dblink_exec(c, 'set role authenticated') from unnest(array['a', 'b']) c;
  perform ci_dblink.dblink_exec(c, who) from unnest(array['a', 'b']) c;

  -- A kid's PIN.
  perform ci_dblink.dblink_exec('a', 'begin');
  select r into v from ci_dblink.dblink('a', format('select public.try_kid_pin(%L, %L)', ada, '0000')) as t(r jsonb);
  assert (v ->> 'tries_left')::int = 4, format('A''s wrong try leaves 4 (%s)', v);
  perform ci_dblink.dblink_send_query('b', format('select public.try_kid_pin(%L, %L)', ada, '1111'));
  perform pg_sleep(0.5);
  waited := ci_dblink.dblink_is_busy('b');
  assert waited = 1, 'B waits while A holds the PIN';
  perform ci_dblink.dblink_exec('a', 'commit');
  select r into v from ci_dblink.dblink_get_result('b') as t(r jsonb);
  perform * from ci_dblink.dblink_get_result('b') as t(r jsonb);
  assert (v ->> 'tries_left')::int = 3, format('B''s try is counted after A''s, not over it: 3 left (got %s)', v);

  -- The grown-up's PIN, the same way.
  perform ci_dblink.dblink_exec('a', 'begin');
  select r into v from ci_dblink.dblink('a', 'select public.try_parent_pin(''0000'')') as t(r jsonb);
  assert (v ->> 'tries_left')::int = 4, format('A''s wrong grown-up PIN leaves 4 (%s)', v);
  perform ci_dblink.dblink_send_query('b', 'select public.try_parent_pin(''1111'')');
  perform pg_sleep(0.5);
  waited := ci_dblink.dblink_is_busy('b');
  assert waited = 1, 'B waits while A holds the grown-up PIN';
  perform ci_dblink.dblink_exec('a', 'commit');
  select r into v from ci_dblink.dblink_get_result('b') as t(r jsonb);
  perform * from ci_dblink.dblink_get_result('b') as t(r jsonb);
  assert (v ->> 'tries_left')::int = 3, format('the grown-up PIN counts B after A too: 3 left (got %s)', v);

  perform ci_dblink.dblink_disconnect('a');
  perform ci_dblink.dblink_disconnect('b');
end $$;

do $$
begin
  assert (select failed_tries from public.kid_pins where profile_id = '00000000-0000-0000-0000-000000005c01') = 2,
    'both kid tries are in the count';
  assert (select failed_tries from public.parent_pins where id = '00000000-0000-0000-0000-0000000000c4') = 2,
    'both grown-up tries are in the count';
end $$;

-- Tidy up: the family (its kid, PINs and consent go with the login) and dblink.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c4';
drop extension dblink;
drop schema ci_dblink;
