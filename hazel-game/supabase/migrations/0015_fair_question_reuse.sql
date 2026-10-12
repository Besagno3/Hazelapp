-- Hazel Quest — fairer question reuse (#130)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0014.
-- Re-runnable, like every migration (see CLAUDE.md → migration rules).
--
-- The owner's calls (2026-10-12), three fixes to how generate-questions
-- reuses its bank:
--
-- 1) The bank was read 200 rows at a time with no ORDER BY, so Postgres
--    handed back the same (oldest) 200 of a level band on every call: past
--    200 a band's new questions were never reused. pick_cached_questions
--    samples the WHOLE band at random, leaning toward less-asked questions
--    (weight 1/sqrt(1 + times_asked)) so the bank gets used evenly, without
--    always serving the newest (least-flagged) ones first.
-- 2) A question records the age it was written for; reuse skips one written
--    for a child more than a year older (the function is given the oldest
--    age allowed). Questions from before this have no age and stay reusable.
-- 3) "Seen" means shown. The app marks a question seen when it's on screen
--    (mark_questions_seen). A question delivered but not shown yet (fetched
--    ahead for a battle that may never happen) is only held back from that
--    kid for a while (p_reserve), and never pushes questions they really saw
--    out of the window — which is now per topic (the last p_seen_limit shown
--    in that topic), not the last 100 of any topic.

-- 2) The age a question was written for (null = from before this).
alter table public.questions add column if not exists age smallint;

-- 3) A view the app reported as shown (true), or a delivery not shown yet
--    (false). Rows from before this were deliveries counted as seen: true.
alter table public.question_views add column if not exists shown boolean not null default true;

-- 1–3) Up to p_limit reusable questions for one topic and level band, in a
-- random order leaning to less-asked, unseen first. `seen` marks the ones this
-- kid saw lately (or was just handed) — the edge function uses those only when
-- its fresh budget can't fill the batch. Flagged questions never come back.
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
  with shown as (
    select v.question_id
      from question_views v
      join questions q on q.id = v.question_id
     where v.profile_id = p_profile
       and v.shown
       and q.topic = p_topic
     -- A question shown again (a battle goes round its pool) counts once.
     group by v.question_id
     order by max(v.seen_at) desc
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
  )
  select q.id, q.level, q.text, q.options, q.correct_index, q.explanation, q.times_asked,
         (h.question_id is not null) as seen
    from questions q
    left join held h on h.question_id = q.id
   where q.topic = p_topic
     and q.level between p_min_level and p_max_level
     and (p_max_age is null or q.age is null or q.age <= p_max_age)
     and not exists (select 1 from question_flags f where f.question_id = q.id)
   order by (h.question_id is not null),
            -- Weighted random order (Efraimidis–Spirakis): the smallest key
            -- wins; 1 - random() is never 0, so ln() always has an answer.
            -ln(1 - random()) * sqrt(1 + greatest(q.times_asked, 0))
   limit greatest(p_limit, 0);
$$;

-- Only the edge function reads the bank.
revoke all on function public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer)
  from public, anon, authenticated;
grant execute on function public.pick_cached_questions(text, integer, integer, integer, uuid, integer, interval, integer)
  to service_role;

-- 3) The app marks questions seen as they're shown, as the kid playing. Only
-- one of the signed-in grown-up's kids (anyone else's: nothing is written),
-- only questions in the bank, at most 20 a call.
create or replace function public.mark_questions_seen(p_profile uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.question_views (profile_id, question_id, shown)
  select p_profile, q.id, true
    from public.questions q
   where q.id = any (p_ids[1:20])
     and exists (
       select 1 from public.profiles p
        where p.id = p_profile and p.parent_id = auth.uid()
     );
$$;

revoke execute on function public.mark_questions_seen(uuid, uuid[]) from public, anon;
grant execute on function public.mark_questions_seen(uuid, uuid[]) to authenticated;
