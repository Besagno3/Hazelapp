-- Hazel Quest — access hardening from the migrations review (#86)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0009.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- Fixes are a NEW migration instead of edits to 0001/0003: projects that
-- already recorded 0001/0003 (e.g. via `supabase db push`) would never re-run
-- an edited old file, so the fix has to arrive as the next version.

-- 1) profiles had no explicit table grants. The client reads/inserts/updates
--    its own row (profileStore), protected by 0001's RLS policies; on a
--    project with tightened public-schema defaults (see 0005/0008) every
--    profile write failed with "permission denied" and XP never saved.
--    Mirrors 0008's grants for `saves`. RLS still limits rows to the owner.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;

-- 2) The sign-up trigger required birth-date metadata: creating a user from
--    the dashboard, an invite, or a future OAuth / parent-account flow failed
--    the whole sign-up ("Database error saving new user"). Now it only seeds
--    the profile when both values are present and valid; otherwise the app
--    creates the row on first load (profileStore.loadProfile) with a default
--    age. `on conflict do nothing` keeps it safe if a row already exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year  text := new.raw_user_meta_data ->> 'birth_year';
  v_month text := new.raw_user_meta_data ->> 'birth_month';
begin
  if v_year ~ '^\d{4}$' and v_month ~ '^\d{1,2}$' and v_month::int between 1 and 12 then
    insert into public.profiles (id, birth_year, birth_month)
    values (new.id, v_year::smallint, v_month::smallint)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- 3) increment_question_usage stayed callable by everyone through Postgres's
--    default PUBLIC execute grant (0003 only revoked anon/authenticated).
--    Harmless today (invoker rights + RLS → 0 rows), but only the edge
--    function should call it. 0005 already grants it to service_role.
revoke execute on function public.increment_question_usage(uuid[]) from public, anon, authenticated;
grant execute on function public.increment_question_usage(uuid[]) to service_role;
