---
paths:
  - hazel-game/supabase/migrations/**
  - hazel-game/supabase/ci/**
  - hazel-game/supabase/apply_all_migrations.sql
  - hazel-game/scripts/build-apply-all.mjs
---
# Migrations and SQL tests — read `hazel-game/docs/architecture/backend-and-ci.md` before changing these files

Non-negotiables (#90):

1. **Forward-only.** Never edit a migration that has been applied anywhere (merged to `main`): `supabase db push` skips recorded versions, so the edit silently never lands. Fix it in the next numbered file.
2. **Re-runnable.** The bundle replays everything every run: `create … if not exists`, `add column if not exists`, `create or replace function`, `drop policy|trigger if exists … on …` before `create policy|trigger`.
3. **No transaction control** (`begin` / `commit`): the bundle wraps all of them in one transaction.
4. After adding one: `npm run db:bundle` (`apply_all_migrations.sql` is generated — never hand-edit it; CI checks it matches and applies it twice) and a SQL test in `supabase/ci/*.test.sql` when access rules change.

- SQL tests run on a plain Postgres after `ci/supabase-stub.sql`; a test that acts as a grown-up opens 👪 Grown-ups first on the stub's `request.jwt.claims` session. A new `profiles` column must be classified for `grown_ups_gate.test.sql` to pass.
- PINs, unlocks, password changes and `admins` are readable by no client; security-definer functions are the only way in. `play_days` is readable by the family for two weeks only.
- Deploy order for a migration the app depends on (0024 + `delete-account`, 0025): `docs/OPERATIONS.md`. Production repair: `docs/PRODUCTION-DB-SETUP.md`.
