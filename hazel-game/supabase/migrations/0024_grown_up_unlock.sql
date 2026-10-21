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
--     tabs from before this) — on the sign-in that typed it, while that
--     sign-in is live;
--   * unlock_grown_ups(session), called by the app right after the 👪 gate
--     (or Close account, or changing the login) checked the password: the
--     device first asks for a check (ask_grown_up_check), then the check
--     signs in on a client of its own, so its token says "password, just
--     now", and it opens the device's own sign-in, which it names. Only a
--     real check may name one (see 2b): a sign-in made just AFTER that
--     sign-in asked for a check (the database's own clock, never a note the
--     app sends), live, not one the app runs on, and only one sign-in each;
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
-- changing anything about them but their play (update of any column not on
-- profiles_kid_play_columns()), set_kid_pin, set_parent_pin, record_consent,
-- admin_review_queue, admin_review_question, and delete_family (the session
-- the app names must be unlocked). The kid's own play needs no gate: saving
-- the game (saves), XP / levels / skill levels / streak / power-ups
-- (profiles update of those columns only), 🚩 reports, marking questions
-- seen, trying their PIN, pin_lock_status, is_admin, and every read.
--
-- Why a session, not just the login: unlocking 👪 on the grown-up's phone
-- must not open the family laptop, and it closes the minute after a real
-- sign-in on the family device (#167's "what's left"): that sign-in's
-- token is fresh, but it may unlock itself only while the family is being
-- set up, and — the app notes it as the device's as it loads the family
-- (note_device_session) — it can't name another sign-in or close the
-- account either (#167 review round 1).
--
-- The password itself (#167 review rounds 1–2): the auth service lets a
-- sign-in change the login's password without the current one unless the
-- project asks for it ("Secure password change" only asks a sign-in over a
-- day old; "require the current password" skips any sign-in made by an
-- email link), and a new password is a fresh sign-in that could open 👪
-- here. So the database notes every password change (a trigger on
-- auth.users): one the app announced first, for the sign-in that makes it
-- (allow_password_change — a password check naming the device, or the reset
-- link's own sign-in, tied to the reset email the auth service recorded) is
-- fine; any other starts a 24-hour wait in which a password can't open
-- 👪 Grown-ups or close the account ("password_changed") — the grown-up PIN
-- still opens 👪, and a new password set from a reset link ends the wait.
-- That gives the grown-up a day to notice (they're signed out everywhere
-- else; Supabase's "password changed" email says so when it's on) and take
-- the login back by email.
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

-- 1b) The family's sign-ins the database knows about: 'device' — one the
--     family's app runs on (noted as it loads the family, and whenever it
--     asks for a password check — `asked_at`; such a sign-in never names
--     another or closes the account), 'check' — a password check that named
--     the sign-in it opened (`target`; a check opens one). Rows for sign-ins
--     that have ended are tidied as new ones come.
create table if not exists public.grown_up_sessions (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  session_id uuid        not null,
  kind       text        not null check (kind in ('device', 'check')),
  target     uuid,
  noted_at   timestamptz not null default now(),
  primary key (user_id, session_id)
);
alter table public.grown_up_sessions add column if not exists asked_at timestamptz;
alter table public.grown_up_sessions enable row level security;
revoke all on public.grown_up_sessions from public, anon, authenticated;

-- 1c) The login's password changes (written by the trigger on auth.users in
--     section 9): a change the app announced first may come until
--     `allowed_until`, from the sign-in `allowed_session` (one change;
--     `allowed_by` says how it was checked); the last change, and the last
--     one nobody checked (`unchecked_at`, which starts the wait).
create table if not exists public.grown_up_password_changes (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  allowed_until timestamptz,
  allowed_by    text        check (allowed_by in ('password', 'recovery')),
  changed_at    timestamptz,
  unchecked_at  timestamptz
);
alter table public.grown_up_password_changes add column if not exists allowed_session uuid;
alter table public.grown_up_password_changes enable row level security;
revoke all on public.grown_up_password_changes from public, anon, authenticated;

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

-- How long a password changed without a check can't open 👪 Grown-ups.
create or replace function public.grown_up_password_wait_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 86400;
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

