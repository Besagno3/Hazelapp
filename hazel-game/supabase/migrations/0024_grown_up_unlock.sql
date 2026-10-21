-- Hazel Quest — 👪 Grown-ups enforced by the database (#167)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0023.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- Until now the grown-up PIN / password gate in front of 👪 Grown-ups was a
-- lock in the app only: every grown-up action needed just the family's
-- sign-in, which a kid on the shared device holds, so a kid with the
-- browser's developer tools could skip the gate (add or remove a sibling, set
-- PINs, a new grown-up PIN, release questions…). Now the database keeps a
-- short "grown-up unlocked until" for each sign-in (session), and the
-- grown-up actions refuse without it.
--
-- What opens it, for 15 minutes:
--   * the right grown-up PIN (try_parent_pin, and check_parent_pin for app
--     tabs from before this) — on the sign-in that typed it;
--   * unlock_grown_ups(session), called by the app right after the 👪 gate
--     (or Close account, or changing the login) checked the password: that
--     check signs in on a client of its own, so its token says "password,
--     just now", and it opens the device's own sign-in, which it names;
--   * unlock_grown_ups() on a sign-in's own token, while the family is still
--     being set up (no consent yet, no player yet, or a player without a PIN)
--     and only in the minute after that sign-in: the first-run flow (sign
--     up or sign in → consent → first player → their PIN) needs no gate.
-- What closes it: lock_grown_ups() (the app calls it on leaving 👪 Grown-ups
-- and once a new family is set up), or the 15 minutes running out.
--
-- Why 15 minutes, from the unlock (not from the last action): it covers a
-- whole visit — the first-run flow, adding a player and their PIN, reading
-- the privacy notice, a round of question review — while a device handed
-- back to a kid without "Done" (a closed tab, a phone put down) stays open
-- for at most that long. An inactivity window would need every grown-up
-- write to extend it (many are plain table writes); a fixed one is simpler
-- to reason about and to test. Running out mid-visit costs the grown-up a
-- 4-digit PIN (or the password), and the app keeps what they typed.
--
-- Grown-up actions (refuse while it's shut, "grown_ups_locked", SQLSTATE
-- HQ001): adding a player (profiles insert), removing one (delete),
-- changing their nickname, picture, birth date or PIN flag (update of those
-- columns), set_kid_pin, set_parent_pin, record_consent, admin_review_queue,
-- admin_review_question, and delete_family (the session the app names must
-- be unlocked). The kid's own play needs no gate: saving the game (saves),
-- XP / levels / skill levels / streak / power-ups (profiles update of those
-- columns only), 🚩 reports, marking questions seen, trying their PIN,
-- pin_lock_status, is_admin, and every read.
--
-- Why a session, not just the login: unlocking 👪 on the grown-up's phone
-- must not open the family laptop, and it closes the minute after a real
-- sign-in on the family device (#167's "what's left"): that sign-in's
-- token is fresh, but it may unlock itself only while the family is being
-- set up, and it can't name another live session it doesn't hold.
--
-- Supabase puts `session_id` and `amr` in every user token (auth.jwt()).

-- 1) Who has 👪 Grown-ups open, on which sign-in, until when. No client may
--    read or write it (RLS on, no policies, no grants): only the functions
--    below get in.
create table if not exists public.grown_up_unlocks (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  session_id     uuid        not null,
  unlocked_until timestamptz not null,
  primary key (user_id, session_id)
);
alter table public.grown_up_unlocks enable row level security;
revoke all on public.grown_up_unlocks from public, anon, authenticated;

-- 2) Small helpers.

-- How long 👪 Grown-ups stays open after an unlock (see above).
create or replace function public.grown_up_unlock_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 900;
$$;

-- The sign-in (session) this call's token belongs to; null when it has none.
create or replace function public.jwt_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := auth.jwt() ->> 'session_id';
begin
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

