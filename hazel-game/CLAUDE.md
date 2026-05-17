# Hazel Quest — Project Context

> Educational quiz-battle game. Players answer questions across topics, unlock an
> open world, pick a fighter avatar, and battle NPCs by answering correctly.

This file is loaded automatically by Claude Code. Keep it accurate — it is the
shared source of truth for how this project works.

---

## Stack

| Layer       | Choice                                              |
|-------------|-----------------------------------------------------|
| Build       | Vite 8 (`@vitejs/plugin-react`, Oxc)                |
| UI          | React 18.3 + TypeScript 5.8                         |
| Styling     | Tailwind CSS 3.4 (`@tailwind` directives in `src/index.css`) |
| State       | Zustand 5 (`gameStore` persisted to localStorage, `authStore`) |
| Backend     | Supabase (`@supabase/supabase-js`) — auth only so far |
| Animation   | Framer Motion 12, canvas-confetti                   |
| Testing     | Vitest 4 + Testing Library + jsdom *(not yet wired)* |

Many dependencies in `package.json` are installed but **not yet used**
(react-router-dom, xstate, react-query, react-hook-form, zod, recharts, howler,
katex, vite-plugin-pwa, etc.). Treat them as "approved to adopt" — not as
existing architecture.

## Decisions

- **Audience:** general kids' educational game (difficulty tiers, not tuned to
  one child).
- **Question source:** AI-generated via the Claude API, called from a Supabase
  Edge Function (the API key must stay server-side). Revises an earlier
  "external trivia API" choice — trivia APIs can't do age-graded content. See
  ISSUES.md #7.
- **Player profiles:** a Supabase `profiles` table (birth year/month + per-topic
  skill levels) backs age-based difficulty. Difficulty model: a **persistent
  per-topic skill level** that rises on consecutive correct answers and falls
  slowly on wrong ones; the starting level is derived from age.
- **Routing:** stay phase-based for now; **do not adopt react-router** (URLs /
  browser-back are a liability for a guided kids' game flow). Plan to migrate
  the game flow to **xstate** (already installed) once guarded transitions
  multiply. See ISSUES.md #11. react-router may still be added later *only* for
  standalone non-game pages (parent dashboard, settings, leaderboard).

## Architecture

- **Auth gates the app.** `App.tsx` calls `useAuthInit()` (loads the Supabase
  session + subscribes to auth changes). No valid session → only `AuthPage` is
  reachable, regardless of any persisted game phase.
- **Routing is state-based, not URL-based.** When authenticated, `App.tsx`
  renders a screen based on `gameStore.phase` (`topic-select → quiz → world →
  battle`). No react-router. xstate migration planned — see Decisions above.
- **Feature folders** under `src/features/`: `auth`, `quiz`, `battle`, `world`.
- **`gameStore`** (`src/store/gameStore.ts`) is persisted to localStorage under
  key `hazel-game` — phase and progress survive reloads. `reset()` clears it
  (called on sign-out).
- **`authStore`** holds the Supabase user/session, populated by `useAuthInit`.
- **`profileStore`** holds the player's `profiles` row (birth date, skill
  levels); `useAuthInit` loads it when a session appears, clears it on sign-out.
- DB schema lives in `supabase/migrations/` — apply via the Supabase SQL Editor
  or `supabase db push`.
- **Question generation** is a Deno edge function in
  `supabase/functions/generate-questions/` — it calls the Claude API
  server-side (API key never reaches the browser). `lib/questions.ts`
  (`fetchQuestions`) invokes it from the client.