-- Whether this call's token was signed in just now, by one of `p_methods`
-- (within a minute, a minute's clock drift allowed) — the rule delete-account uses
-- (`signedInFreshly`, _shared/closeAccount.ts): Supabase lists how a session
-- signed in under `amr` as [{method, timestamp}] and keeps it through token
-- refreshes; a token with no `amr` says nothing and is refused; bare method
-- names (a custom hook) must name a password, and then the login's last
-- sign-in must be just now. Never `iat`, which every refresh renews.
-- For the first run an email link opened just now counts too (a sign-up's
-- confirmation, a magic link, a reset link): that's how a new family's
-- first sign-in arrives when the project confirms emails, and it proves the
-- grown-up's inbox, not just the device. A password check (2b) is a password.
create or replace function public.grown_up_fresh_by(p_methods text[])
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
         and e ->> 'method' = any (p_methods)
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

-- Signed in just now by a password or an email link (the first-run flow).
create or replace function public.grown_up_signed_in_freshly()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.grown_up_fresh_by(array['password', 'otp', 'magiclink', 'email/signup', 'recovery', 'invite']);
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

-- Whether a sign-in is one of the login's live sessions (not signed out,
-- not ended by a password change elsewhere, not past its end).
create or replace function public.grown_up_session_live(p_user uuid, p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
     where s.id = p_session and s.user_id = p_user
       and (s.not_after is null or s.not_after > now())
  );
$$;