-- Whether this call's token was signed in just now (within a minute, a
-- minute's clock drift allowed) — the rule delete-account uses
-- (`signedInFreshly`, _shared/closeAccount.ts): Supabase lists how a session
-- signed in under `amr` as [{method, timestamp}] and keeps it through token
-- refreshes; a token with no `amr` says nothing and is refused; bare method
-- names (a custom hook) must name a password, and then the login's last
-- sign-in must be just now. Never `iat`, which every refresh renews.
-- Unlike closing, an email link opened just now counts too (a sign-up's
-- confirmation, a magic link, a reset link): that's how a new family's
-- first sign-in arrives when the project confirms emails, and it proves the
-- grown-up's inbox, not just the device.
create or replace function public.grown_up_signed_in_freshly()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_window constant double precision := 60;
  c_slack  constant double precision := 60;
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_amr    jsonb := v_claims -> 'amr';
  v_now    double precision := extract(epoch from now());
  v_last   timestamptz;
begin
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' or jsonb_array_length(v_amr) = 0 then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(v_amr) e
              where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'method') = 'string') then
    return exists (
      select 1 from jsonb_array_elements(v_amr) e
       where jsonb_typeof(e) = 'object'
         and e ->> 'method' in ('password', 'otp', 'magiclink', 'email/signup', 'recovery', 'invite')
         and jsonb_typeof(e -> 'timestamp') = 'number'
         and (e ->> 'timestamp')::double precision <= v_now + c_slack
         and v_now - (e ->> 'timestamp')::double precision <= c_window
    );
  end if;
  if not exists (select 1 from jsonb_array_elements(v_amr) e
                  where jsonb_typeof(e) = 'string' and e #>> '{}' in ('password', 'pwd')) then
    return false;
  end if;
  select u.last_sign_in_at into v_last from auth.users u where u.id = auth.uid();
  return v_last is not null
     and extract(epoch from v_last) <= v_now + c_slack
     and v_now - extract(epoch from v_last) <= c_window;
end;
$$;

-- Whether a family is still being set up: no consent yet, no player yet, or
-- a player without a PIN (the screens before "Who's playing?").
create or replace function public.grown_up_first_run(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.parents where id = p_user and consent_at is not null)
      or not exists (select 1 from public.profiles where parent_id = p_user)
      or exists (select 1 from public.profiles where parent_id = p_user and not has_pin);
$$;

-- Open 👪 Grown-ups on one of the caller's sign-ins for the window.
create or replace function public.grown_up_open(p_user uuid, p_session uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz := now() + make_interval(secs => public.grown_up_unlock_seconds());
begin
  -- Old rows go as new ones come (the caller's own, run out).
  delete from public.grown_up_unlocks where user_id = p_user and unlocked_until <= now();
  insert into public.grown_up_unlocks (user_id, session_id, unlocked_until)
  values (p_user, p_session, v_until)
  on conflict (user_id, session_id) do update set unlocked_until = excluded.unlocked_until;
  return v_until;
end;
$$;

revoke execute on function public.grown_up_unlock_seconds() from public, anon, authenticated;
revoke execute on function public.jwt_session_id() from public, anon, authenticated;
revoke execute on function public.grown_up_signed_in_freshly() from public, anon, authenticated;
revoke execute on function public.grown_up_first_run(uuid) from public, anon, authenticated;
revoke execute on function public.grown_up_open(uuid, uuid) from public, anon, authenticated;

-- 3) The check every grown-up action makes: is 👪 Grown-ups open on this
--    sign-in? (Callable by the app too, and by RLS policies, which run as
--    the caller.)
create or replace function public.grown_ups_unlocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.grown_up_unlocks u
     where u.user_id = auth.uid()
       and u.session_id = public.jwt_session_id()
       and u.unlocked_until > now()
  );
$$;
revoke execute on function public.grown_ups_unlocked() from public, anon;
grant execute on function public.grown_ups_unlocked() to authenticated;

-- …and the refusal, the same everywhere (the app knows it by its code).
create or replace function public.require_grown_up()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.grown_ups_unlocked() then
    raise exception 'grown_ups_locked: open 👪 Grown-ups with your grown-up PIN or password first'
      using errcode = 'HQ001';
  end if;
end;
$$;
revoke execute on function public.require_grown_up() from public, anon, authenticated;

-- 4) Opening and closing it.

