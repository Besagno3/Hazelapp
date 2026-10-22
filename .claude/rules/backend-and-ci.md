---
paths:
  - hazel-game/supabase/migrations/**
  - hazel-game/supabase/ci/**
  - hazel-game/supabase/apply_all_migrations.sql
  - hazel-game/scripts/**
  - hazel-game/vercel.json
  - hazel-game/site/**
  - hazel-game/vite.config.ts
  - hazel-game/index.html
  - hazel-game/public/manifest.webmanifest
  - hazel-game/package.json
  - .github/workflows/**
  - .githooks/**
  - .claude/**
---
# Migrations, CI and deploys — read `hazel-game/docs/architecture/backend-and-ci.md` before changing these files

Migration rules (#90):

1. **Forward-only.** Never edit a migration that has been applied anywhere (merged to `main`): `supabase db push` skips recorded versions, so the edit silently never lands. Fix it in the next numbered file.
2. **Re-runnable.** The bundle replays everything every run: `create … if not exists`, `add column if not exists`, `create or replace function`, `drop policy|trigger if exists … on …` before `create policy|trigger`.
3. **No transaction control** (`begin` / `commit`): the bundle wraps all of them in one transaction.
4. After adding one: `npm run db:bundle` (`apply_all_migrations.sql` is generated — never hand-edit it; CI checks it matches and applies it twice) and a SQL test in `supabase/ci/*.test.sql` when access rules change.

- SQL tests run on a plain Postgres after `ci/supabase-stub.sql`; a test that acts as a grown-up opens 👪 Grown-ups first on the stub's `request.jwt.claims` session. A new `profiles` column must be classified for `grown_ups_gate.test.sql` to pass.
- PINs, unlocks, password changes and `admins` are readable by no client; security-definer functions are the only way in. `play_days` is readable by the family for two weeks only.
- Deploy order for a migration the app depends on (0024 + `delete-account`, 0025): `docs/OPERATIONS.md`. Production repair: `docs/PRODUCTION-DB-SETUP.md`.
- CI (`ci.yml`): every job is gated on the PR not being a draft and `pull_request` also triggers on `ready_for_review`; no `paths:` filter on purpose (a required check that skips would leave PRs stuck). The job's check is named `test`. Pushes to `main` always run.
- Vercel: `ignoreCommand` → `scripts/vercel-ignore-build.mjs` (production always builds; a preview only for an open, non-draft PR; any lookup failure fails open); `claude/**` branches never deploy (`git.deploymentEnabled`, #126 — the Hobby plan's 100 deployments a day). `build:web` refuses a production build without the Supabase env (#175); the game is built with base `/` and only its page moves to `/play/`.
- `package.json` lists only packages the app imports (#87); add a package in the same change that first uses it.
- `.claude/hooks/check-claude-md.mjs` keeps `hazel-game/CLAUDE.md` at ≤150 lines (warns at 180, fails at 200); a rule file here without `paths:` loads every session — give every new rule a `paths:` list.
