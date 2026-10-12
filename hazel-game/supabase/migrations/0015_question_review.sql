-- Hazel Quest — reviewing questions for kids (Act I launch review B10)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0014.
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
