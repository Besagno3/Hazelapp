-- Hazel Quest — player power-ups
-- Run in the Supabase SQL Editor (or `supabase db push`) after 0003.
--
-- On each level-up the player chooses a power-up; this column holds how many
-- of each they have ({ "attack": 2, "vitality": 1, ... }).

alter table public.profiles
  add column if not exists power_ups jsonb not null default '{}'::jsonb;
