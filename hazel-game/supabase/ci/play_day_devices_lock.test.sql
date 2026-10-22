-- CI test for migration 0027's lock on a day (#179): two devices noting one
-- kid's day at the same moment take turns, so the day's sum counts both.
-- play_day_add_part locks the day's play_days row (`for update`) before it
-- writes its part and adds the parts up; without it, the second note adds up
-- the parts it can see — not the first note's, still uncommitted — and then
-- writes that sum over the first note's, so the day loses a device until its
-- next note. The other SQL tests run in one session and can't see this, so
-- this one opens two more sessions with dblink (as pin_limits_lock does):
--   1. A notes the tablet's day and keeps its transaction open; B notes the
--      laptop's day at the same moment — it must wait for A; A commits; the
--      day must hold both devices' play.
--   2. The narrow window the lock is for: B is paused after adding up the
--      parts, just before it writes the day (a test-only statement trigger
--      that waits on an advisory lock this session holds); A notes its day
--      meanwhile — it must wait for B rather than write over it; then B
--      goes on, and the day must hold both. Without the lock A writes first
--      and B's older sum (its part alone) lands on top.
--
-- Unlike the other tests this one must COMMIT its family (the other sessions
-- only see committed rows), so it uses its own ids and deletes them again.
-- dblink lives in its own schema and is dropped at the end.

create schema if not exists ci_dblink;
create extension if not exists dblink schema ci_dblink;

\set pgpass ''
\getenv pgpass PGPASSWORD
\o /dev/null
select set_config('ci.pgpass', :'pgpass', false);
\o

-- A leftover from a run that stopped halfway goes first.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c9';
drop trigger if exists ci_pause_day_write on public.play_days;
drop function if exists public.ci_pause_day_write();

begin;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c9', '{"consent_version": "2026-10-draft"}');
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000007c01', '00000000-0000-0000-0000-0000000000c9', 'Ada', 'owl', 2017, 3);
-- The day already noted (an old tab's note_play_days: zeros), so both
-- sessions find the row there.
insert into public.profiles (id, parent_id, display_name, icon, birth_year, birth_month) values
  ('00000000-0000-0000-0000-000000007c02', '00000000-0000-0000-0000-0000000000c9', 'Bo', 'cat', 2018, 6);
insert into public.play_days (profile_id, day) values
  ('00000000-0000-0000-0000-000000007c01', (now() at time zone 'UTC')::date),
  ('00000000-0000-0000-0000-000000007c02', (now() at time zone 'UTC')::date);
-- Test only: a session that sets ci.pause_day waits, as it starts writing a
-- day (before any row of it is locked), until advisory lock 4179 is free.
create function public.ci_pause_day_write() returns trigger language plpgsql as $f$
begin
  if current_setting('ci.pause_day', true) = 'on' then
    perform pg_advisory_lock_shared(4179);
    perform pg_advisory_unlock_shared(4179);
  end if;
  return null;
end $f$;
create trigger ci_pause_day_write before update on public.play_days
  for each statement execute function public.ci_pause_day_write();
commit;

do $$
declare
  cs constant text := format('host=%s port=%s dbname=%s user=%s',
    split_part(current_setting('unix_socket_directories'), ',', 1),
    current_setting('port'), current_database(), current_user)
    || coalesce(' password=''' || replace(replace(nullif(current_setting('ci.pgpass'), ''), '\', '\\'), '''', '\''') || '''', '');
  ada constant uuid := '00000000-0000-0000-0000-000000007c01';
  bo constant uuid := '00000000-0000-0000-0000-000000007c02';
  who constant text := 'set "request.jwt.claim.sub" = ''00000000-0000-0000-0000-0000000000c9''';
  today constant text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  note constant text := 'select public.note_device_play(%L, %L, %L::jsonb)';
  n integer;
begin
  perform ci_dblink.dblink_connect('a', cs);
  perform ci_dblink.dblink_connect('b', cs);
  perform ci_dblink.dblink_exec(c, 'set role authenticated') from unnest(array['a', 'b']) c;
  perform ci_dblink.dblink_exec(c, who) from unnest(array['a', 'b']) c;

  perform ci_dblink.dblink_exec('a', 'begin');
  select r into n from ci_dblink.dblink('a', format(note, ada, 'tab-1',
    jsonb_build_array(jsonb_build_object('day', today, 'xp', 40, 'minutes', 10, 'noted', true)))) as t(r integer);
  assert n = 1, 'A noted the tablet''s day';
  perform ci_dblink.dblink_send_query('b', format(note, ada, 'lap-1',
    jsonb_build_array(jsonb_build_object('day', today, 'xp', 25, 'minutes', 5, 'noted', true))));
  perform pg_sleep(0.5);
  assert ci_dblink.dblink_is_busy('b') = 1, 'B waits while A holds the day';
  perform ci_dblink.dblink_exec('a', 'commit');
  select r into n from ci_dblink.dblink_get_result('b') as t(r integer);
  perform * from ci_dblink.dblink_get_result('b') as t(r integer);
  assert n = 1, 'B noted the laptop''s day';

  -- 2. B paused between adding up and writing; A comes in meanwhile.
  perform pg_advisory_lock(4179);
  perform ci_dblink.dblink_exec('b', 'set ci.pause_day = ''on''');
  perform ci_dblink.dblink_send_query('b', format(note, bo, 'lap-1',
    jsonb_build_array(jsonb_build_object('day', today, 'xp', 25, 'minutes', 5, 'noted', true))));
  perform pg_sleep(0.5);
  assert ci_dblink.dblink_is_busy('b') = 1, 'B is paused before it writes the day';
  perform ci_dblink.dblink_send_query('a', format(note, bo, 'tab-1',
    jsonb_build_array(jsonb_build_object('day', today, 'xp', 40, 'minutes', 10, 'noted', true))));
  perform pg_sleep(0.5);
  assert ci_dblink.dblink_is_busy('a') = 1, 'A waits for B''s day';
  perform pg_advisory_unlock(4179);
  select r into n from ci_dblink.dblink_get_result('b') as t(r integer);
  perform * from ci_dblink.dblink_get_result('b') as t(r integer);
  assert n = 1, 'B noted the laptop''s day';
  select r into n from ci_dblink.dblink_get_result('a') as t(r integer);
  perform * from ci_dblink.dblink_get_result('a') as t(r integer);
  assert n = 1, 'A noted the tablet''s day';

  perform ci_dblink.dblink_disconnect('a');
  perform ci_dblink.dblink_disconnect('b');
end $$;

do $$
begin
  assert (select xp = 65 and minutes = 15 from public.play_days
           where profile_id = '00000000-0000-0000-0000-000000007c01' and day = (now() at time zone 'UTC')::date),
    format('the day holds both devices: 40 + 25 XP, 10 + 5 minutes (got %s)',
           (select to_jsonb(d) from public.play_days d where profile_id = '00000000-0000-0000-0000-000000007c01'));
  assert (select xp = 65 and minutes = 15 from public.play_days
           where profile_id = '00000000-0000-0000-0000-000000007c02' and day = (now() at time zone 'UTC')::date),
    format('a note coming in while another adds up waits, so the day holds both (got %s)',
           (select to_jsonb(d) from public.play_days d where profile_id = '00000000-0000-0000-0000-000000007c02'));
end $$;

-- Tidy up: the family (its kids, days and parts go with the login), the
-- pause and dblink.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c9';
drop trigger ci_pause_day_write on public.play_days;
drop function public.ci_pause_day_write();
drop extension dblink;
drop schema ci_dblink;
