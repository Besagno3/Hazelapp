-- Hazel Quest — explicit grants for the question cache
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0003.
--
-- Migration 0003 created the `questions` table and enabled RLS, relying on
-- the public-schema default privileges to give `service_role` table access.
-- On projects where those defaults have been tightened, the edge function
-- logs `cache insert failed: permission denied for table questions` — RLS
-- is bypassed for the service role, but it still needs the underlying GRANTs.
-- This migration makes the grants explicit so the cache works on any project.

grant usage on schema public to service_role;

grant select, insert, update on public.questions to service_role;

grant execute on function public.increment_question_usage(uuid[]) to service_role;
