-- Hazel Quest — an older game can never overwrite a newer save (#101h)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0010.
-- Re-runnable, like every migration (see CLAUDE.md → migrations rules).
--
-- Each save records the version of its shape (`data->>'version'`;
-- `SAVE_VERSION` in src/lib/save.ts — 2 since #75 item 8). A client already
-- refuses to LOAD a save from a newer version than itself, but a tab that was
-- open when a newer version shipped still has its older save in memory, and
-- its next upload would replace the newer save. This trigger refuses any
-- update that would lower a save's version; the client then shows "refresh to
-- update" (saveStore: the error code `save_version_conflict`).
--
-- A save without a numeric version (or with junk there) counts as version 1,
-- as the client reads it (`saveVersionOf`).

create or replace function public.saves_keep_newest_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old integer := case when jsonb_typeof(old.data -> 'version') = 'number'
                         and (old.data ->> 'version') ~ '^\d{1,9}$'
                        then (old.data ->> 'version')::integer else 1 end;
  v_new integer := case when jsonb_typeof(new.data -> 'version') = 'number'
                         and (new.data ->> 'version') ~ '^\d{1,9}$'
                        then (new.data ->> 'version')::integer else 1 end;
begin
  if v_new < v_old then
    raise exception 'save_version_conflict: this save was written by a newer version of the game (v%), refusing v%',
      v_old, v_new
      using hint = 'Refresh the page to update the game.';
  end if;
  return new;
end;
$$;

drop trigger if exists saves_keep_newest_version on public.saves;
create trigger saves_keep_newest_version
  before update on public.saves
  for each row execute function public.saves_keep_newest_version();
