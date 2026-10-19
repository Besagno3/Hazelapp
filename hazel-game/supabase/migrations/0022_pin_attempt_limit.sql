-- Hazel Quest — a server-side limit on PIN guesses (#124c)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0021.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- Since 0014 a kid's 4-digit PIN, and the grown-up's optional PIN for
-- 👪 Grown-ups, were checked by check_kid_pin / check_parent_pin with no
-- limit. The app rested its pad after 5 wrong tries, but a reload started it
-- over, and anyone holding the family's session could call the functions
-- directly and try all 10,000 PINs in minutes. Now the database counts:
--   * 5 wrong tries in a row lock that PIN. Each lock in a row lasts longer:
--     1 minute, then 5, then 15, then an hour each time after that.
--   * While it's locked, a try is refused without being checked (the right
--     PIN too) and without counting.
--   * The right PIN starts it all over, and so does a new PIN (set_kid_pin /
--     set_parent_pin, below: a grown-up giving a locked-out kid a new PIN —
--     even the same one — unlocks it), and so does a day with no wrong tries.
--   * Only the caller's own kid, or their own grown-up PIN, is counted:
--     nobody can lock another family's kid out.
--
-- Why these numbers: five tries covers a young kid's slips (two digits
-- swapped, a brother's PIN) before any rest, and the first rest is a minute —
-- about as long as it takes to fetch a grown-up. After that, guessing gets
-- slow: the first 20 tries take 81 minutes of rests, then it's 5 tries an
-- hour, so working through half of the 10,000 PINs takes about six weeks of
-- non-stop trying (all of them, nearly three months) — and the kid sees "Too
-- many tries" every time they open their tile. A longer cap would add little
-- (anyone with the session can already set a new PIN) and would leave a kid
-- who really forgot locked out for longer.
--
-- New for the app: try_kid_pin(kid, pin) / try_parent_pin(pin) answer
--   {"ok": true|false, "tries_left": n, "wait_seconds": s}
-- wait_seconds > 0: locked for that long (counted by the database's clock);
-- tries_left: wrong tries left before the next lock (null: nothing counted —
-- not your kid, or no PIN set). check_kid_pin / check_parent_pin keep their
-- signatures for app tabs from before this: true / false, a locked PIN false.

-- 1) The counters live beside each hash, in tables no client can read or
--    write (RLS on, no policies, no grants — 0014); re-stated here.
alter table public.kid_pins
  add column if not exists failed_tries   integer     not null default 0,
  add column if not exists lockouts       integer     not null default 0,
  add column if not exists locked_until   timestamptz,
  add column if not exists last_failed_at timestamptz;
alter table public.parent_pins
  add column if not exists failed_tries   integer     not null default 0,
  add column if not exists lockouts       integer     not null default 0,
  add column if not exists locked_until   timestamptz,
  add column if not exists last_failed_at timestamptz;
alter table public.kid_pins enable row level security;
alter table public.parent_pins enable row level security;
revoke all on public.kid_pins from anon, authenticated;
revoke all on public.parent_pins from anon, authenticated;

