-- Hazel Quest — closing a whole account (#124b)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0022.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- A grown-up can close their account from 👪 Grown-ups (until now it was
-- "email us"). The `delete-account` edge function checks who's asking and
-- their password, calls delete_family() below with the service role, then
-- deletes the login itself (Supabase's admin API — deleting from auth.users
-- is the auth service's job).
--
-- delete_family() removes everything the family owns, in one transaction,
-- in an order the foreign keys accept:
--   * every kid (profiles): their saves, seen questions, question reports and
--     PINs go with them (on delete cascade). 0021's trigger deletes their
--     question-request log except today's spend, which stays — without a name
--     — so it still counts against the project's daily budget for a day (and
--     the family's, while the login is still there);
--   * the family's leftover request rows no budget needs (kids removed
--     earlier: over a day old, or nothing spent);
--   * the grown-up's PIN, consent row and admin row;
--   * their name on questions they reviewed (reviewed_by → null).
-- Deleting the login afterwards cascades the same tables again (all of them
-- reference auth.users or profiles with on delete cascade / set null), so the
-- function is belt and braces, and a failed login delete leaves an empty
-- account to retry, never half a family.

create or replace function public.delete_family(p_parent uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kids integer;
begin
  if p_parent is null then
    raise exception 'no_parent: whose account is this?';
  end if;

  delete from public.profiles where parent_id = p_parent;
  get diagnostics v_kids = row_count;

  delete from public.question_requests
   where parent_id = p_parent
     and (fresh_count = 0 or requested_at <= now() - interval '1 day');

  delete from public.parent_pins where id = p_parent;
  delete from public.parents where id = p_parent;
  delete from public.admins where user_id = p_parent;
  update public.questions set reviewed_by = null where reviewed_by = p_parent;

  return jsonb_build_object('kids', v_kids);
end;
$$;

-- Only the edge function (the service role) may call it.
revoke execute on function public.delete_family(uuid) from public, anon, authenticated;
grant execute on function public.delete_family(uuid) to service_role;

notify pgrst, 'reload schema';