- Quiz and battle screens still use **hardcoded sample data** — Phase 3 wires
  `fetchQuestions` into gameplay (ISSUES.md #7).

## Commands

```bash
npm install      # install deps (node_modules is gitignored)
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint
# npm test       # NOT yet configured — see ISSUES.md
```

## Conventions

- TypeScript strict mode; `noUnusedLocals`/`noUnusedParameters` are on.
- Tailwind utility classes inline; use the `cn()` helper (`src/lib/utils.ts`)
  for conditional class merging.
- Game tuning constants live in `src/lib/utils.ts` (`PASS_THRESHOLD`,
  `ROUNDS_TO_UNLOCK`, `calcAttackDamage`).
- Shared types live in `src/types/index.ts`.

---

## ⚠️ Pre-commit ritual (REQUIRED before every commit)

Before staging a commit, update all three docs:

1. **`CLAUDE.md`** (this file) — add to the Feature Log below what changed.
2. **`docs/ISSUES.md`** — log any bug, shortcut, or thing to revisit.
3. **`docs/TEST-CASES.md`** — write test cases for the new/changed behavior.

**This is enforced.** A git hook (`.githooks/pre-commit`) blocks any commit that
stages files under `hazel-game/src/` unless all three docs are staged too.
Doc-only and config-only commits are not blocked.

- Intentional bypass (use sparingly): `git commit --no-verify`
- **Fresh clones must activate the hook once:** `git config core.hooksPath .githooks`
  (`core.hooksPath` is local config and is not cloned automatically.)

---

## Feature Log

Newest first. One entry per commit (or per logical change).

### 2026-05-17 — AI question generation (Phase 2 of age-based questions)
- `supabase/functions/generate-questions/`: Deno edge function calling the
  Claude API (`claude-haiku-4-5`, structured JSON output) — Haiku chosen for
  low cost/latency. The API key lives only as the Supabase secret
  `ANTHROPIC_API_KEY`.
- `lib/questions.ts`: `fetchQuestions(topic, age, skillLevel, count)` invokes
  the function via `supabase.functions.invoke`.
- `Question` gains an optional `explanation` field.
- ESLint ignores `supabase/functions/` (Deno runtime, not the Vite build).
- ⚠️ Deploy required: `supabase functions deploy generate-questions` — #16.
- Phase 3 (wire `fetchQuestions` into quiz/battle, skill ramp) pending.

### 2026-05-17 — Player profiles & age (Phase 1 of age-based questions)
- `supabase/migrations/0001_create_profiles.sql`: `profiles` table (birth
  year/month, per-topic skill levels), RLS policies, and a trigger that
  auto-creates the row from sign-up metadata.
- Sign-up form now collects birth month + year.
- `lib/age.ts`: age derivation + age→skill-level helpers.
- `profileStore`: loads/updates the profile; `useAuthInit` syncs it.
- ⚠️ The migration must be applied in Supabase or profiles won't load — #15.
- Phases 2 (Claude-API edge function) and 3 (skill ramp in gameplay) pending.

### 2026-05-17 — Vite 8 upgrade
- Build toolchain bumped together: `vite` 5.4 → 8, `vitest` 3 → 4,
  `@vitest/ui` → 4, `vite-plugin-pwa` → 1.3.
- Swapped `@vitejs/plugin-react-swc` → `@vitejs/plugin-react` (Vite 8's
  Oxc-based recommended plugin) and updated `vite.config.ts`.
- `npm audit` now reports 0 vulnerabilities (was 2 moderate).
- Resolves ISSUES.md #13; #14 cleared as a side effect.

### 2026-05-17 — Real auth gating + dependency install
- `useAuthInit` hook loads the Supabase session and subscribes to auth changes;
  `authStore` gains an `initialized` flag.
- `App.tsx` now gates on a real session — shows a loading state until the
  session check resolves, then `AuthPage` or the game.
- `AuthPage` handles sign-up email confirmation (shows a notice instead of
  entering the game when no session is returned).
- `SignOutButton` added (floating, all screens) — signs out + resets progress.
- `supabase.ts` throws a clear, actionable error when env vars are missing.
- Removed unused `@vitejs/plugin-react` (vite 8 peer conflict); aligned
  `@vitest/ui` to v3 to match `vitest`. Dependencies now install cleanly.
- Fixed pre-existing unused-variable build errors in `QuizRound`/`gameStore`.

### 2026-05-16 — Initial scaffold
- Vite + React + TS + Tailwind project structure.
- Five screens: Auth, Topic Select, Quiz Round, Avatar Select, World Map,
  Battle Arena, wired via `gameStore.phase`.
- Supabase email/password auth on the Auth screen.
- Quiz: 5 questions/round, 4 topics, pass at `PASS_THRESHOLD`, confetti on pass.
- Battle: 3-question attack/defend rounds, HP bars, damage from `calcAttackDamage`.
- Project docs created: `CLAUDE.md`, `docs/ISSUES.md`, `docs/TEST-CASES.md`.
