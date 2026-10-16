-- Migration 0017 (#147): saved questions are reused within a year of the age
-- they were written for, both ways, and the review queue shows questions held
-- back without a report (the bank recheck's).
--
-- 1) The question writer now pitches a level to the child's age: level 9 for a
--    7-year-old is much easier than level 9 for an 11-year-old. 0015 only kept
--    out questions written for a child more than a year OLDER, so an
--    11-year-old at level 10 was mostly served questions written for 7- and
--    8-year-olds. The picker gains a lower edge (p_min_age), and a question
--    written for an older child is reused only at or below this kid's own
--    level (p_age, p_level), so a "two years ahead" stretch question never
--    reaches a younger kid above theirs. Questions saved before ages were
--    stored have none and stay in (the owner's call in #134). The three new
--    parameters default to null, which keeps 0016's behaviour, so the edge
--    function from before this migration still works against it.
-- 2) questions.review_note: why a question was held back by something other
--    than a family's report — `supabase/scripts/recheck-questions.ts` writes it.
-- 3) The review queue lists held-back questions with no reports too, their
--    note among the reasons. Same columns as 0016's view, so re-running 0016
--    from the bundle still works.

alter table public.questions add column if not exists review_note text;

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
       array_remove(array_agg(distinct f.reason), null)
         || case when q.review_note is null then '{}'::text[] else array['recheck: ' || q.review_note] end
         as reasons,
       max(f.created_at) as last_report
  from public.questions q
  left join public.question_flags f on f.question_id = q.id
  left join public.profiles p on p.id = f.profile_id
 where q.status <> 'retired'
   and (q.status = 'review' or f.created_at > coalesce(q.reviewed_at, '-infinity'::timestamptz))
 group by q.id
 order by (q.status = 'review') desc, not_for_kids desc, families desc, last_report desc nulls last;
revoke all on public.question_review_queue from public, anon, authenticated;
grant select on public.question_review_queue to service_role;

-- The picker gains three parameters, so it's a new signature: drop 0016's.
drop function if exists public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer);

create or replace function public.pick_cached_questions(
  p_topic      text,
  p_min_level  integer,
  p_max_level  integer,
  p_max_age    integer,
  p_profile    uuid,
  p_seen_limit integer,
  p_reserve    interval,
  p_limit      integer,
  p_min_age    integer default null,
  p_age        integer default null,
  p_level      integer default null
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
     and (p_min_age is null or q.age is null or q.age >= p_min_age)
     -- A question written for an older child: only at or below this kid's level.
     and (p_age is null or p_level is null or q.age is null or q.age <= p_age or q.level <= p_level)
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

revoke all on function public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer, integer, integer, integer)
  to service_role;
