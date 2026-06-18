# Production Supabase — diagnose & fix persistence

If XP / levels / skill levels reset on refresh (ISSUES #61), the production
Supabase is missing migrations. A Supabase `UPDATE` under RLS with **no matching
policy affects 0 rows and returns no error** — so writes fail silently.

Run the steps below in the **Supabase dashboard → SQL Editor** on the
**production** project (the one your Vercel deploy points at).

---

## Step 1 — Diagnose what's missing

Copy-paste and run:

```sql
-- A) Does the profiles UPDATE policy exist?  (the silent-write culprit)
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;

-- B) Do the columns added by later migrations exist?
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in
    ('skill_levels','xp','power_ups','current_streak','longest_streak','last_played_on')
order by column_name;

-- C) Which tables exist at all?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','questions','question_views','question_flags','saves')
order by table_name;
```

### How to read it
- **(A)** You want a row with `cmd = UPDATE` (and ideally `SELECT` + `INSERT`).
  No `UPDATE` row → migration **0001** isn't fully applied. **This is the #1
  cause of the XP reset.**
- **(B)** Any of these missing maps to a migration:
  | Missing column | Apply migration |
  |----------------|-----------------|
  | `xp` | `0002_add_xp.sql` |
  | `power_ups` | `0004_power_ups.sql` |
  | `current_streak` / `longest_streak` / `last_played_on` | `0007_add_streak.sql` |
  | `skill_levels` | `0001_create_profiles.sql` (table itself) |
- **(C)** Missing tables:
  | Missing table | Apply migration |
  |---------------|-----------------|
  | `profiles` | `0001_create_profiles.sql` |
  | `questions` | `0003_questions_cache.sql` (+ `0005_questions_grants.sql`) |
  | `question_views` / `question_flags` | `0006_question_views_and_flags.sql` |
  | `saves` | `0008_saves.sql` |

---

## Step 2 — Apply the missing migrations

### Option A (recommended): Supabase CLI
From `hazel-game/`:

```bash
npx supabase link --project-ref <your-prod-project-ref>
npx supabase db push
```

`db push` tracks which migrations are already applied and runs only the
outstanding ones, in order.

### Option B: paste SQL by hand
In the SQL Editor, open each file under `hazel-game/supabase/migrations/` and
run them **in numeric order** (`0001` → `0008`), skipping any the diagnostic
showed are already present. If a statement errors with `already exists`, that
piece is done — keep going.

Full order: `0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` → `0008`.

---

## Step 3 — Verify the fix
1. Re-run the **Step 1** queries — the `UPDATE` policy and all columns should now exist.
2. In the app: earn some XP, then **refresh**. The level should hold.
3. In the dashboard, open the `profiles` table — your row's `xp` / `skill_levels`
   should now update as you play.

> Note: rows that were already zeroed out can only be restored via Supabase
> **Point-in-Time Recovery / a backup** — applying migrations fixes persistence
> going forward, not past loss.
