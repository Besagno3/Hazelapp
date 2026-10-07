-- Hazel Quest — per-player request log + quota for generate-questions (#84)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0008.
--
-- The edge function calls the Claude API on the project's key, so an
-- unthrottled caller could run up the bill. Every call is logged here and
-- checked by `begin_question_request`:
--   * a per-player request rate (calls per minute) → over it: 429
--   * a per-player daily budget of FRESH (Claude-generated) questions
--   * a project-wide daily budget of fresh questions (the real cost ceiling)
-- When a fresh budget is spent the function still serves cached questions,
-- so kids keep playing from the shared bank. The `questions` bank itself is
-- never pruned (product decision, ISSUES #68).

create table if not exists public.question_requests (
  id           bigint      generated always as identity primary key,
  profile_id   uuid        not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- Filled in after generation: how many questions actually came from Claude.
  fresh_count  integer     not null default 0
);

-- Lookup patterns: one player's recent calls; everyone's calls in the last day.
create index if not exists question_requests_profile_time_idx
  on public.question_requests (profile_id, requested_at desc);
create index if not exists question_requests_time_idx
  on public.question_requests (requested_at);

alter table public.question_requests enable row level security;
-- No client policies: only the edge function (service role) touches this.
grant select, insert, update on public.question_requests to service_role;

-- Atomically check the caller's quota and log the call. Serialized per player
-- with an advisory lock, so a burst of parallel calls can't all slip under
-- the limit. Returns:
--   allowed         false → over the per-minute rate (caller returns 429)
--   fresh_allowance how many fresh questions this call may generate (≥ 0)
--   request_id      the log row; the caller records fresh_count on it
create or replace function public.begin_question_request(
  p_profile         uuid,
  p_max_per_minute  integer,
  p_fresh_per_day   integer,
  p_fresh_global    integer
)
returns table (allowed boolean, fresh_allowance integer, request_id bigint)
language plpgsql
set search_path = public
as $$
declare
  v_recent       integer;
  v_fresh_mine   integer;
  v_fresh_all    integer;
  v_id           bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 0));

  select count(*) into v_recent
    from question_requests
   where profile_id = p_profile
     and requested_at > now() - interval '1 minute';

  if v_recent >= p_max_per_minute then
    return query select false, 0, null::bigint;
    return;
  end if;

  select coalesce(sum(fresh_count), 0) into v_fresh_mine
    from question_requests
   where profile_id = p_profile
     and requested_at > now() - interval '1 day';

  select coalesce(sum(fresh_count), 0) into v_fresh_all
    from question_requests
   where requested_at > now() - interval '1 day';

  insert into question_requests (profile_id) values (p_profile)
  returning id into v_id;

  return query select
    true,
    greatest(0, least(p_fresh_per_day - v_fresh_mine, p_fresh_global - v_fresh_all))::integer,
    v_id;
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon + authenticated by
-- default; revoke so a client can never burn another player's quota.
revoke all on function public.begin_question_request(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.begin_question_request(uuid, integer, integer, integer) to service_role;
