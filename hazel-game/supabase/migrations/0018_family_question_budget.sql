-- Hazel Quest — a question budget per family (Act I launch review B9)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0017.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- Since 0014 every kid has their own daily budget of fresh (Claude-written)
-- questions, and removing a kid removed their request log with them — so a
-- grown-up could add a kid, spend their budget, remove them and repeat
-- without end, and every one of up to 8 kids added a full budget. Now:
--   * a request log row outlives its kid (profile_id → null), so spent
--     questions still count against the family and the project for the day;
--   * every request records the grown-up whose kid made it (`parent_id`);
--   * `begin_question_request` takes a per-family daily cap as well
--     (`p_fresh_per_family`, the kid's family = the kid's grown-up) — null
--     means no family cap, which is what a caller from before this sends.

-- 1) Who the request was for, kept when the kid goes.
alter table public.question_requests
  add column if not exists parent_id uuid references auth.users (id) on delete set null;
alter table public.question_requests alter column profile_id drop not null;
alter table public.question_requests drop constraint if exists question_requests_kid_fkey;
-- NOT VALID, as in 0014: rows logged under a login before parent accounts are left as they are.
alter table public.question_requests add constraint question_requests_kid_fkey
  foreign key (profile_id) references public.profiles (id) on delete set null not valid;
create index if not exists question_requests_parent_time_idx
  on public.question_requests (parent_id, requested_at desc);

-- Requests already logged: fill in their grown-up where the kid is still here.
update public.question_requests r
   set parent_id = p.parent_id
  from public.profiles p
 where p.id = r.profile_id
   and r.parent_id is null;

-- 2) The quota check, with the family's budget. The old four-argument version
--    goes; a caller that still sends four arguments gets the family cap's
--    default (none).
drop function if exists public.begin_question_request(uuid, integer, integer, integer);

create or replace function public.begin_question_request(
  p_profile           uuid,
  p_max_per_minute    integer,
  p_fresh_per_day     integer,
  p_fresh_global      integer,
  p_fresh_per_family  integer default null
)
returns table (allowed boolean, fresh_allowance integer, request_id bigint)
language plpgsql
set search_path = public
as $$
declare
  v_parent       uuid;
  v_recent       integer;
  v_fresh_mine   integer;
  v_fresh_family integer;
  v_fresh_all    integer;
  v_left         integer;
  v_id           bigint;
begin
  select parent_id into v_parent from profiles where id = p_profile;

  -- One family at a time (or one kid, if it has no grown-up on record), so a
  -- burst of calls from brothers and sisters can't all slip under the cap.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_parent, p_profile)::text, 0));

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

  v_left := least(p_fresh_per_day - v_fresh_mine, p_fresh_global - v_fresh_all);

  if p_fresh_per_family is not null and v_parent is not null then
    select coalesce(sum(fresh_count), 0) into v_fresh_family
      from question_requests
     where parent_id = v_parent
       and requested_at > now() - interval '1 day';
    v_left := least(v_left, p_fresh_per_family - v_fresh_family);
  end if;

  insert into question_requests (profile_id, parent_id) values (p_profile, v_parent)
  returning id into v_id;

  return query select true, greatest(0, v_left)::integer, v_id;
end;
$$;

revoke execute on function public.begin_question_request(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.begin_question_request(uuid, integer, integer, integer, integer) to service_role;
