-- Hazel Quest — daily streak hook (#28)
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0006.
--
-- Adds three columns to `profiles`:
--   current_streak   — consecutive days played, advances by 1 each new day.
--   longest_streak   — high-water mark across all time, for parent dashboard.
--   last_played_on   — local-date (YYYY-MM-DD) of the player's last round.
--
-- The streak math runs client-side (lib/streak.ts) using the player's local
-- calendar day — no server-side cron / trigger needed.

alter table public.profiles
  add column if not exists current_streak integer     not null default 0,
  add column if not exists longest_streak integer     not null default 0,
  add column if not exists last_played_on date;
