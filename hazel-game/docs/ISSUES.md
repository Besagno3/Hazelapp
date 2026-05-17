# Issues Log

Running log of bugs, shortcuts, and things to revisit. **Update before every
commit** — if you added a workaround or noticed something off, log it here.

Status: 🔴 open · 🟡 in progress · 🟢 resolved

| ID  | Status | Severity | Summary |
|-----|--------|----------|---------|
| #1  | 🟢 | High   | Auth is cosmetic — game state not gated on a real session |
| #2  | 🟢 | High   | `PASS_THRESHOLD` (0.82) vs 5 questions requires a perfect score |
| #3  | 🟢 | High   | App crashes on boot if Supabase env vars are missing |
| #4  | 🔴 | Med    | Test infrastructure (Vitest) installed but not wired |
| #5  | 🔴 | Med    | `vite-plugin-pwa` installed but not configured |
| #6  | 🟢 | Med    | Sign-up proceeds even when email confirmation is pending |
| #7  | 🟢 | Med    | Quiz/battle questions are hardcoded — replaced by AI generation |
| #8  | 🔴 | Low    | Battle damage and avatar HP do not persist between battles |
| #9  | 🟡 | Low    | Dead code: `NPC.questions` field unused |
| #10 | 🟢 | Low    | Two React Vite plugins installed (`-react` and `-react-swc`) |
| #11 | 🔴 | Med    | Migrate game flow to xstate once guarded transitions multiply |
| #12 | 🔴 | Med    | Game progress in localStorage is not tied to user identity |
| #13 | 🟢 | Med    | Consider upgrading the build toolchain Vite 5 → 8 |
| #14 | 🟢 | Low    | 2 moderate npm audit vulnerabilities (dev-only) |
| #15 | 🔴 | High   | `profiles` migration must be applied in Supabase or profiles fail to load |
| #16 | 🔴 | High   | `generate-questions` edge function must be deployed before it can be called |

---

## Details

### #1 — Auth is cosmetic 🟢 High — RESOLVED (2026-05-17)
`authStore` was never populated; nothing checked a real session. **Fixed:**
`useAuthInit` calls `getSession()` + subscribes to `onAuthStateChange`; `App.tsx`
gates on `authStore.session` — no session means only `AuthPage` renders,
regardless of the persisted game phase. Regression test: TC-R1.

### #2 — Pass threshold math 🟢 High — RESOLVED (2026-05-17)
`PASS_THRESHOLD` was `0.82`, so 4/5 (0.80) failed — a perfect 5/5 was required
despite the UI saying "82%+". **Fixed:** threshold lowered to `0.8` (4 of 5),
and `TopicSelect` copy now derives its numbers from `PASS_THRESHOLD` /
`ROUNDS_TO_UNLOCK` instead of hardcoding "3" and "82%", so it can't drift again.
Regression test: TC-R2.

### #3 — Boots crash without env 🟢 High — RESOLVED (2026-05-17)
`src/lib/supabase.ts` now checks for `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` and throws a clear, actionable error pointing to
`.env.example` when they are missing — instead of a cryptic `createClient`
crash. A real `hazel-game/.env` (gitignored) holds the project credentials.
Regression test: TC-R3.

### #4 — Tests not wired 🔴 Med
Vitest, Testing Library, jsdom are in `devDependencies`, but: no `test` script
in `package.json`, no `test` block in `vite.config.ts`, no jest-dom setup file.
**Fix:** add config + setup file + `npm test` script.

### #5 — PWA not configured 🔴 Med
`vite-plugin-pwa` is installed but `vite.config.ts` only registers the React
plugin. No manifest, no service worker. **Fix:** wire the plugin or drop the dep.

### #6 — Sign-up confirmation 🟢 Med — RESOLVED (2026-05-17)
`AuthPage` now inspects `data.session` after `signUp`. A null session (email
confirmation required) shows a "check your email" notice and switches to the
sign-in view instead of entering the game. Regression test: TC-R4.

**Note:** whether confirmation is required depends on the Supabase project's
Auth settings (Authentication → Providers → Email → "Confirm email").

