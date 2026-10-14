-- Hazel Quest — reviewing questions for kids (Act I launch review B10)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0015.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- Before this, one report from any family hid a question from everyone, for
-- good, and nobody looked at reports. Now:
--   * every question has a review status: 'active' (served), 'review' (held
--     back until a grown-up looks), 'retired' (never served again) or
--     'approved' (looked at and fine — served first);
--   * a "not OK for kids" report holds an active question back at once; an
--     approved one goes back to review once two families say so;
--   * any other report (wrong answer, confusing, difficulty) hides the
--     question from the reporting family only (the edge function), and holds
--     it back for everyone once three families have reported it;
--   * `question_review_queue` lists what needs a look, and `review_question`
--     records the decision. Both are for the project owner (service role /
--     SQL editor) only.

-- 1) A review status on every question.
alter table public.questions
  add column if not exists status text not null default 'active'
    constraint questions_status_check check (status in ('active', 'review', 'retired', 'approved'));
alter table public.questions add column if not exists reviewed_at timestamptz;
create index if not exists questions_topic_status_level_idx on public.questions (topic, status, level);

-- 2) Reports move a question into review.
create or replace function public.question_flag_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  families int;
  not_ok_families int;
begin
  select count(distinct p.parent_id),
         count(distinct p.parent_id) filter (where f.reason = 'not_for_kids')
    into families, not_ok_families
    from public.question_flags f
    join public.profiles p on p.id = f.profile_id
   where f.question_id = new.question_id;

  update public.questions q
     set status = 'review'
   where q.id = new.question_id
     and (
       (q.status = 'active' and (new.reason = 'not_for_kids' or families >= 3))
       or (q.status = 'approved' and not_ok_families >= 2)
     );
  return new;
end;
$$;
revoke execute on function public.question_flag_review() from public, anon, authenticated;

drop trigger if exists question_flag_review on public.question_flags;
create trigger question_flag_review
  after insert on public.question_flags
  for each row execute function public.question_flag_review();

-- 3) What needs a look: questions held back, and any with reports since they
--    were last reviewed — "not OK for kids" first, then by families.
create or replace view public.question_review_queue
with (security_invoker = true) as
select q.id,
       q.topic,
       q.level,
       q.status,
       q.text,
       q.options,
       q.correct_index,
       q.explanation,
       count(f.id) as reports,
       count(distinct p.parent_id) as families,
       count(f.id) filter (where f.reason = 'not_for_kids') as not_for_kids,
       array_remove(array_agg(distinct f.reason), null) as reasons,
       max(f.created_at) as last_report
  from public.questions q
  join public.question_flags f on f.question_id = q.id
  left join public.profiles p on p.id = f.profile_id
 where q.status <> 'retired'
   and (q.status = 'review' or f.created_at > coalesce(q.reviewed_at, '-infinity'::timestamptz))
 group by q.id
 order by (q.status = 'review') desc, not_for_kids desc, families desc, last_report desc;
revoke all on public.question_review_queue from public, anon, authenticated;
grant select on public.question_review_queue to service_role;

-- 4) Recording a review: approve (served first), retire (never again), or put
--    back to active.
create or replace function public.review_question(p_question uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('active', 'approved', 'retired') then
    raise exception 'status must be active, approved or retired';
  end if;
  update public.questions set status = p_status, reviewed_at = now() where id = p_question;
  if not found then
    raise exception 'no such question';
  end if;
end;
$$;
revoke execute on function public.review_question(uuid, text) from public, anon, authenticated;
grant execute on function public.review_question(uuid, text) to service_role;

-- 5) The question picker (0015, #134) follows these rules too: only 'active'
--    and 'approved' questions, approved ones first, and a report hides a
--    question from the reporting family only (everyone else stops seeing it
--    through its status). Same signature and columns as 0015's, so the edge
--    function's call is unchanged; everything else it does — the age limit,
--    the per-topic seen window, the hour's hold, the lean to less-asked — is
--    as before.
create or replace function public.pick_cached_questions(
  p_topic      text,
  p_min_level  integer,
  p_max_level  integer,
  p_max_age    integer,
  p_profile    uuid,
  p_seen_limit integer,
  p_reserve    interval,
  p_limit      integer
)
returns table (
  id            uuid,
  level         smallint,
  text          text,
  options       jsonb,
  correct_index smallint,
  explanation   text,
  times_asked   integer,
  seen          boolean
)
language sql
set search_path = public
as $$
  with recent as (
    -- The kid's latest shown views of any topic, read newest first off the
    -- (profile_id, seen_at desc) index and capped, so a call costs the same
    -- however long they've played (no scan of their whole history).
    select v.question_id, v.seen_at
      from question_views v
     where v.profile_id = p_profile
       and v.shown
     order by v.seen_at desc
     limit greatest(p_seen_limit, 0) * 10
  ),
  shown as (
    select r.question_id
      from recent r
      join questions q on q.id = r.question_id
     where q.topic = p_topic
     -- A question shown again (a battle goes round its pool) counts once.
     group by r.question_id
     order by max(r.seen_at) desc
     limit greatest(p_seen_limit, 0)
  ),
  held as (
    select question_id from shown
    union
    select v.question_id
      from question_views v
     where v.profile_id = p_profile
       and not v.shown
       and v.seen_at > now() - p_reserve
  ),
  family as (
    -- Every kid of the grown-up this kid belongs to.
    select f.id
      from profiles f
     where f.parent_id = (select k.parent_id from profiles k where k.id = p_profile)
  )
  select q.id, q.level, q.text, q.options, q.correct_index, q.explanation, q.times_asked,
         (h.question_id is not null) as seen
    from questions q
    left join held h on h.question_id = q.id
   where q.topic = p_topic
     and q.level between p_min_level and p_max_level
     and q.status in ('active', 'approved')
     and (p_max_age is null or q.age is null or q.age <= p_max_age)
     and not exists (
       select 1 from question_flags fl
        where fl.question_id = q.id
          and fl.profile_id in (select id from family)
     )
   order by (h.question_id is not null),
            (q.status <> 'approved'),
            -- Weighted random order (Efraimidis–Spirakis): the smallest key
            -- wins; 1 - random() is never 0, so ln() always has an answer.
            -ln(1 - random()) * sqrt(1 + greatest(q.times_asked, 0))
   limit greatest(p_limit, 0);
$$;

revoke all on function public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer)
  from public, anon, authenticated;
grant execute on function public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer)
  to service_role;
