-- Migration 0018 (#146): every question is checked once, and a family's report
-- checks it again.
--
-- 1) questions.checked_version / checked_at: the rules version a question was
--    last checked under, and when. New questions are saved with it (they pass
--    the checks before they're saved); the recheck script
--    (supabase/scripts/recheck-questions.ts) sets it on the saved bank and
--    skips anything already checked under the current version, so each
--    question is checked once per version of the rules.
-- 2) questions.report_checked_at and claim_report_check(): a report starts a
--    check (the edge function's `check-report` action, Claude Haiku then a
--    stronger model). The claim is atomic and only succeeds when the family
--    reported the question since its last check, and while the family has
--    made no more than p_daily_cap reports in the last day — so each report
--    checks a question at most once, and a family can't run up the bill. With
--    p_parent null (the recheck script's sweep) any family's report counts and
--    there's no cap.
-- 3) pending_report_checks(): questions with a report newer than their last
--    check — reports the edge function never got to (an app closed, a check
--    that failed, a family over its cap) — for the recheck script's
--    `--reported` run.

alter table public.questions add column if not exists checked_version smallint;
alter table public.questions add column if not exists checked_at timestamptz;
alter table public.questions add column if not exists report_checked_at timestamptz;

create or replace function public.claim_report_check(
  p_question  uuid,
  p_parent    uuid,
  p_daily_cap integer
)
returns table (
  id            uuid,
  text          text,
  options       jsonb,
  correct_index smallint,
  explanation   text,
  age           smallint
)
language sql
set search_path = public
as $$
  with family as (
    select f.id from profiles f where f.parent_id = p_parent
  ),
  newest as (
    select max(fl.created_at) as at
      from question_flags fl
     where fl.question_id = p_question
       and (p_parent is null or fl.profile_id in (select id from family))
  ),
  today as (
    select count(*) as n
      from question_flags fl
     where fl.profile_id in (select id from family)
       and fl.created_at > now() - interval '1 day'
  )
  update questions q
     -- A check covers every report so far, whoever made it.
     set report_checked_at = greatest(now(), (select max(fl.created_at) from question_flags fl
                                              where fl.question_id = p_question))
   where q.id = p_question
     and q.status <> 'retired'
     and (select at from newest) is not null
     and (select at from newest) > coalesce(q.report_checked_at, '-infinity'::timestamptz)
     and (p_parent is null or (select n from today) <= p_daily_cap)
  returning q.id, q.text, q.options, q.correct_index, q.explanation, q.age;
$$;

create or replace function public.pending_report_checks(p_limit integer)
returns table (id uuid)
language sql
stable
set search_path = public
as $$
  select q.id
    from questions q
   where q.status <> 'retired'
     and exists (
       select 1 from question_flags fl
        where fl.question_id = q.id
          and fl.created_at > coalesce(q.report_checked_at, '-infinity'::timestamptz)
     )
   order by q.id
   limit greatest(p_limit, 0);
$$;

revoke all on function public.claim_report_check(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_report_check(uuid, uuid, integer) to service_role;
revoke all on function public.pending_report_checks(integer) from public, anon, authenticated;
grant execute on function public.pending_report_checks(integer) to service_role;
