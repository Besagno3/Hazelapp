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
| #17 | 🟢 | High   | Migration `0002_add_xp.sql` must be applied or profile load fails |
| #18 | 🟢 | Med    | Generic error messages hide the real cause (esp. edge-function errors) |
| #19 | 🟢 | High   | Apply migration 0003 + redeploy the edge function (cache + error detail) |
| #20 | 🟢 | Low    | No visual feedback (pop / celebration) when the player levels up |
| #21 | 🟢 | High   | Migration `0004_power_ups.sql` must be applied or profile load fails |
| #22 | 🟢 | Low    | Quiz auto-advances on a fixed timer — a Next button would suit all readers |
| #23 | 🟢 | High   | Question cache inserts fail — `service_role` lacks INSERT on `questions` |
| #24 | 🟢 | Med    | Cache has no per-player dedupe — the same kid can see the same question twice |
| #25 | 🟢 | Low    | No end-of-round "missed questions" recap — explanations flash once and are lost |
| #26 | 🟢 | Med    | No way to flag a wrong/awkward question — LLM errors have no feedback loop |
| #27 | 🟢 | Low    | Power-ups stack uncapped + all four bias offense — high-level battles trivialise |
| #28 | 🟢 | Low    | No daily-streak / return-tomorrow hook — the canonical kids-game retention loop |
| #29 | 🔴 | Med    | No parent dashboard — buyers see nothing of their kid's progress |
| #30 | 🟢 | Low    | Cache-vs-AI split is uniformly random — no reuse bias, no per-session cost cap |
| #31 | 🟢 | Low    | "Loading…" dead air while Claude generates — needs a fun fact / mascot animation |
| #32 | 🟢 | Low    | Battles never nudge `skill_levels` — fighting NPCs teaches the difficulty model nothing |
| #33 | 🔴 | Low    | Topic set is hardcoded to four — no easy path to add history, language, etc. |
| #34 | 🟢 | High   | Apply migration 0006 + redeploy the edge function (per-player dedupe + flags) |
| #35 | 🟢 | High   | Apply migration 0007 (streak columns on profiles) |

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

### #17 — Migration 0002 must be applied 🟢 High — RESOLVED (2026-05-17)
`0002_add_xp.sql` applied to the live Supabase project. `profiles.xp`
exists; profile load + XP/level systems are working end-to-end.

### #20 — No level-up feedback 🟢 Low — RESOLVED (2026-05-17)
`LevelUpModal` celebrates each level-up with confetti and a power-up choice.
"Owed" celebrations are derived from `playerLevel − 1 − powerUpsChosen`, so a
level-up can't be missed (survives reloads, handles multi-level jumps).

### #22 — Quiz advances on a fixed timer 🟢 Low — RESOLVED (2026-05-17)
The timer is gone. After answering, `QuizRound` shows the result + explanation
and a "Next Question" / "See Results" button; the player advances when ready.

