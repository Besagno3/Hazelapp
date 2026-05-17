-- Hazel Quest — question cache
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0002.
--
-- Generated questions are stored here so they can be randomly reused instead
-- of always calling the Claude API. `times_asked` counts how often each
-- question has been served. Only the generate-questions edge function (service
-- role) touches this table — RLS is on with no policies, denying direct
-- client access.

create table if not exists public.questions (
  id            uuid        primary key default gen_random_uuid(),
  topic         text        not null,
  level         smallint    not null,
  text          text        not null,
  options       jsonb       not null,
  correct_index smallint    not null,
  explanation   text,
  times_asked   integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists questions_topic_level_idx
  on public.questions (topic, level);

alter table public.questions enable row level security;

-- Atomically bump the ask-counter for a set of questions.
create or replace function public.increment_question_usage(ids uuid[])
returns void
language sql
as $$
  update public.questions
  set times_asked = times_asked + 1
  where id = any(ids);
$$;

-- Only the edge function (service role) should call this.
revoke execute on function public.increment_question_usage(uuid[]) from anon, authenticated;
