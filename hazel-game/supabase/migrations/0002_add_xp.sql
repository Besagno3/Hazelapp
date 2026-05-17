-- Hazel Quest — add player XP
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0001.
--
-- XP accumulates from correct answers and NPC defeats. The player's level is
-- derived from XP in the client (see src/lib/level.ts) — it is not stored.

alter table public.profiles
  add column if not exists xp integer not null default 0;