### #7 — Hardcoded questions 🟢 Med — RESOLVED (2026-05-17)
The `SAMPLE_QUESTIONS` / `BATTLE_QUESTIONS` literals are gone. `QuizRound` and
`BattleArena` load AI-generated questions via `useGeneratedQuestions` →
`fetchQuestions` → the `generate-questions` edge function, with loading and
error/retry states. Requires the function to be deployed (#16).

### #8 — Battle state not persisted 🔴 Low
`WorldMap` passes `avatar.hp` (always full) into each battle; damage taken is
never written back to the avatar. Every battle starts fresh. Confirm whether
this is intended.

### #9 — Dead code 🟡 Low — PARTIALLY RESOLVED
- ~~`gameStore.reset()` defined but no UI calls it~~ — now called by
  `SignOutButton` (2026-05-17).
- ~~`type Phase` in `BattleArena` includes `'result'`~~ — removed in Phase 3.
- Still open: `NPC.questions` field unused — battle questions come from
  `fetchQuestions(npc.topic, …)`, not the NPC object. Either populate it or
  drop the field from the `NPC` type.

### #10 — Duplicate React plugin 🟢 Low — RESOLVED (2026-05-17)
Both `@vitejs/plugin-react` and `@vitejs/plugin-react-swc` were dependencies.
`@vitejs/plugin-react@6` also peer-required `vite@^8`, which broke `npm install`
against the pinned `vite@5.4`. **Fixed:** removed the unused `@vitejs/plugin-react`
(`vite.config.ts` uses `-swc`). Also aligned `@vitest/ui` from `^4` to `^3` to
match `vitest@3`. Dependencies now install cleanly.

### #11 — Migrate game flow to xstate 🔴 Med
**Decision:** routing stays phase-based now; react-router is rejected for the
game flow (URLs / browser-back are a liability for a guided kids' game).
The flow is genuinely a state machine and already strains — e.g. `App.tsx`:
`if (progress.worldUnlocked && !avatar) return <AvatarSelect />` is a guarded
transition leaking into render logic. **Trigger to act:** when the 2nd–3rd
guarded transition appears (lives, level progression, save/resume, battle
result screen). At that point move the flow into an xstate machine (`xstate` +
`@xstate/react` are already installed) and keep Zustand for data only.

### #12 — Progress not tied to user identity 🔴 Med
`gameStore` persists progress to localStorage under a fixed key (`hazel-game`),
not per Supabase user. Sign-out calls `reset()`, but if a player just closes
the tab without signing out, the next player on that browser inherits their
progress. **Fix:** key persistence by user id, or sync progress to a Supabase
table once the data model is set (relates to #7).

### #13 — Upgrade Vite 5 → 8 🟢 Med — RESOLVED (2026-05-17)
Coordinated toolchain bump: `vite` 5.4 → 8.0.13, `vitest` 3 → 4.1.6,
`@vitest/ui` → 4.1.6, `vite-plugin-pwa` → 1.3.0. Also swapped
`@vitejs/plugin-react-swc` → `@vitejs/plugin-react@6` — Vite 8 recommends the
Oxc-based plugin when no SWC plugins are used — and updated `vite.config.ts`.
Lint, build, and dev server all verified green.

### #14 — npm audit vulnerabilities 🟢 Low — RESOLVED (2026-05-17)
The 2 moderate advisories (esbuild dev-server, via Vite 5's toolchain) were
cleared by the Vite 8 upgrade (#13). `npm audit` now reports 0 vulnerabilities.

### #15 — profiles migration must be applied 🔴 High
`supabase/migrations/0001_create_profiles.sql` defines the `profiles` table +
the `handle_new_user` trigger. Until it is applied to the Supabase project,
`profileStore.loadProfile` errors ("relation does not exist") and no profile
loads — the app still runs (gating is on session, not profile), but age-based
features can't work. **Action:** run the migration in the Supabase SQL Editor
(or `supabase db push`). Existing users created before the trigger exists will
have no profile row and need one backfilled.

### #16 — generate-questions edge function must be deployed 🔴 High
`supabase/functions/generate-questions/` calls the Claude API server-side.
Until it is deployed, `fetchQuestions` (`lib/questions.ts`) fails. The
`ANTHROPIC_API_KEY` secret is already set in Supabase. **Action:**
`supabase link --project-ref <ref>` then
`supabase functions deploy generate-questions`. JWT verification is on by
default, so only signed-in players can call it.
