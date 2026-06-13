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
| #11 | 🟢 | Med    | Migrate game flow to xstate once guarded transitions multiply |
| #12 | 🟢 | Med    | Game progress in localStorage is not tied to user identity |
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
| #33 | 🟢 | Low    | Topic set is hardcoded to four — no easy path to add history, language, etc. |
| #34 | 🟢 | High   | Apply migration 0006 + redeploy the edge function (per-player dedupe + flags) |
| #35 | 🟢 | High   | Apply migration 0007 (streak columns on profiles) |
| #36 | 🟢 | Med    | "Open World" is just a 4-card NPC picker — superseded by the #37 build |
| #37 | 🟡 | Epic   | Evolve into an educational JRPG — phases 0–3 SHIPPED; phase 4 open |
| #38 | 🟢 | High   | Apply migration 0008 (saves) + redeploy the edge function (context flavor) |
| #39 | 🔴 | Med    | Replace placeholder programmer art with CC0 tilesets/sprite sheets |
| #40 | 🔴 | Low    | Boss question difficulty doesn't ramp per enrage phase (damage does) |
| #41 | 🔴 | Low    | No audio — howler installed, needs CC0 chiptune/SFX packs (phase 4) |
| #42 | 🟢 | Low    | All four mini-quests share the riddle-chest pattern — add variety later |
| #43 | 🟢 | Med    | Review-pass fixes: double-tap turn resolve, legacy-key leak, sage/step lock, hub chest |
| #44 | 🔴 | Low    | Battle turn flow + world cutscenes live in component state, not machine substates |
| #45 | 🟢 | High   | World canvas: black lines on screen change, keys need a click, canvas too small |
| #46 | 🔴 | Med    | Pixel-art assets still to be produced — heroes, Ember, Verdara first; hub NPCs + Numbria/Gearfall/Chromaria zones after (depends on Task 8 asset production; see `docs/ASSET-SOURCING.md`) |

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

### #11 — Migrate game flow to xstate 🟢 Med — RESOLVED (2026-06-12)
`src/machines/gameFlow.ts` (xstate v5 `setup()`): `boot → topicSelect ⇄ quiz
→ avatarSelect → world ⇄ battle` with world overlay substates. Guards
(`worldUnlocked`, `hasAvatar`) read the save store at transition time —
the guarded transitions that used to leak into `App.tsx` render logic live
in the machine now. Zustand keeps data only. Covered by `gameFlow.test.ts`.

