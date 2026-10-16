-- Migration 0019 (#146): the game's owner reviews questions in the app.
--
-- Until now the review queue and review_question() (0016) were reachable only
-- from the SQL editor (service role). The app gets an admin page, so:
--
-- 1) public.admins: who may review. Nobody can read or write it through the
--    API (RLS on, no policies, no grants); the owner adds themself once in the
--    SQL editor:
--      insert into public.admins (user_id)
--        select id from auth.users where email = 'you@example.com';
-- 2) is_admin(): whether the signed-in user is one (the app shows the page).
-- 3) admin_review_queue(): question_review_queue for an admin (the age too).
-- 4) admin_review_question(): review_question() for an admin, recording who
--    decided (questions.reviewed_by).
-- Both admin functions refuse anyone else with "not an admin" (42501).

create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

alter table public.questions add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
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
  -- The same decision the SQL editor makes (refuses anything but active /
  -- approved / retired, and a question that doesn't exist).
  perform public.review_question(p_question, p_status);
  update public.questions set reviewed_by = auth.uid() where id = p_question;
end;
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
revoke all on function public.admin_review_queue() from public, anon;
grant execute on function public.admin_review_queue() to authenticated;
revoke all on function public.admin_review_question(uuid, text) from public, anon;
grant execute on function public.admin_review_question(uuid, text) to authenticated;
