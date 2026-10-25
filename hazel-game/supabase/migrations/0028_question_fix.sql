-- Migration 0028: the owner fixes a question's answer in the app, and browses
-- the whole bank to check answers.
--
-- Until now 🛡️ Question review could only release, approve or retire a
-- question; a wrong answer was fixed by hand in the SQL editor. Now:
--
-- 1) admin_fix_question(): saves a corrected question — its text, its four
--    options, which one is right and the explanation — and approves it (an
--    owner who fixed it has looked at it). It records who and when
--    (reviewed_by / reviewed_at), notes the fix in review_note (shown with any
--    later report) and clears checked_version, so a recheck with
--    --include-approved --include-reviewed checks the new wording. It refuses what
--    screenQuestion (_shared/questionScreen.ts) would never serve: not four
--    different non-empty options, the right answer missing, or anything too
--    long (trimmed as the app trims, question_trim). The word, link and "points at a place" checks run in the app before
--    saving, and the edge function screens every saved question as it serves
--    it.
-- 2) admin_browse_questions(): every question that isn't retired (or only one
--    status), filtered by topic, level and words in the question, newest
--    first, a page at a time — with the right answer, how often it was asked
--    and its reports. Pages are keyset (after the last one shown, by
--    created_at, id), so a question that leaves the filter as it's fixed
--    (held back → approved) never shifts the next page past one unseen.
-- 3) question_trim(): trims like JavaScript's trim() (every Unicode space,
--    tabs and newlines, not just ' ' as btrim does), so the database and the
--    app agree on what's empty and what's the same.
-- Both are for an admin with 👪 Grown-ups open, like admin_review_question
-- (0019, 0024): "not an admin" (42501), "grown_ups_locked" (HQ001).
--
-- The app reads every question from the server as it needs it, so a fix is
-- served from the next request; a copy already loaded on a device lasts at
-- most until it's reloaded or 45 minutes (HELD_FOR_MS). A report check
-- already running on the old wording when the fix lands doesn't undo it: the
-- check's write-back (generate-questions `check-report`, the recheck script)
-- skips a question the owner reviewed after the check began.

create or replace function public.question_trim(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    p,
    '^[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
    '', 'g');
$$;

create or replace function public.admin_fix_question(
  p_question      uuid,
  p_text          text,
  p_options       jsonb,
  p_correct_index integer,
  p_explanation   text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text        text := public.question_trim(coalesce(p_text, ''));
  v_explanation text := nullif(public.question_trim(coalesce(p_explanation, '')), '');
  v_options     jsonb;
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  perform public.require_grown_up();

  -- The same limits as screenQuestion (MAX_TEXT_CHARS, MAX_OPTION_CHARS,
  -- MAX_EXPLANATION_CHARS).
  if v_text = '' then
    raise exception 'the question needs words' using errcode = '22023';
  end if;
  if length(v_text) > 220 then
    raise exception 'the question is too long (220 characters at most)' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) <> 4
     or exists (select 1 from jsonb_array_elements(p_options) o where jsonb_typeof(o) <> 'string') then
    raise exception 'a question needs exactly four answers' using errcode = '22023';
  end if;
  select jsonb_agg(public.question_trim(o) order by ord) into v_options
    from jsonb_array_elements_text(p_options) with ordinality as t(o, ord);
  if exists (select 1 from jsonb_array_elements_text(v_options) o where o = '') then
    raise exception 'every answer needs words' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_options) o where length(o) > 80) then
    raise exception 'an answer is too long (80 characters at most)' using errcode = '22023';
  end if;
  if (select count(distinct lower(o)) from jsonb_array_elements_text(v_options) o) <> 4 then
    raise exception 'two answers are the same' using errcode = '22023';
  end if;
  if p_correct_index is null or p_correct_index not between 0 and 3 then
    raise exception 'pick the right answer' using errcode = '22023';
  end if;
  if length(coalesce(v_explanation, '')) > 280 then
    raise exception 'the explanation is too long (280 characters at most)' using errcode = '22023';
  end if;

  update public.questions
     set text            = v_text,
         options         = v_options,
         correct_index   = p_correct_index,
         explanation     = v_explanation,
         status          = 'approved',
         reviewed_at     = now(),
         reviewed_by     = auth.uid(),
         review_note     = to_char(now(), 'YYYY-MM-DD') || ' fixed by the owner',
         checked_version = null,
         checked_at      = null
   where id = p_question
     and status <> 'retired';
  if not found then
    raise exception 'no such question' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_browse_questions(
  p_topic        text        default null,
  p_level        integer     default null,
  p_status       text        default null,
  p_search       text        default null,
  p_limit        integer     default 50,
  -- The last question shown (both or neither): the page after it.
  p_after_created timestamptz default null,
  p_after_id      uuid        default null
)
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
  times_asked   integer,
  reports       bigint,
  created_at    timestamptz,
  reviewed_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Words, not a pattern: % and _ in the search match themselves.
  v_like text := '%' || replace(replace(replace(public.question_trim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  perform public.require_grown_up();
  return query
    select q.id, q.topic, q.level, q.age, q.status, q.text, q.options, q.correct_index, q.explanation,
           q.times_asked,
           (select count(*) from public.question_flags f where f.question_id = q.id),
           q.created_at, q.reviewed_at
      from public.questions q
     where (p_topic is null or q.topic = p_topic)
       and (p_level is null or q.level = p_level)
       and (case when p_status is null then q.status <> 'retired' else q.status = p_status end)
       and (nullif(public.question_trim(coalesce(p_search, '')), '') is null or q.text ilike v_like)
       and (p_after_created is null or p_after_id is null or (q.created_at, q.id) < (p_after_created, p_after_id))
     order by q.created_at desc, q.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function public.admin_fix_question(uuid, text, jsonb, integer, text) from public, anon;
grant execute on function public.admin_fix_question(uuid, text, jsonb, integer, text) to authenticated;
revoke all on function public.admin_browse_questions(text, integer, text, text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.admin_browse_questions(text, integer, text, text, integer, timestamptz, uuid) to authenticated;
revoke all on function public.question_trim(text) from public, anon, authenticated;