-- Until when a password can't open 👪 Grown-ups (a change nobody checked,
-- under a day ago); null when it can.
create or replace function public.grown_up_password_wait(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select c.unchecked_at + make_interval(secs => public.grown_up_password_wait_seconds())
    from public.grown_up_password_changes c
   where c.user_id = p_user
     and c.unchecked_at + make_interval(secs => public.grown_up_password_wait_seconds()) > now();
$$;

-- The refusal while that wait runs (SQLSTATE HQ002; DETAIL is when it ends, UTC).
create or replace function public.grown_up_refuse_password_wait(p_until timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'password_changed: the password was changed without a check, so until % no password opens 👪 Grown-ups or closes the account (the grown-up PIN still opens 👪)', p_until
    using errcode = 'HQ002',
          detail = to_char(p_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
end;
$$;

-- 2b) Is this call a real password check for `p_target` — the throwaway
--     sign-in the app makes to check a password typed just now? Its token's
--     password (a password, not an email link) is under a minute old; its
--     sign-in is live and was itself made within the minute; the family's
--     app has never run on it (no 'device' row); it names another sign-in,
--     a live one of the same login; and — the rule the server keeps itself,
--     never a note the app may or may not send (#167 review round 2) — that
--     sign-in asked for a check (ask_grown_up_check) within the minute
--     BEFORE this one was made. The device's own sign-in, however fresh,
--     was made before it could ask, and asking marks it as a device, so it
--     can never pass for a check. Null when it is; else the refusal's words.
drop function if exists public.grown_up_check_refusal();
create or replace function public.grown_up_check_refusal(p_target uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_window constant interval := interval '60 seconds';
  c_slack  constant interval := interval '60 seconds';
  -- The ask comes a round trip before the check's sign-in; the two clocks
  -- (the database's, the auth service's) may be a moment apart.
  c_order  constant interval := interval '2 seconds';
  v_user  uuid := auth.uid();
  v_own   uuid := public.jwt_session_id();
  v_made  timestamptz;
  v_asked timestamptz;
begin
  if v_user is null or v_own is null then
    return 'no_session: this sign-in has no session';
  end if;
  if not public.grown_up_fresh_by(array['password']) then
    return 'reauth_required: type your password again to open 👪 Grown-ups';
  end if;
  select s.created_at into v_made
    from auth.sessions s
   where s.id = v_own and s.user_id = v_user and (s.not_after is null or s.not_after > now());
  if not found or v_made > now() + c_slack or now() - v_made > c_window then
    return 'reauth_required: a password check is a sign-in made just now';
  end if;
  if exists (select 1 from public.grown_up_sessions g
              where g.user_id = v_user and g.session_id = v_own and g.kind = 'device') then
    return 'reauth_required: the device''s own sign-in is no password check';
  end if;
  if p_target is null or p_target = v_own then
    return 'reauth_required: a password check opens another sign-in';
  end if;
  if not public.grown_up_session_live(v_user, p_target) then
    return 'no_session: that sign-in isn''t a live one of yours';
  end if;
  select g.asked_at into v_asked
    from public.grown_up_sessions g
   where g.user_id = v_user and g.session_id = p_target and g.kind = 'device';
  if v_asked is null or now() - v_asked > c_window or v_asked > v_made + c_order then
    return 'reauth_required: a password check is a sign-in made just after that sign-in asked for one';
  end if;
  return null;
end;
$$;

-- 2c) Is this call a reset link's own sign-in (#167 review round 2)? With
--     the app's implicit flow the auth service signs an emailed link in with
--     the method "otp" ("recovery" only with PKCE, "magiclink" for a magic
--     link) — the same method a sign-up confirmation gets — so the method
--     alone can't tell a reset. What the auth service records can:
--     auth.users.recovery_sent_at is when a reset (or magic-link) email last
--     went out, cleared by every password change, and recovery_token is
--     emptied once its link is opened. So: such an email was sent and its
--     link used; this token's email-link sign-in is at or after the send,
--     within the hour; it's this sign-in's own (made at that moment, still
--     live); and no password change since. A device signed in long ago by its
--     sign-up link fails (its sign-in is older than any reset email), and so
--     does any sign-in while a reset email waits unopened.
create or replace function public.grown_up_reset_sign_in()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_link  constant double precision := 3600;
  c_slack constant double precision := 60;
  v_user  uuid := auth.uid();
  v_own   uuid := public.jwt_session_id();
  v_amr   jsonb := auth.jwt() -> 'amr';
  v_now   double precision := extract(epoch from now());
  v_sent  timestamptz;
  v_token text;
  v_made  timestamptz;
  v_last  timestamptz;
begin
  if v_user is null or v_own is null or jsonb_typeof(v_amr) is distinct from 'array' then
    return false;
  end if;
  select u.recovery_sent_at, u.recovery_token into v_sent, v_token from auth.users u where u.id = v_user;
  if v_sent is null or coalesce(v_token, '') <> '' then
    return false;
  end if;
  select s.created_at into v_made
    from auth.sessions s
   where s.id = v_own and s.user_id = v_user and (s.not_after is null or s.not_after > now());
  if not found then
    return false;
  end if;
  select c.changed_at into v_last from public.grown_up_password_changes c where c.user_id = v_user;
  return exists (
    select 1 from jsonb_array_elements(v_amr) e
     where jsonb_typeof(e) = 'object'
       and e ->> 'method' in ('otp', 'recovery', 'magiclink')
       and jsonb_typeof(e -> 'timestamp') = 'number'
       and (e ->> 'timestamp')::double precision <= v_now + c_slack
       and v_now - (e ->> 'timestamp')::double precision <= c_link
       and (e ->> 'timestamp')::double precision >= floor(extract(epoch from v_sent))
       and abs((e ->> 'timestamp')::double precision - extract(epoch from v_made)) <= c_slack
       and (v_last is null or extract(epoch from v_last) < (e ->> 'timestamp')::double precision)
  );
end;
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
revoke execute on function public.grown_up_password_wait_seconds() from public, anon, authenticated;
revoke execute on function public.jwt_session_id() from public, anon, authenticated;
revoke execute on function public.grown_up_fresh_by(text[]) from public, anon, authenticated;
revoke execute on function public.grown_up_signed_in_freshly() from public, anon, authenticated;
revoke execute on function public.grown_up_first_run(uuid) from public, anon, authenticated;
revoke execute on function public.grown_up_session_live(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.grown_up_password_wait(uuid) from public, anon, authenticated;
revoke execute on function public.grown_up_refuse_password_wait(timestamptz) from public, anon, authenticated;
revoke execute on function public.grown_up_check_refusal(uuid) from public, anon, authenticated;
revoke execute on function public.grown_up_reset_sign_in() from public, anon, authenticated;
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

-- The family's app notes the sign-in it runs on as it loads the family
-- (#167 review round 1): such a sign-in — however fresh — is no password
-- check, so it never names another sign-in to open, nor closes the account.
-- Tidies the login's rows for sign-ins that have ended.
create or replace function public.note_device_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_own  uuid := public.jwt_session_id();
begin
  if v_user is null or v_own is null then
    return;
  end if;
  delete from public.grown_up_sessions g
   where g.user_id = v_user
     and not exists (select 1 from auth.sessions s where s.id = g.session_id);
  insert into public.grown_up_sessions (user_id, session_id, kind)
  values (v_user, v_own, 'device')
  on conflict (user_id, session_id) do update set kind = 'device', target = null, noted_at = now();
end;
$$;

-- Before every password check (the 👪 gate, the dialog, Close account,
-- changing the login), the device asks for one on its own sign-in (#167
-- review round 2): only a password sign-in made after this, within the
-- minute, may then name this sign-in (2b). Asking also notes the sign-in as
-- a device's, so it is never itself taken for a check. Refusal, SQLSTATE
-- HQ002: "no_session" (no session, or it has ended).
create or replace function public.ask_grown_up_check()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_own  uuid := public.jwt_session_id();
begin
  if v_user is null or v_own is null then
    raise exception 'no_session: this sign-in has no session' using errcode = 'HQ002';
  end if;
  if not public.grown_up_session_live(v_user, v_own) then
    raise exception 'no_session: this sign-in has ended' using errcode = 'HQ002';
  end if;
  delete from public.grown_up_sessions g
   where g.user_id = v_user
     and not exists (select 1 from auth.sessions s where s.id = g.session_id);
  insert into public.grown_up_sessions (user_id, session_id, kind, asked_at)
  values (v_user, v_own, 'device', now())
  on conflict (user_id, session_id) do update
    set kind = 'device', target = null, asked_at = now(), noted_at = now();
end;
$$;

-- After the app checked the grown-up's password: called with that check's
-- own token (a password typed just now, 2b), naming the device's sign-in to
-- open (`p_session`, a live session of the same login that asked for this
-- check just before it was made; a check names one).
-- With no session named, the caller's own sign-in — only while the family is
-- being set up (the first-run flow, right after signing up or in). Either
-- way, not while a password changed without a check is waiting out its day.
-- Refusals, SQLSTATE HQ002: "reauth_required" (not a password typed just
-- now, not a real check, or the family is set up and the sign-in tried to
-- open itself) / "no_session" (that sign-in isn't a live one of yours — on
-- the device, signed out, e.g. by a password change elsewhere) /
-- "password_changed" (the wait; DETAIL says when it ends).
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
  v_why  text;
  v_wait timestamptz;
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
    if not public.grown_up_session_live(v_user, v_own) then
      raise exception 'no_session: this sign-in has ended' using errcode = 'HQ002';
    end if;
  else
    -- Another sign-in — one of this login's live sessions, never a made-up
    -- id, that asked for this check — named by a real password check (2b),
    -- once.
    v_why := public.grown_up_check_refusal(v_target);
    if v_why is not null then
      raise exception '%', v_why using errcode = 'HQ002';
    end if;
    if exists (select 1 from public.grown_up_sessions g
                where g.user_id = v_user and g.session_id = v_own and g.kind = 'check'
                  and g.target is distinct from v_target) then
      raise exception 'reauth_required: a password check opens one sign-in' using errcode = 'HQ002';
    end if;
  end if;
  v_wait := public.grown_up_password_wait(v_user);
  if v_wait is not null then
    perform public.grown_up_refuse_password_wait(v_wait);
  end if;
  if v_target <> v_own then
    insert into public.grown_up_sessions (user_id, session_id, kind, target)
    values (v_user, v_own, 'check', v_target)
    on conflict (user_id, session_id) do nothing;
  end if;
  perform public.grown_up_open(v_user, v_target);
  return jsonb_build_object('unlocked', true, 'seconds', public.grown_up_unlock_seconds());
end;
$$;

-- Leaving 👪 Grown-ups: shut it on this sign-in (and tidy run-out rows); a
-- password change announced for this sign-in that never came is off too.
create or replace function public.lock_grown_ups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.grown_up_unlocks
   where user_id = auth.uid()
     and (session_id = public.jwt_session_id() or unlocked_until <= now());
  update public.grown_up_password_changes
     set allowed_until = null, allowed_by = null, allowed_session = null
   where user_id = auth.uid() and allowed_session = public.jwt_session_id();
end;
$$;

revoke execute on function public.note_device_session() from public, anon;
revoke execute on function public.ask_grown_up_check() from public, anon;
revoke execute on function public.unlock_grown_ups(uuid) from public, anon;
revoke execute on function public.lock_grown_ups() from public, anon;
grant execute on function public.note_device_session() to authenticated;
grant execute on function public.ask_grown_up_check() to authenticated;
grant execute on function public.unlock_grown_ups(uuid) to authenticated;
grant execute on function public.lock_grown_ups() to authenticated;

-- 5) The right grown-up PIN opens it, on the sign-in that typed it while
--    that sign-in is live (0022's count otherwise unchanged; check_parent_pin
--    goes through here, so app tabs from before this open it too). The
--    answer gains "grown_ups_seconds" when it opened, or "signed_out" when
--    the PIN was right but the sign-in has ended (a password change on
--    another device ends the others — a PIN mustn't outlive that).
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
    if not public.grown_up_session_live(r.id, v_session) then
      return s.verdict || jsonb_build_object('signed_out', true);
    end if;
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
--    their play is theirs. A trigger, so a refusal says why (an RLS policy
--    would just skip a delete without a word, and can't tell a nickname from
--    XP in one update). The play columns are LISTED (below), so a column
--    added to profiles later is a grown-up's until someone says otherwise
--    (CI fails until every column is on one list or the other,
--    grown_ups_gate.test.sql). Only the API's own roles are checked: the
--    database's own work — a security-definer function such as set_kid_pin
--    (which checks the gate itself) or delete_family, the auth service
--    deleting a login — runs as another role.

-- The columns a kid's own play writes: XP and levels, skill levels,
-- power-ups, the streak, and when the row was last written. Callable by
-- anyone (it's a list of names): the gate runs as the caller.
create or replace function public.profiles_kid_play_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['xp', 'level', 'level_xp', 'skill_levels', 'power_ups',
               'current_streak', 'longest_streak', 'last_played_on', 'updated_at'];
$$;

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
     and to_jsonb(new) - public.profiles_kid_play_columns()
         = to_jsonb(old) - public.profiles_kid_play_columns() then
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
--    now that delete-account checks — and the token that typed it
--    (`p_caller`, its session) must be a password check the database itself
--    recorded opening that sign-in (unlock_grown_ups, 2b), never a sign-in
--    the family's app runs on (in the minute after a grown-up signs in, the
--    device's own token is fresh too) — and not while a password changed
--    without a check waits out its day (#167 review round 2: that password
--    is the one in doubt). Signature changed (more arguments), so the old
--    ones go. Still service role only.
drop function if exists public.delete_family(uuid);
drop function if exists public.delete_family(uuid, uuid);
create or replace function public.delete_family(p_parent uuid, p_session uuid default null, p_caller uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kids integer;
  v_wait timestamptz;
begin
  if p_parent is null then
    raise exception 'no_parent: whose account is this?';
  end if;
  if p_caller is null then
    raise exception 'reauth_required: close the account with a password typed just now'
      using errcode = 'HQ002';
  end if;
  if p_session is null or not exists (
    select 1 from public.grown_up_unlocks u
     where u.user_id = p_parent and u.session_id = p_session and u.unlocked_until > now()
  ) then
    raise exception 'grown_ups_locked: open 👪 Grown-ups with your grown-up PIN or password first'
      using errcode = 'HQ001';
  end if;
  -- A sign-in the family's app runs on is noted as a device's, never a
  -- check, so this also turns away the device's own fresh token.
  if not exists (
    select 1 from public.grown_up_sessions g
     where g.user_id = p_parent and g.session_id = p_caller and g.kind = 'check' and g.target = p_session
  ) then
    raise exception 'reauth_required: close the account with a password check made just now'
      using errcode = 'HQ002';
  end if;
  v_wait := public.grown_up_password_wait(p_parent);
  if v_wait is not null then
    perform public.grown_up_refuse_password_wait(v_wait);
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

revoke execute on function public.delete_family(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_family(uuid, uuid, uuid) to service_role;

-- 9) The login's password (#167 review rounds 1–2). The app says a change is
--    coming before it asks the auth service for it, for the one sign-in
--    that will make it, from a token that proves the grown-up:
--      * 'password' — a password check (2b) naming the device's sign-in,
--        which that check opened just now (unlock_grown_ups), outside the
--        wait: the change-password page, the current password typed again;
--      * 'recovery' — the reset link's own sign-in (2c), within the hour of
--        opening the link, with no password change since (the reset-password
--        page): it proves the inbox, which could reset the password anyway,
--        and it ends the wait — how a grown-up takes their login back.
--    It holds for a minute (the change follows at once; the emailed-code
--    step checks again), for one change, from that sign-in only (the auth
--    service ends every other sign-in in the same change, so the trigger
--    below finds it still there only if it made the change); a failed change
--    (drop_password_change) and leaving 👪 Grown-ups drop it. Refusals
--    HQ002 as unlock_grown_ups.
drop function if exists public.allow_password_change();
create or replace function public.allow_password_change(p_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_hold  constant integer := 60;
  v_user  uuid := auth.uid();
  v_own   uuid := public.jwt_session_id();
  v_why   text;
  v_wait  timestamptz;
  v_by    text;
  v_for   uuid;
begin
  if v_user is null or v_own is null then
    raise exception 'no_session: this sign-in has no session' using errcode = 'HQ002';
  end if;
  if p_session is null or p_session = v_own then
    -- The sign-in that will change the password says so itself: only a reset
    -- link's.
    if not public.grown_up_reset_sign_in() then
      raise exception 'reauth_required: only a reset link''s own sign-in, or a password check naming a sign-in, says a password change is coming'
        using errcode = 'HQ002';
    end if;
    v_by := 'recovery';
    v_for := v_own;
  else
    v_why := public.grown_up_check_refusal(p_session);
    if v_why is not null then
      raise exception '%', v_why using errcode = 'HQ002';
    end if;
    v_wait := public.grown_up_password_wait(v_user);
    if v_wait is not null then
      perform public.grown_up_refuse_password_wait(v_wait);
    end if;
    if not exists (select 1 from public.grown_up_sessions g
                    where g.user_id = v_user and g.session_id = v_own and g.kind = 'check'
                      and g.target = p_session)
       or not exists (select 1 from public.grown_up_unlocks u
                       where u.user_id = v_user and u.session_id = p_session and u.unlocked_until > now()) then
      raise exception 'reauth_required: open 👪 Grown-ups on that sign-in with this check first'
        using errcode = 'HQ002';
    end if;
    v_by := 'password';
    v_for := p_session;
  end if;
  insert into public.grown_up_password_changes (user_id, allowed_until, allowed_by, allowed_session)
  values (v_user, now() + make_interval(secs => c_hold), v_by, v_for)
  on conflict (user_id) do update
    set allowed_until = excluded.allowed_until, allowed_by = excluded.allowed_by,
        allowed_session = excluded.allowed_session;
  return jsonb_build_object('allowed', true, 'seconds', c_hold, 'by', v_by);
end;
$$;

-- The app's change didn't go through (a weak or same password, the
-- network…): the allowance it asked for goes at once, rather than waiting
-- out its minute. Only the sign-in it was for can drop it.
create or replace function public.drop_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.grown_up_password_changes
     set allowed_until = null, allowed_by = null, allowed_session = null
   where user_id = auth.uid() and allowed_session = public.jwt_session_id();
end;
$$;
revoke execute on function public.allow_password_change(uuid) from public, anon;
revoke execute on function public.drop_password_change() from public, anon;
grant execute on function public.allow_password_change(uuid) to authenticated;
grant execute on function public.drop_password_change() to authenticated;

-- Every change of the login's password, as the auth service writes it: one
-- the app said was coming (above), made by the sign-in it was for, uses that
-- up — a reset link's also ends any wait; any other starts the wait
-- (`unchecked_at`), whoever made it: another sign-in of the login with no
-- current password asked for, the dashboard, an app tab from before this.
-- Runs as the auth service's update (security definer: it writes a table no
-- client may touch), and at the END of its transaction (a deferred trigger):
-- by then the auth service has ended every other sign-in of the login (all
-- of them for a change made outside a sign-in), so the sign-in the change
-- was announced for is still there only if it made it. Never raises — a
-- password change must never fail because of this.
create or replace function public.grown_up_note_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by  text;
  v_for uuid;
begin
  if new.encrypted_password is not distinct from old.encrypted_password then
    return null;
  end if;
  select c.allowed_by, c.allowed_session into v_by, v_for
    from public.grown_up_password_changes c
   where c.user_id = new.id and c.allowed_until > now()
   for update;
  if v_by is not null and not exists (
    select 1 from auth.sessions s where s.id = v_for and s.user_id = new.id
  ) then
    v_by := null;
  end if;
  insert into public.grown_up_password_changes as c (user_id, changed_at, unchecked_at)
  values (new.id, now(), case when v_by is null then now() end)
  on conflict (user_id) do update
    set changed_at = now(),
        allowed_until = null,
        allowed_by = null,
        allowed_session = null,
        unchecked_at = case when v_by is null then now()
                            when v_by = 'recovery' then null
                            else c.unchecked_at end;
  return null;
end;
$$;
revoke execute on function public.grown_up_note_password_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_password_changed on auth.users;
create constraint trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  deferrable initially deferred
  for each row execute function public.grown_up_note_password_change();

notify pgrst, 'reload schema';