-- After the app checked the grown-up's password: called with that check's
-- own token (a password typed just now), naming the device's sign-in to
-- open (`p_session`, a live session of the same login). With no session
-- named, the caller's own sign-in — only while the family is being set up
-- (the first-run flow, right after signing up or in). Refusals: HQ002
-- "reauth_required" (not signed in just now, or the family is set up and
-- the sign-in tried to open itself) / "no_session".
create or replace function public.unlock_grown_ups(p_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_own  uuid := public.jwt_session_id();
  v_target uuid := coalesce(p_session, v_own);
begin
  if v_user is null or v_own is null or v_target is null then
    raise exception 'no_session: this sign-in has no session to open' using errcode = 'HQ002';
  end if;
  if not public.grown_up_signed_in_freshly() then
    raise exception 'reauth_required: type your password again to open 👪 Grown-ups' using errcode = 'HQ002';
  end if;
  if v_target = v_own then
    -- A sign-in opening itself: only the first-run flow. Afterwards the
    -- device's own sign-in, however fresh, is no proof a grown-up is here
    -- (they may have just signed in and handed it to a kid).
    if not public.grown_up_first_run(v_user) then
      raise exception 'reauth_required: type your password on the 👪 gate to open it' using errcode = 'HQ002';
    end if;
  elsif not exists (
    select 1 from auth.sessions s
     where s.id = v_target and s.user_id = v_user
       and (s.not_after is null or s.not_after > now())
  ) then
    -- Another sign-in: one of this login's live sessions, never a made-up id.
    raise exception 'no_session: that sign-in isn''t one of yours' using errcode = 'HQ002';
  end if;
  perform public.grown_up_open(v_user, v_target);
  return jsonb_build_object('unlocked', true, 'seconds', public.grown_up_unlock_seconds());
end;
$$;

-- Leaving 👪 Grown-ups: shut it on this sign-in (and tidy run-out rows).
create or replace function public.lock_grown_ups()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.grown_up_unlocks
   where user_id = auth.uid()
     and (session_id = public.jwt_session_id() or unlocked_until <= now());
$$;

revoke execute on function public.unlock_grown_ups(uuid) from public, anon;
revoke execute on function public.lock_grown_ups() from public, anon;
grant execute on function public.unlock_grown_ups(uuid) to authenticated;
grant execute on function public.lock_grown_ups() to authenticated;

-- 5) The right grown-up PIN opens it, on the sign-in that typed it (0022's
--    count otherwise unchanged; check_parent_pin goes through here, so app
--    tabs from before this open it too). The answer gains
--    "grown_ups_seconds" when it opened.
create or replace function public.try_parent_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.parent_pins%rowtype;
  s record;
  v_session uuid := public.jwt_session_id();
begin
  select * into r from public.parent_pins where id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'tries_left', null, 'wait_seconds', 0);
  end if;

  if r.locked_until > now() then
    return public.pin_locked_verdict(r.locked_until);
  end if;

  select * into s
    from public.pin_try_step(coalesce(r.pin_hash = extensions.crypt(p_pin, r.pin_hash), false),
                             r.failed_tries, r.lockouts, r.last_failed_at);
  update public.parent_pins
     set failed_tries = s.failed_tries,
         lockouts = s.lockouts,
         locked_until = s.locked_until,
         last_failed_at = s.last_failed_at
   where id = r.id;
  if (s.verdict ->> 'ok')::boolean and v_session is not null then
    perform public.grown_up_open(r.id, v_session);
    return s.verdict || jsonb_build_object('grown_ups_seconds', public.grown_up_unlock_seconds());
  end if;
  return s.verdict;
end;
$$;

