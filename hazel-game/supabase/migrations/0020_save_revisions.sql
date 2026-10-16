-- Hazel Quest — a save never goes back to an older copy (#151, launch checklist S1)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0019.
-- Re-runnable, like every migration (see CLAUDE.md → migration rules).
--
-- Every save now carries a revision (`data->'revision'`; `revisionOf` in
-- src/lib/save.ts): the app adds one each time it changes the save. 0011's
-- trigger stopped an older *version of the game* writing over a newer save;
-- this adds the same check for revisions, so an older *copy* can't write over
-- a newer one either — a second tab or device that fell behind, or a copy
-- kept offline that the server has since passed. It raises 0011's error,
-- `save_version_conflict`, so every app, old or new, already stops saving and
-- asks for a refresh; the detail `save_revision_conflict` tells the new app
-- to say "you played on somewhere else" rather than "the game was updated".
--
-- On UPDATE (an insert has nothing to write over):
--   * the version may not go down (0011, unchanged);
--   * a stored save with no revision (saved before this) may be replaced by
--     anything — apps from before revisions keep working until the new app
--     has saved this player once;
--   * a stored save with a revision may only be replaced by a higher one, or
--     by the very same save again (a retried upload changes nothing). A save
--     without a revision — an app from before revisions — can't replace it:
--     that tab is told to refresh.
-- A revision is a whole number of up to 15 digits; anything else counts as
-- none, as `revisionOf` reads it.
--
-- Editing a save by hand (SQL editor, service role): raise its revision too,
-- e.g. `data || jsonb_build_object('revision', (data->>'revision')::bigint + 1)`,
-- or the trigger refuses the change.

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
  r_old bigint := case when jsonb_typeof(old.data -> 'revision') = 'number'
                        and (old.data ->> 'revision') ~ '^\d{1,15}$'
                       then (old.data ->> 'revision')::bigint end;
  r_new bigint := case when jsonb_typeof(new.data -> 'revision') = 'number'
                        and (new.data ->> 'revision') ~ '^\d{1,15}$'
                       then (new.data ->> 'revision')::bigint end;
begin
  if v_new < v_old then
    raise exception 'save_version_conflict: this save was written by a newer version of the game (v%), refusing v%',
      v_old, v_new
      using hint = 'Refresh the page to update the game.';
  end if;
  if r_old is not null
     and (r_new is null or r_new < r_old or (r_new = r_old and new.data is distinct from old.data)) then
    raise exception 'save_version_conflict: a newer save is already stored (revision %), refusing revision %',
      r_old, coalesce(r_new::text, 'none')
      using detail = 'save_revision_conflict',
            hint = 'Refresh the page to load the newest save.';
  end if;
  return new;
end;
$$;

drop trigger if exists saves_keep_newest_version on public.saves;
create trigger saves_keep_newest_version
  before update on public.saves
  for each row execute function public.saves_keep_newest_version();
