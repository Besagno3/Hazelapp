# Production Supabase — set up, update, check

The game needs the production Supabase project (the one the Vercel build's
`VITE_SUPABASE_URL` points at) to have **every migration** in
`hazel-game/supabase/migrations/` — `0001` to `0021` today — and the
`generate-questions` edge function deployed with its key. Run the SQL below in
the **Supabase dashboard → SQL Editor** on that project.

Why it matters: under RLS, a write that no policy allows changes 0 rows and
returns no error, so a missing migration fails silently — XP and levels that
reset on refresh were exactly that (ISSUES #61). Later migrations guard saves
(0011, 0020) and the question budget (0009, 0021).

---

## Step 1 — What's applied?

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

`apply_all_migrations.sql` and `supabase db push` both record each migration
here, so you want one row per file, `0001` … `0021`. Migrations pasted in one by
one are **not** recorded (if the table doesn't exist, nothing ever was) — then
ask the schema itself:

```sql
with col as (
  select table_name as t, column_name as c from information_schema.columns where table_schema = 'public'
)
select migration, present from (values
  ('0001', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'UPDATE')),
  ('0002', exists (select 1 from col where t = 'profiles' and c = 'xp')),
  ('0003', to_regclass('public.questions') is not null),
  ('0004', exists (select 1 from col where t = 'profiles' and c = 'power_ups')),
  ('0005', case when to_regclass('public.questions') is null then false
                else has_table_privilege('service_role', 'public.questions', 'insert') end),
  ('0006', to_regclass('public.question_flags') is not null),
  ('0007', exists (select 1 from col where t = 'profiles' and c = 'current_streak')),
  ('0008', to_regclass('public.saves') is not null),
  ('0009', to_regclass('public.question_requests') is not null),
  ('0010', case when to_regclass('public.profiles') is null then false
                else has_table_privilege('authenticated', 'public.profiles', 'update') end),
  ('0011', to_regproc('public.saves_keep_newest_version') is not null),
  ('0012', exists (select 1 from col where t = 'profiles' and c = 'level')),
  ('0013', to_regclass('public.parents') is not null),
  ('0014', to_regclass('public.kid_pins') is not null),
  ('0015', exists (select 1 from col where t = 'questions' and c = 'age')),
  ('0016', exists (select 1 from col where t = 'questions' and c = 'status')),
  ('0017', exists (select 1 from col where t = 'questions' and c = 'review_note')),
  ('0018', exists (select 1 from col where t = 'questions' and c = 'checked_version')),
  ('0019', to_regclass('public.admins') is not null),
  ('0020', coalesce(pg_get_functiondef(to_regproc('public.saves_keep_newest_version')) like '%save_revision_conflict%', false)),
  ('0021', exists (select 1 from col where t = 'question_requests' and c = 'parent_id'))
) as v(migration, present)
order by migration;
```

Every `present` should be `true`; a `false` names a migration that's missing
(each row looks for one thing that migration adds).

---

## Step 2 — Apply the migrations

### Option A (recommended): the one-file bundle

Paste the **whole** of `hazel-game/supabase/apply_all_migrations.sql` into the
SQL Editor and click **Run**. It replays every migration in order in one
transaction (all or nothing) and records each in
`supabase_migrations.schema_migrations`. Every statement is re-runnable, so it
is safe on a fresh, half-migrated or finished project, and it repairs a missing
or wrong policy, grant or column on the way. Its last result is Step 1's list.

The file is generated from `supabase/migrations/`: after adding a migration, run
`npm run db:bundle` (CI fails if it's stale: `node scripts/build-apply-all.mjs --check`).

### Option B: Supabase CLI

From `hazel-game/`:

```bash
npx supabase link --project-ref <your-prod-project-ref>
npx supabase db push
```

`db push` runs only the migrations not yet recorded, in order. It never re-runs
a recorded one, so it can't repair a project that drifted — Option A can.

### Option C: by hand

Run each file in `supabase/migrations/` in numeric order, `0001` → `0021`,
skipping the ones Step 1 shows are there. Nothing is recorded this way, so
prefer Option A.

**Order:** apply new migrations **before** shipping the app build that came
with them — the app needs some of them (0011, 0012 and 0020 say so). The edge
function copes without most of them (Step 3).

---

## Step 3 — Deploy the question function

From `hazel-game/`:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
npx supabase functions deploy generate-questions
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set by
Supabase. Optional secrets: the limits (`QUESTION_RATE_PER_MINUTE`,
`FRESH_PER_PLAYER_PER_DAY`, `FRESH_PER_FAMILY_PER_DAY`, `FRESH_GLOBAL_PER_DAY`;
defaults in `QUOTA_DEFAULTS`), `QUESTION_SECOND_CHECK=off`, and the review alerts
— `docs/OPERATIONS.md` has those, the daily digest job and how to make yourself
an admin. The function is one file with its imports pinned to exact versions,
so a dashboard deploy works too.

A missing migration shows in the function's log (Edge Functions →
generate-questions → Logs):

| Log line | Missing | What happens |
|----------|---------|--------------|
| `QUOTA CHECK FAILED … (is migration 0009 applied?)` | 0009 | saved questions only, no new ones |
| `player lookup failed (is migration 0013 applied?)` | 0013 | every call fails ("try again later") |
| `QUESTION PICKER MISSING (is migration 0015 applied?)` | 0015 | the old, unfair lookup |
| `QUESTION PICKER WITHOUT THE AGE WINDOW (is migration 0017 applied?)` | 0017 | questions for younger kids reused too |
| `REPORT CHECK CLAIM FAILED` / `CHECKED MARKER MISSING (is migration 0018 applied?)` | 0018 | reports aren't rechecked; new questions aren't marked checked |
| `FAMILY BUDGET UNAVAILABLE … (is migration 0021 applied?)` | 0021 | per-kid budgets only |

Not the database, but also production: Supabase → Authentication → URL
Configuration → Redirect URLs needs `https://hazelapp-pi.vercel.app/play/`
(sign-up and password-reset links, #146i).

---

## Step 4 — Check it works

1. Step 1's queries: 21 rows, every `present` true.
2. In the app: sign in, pick a kid, earn some XP and **refresh** — the level
   holds. Start a battle — questions load, and the function's log shows the call.
3. Dashboard → Table Editor → `profiles`: the kid's `xp` / `level` change as you play.

> Rows that were already zeroed (#61) only come back from Point-in-Time
> Recovery or a backup — migrations fix things going forward, not past loss.