-- 6) The grown-up functions want it open.
create or replace function public.set_kid_pin(p_kid uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_grown_up();
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'pin_format: a PIN is 4 digits';
  end if;
  if not exists (select 1 from public.profiles where id = p_kid and parent_id = auth.uid()) then
    raise exception 'not_your_kid: that player belongs to another account';
  end if;
  insert into public.kid_pins (profile_id, pin_hash)
  values (p_kid, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        updated_at = now(),
        failed_tries = 0,
        lockouts = 0,
        locked_until = null,
        last_failed_at = null;
  update public.profiles set has_pin = true where id = p_kid;
end;
$$;

create or replace function public.set_parent_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_grown_up();
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'pin_format: a PIN is 4 digits';
  end if;
  insert into public.parent_pins (id, pin_hash)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (id) do update
    set pin_hash = excluded.pin_hash,
        updated_at = now(),
        failed_tries = 0,
        lockouts = 0,
        locked_until = null,
        last_failed_at = null;
  insert into public.parents (id, has_pin) values (auth.uid(), true)
  on conflict (id) do update set has_pin = true;
end;
$$;

create or replace function public.record_consent(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_grown_up();
  insert into public.parents (id, consent_at, consent_version)
  values (auth.uid(), now(), left(p_version, 40))
  on conflict (id) do update
    set consent_at = now(), consent_version = left(p_version, 40);
end;
$$;

create or replace function public.admin_review_queue()
returns table (
  id            uuid,
  topic         text,
  level         smallint,
  age           smallint,
  status        text,
  text          text,
  options       jsonb,
  correct_index smallint,
  explanation   text,
  reports       bigint,
  families      bigint,
  not_for_kids  bigint,
  reasons       text[],
  last_report   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  perform public.require_grown_up();
  return query
    select r.id, r.topic, r.level, q.age, r.status, r.text, r.options, r.correct_index, r.explanation,
           r.reports, r.families, r.not_for_kids, r.reasons, r.last_report
      from public.question_review_queue r
      join public.questions q on q.id = r.id
     order by (r.status = 'review') desc, r.not_for_kids desc, r.families desc, r.last_report desc nulls last;
end;
$$;

create or replace function public.admin_review_question(p_question uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  perform public.require_grown_up();
  perform public.review_question(p_question, p_status);
  update public.questions set reviewed_by = auth.uid() where id = p_question;
end;
$$;

-- 7) Players: adding, removing and changing who they are is the grown-up's;
--    their play (XP, levels, streak, power-ups) is theirs. A trigger, so a
--    refusal says why (an RLS policy would just skip a delete without a
--    word, and can't tell a nickname from XP in one update). Only the API's
--    own roles are checked: the database's own work — a security-definer
--    function such as set_kid_pin (which checks the gate itself) or
--    delete_family, the auth service deleting a login — runs as another
--    role.
create or replace function public.profiles_grown_up_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and (new.id, new.parent_id, new.display_name, new.icon, new.birth_year, new.birth_month, new.has_pin)
         is not distinct from
         (old.id, old.parent_id, old.display_name, old.icon, old.birth_year, old.birth_month, old.has_pin) then
    return new;
  end if;
  if not public.grown_ups_unlocked() then
    raise exception 'grown_ups_locked: open 👪 Grown-ups with your grown-up PIN or password first'
      using errcode = 'HQ001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists profiles_grown_up_gate on public.profiles;
create trigger profiles_grown_up_gate
  before insert or update or delete on public.profiles
  for each row execute function public.profiles_grown_up_gate();

-- The insert policy says it too (belt and braces: the trigger refuses first, in words).
drop policy if exists "Grown-ups add kids" on public.profiles;
create policy "Grown-ups add kids"
  on public.profiles for insert
  with check (auth.uid() = parent_id and public.grown_ups_unlocked());

-- 8) Closing the account: the sign-in the app names (the device where
--    👪 Grown-ups is open) must be unlocked, besides the password typed just
--    now that delete-account checks. Signature changed (a second argument),
--    so the old one goes. Still service role only.
drop function if exists public.delete_family(uuid);
create or replace function public.delete_family(p_parent uuid, p_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kids integer;
begin
  if p_parent is null then
    raise exception 'no_parent: whose account is this?';
  end if;
  if p_session is null or not exists (
    select 1 from public.grown_up_unlocks u
     where u.user_id = p_parent and u.session_id = p_session and u.unlocked_until > now()
  ) then
    raise exception 'grown_ups_locked: open 👪 Grown-ups with your grown-up PIN or password first'
      using errcode = 'HQ001';
  end if;

  delete from public.profiles where parent_id = p_parent;
  get diagnostics v_kids = row_count;

  delete from public.question_requests
   where parent_id = p_parent
     and (fresh_count = 0 or requested_at <= now() - interval '1 day');

  delete from public.parent_pins where id = p_parent;
  delete from public.parents where id = p_parent;
  delete from public.admins where user_id = p_parent;
  -- The 👪 window is left to run out (or go with the login, on delete
  -- cascade): if deleting the login fails, the retry finds it still open.
  update public.questions set reviewed_by = null where reviewed_by = p_parent;

  return jsonb_build_object('kids', v_kids);
end;
$$;

revoke execute on function public.delete_family(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_family(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
