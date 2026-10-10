-- Hazel Quest — save the player's level
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0011.
--
-- The level used to be derived from total XP (a flat 100 XP per level), so
-- changing the curve would have moved every player's level. Now the level is
-- stored, with the XP earned toward the next one (src/lib/level.ts):
--   level     — the player's level, never lowered by a curve change.
--   level_xp  — XP earned into the current level.
-- `xp` stays the lifetime total.
--
-- Existing rows are backfilled from the old flat curve, so every player keeps
-- exactly the level they had. Re-runnable: the backfill only touches rows
-- that have no level yet.

alter table public.profiles
  add column if not exists level    integer,
  add column if not exists level_xp integer;

update public.profiles
   set level    = greatest(xp, 0) / 100 + 1,
       level_xp = greatest(xp, 0) % 100
 where level is null or level_xp is null;

alter table public.profiles
  alter column level    set default 1,
  alter column level    set not null,
  alter column level_xp set default 0,
  alter column level_xp set not null;