### #12 — Progress not tied to user identity 🟢 Med — RESOLVED (2026-06-12)
Progress lives in the per-player save file: Supabase `saves` row (migration
0008, #38) + localStorage write-through keyed `hazel-save-<userId>`. The old
fixed-key `hazel-game` payload is migrated once (world unlock, passed rounds,
avatar) and ignored thereafter. Shared-tablet players no longer inherit each
other's progress; saves follow the player across devices once 0008 is live.

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

### #36 — "Open World" is a card picker, not a world 🟢 Med — SUPERSEDED by #37 (2026-06-12)
The #37 JRPG build replaced the single-screen MVP with a 5-zone tile world:
multi-screen exits ✅, static obstacles ✅, on-screen d-pad ✅, position
persistence across battles ✅, beaten-enemy tracking ✅, per-topic biomes ✅.
The one surviving follow-up — real sprite sheets/tilesets — moved to #39.
Original MVP notes kept below for the KaPlay integration lessons.

#### Original entry (historical)
**MVP done:** KaPlay 3001 added (lazy-loaded). `WorldMap.tsx` is now a
single 640×480 canvas screen — player avatar walks with arrow keys /
WASD, bumping into an NPC triggers the existing `startBattle()` flow.
Manual position update + clamp + overlap detection (no physics body).
Placeholder graphics (colored rounded rects with emoji labels). Bundle
impact: +70 KB gzip, isolated to the world chunk via `React.lazy`.

**2026-05-26 follow-up fixes:** Removed React `<StrictMode>` (KaPlay's
internal singleton survives `quit()`, so the double-effect-run corrupted
the WebGL context). Switched WorldMap from a `canvas` ref to a `<div>`
ref + KaPlay's `root` option so a fresh canvas is created each mount.
Added `loadingScreen: false, debug: false, focus: false` to suppress
the built-in mascot splash (broken-image artifact under lazy chunks).

**Follow-ups (kept in this issue, status stays 🟡 until they land):**
- Real sprite sheets — Kenney / OpenGameArt CC0 tilesets and a 4-dir
  walk animation for the player.
- Tilemap background — author with the Tiled editor, load via KaPlay
  `loadSprite`/`addLevel`. Today's background is a solid green fill.
- On-screen d-pad for mobile / tablet (keyboard-only right now).
- Multiple screens — walk to the edge → next "room". Zelda-1 mechanic.
- Static obstacles — trees, rocks, water — once the tilemap exists.
- Persist player position across battle round-trips (the kid currently
  respawns at center after each battle).
- Beaten-NPC tracking — defeated NPCs should disappear from the map
  until the next session.
- Optional: distinct biomes per topic (library / lab / studio / workshop).

### #37 — Educational JRPG epic 🟡 Epic — PHASES 0–3 SHIPPED (2026-06-12)
The product vision is a classic NES/SNES-style JRPG (FF1/2/4/6, Dragon
Warrior) where the 2D open world and side-profile battles are powered by the
existing AI question pipeline. Full design, architecture, 5-phase roadmap, and
build-scope live in **`docs/DESIGN-JRPG.md`**.

**Shipped 2026-06-12 (phases 0–3):** xstate game-flow machine (#11), per-user
Supabase save files (#12), topic registry (#33), 5-zone tile overworld with
dialogue/gates/chests/save-crystals/mobile d-pad (supersedes #36), FF-style
command battles with Sages/Specials/charge gauge/boss phases, shop + inn +
library services, coins/badges economy, crystal-restoration arc + ending.
Deploy steps tracked as #38; placeholder-art swap as #39.

**Story pass shipped 2026-06-12:** `docs/STORY.md` bible, opening/hatch/
ending cutscenes, Ember the dragon companion (hatches on first victory,
grows with crystals), Fiend battle dialogue, one mini-quest per zone (#42
tracks quest variety).

**Remaining (phase 4):** audio (#41), PWA (#5), parent dashboard (#29),
friends leaderboard, companions (incl. Ember battle actions), New Game+.

### #38 — Apply migration 0008 + redeploy the edge function 🔴 High
The JRPG build needs `0008_saves.sql` applied (the `saves` table — without it
cloud saves degrade to local-only and the menu shows a warning) and
`supabase functions deploy generate-questions` re-run (optional `context`
flavor hint). Same runbook as #34/#35.

### #39 — Placeholder art → CC0 asset packs 🔴 Med
Everything renders as colored tiles + emoji ("programmer art", decided
2026-06-12). Swap in CC0 packs: Kenney "Tiny Town"/"Pixel Platformer" or
OpenGameArt Zelda-like tilesets for `WorldCanvas` tiles, 4-dir character
sheets for the player, side-profile poses for battle actors, painted
backdrops per topic for `BattleArena`. Wire via KaPlay `loadSprite` +
`<img>` in battle; add a `docs/CREDITS.md` with licenses. Human asset
review/picks needed — see DESIGN-JRPG.md §5.

### #40 — Boss questions don't ramp per phase 🔴 Low
Design says Fiend question difficulty rises each enrage phase; shipped build
ramps damage + dialogue only (questions stay at the boss's level, +1 over
zone mobs). Ramping would need per-phase question pools — an extra fetch per
phase. Revisit after observing real boss-fight pacing with kids.

### #41 — No audio 🔴 Low
howler is installed and unused. Needs CC0 packs (zone themes, battle theme,
victory fanfare, SFX for hits/heals/saves) and a small `lib/audio.ts` with a
mute toggle in the menu. Asset sourcing is the blocker, not code.

### #43 — Review-pass fixes 🟢 Med — RESOLVED (2026-06-12)
A 7-angle bug hunt over the whole JRPG build. Fixed: QuestionCard double-tap
double-resolving battle turns (+ biased hint shuffle, + `correct` passed via
`onContinue` replacing the BattleArena ref channel); legacy `hazel-game` key
consumed after migration so the next account on a shared browser can't
inherit it; quest-step conversations no longer hide a sage's service button
(and the service path applies the step finish); machine RESET clears context;
explicit save flushes after battle end / avatar choice; new content
invariant (no gates/chests in no-topic zones) which caught and removed a
mis-placed hub chest; dead code removed (`calcAttackDamage`, legacy types);
shared helpers `playerAge` / `heroMaxHp` / `emberStatus` / `setFlag` /
`spendHint` replace 12+ duplicated derivations.

Reviewed and explicitly NOT changed (with reasons): per-frame gate/chest
sprite sync in WorldCanvas (required — gates open while the canvas stays
mounted under overlays); Special-tier question prefetch per battle (prefetch
is the point; server cache absorbs cost); path-question refetch on retry
(fresh question per attempt is a design feature); hand-rolled normalizeSave
vs zod (tested, working; revisit if schema churn grows).

### #44 — Battle turns + cutscenes as machine substates 🔴 Low
The design doc sketches battle substates inside the flow machine; the build
keeps turn flow in BattleArena component state and cutscenes as WorldScreen
local overlays (pausedRef union). Fine at current scale, but each new
cutscene/turn-phase adds boilerplate. When phase 4 lands (companions, more
story moments), promote both into the gameFlow machine.

### #45 — World canvas: black lines, click-to-focus, too small 🟢 High — RESOLVED (2026-06-13)
Three problems with the KaPlay overworld surfaced in live play:
- **Black lines through everything on a screen change.** Root cause is
  KaPlay's app state (`a`) being a *module-global singleton* whose `quit()`
  is deferred to frame-end and never clears `a.k`. `WorldCanvas` was keyed
  `${zoneId}|${ember}` (remount per zone) and re-`kaplay()`-ed on every world
  mount, so a previous instance's pending `quit()` tore down the *new* canvas.
  This is the same singleton trap as the 2026-05-26 StrictMode fix (#36),
  re-triggered first by zone changes and then by `world → battle → world`
  re-entry. **Fix:** call `kaplay()` exactly ONCE per session
  (module-level `sharedKaplay`), drop the remount `key`, rebuild the scene
  per zone with `destroyAll('*')`, and re-parent the cached canvas on every
  later mount. No code path calls `kaplay()` twice anymore.
- **Had to click the canvas before the keys moved the hero.** KaPlay binds
  keys to its canvas (run with `focus:false`), so they only fired once the
  canvas had focus. **Fix:** window-level `keydown`/`keyup` listeners drive
  movement (works whenever the window is focused), `preventDefault` on the
  arrows (no page scroll), clear-on-blur (no stuck keys after alt-tab).
- **Canvas felt small.** It rendered at a fixed 704×448. **Fix:** the stage is
  now responsive — `min(96vw, (100dvh − 220px) × 11/7)`, aspect-locked to the
  zone's 11:7, the canvas upscaled crisply (`image-rendering: pixelated`) from
  the unchanged internal resolution.

Lesson (third time KaPlay's singleton has bitten): **never construct a second
KaPlay instance in the same page — one per session, reuse it.**

### #42 — Mini-quest pattern is uniform 🟢 Low — RESOLVED (2026-06-12)
Quests are now ordered steps with three mechanics: chest steps, **defeat
steps** (lifetime per-enemy kill counts in `save.kills`, written on battle
victory), and **talk steps** (a step-target NPC speaks its own lines and
advances the quest — used for deliveries via the new `save.questItems`
carried-item slot). The five quests use every mechanic: chest fetch
(Numbria), 3-critter defeat with a remaining-targets hint (Verdara),
chest→polish→report multi-step (Gearfall), seed delivery (Chromaria), and
a cross-zone hub defeat quest from Pip. The menu gained a quest log +
carried-items row. See STORY.md §6.

### #33 — Topic set is hardcoded 🟢 Low — RESOLVED (2026-06-12)
`src/content/topics.ts` ships `TOPIC_REGISTRY` (id, label, emoji, colors,
crystal/fiend fiction, zone id) — UI and world content derive from it.
Adding a topic = one registry entry + a zone in `zones.ts` + a persona line
in the edge function's system prompt (the `Topic` union and the function's
`TOPICS` list still need their one-line additions; acceptable).

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