-- 2) The ladder: how long the nth lock in a row lasts.
create or replace function public.pin_lock_seconds(p_lockouts integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lockouts <= 1 then 60
    when p_lockouts = 2 then 300
    when p_lockouts = 3 then 900
    else 3600
  end;
$$;

-- What a locked PIN answers: how long is left, rounded up to a whole second.
create or replace function public.pin_locked_verdict(p_locked_until timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'tries_left', 0,
    'wait_seconds', greatest(1, ceil(extract(epoch from (p_locked_until - now()))))::integer
  );
$$;

-- One checked try against a PIN's counters: the counters after it, and what
-- to tell the app. Shared by the kid's and the grown-up's PIN.
create or replace function public.pin_try_step(
  p_right          boolean,
  p_failed_tries   integer,
  p_lockouts       integer,
  p_last_failed_at timestamptz,
  out failed_tries   integer,
  out lockouts       integer,
  out locked_until   timestamptz,
  out last_failed_at timestamptz,
  out verdict        jsonb
)
language plpgsql
stable
set search_path = ''
as $$
declare
  c_tries constant integer := 5;
begin
  if p_right then
    failed_tries := 0;
    lockouts := 0;
    locked_until := null;
    last_failed_at := null;
    verdict := jsonb_build_object('ok', true, 'tries_left', c_tries, 'wait_seconds', 0);
    return;
  end if;

  -- A day without a wrong try starts the ladder over.
  if p_last_failed_at is null or p_last_failed_at <= now() - interval '1 day' then
    p_failed_tries := 0;
    p_lockouts := 0;
  end if;

  failed_tries := p_failed_tries + 1;
  lockouts := p_lockouts;
  locked_until := null;
  last_failed_at := now();

  if failed_tries >= c_tries then
    lockouts := lockouts + 1;
    failed_tries := 0;
    locked_until := now() + make_interval(secs => public.pin_lock_seconds(lockouts));
    verdict := jsonb_build_object('ok', false, 'tries_left', 0, 'wait_seconds', public.pin_lock_seconds(lockouts));
  else
    verdict := jsonb_build_object('ok', false, 'tries_left', c_tries - failed_tries, 'wait_seconds', 0);
  end if;
end;
$$;

-- The helpers are only for the functions below (which run as their owner).
revoke execute on function public.pin_lock_seconds(integer) from public, anon, authenticated;
revoke execute on function public.pin_locked_verdict(timestamptz) from public, anon, authenticated;
revoke execute on function public.pin_try_step(boolean, integer, integer, timestamptz) from public, anon, authenticated;

-- 3) A kid's PIN, counted.
create or replace function public.try_kid_pin(p_kid uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.kid_pins%rowtype;
  s record;
begin
  -- Only the caller's own kid with a PIN set. Anyone else's kid (or none) is
  -- a plain no, counted nowhere, so no one can lock another family out. The
  -- row lock takes one try at a time per PIN: a burst of calls can't all get
  -- in before the count catches up.
  select k.* into r
    from public.kid_pins k
    join public.profiles p on p.id = k.profile_id
   where k.profile_id = p_kid
     and p.parent_id = auth.uid()
     for update of k;
  if not found then
    return jsonb_build_object('ok', false, 'tries_left', null, 'wait_seconds', 0);
  end if;

  if r.locked_until > now() then
    return public.pin_locked_verdict(r.locked_until);
  end if;

  select * into s
    from public.pin_try_step(coalesce(r.pin_hash = extensions.crypt(p_pin, r.pin_hash), false),
                             r.failed_tries, r.lockouts, r.last_failed_at);
  update public.kid_pins
     set failed_tries = s.failed_tries,
         lockouts = s.lockouts,
         locked_until = s.locked_until,
         last_failed_at = s.last_failed_at
   where profile_id = p_kid;
  return s.verdict;
end;
$$;

-- The grown-up's own PIN, counted the same way.
create or replace function public.try_parent_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.parent_pins%rowtype;
  s record;
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
  return s.verdict;
end;
$$;

-- 4) The old checks go through the count too (app tabs from before this
--    still call them): same signatures, now volatile — they write.
create or replace function public.check_kid_pin(p_kid uuid, p_pin text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce((public.try_kid_pin(p_kid, p_pin) ->> 'ok')::boolean, false);
$$;

create or replace function public.check_parent_pin(p_pin text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce((public.try_parent_pin(p_pin) ->> 'ok')::boolean, false);
$$;

-- 5) A new PIN starts the count over (and unlocks a locked one).
create or replace function public.set_kid_pin(p_kid uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

revoke execute on function public.try_kid_pin(uuid, text) from public, anon;
revoke execute on function public.try_parent_pin(text) from public, anon;
revoke execute on function public.check_kid_pin(uuid, text) from public, anon;
revoke execute on function public.check_parent_pin(text) from public, anon;
revoke execute on function public.set_kid_pin(uuid, text) from public, anon;
revoke execute on function public.set_parent_pin(text) from public, anon;
grant execute on function public.try_kid_pin(uuid, text) to authenticated;
grant execute on function public.try_parent_pin(text) to authenticated;
grant execute on function public.check_kid_pin(uuid, text) to authenticated;
grant execute on function public.check_parent_pin(text) to authenticated;
grant execute on function public.set_kid_pin(uuid, text) to authenticated;
grant execute on function public.set_parent_pin(text) to authenticated;

-- The API caches each function's volatility, and runs a stable one read-only:
-- reload it, or check_kid_pin's first write would fail until it does.
notify pgrst, 'reload schema';
