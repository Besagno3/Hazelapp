# Issues Log

Running log of bugs, shortcuts, and things to revisit. **Update before every
commit** — if you added a workaround or noticed something off, log it here.

Status: 🔴 open · 🟡 in progress · 🟢 resolved

| ID  | Status | Severity | Summary |
|-----|--------|----------|---------|
| #1  | 🟢 | High   | Auth is cosmetic — game state not gated on a real session |
| #2  | 🟢 | High   | `PASS_THRESHOLD` (0.82) vs 5 questions requires a perfect score |
| #3  | 🟢 | High   | App crashes on boot if Supabase env vars are missing |
| #4  | 🟢 | Med    | Test infrastructure (Vitest) installed but not wired |
| #5  | 🔴 | Med    | `vite-plugin-pwa` installed but not configured |
| #6  | 🟢 | Med    | Sign-up proceeds even when email confirmation is pending |
| #7  | 🟢 | Med    | Quiz/battle questions are hardcoded — replaced by AI generation |
| #8  | 🟢 | Low    | Battle damage and avatar HP do not persist between battles |
| #9  | 🟢 | Low    | Dead code: `NPC.questions` field unused |
| #10 | 🟢 | Low    | Two React Vite plugins installed (`-react` and `-react-swc`) |
| #11 | 🔴 | Med    | Migrate game flow to xstate once guarded transitions multiply |
| #12 | 🔴 | Med    | Game progress in localStorage is not tied to user identity |
| #13 | 🟢 | Med    | Consider upgrading the build toolchain Vite 5 → 8 |
| #14 | 🟢 | Low    | 2 moderate npm audit vulnerabilities (dev-only) |
| #15 | 🟢 | High   | `profiles` migration must be applied in Supabase or profiles fail to load |
| #16 | 🟢 | High   | `generate-questions` edge function must be deployed before it can be called |
| #17 | 🔴 | High   | Migration `0002_add_xp.sql` must be applied or profile load fails |
| #18 | 🔴 | Med    | Generic error messages hide the real cause (esp. edge-function errors) |

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

### #4 — Tests not wired 🟢 Med — RESOLVED (2026-05-17)
Vitest is wired: `test` block in `vite.config.ts` (jsdom), setup file
`src/test/setup.ts` (jest-dom matchers + RTL cleanup), and `test` /
`test:watch` / `test:ui` scripts. 21 cases automated across `utils`, `age`,
`gameStore`, and `StatusScreens` — `npm test` is green.

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

### #8 — Battle state not persisted 🟢 Low — RESOLVED (2026-05-17)
**Resolved by decision:** battles are independent — the player starts at full
HP every battle. Carrying damage across battles would need a healing mechanic
to avoid a death spiral, which is unfriendly for a kids' game. `WorldMap` now
calls `startBattle(npc, avatar.maxHp)` explicitly, and the redundant `hp`
fields (always equal to `maxHp`) were removed from the `Avatar` and `NPC`
types — `maxHp` is the single source of truth.

### #9 — Dead code 🟢 Low — RESOLVED (2026-05-17)
- ~~`gameStore.reset()` defined but no UI calls it~~ — called by `SignOutButton`.
- ~~`type Phase` in `BattleArena` includes `'result'`~~ — removed in Phase 3.
- ~~`NPC.questions` field unused~~ — removed; battle questions come from
  `fetchQuestions(npc.topic, …)`.

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

### #15 — profiles migration must be applied 🟢 High — RESOLVED (2026-05-17)
`0001_create_profiles.sql` applied to the Supabase project (`profiles` table +
`handle_new_user` trigger). Note: any users created before the trigger existed
have no profile row and would need one backfilled.

### #16 — generate-questions edge function must be deployed 🟢 High — RESOLVED (2026-05-17)
The `generate-questions` edge function is deployed; the `ANTHROPIC_API_KEY`
secret is set. JWT verification is on by default, so only signed-in players
can call it. (Runtime errors from the function are now surfaced in full — see #18.)

### #17 — Migration 0002 must be applied 🔴 High
`0002_add_xp.sql` adds the `profiles.xp` column. Until applied,
`profileStore.loadProfile` (which now selects `xp`) errors and no profile
loads. **Action:** run `0002_add_xp.sql` in the Supabase SQL Editor (or
`supabase db push`).

### #18 — Generic errors hide the real cause 🔴 Med
`supabase.functions.invoke` returns a generic `FunctionsHttpError` ("Edge
Function returned a non-2xx status code") — the edge function's actual
`{error, detail}` response body is dropped, so the user sees a useless message
and the real failure (Anthropic API error, bad JSON, etc.) is hidden.
**Fix:** an app-wide error utility that extracts the real message — including
reading the `FunctionsHttpError` response body — used wherever errors surface.