### #34 — Apply migration 0006 + redeploy the edge function 🟢 High — RESOLVED (2026-05-17)
`0006_question_views_and_flags.sql` applied and `generate-questions`
redeployed. Per-player dedupe (#24) and flag quarantine (#26) are live.

### #35 — Apply migration 0007 (streak columns) 🟢 High — RESOLVED (2026-05-17)
`0007_add_streak.sql` applied and `generate-questions` redeployed
(also picks up #30's smarter cache mix). The daily-streak hook (#28)
is live end-to-end.

### #33 — Topic set is hardcoded 🔴 Low
The four topics (math, science, engineering, creativity) are baked into the
`Topic` union, the edge function's `TOPICS` list, and the `TopicSelect` UI.
Adding history, language, geography, etc. is a low-risk change but requires
edits in 3-4 places + system-prompt tuning per topic. Worth a tiny abstraction
(`TOPIC_REGISTRY` with `id`, `label`, `icon`, `claude_persona_hint`) so future
topics are a one-file add.

### #32 — Battles don't move the skill ramp 🟢 Low — RESOLVED (2026-05-17)
`lib/age.ts` ships `nextSkillLevelFromBattle(current, answers)` — same
shape as `nextSkillLevel` but clamped to never lower the current skill
(NPCs scale to age, not skill, so a tough loss shouldn't make the next
quiz easier and punish the kid twice). `BattleArena.finishBattle` reads
the player's current topic skill (`skillLevelFor` falls back to age start
for never-played topics) and writes the new value via `setSkillLevel`
only when it changed. Regression tests: TC-108..TC-110. No deploy needed.

### #31 — Loading screen dead air 🟢 Low — RESOLVED (2026-05-17)
`lib/funFacts.ts` ships a per-topic pool (5 facts each for math, science,
engineering, creativity) plus generic fallbacks. `LoadingScreen` now takes
an optional `topic` prop, starts on a random index, and rotates a fact
every 4 seconds with a fade transition (Framer Motion `AnimatePresence`).
`QuizRound` and `BattleArena` both pass their topic. Regression test:
TC-89..91 (automated).

### #30 — Random cache-vs-AI mix 🟢 Low — RESOLVED (2026-05-17)
Edge function now uses `chooseFreshCount(count, cacheSize)`: empty cache
→ all fresh; rich cache (≥3× count rows available) → ~20% fresh for
novelty, rest reused; thin cache → use what's there, generate the rest.
Cuts ~30-40% of Claude calls on a well-populated cache while keeping
enough novelty that the cache keeps growing. Per-session cost cap not
implemented (would need session tracking) — explicitly deferred until
cost data shows it matters. Awaits `supabase functions deploy
generate-questions` to ship.

### #29 — No parent dashboard 🔴 Med
Parents are the buyers; right now they can see literally nothing of their
kid's progress, missed questions, or topic strengths. A single read-only
`/parent` page (XP timeline, per-topic skill levels, recent missed questions,
last-7-days streak) converts the product from "kids' game" to "kids' game
parents will pay for". Data is already in Supabase — mostly UI work. Auth
question to resolve: separate parent account vs. same account with a
passcode-gated view.

### #28 — No daily-streak hook 🟢 Low — RESOLVED (2026-05-17)
Migration `0007_add_streak.sql` adds `current_streak`, `longest_streak`,
`last_played_on` (date) to `profiles`. `lib/streak.ts` ships pure date
math (`todayIso`, `isoOffset`, `nextStreak`) — same-day → unchanged,
yesterday → +1, older → 1. `profileStore.recordActivity()` runs from both
`QuizRound.finishRound` and `BattleArena.finishBattle`. `StreakBadge`
shows 🔥 + day count below the level medallion, with a "Best streak!"
callout when current ties longest. No streak-freeze yet — explicitly
deferred to keep the first ship simple. Regression tests: TC-92..TC-100.
Awaits deployment of migration 0007 (#35).

### #27 — Power-up stacking goes infinite 🟢 Low — RESOLVED (2026-05-17)
Both fixes shipped: `effectiveStacks` in `lib/powerups.ts` gives full
credit through stack 5, half through 10, quarter past 10 — bonuses
asymptote instead of growing linearly. `choicesForLevel(level, 2)`
deterministically offers 2 of 4 power-ups per level (seeded by level so
refresh can't reroll), and `LevelUpModal` uses it. Combat-bias is now
the player's deliberate choice within the available pair rather than an
auto-stack. Regression tests: TC-101..TC-107. Pure code change; no
migration or redeploy needed.

### #26 — No flag-a-question feedback loop 🟢 Med — RESOLVED (2026-05-17)
Migration `0006_question_views_and_flags.sql` adds `question_flags`
(`question_id`, `profile_id`, optional `reason`, `created_at`); RLS limits
`INSERT` to `auth.uid() = profile_id`. `lib/questions.ts` `flagQuestion(id,
reason?)` does the direct RLS-protected insert — no edge function needed.
`components/FlagButton.tsx` is a 3-reason picker (wrong / confusing /
difficulty) inline with the post-answer explanation in `QuizRound`. The
edge function reads `question_flags` and excludes flagged rows from the
cache pool (single-strike quarantine — easy to relax later). Regression
test: TC-R7. Awaits deployment of migration 0006 (#34).

### #25 — No "missed questions" recap 🟢 Low — RESOLVED (2026-05-17)
`QuizRound`'s round-result screen now shows a "What you missed" section:
each wrong question with the player's pick (now tracked in a new `picks`
state), the correct answer, and the explanation. Section is omitted when
the round was perfect. Regression test: TC-88 (manual). No backend
dependency — ships with the next build.

### #24 — Question cache has no per-player dedupe 🟢 Med — RESOLVED (2026-05-17)
Migration `0006_question_views_and_flags.sql` adds `question_views`
(`profile_id`, `question_id`, `seen_at`) with a `(profile_id, seen_at desc)`
index. The edge function now extracts `auth.uid()` from the caller's JWT,
reads the most recent 100 view rows for that profile (`SEEN_HISTORY_LIMIT`),
excludes those IDs from the cache pool, and writes a view row per question
returned. Synthetic `fresh-…` IDs are skipped on the view insert so a
failed cache insert doesn't FK-violate the view insert. Soft cap chosen
over hard-never-repeat to keep the cache pool viable. Regression test:
TC-R6. Awaits deployment of migration 0006 (#34).

### #23 — Question cache insert denied 🟢 High — RESOLVED (2026-05-17)
`0005_questions_grants.sql` applied. `service_role` now has explicit
`SELECT/INSERT/UPDATE` on `questions` and `EXECUTE` on
`increment_question_usage`. Cache writes succeed; `questions` row count
climbs after each new-question round.

### #21 — Migration 0004 must be applied 🟢 High — RESOLVED (2026-05-17)
`0004_power_ups.sql` applied. `profiles.power_ups` column exists; profile
load + power-up stack tracking work end-to-end.

### #19 — Apply migration 0003 + redeploy the edge function 🟢 High — RESOLVED (2026-05-17)
`0003_questions_cache.sql` applied and `generate-questions` redeployed.
The `questions` cache table + `increment_question_usage` RPC are live;
the rewritten edge function (cache + always-include-detail errors) is
serving traffic.

### #18 — Generic errors hide the real cause 🟢 Med — RESOLVED (2026-05-17)
`lib/errors.ts` added: `errorMessage` (sync — any error value → its real
message, including a Supabase error's `code`/`details`/`hint`) and
`resolveErrorMessage` (async — unwraps a `FunctionsHttpError` by reading the
edge function's response body, so the function's real `{error, detail}` is
shown instead of "non-2xx status code"). Wired into `fetchQuestions`,
`useGeneratedQuestions`, `profileStore`, and `AuthPage`. An `ErrorBoundary`
wraps the app — uncaught render errors show the real message (+ stack in dev)
instead of a blank screen. The edge function's catch-all always returns a
`detail` now.
