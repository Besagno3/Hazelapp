# Hazel Quest — Project Context

> Educational JRPG (#37, see `docs/DESIGN-JRPG.md`). Players train at quiz
> rounds to unlock the world of Lumina, then explore a tile-based 2D world,
> talk to NPCs, and fight FF-style side-profile command battles — every
> attack, special, and block is powered by answering AI-generated questions.

This file is loaded automatically by Claude Code. Keep it accurate — it is the
shared source of truth for how this project works.

---

## Stack

| Layer       | Choice                                              |
|-------------|-----------------------------------------------------|
| Build       | Vite 8 (`@vitejs/plugin-react`, Oxc)                |
| UI          | React 18.3 + TypeScript 5.8                         |
| Styling     | Tailwind CSS 3.4 (`@tailwind` directives in `src/index.css`) |
| State       | xstate 5 (game flow) + Zustand 5 (`saveStore`, `battleStore`, `authStore`, `profileStore`) |
| Backend     | Supabase (`@supabase/supabase-js`) — auth only so far |
| Animation   | Framer Motion 12, canvas-confetti                   |
| Game canvas | KaPlay 3001 (tile overworld, lazy-loaded with the world screen) |
| Testing     | Vitest 4 + Testing Library + jsdom (`npm test`)     |

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
- **Routing:** the game flow is an **xstate machine** (`src/machines/gameFlow.ts`,
  shipped 2026-06-12, resolved #11). **Do not adopt react-router** for the game
  flow (URLs / browser-back are a liability for a guided kids' game).
  react-router may still be added later *only* for standalone non-game pages
  (parent dashboard, settings, leaderboard).
- **JRPG design (2026-06-12, #37):** hero + story companions; one kid-friendly
  dialogue register; simple coin/shop economy; async-only friends features;
  placeholder programmer art now, CC0 packs later. See `docs/DESIGN-JRPG.md` §6.

## Architecture

- **Auth gates the app.** `App.tsx` calls `useAuthInit()` (loads the Supabase
  session + subscribes to auth changes). No valid session → only `AuthPage` is
  reachable.
- **Routing is the game-flow machine** (`src/machines/gameFlow.ts`, xstate v5):
  `boot → topicSelect ⇄ quiz → avatarSelect → world ⇄ battle`, with world
  substates `exploring / dialogue / service / path / menu` driving DOM
  overlays. App sends `READY` once session + save are loaded; sign-out sends
  `RESET`. Guards (world unlock, avatar chosen) read the save store. The
  machine owns *where the player is*; Zustand stores own *what they have*.
- **Feature folders** under `src/features/`: `auth`, `quiz`, `battle`, `world`.
- **Content layer** (`src/content/`): `topics.ts` (the topic registries —
  `TOPIC_REGISTRY` = the four **crystal** topics with crystal/Fiend/zone;
  `EXTRA_TOPICS` = the expansion themes nature/space/history; `topicInfo`
  resolves all seven, #33/#55), `zones.ts` (10 ASCII tile maps: Lumina Field
  hub + 4 crystal zones + Village (safe) + 3 themed combat zones + the Crystal
  Spire, validated by `zones.test.ts`), `npcs.ts` (dialogue trees),
  `enemies.ts` (archetypes + fiends, age-scaled at spawn), `abilities.ts`
  (Sage personas + charge tuning), `spells.ts` (the Spellbook — castable
  abilities derived from the save), `spire.ts` (the endgame climb floors +
  villain), `items.ts` (shop + economy tuning), `avatars.ts`.
- **`saveStore`** (`src/store/saveStore.ts`, #12): the per-player save file —
  zone, position, HP, coins, items, badges, sages, story flags, opened chests,
  quiz progress, Library queue. Write-through: localStorage immediately
  (keyed `hazel-save-<userId>`), Supabase `saves` table on a 2s debounce;
  `flush()` on save crystals / sign-out. Supabase errors degrade to
  local-only play. Pure logic in `lib/save.ts` (normalize / legacy migration).
- **`battleStore`** holds the ephemeral battle session (enemy, HP, defeated
  instance ids) — deliberately not persisted.
- **`authStore`** holds the Supabase user/session; **`profileStore`** holds the
  `profiles` row (birth date, skill levels, xp, power-ups, streak).
- **World** (`features/world/`): `WorldScreen` (HUD + overlays + cutscenes)
  wraps `WorldCanvas` (KaPlay; tile collision, bump-to-interact, zone exits,
  the Spire icon, remounted per zone, paused under overlays via ref). Overlays:
  dialogue, services (shop/inn/library/sage), path questions (gates/chests),
  menu, and the **Spire climb** (`SpireOverlay`, machine substate `world.spire`,
  opened by bumping the Spire icon — the all-crystals-gated endgame). `TouchPad`
  is the mobile d-pad.
- **Battle** (`features/battle/BattleArena.tsx`): FF-style side-profile command
  battle — Attack / Spells / Guard / Potion / Flee, every command resolved by
  a question; enemy counterattacks are blocked by defend questions. **Spells**
  (the Spellbook, `content/spells.ts`): the hero casts any learned spell
  (Mend / Aegis / Sage strikes / Ember's Breath) by answering one *super-hard*
  question (`SPELL_LEVEL_BONUS` = 3 levels up); each spends charge (◆, the mana
  gauge filled by correct answers, `CHARGE_MAX` = 4) and a miss fizzles +
  refunds the charge. Fiends (bosses) have enrage phases and restore their
  crystal on defeat. Pure math in `lib/battleMath.ts`. No game over — defeat
  returns the player to the hub, healed.
- DB schema lives in `supabase/migrations/` — apply via the Supabase SQL Editor
  or `supabase db push`.
- **Question generation** is a Deno edge function in
  `supabase/functions/generate-questions/` — it calls the Claude API
  server-side (API key never reaches the browser). `lib/questions.ts`
  (`fetchQuestions`) invokes it from the client; the optional `context` arg
  adds adventure flavor to fresh generations (#37).
- Quiz and battle screens load **AI-generated questions** via the
  `useGeneratedQuestions` hook (age + per-topic skill level → `fetchQuestions`),
  with loading and error/retry states.
- Two progression systems: (1) per-topic **skill ramp** — `nextSkillLevel`
  (`lib/age.ts`) tunes quiz difficulty after each quiz round, persisted via
  `profileStore.setSkillLevel`; (2) overall **player level** — derived from XP
  (`lib/level.ts`), earned from correct answers + NPC defeats, in `profiles.xp`.
- **Question cache:** generated questions are stored in a Supabase `questions`
  table (level-tagged, `times_asked` counter). The edge function randomly
  mixes cached questions (reused from a ±2 level band) with fresh ones.
  `prefetchQuestions` (`lib/questions.ts`) warms requests ahead of need.

## Commands

```bash
npm install      # install deps (node_modules is gitignored)
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint
npm test         # Vitest suite (test:watch / test:ui also available)
```

## Error handling

- Use `errorMessage(err)` (`src/lib/errors.ts`) anywhere a caught error is
  shown or logged — never a hardcoded "something went wrong".
- For `supabase.functions.invoke` failures, use `resolveErrorMessage` (async)
  so the edge function's real `{error, detail}` body surfaces.
- `ErrorBoundary` (`src/components/`) catches uncaught render errors.

## Conventions

- TypeScript strict mode; `noUnusedLocals`/`noUnusedParameters` are on.
- Tailwind utility classes inline; use the `cn()` helper (`src/lib/utils.ts`)
  for conditional class merging.
- Game tuning constants: quiz gate in `src/lib/utils.ts` (`PASS_THRESHOLD`,
  `ROUNDS_TO_UNLOCK`); battle math in `src/lib/battleMath.ts`; economy in
  `src/content/items.ts`.
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

### 2026-06-15 — Themed expansion zones + the Spire endgame & villain (#55)
The new zones got question topics, and the game got a real finale.
- **Topic decoupling:** `Topic` now splits into `CrystalTopic` (the core four —
  crystal/Fiend/Sage/ending logic keys off these) and the wider `Topic` (adds
  `nature`, `space`, `history`). `topics.ts` keeps `TOPIC_REGISTRY` = the four
  crystal topics and adds `EXTRA_TOPICS` (styling only); `topicInfo` resolves
  all seven, `crystalInfo` the crystal four. `SAGES`/`BOSS_LINES`/
  `CRYSTAL_PANELS` and `save.sages` are now `CrystalTopic`-typed.
- **Themed combat zones:** Whispering Woods (nature/animals), Starfall Coast
  (space), Clockwork Depths (time/history) each gained a `topic`, three roaming
  critters (`enemies.ts`), a gatekeeper gate and a riddle-chest — full mini
  regions, minus the Fiend/crystal/Sage. Lumina Village stays combat-free.
  Fun-facts + the edge-function persona prompt cover the three new topics.
- **The Crystal Spire endgame:** a `spire` icon (`ZoneDef.spire`, rendered +
  bump-handled in `WorldCanvas` → `onSpire`) stands in the Spire zone, sealed
  until all four crystals are restored. Bumping it opens `SpireOverlay` — a
  multi-floor climb (`content/spire.ts` `SPIRE_FLOORS`): each floor escalates
  in level and rotates topics, wrong answers snuff candle-lights
  (`SPIRE_LIVES`), and the top floor is the final boss, **Umbra, the Forgotten
  One**. Clearing it sets `SPIRE_CLEARED`; losing casts you back to the hub,
  healed. New machine substate `world.spire` (`OPEN_SPIRE`).
- **Villain arc:** each crystal cutscene now ends on a 🌑 omen panel revealing
  Umbra; the four-crystal "ending" became the *call to climb the Spire*
  (`endingPanels`), and `spireVictoryPanels` is the true finale after Umbra
  falls. Flags: `spire-cleared`, `spire-victory-seen`.
- ⚠️ **Deploy required:** redeploy `generate-questions` so nature/space/history
  questions generate (the function whitelists topics). See ISSUES.md #57.
- 172 tests green (was 164); lint + build clean.

### 2026-06-15 — World x2 + story x2 + Spellbook battle magic (#50, #51)
Three-part expansion of the JRPG.
- **More screens (5 → 10 zones, #50):** five new topic-less story/exploration
  zones in `content/zones.ts`, reached through a new **Lumina Village**
  crossroads: Village ↔ Whispering Woods ↔ Clockwork Depths, Village ↔
  Starfall Coast, Village ↔ The Crystal Spire. The hub gains a single new exit
  (top, cols 2-3) to the Village; the rest branch off the new zones, so edits
  to existing maps are minimal. All maps stay 22×14 (the shared KaPlay canvas
  is sized once). 11 new flag-reactive NPCs in `content/npcs.ts`. New tests:
  every zone reachable from the hub (BFS) + no one-way exits.
- **Story doubled (#50):** `content/story.ts` gains `CRYSTAL_PANELS` (a
  victory cutscene per Fiend), `SPIRE_PANELS` (the Spire wakes after the first
  crystal), and longer `INTRO_PANELS` / `endingPanels`. `WorldScreen` now
  selects exactly one due cutscene per render: intro → hatch → crystal → spire
  → ending. New flags: `crystal-<topic>-scene-seen`, `spire-awake-seen`.
- **Spellbook (#51):** the single equipped-Sage Special becomes a cast-any
  system. `content/spells.ts` defines spells (damage / heal / shield) with a
  charge cost; `spellsKnown(save)` derives the list from the save (Mend always;
  each Sage's strike; Aegis at 1 crystal; Ember's Breath at full-grown Ember) —
  no new save field. In battle, **📖 Spells** opens a menu; casting asks one
  super-hard question (`SPELL_LEVEL_BONUS` = 3 up), spends charge, and fizzles
  + refunds on a miss. `CHARGE_MAX` 3 → 4; `lib/battleMath.spellDamage` added.
  `MenuOverlay` shows the Spellbook; Sage service copy updated.
- 164 tests green (was 156); lint + build clean.

### 2026-06-13 — Fix leveling (XP gauge / medallion) + battle HUD tidy
Player progression was invisible: a missing Supabase `profiles` row left
`profileStore.profile` null, so `LevelBadge` rendered nothing and `addXp`
silently dropped all XP (the gauge never moved after battles/quizzes).
- **`profileStore.loadProfile`** now self-heals (mirrors `saveStore`'s
  local-degradation): switched `.single()` → `.maybeSingle()`; when no row
  exists it builds a working `defaultProfile` (birth date pulled from the auth
  user's sign-up metadata so age-based difficulty stays right) and best-effort
  `upsert`s it so progress persists going forward. XP now accrues even if the
  remote write fails (optimistic in-memory update).
- **`LevelBadge`** no longer returns null without a profile — falls back to
  Lv 1 / 0 XP so the medallion is always visible (fixes "no medallion on the
  overworld"). New `placement` prop: top-center on the battle screen, top-left
  elsewhere.
- **`App.tsx`**: sign-out button hidden in battle (it overlapped the hero
  status panel); medallion placement wired by screen.
- Resolves ISSUES #47/#48. 156 tests green; lint + build clean.
- Also logged the sprite-system review backlog (#49, `docs/SPRITE-REVIEW-FINDINGS.md`).

### 2026-06-13 — Pixel-art character sprite system (emoji fallback)
Data-driven pipeline for swapping emoji placeholders with CC0 sprite sheets —
zero visual change until art assets land:
- **`src/content/sprites.ts`**: `SPRITES` manifest (currently empty) + `resolveSprite(spriteId, emoji)` resolver; `SpriteView`/`SpriteDef` types. Idle anim is required; others fall back to idle automatically.
- **`src/lib/spriteAnim.ts`**: pure math (`frameAt`, `bgPosX`, `frameCount`, `cycleMs`, `SpriteAnim`) — no React, fully unit-tested.
- **`src/features/battle/SpriteSheet.tsx`**: React component (rAF frame stepping) that renders a sprite strip or falls back to the emoji when no sprite is registered for the id.
- **`src/features/world/worldSprites.ts`**: KaPlay helpers `loadWorldSprites` + `worldFace` + pure `toKaplayAnims`. World drives walk/idle/flip per direction and adds a single-frame hop for sprites with only one frame.
- Optional `spriteId?: string` on `Avatar`/`NPC`/`EnemyDef`/`WorldNpcDef`; carried through `spawnEnemy`. `EMBER_SPRITE_IDS` stage→id map in `story.ts`.
- **`BattleArena.tsx`**: renders enemy/hero/Ember via `<SpriteSheet>`; attack/hurt driven by transient `enemyActing`/`heroActing` flags (±520ms lunge window).
- **`WorldCanvas.tsx`**: loads sprites once via `loadWorldSprites`, renders NPC/enemy/player/Ember via `worldFace`; player walk/idle/flip + hop for single-frame sprites.
- All characters without a registered spriteId continue to display their emoji — no regression.
- **Art production** (sourcing CC0 packs + generating Verdara-slice mascots) is the remaining step. First slice: heroes, Ember all stages, Verdara boss. Hub NPCs + Numbria/Gearfall/Chromaria zones come after. See `docs/ASSET-SOURCING.md` and the plan/design under `docs/superpowers/`.
155 tests green; lint + build clean.

### 2026-06-13 — World canvas: kill black lines, window-focus keys, bigger stage (#45)
Three live-play fixes to the KaPlay overworld (`WorldCanvas` + `WorldScreen`):
- **Black lines on screen change (and again after battles).** KaPlay's app
  state is a module-global singleton and its `quit()` is deferred + never
  clears the singleton, so a second `kaplay()` call lets the old instance's
  pending quit tear down the new canvas. We now construct **one KaPlay
  instance per session** (`sharedKaplay`), removed the `${zoneId}|${ember}`
  remount key, rebuild the scene per zone with `destroyAll('*')`, and
  **re-parent the cached canvas** on every later world mount. No path calls
  `kaplay()` twice — fixes both zone→zone and `world → battle → world`.
  (Third time the singleton has bitten — see #36's StrictMode fix.)
- **Keys needed a canvas click first.** Replaced KaPlay's canvas-focused
  `isKeyDown` with **window-level `keydown`/`keyup`** listeners, so the hero
  moves whenever the browser window is focused; arrows `preventDefault`
  (no page scroll) and keys clear on blur.
- **Bigger world.** The stage is responsive — `min(96vw, (100dvh−220px)×11/7)`,
  aspect-locked 11:7, canvas upscaled crisply (`image-rendering: pixelated`)
  from the unchanged 704×448 internal resolution.
137 tests green; lint + build clean.

### 2026-06-12 — Bug-hunt review pass: 7-angle audit + fixes (#43)
Full-codebase review (7 finder angles + verification) of the JRPG build.
Correctness fixes:
- `QuestionCard`: a fast double-tap on Continue could resolve a battle turn
  twice (double damage / double enemy hit). Continue now fires once, passes
  `correct` to `onContinue` (the `lastAnswer` ref dual-channel in
  BattleArena is gone), and the hint-feather option hiding uses a fair
  Fisher-Yates instead of biased `.sort(random)`.
- `saveStore.load`: the pre-JRPG `hazel-game` localStorage key is now
  consumed (removed) after the one-time migration — previously the NEXT
  account signing in on the same browser could inherit it via
  `migrateLegacy` (#12 edge case).
- `DialogueOverlay`: service NPCs who are quest STEP targets (Sage Cog,
  Sage Muse) keep their service button during the step conversation, and
  taking the service path also applies the step's finish (previously
  "Learn" was hidden mid-quest, and would have stranded the step).
- `gameFlow`: RESET clears machine context (topic/npcId/service/pathTarget)
  so one player's context can't leak into the next session.
- New zones invariant test: no-topic zones must not contain gates/chests —
  it immediately caught a chest in the hub map (silently falling back to
  math questions); the chest was removed.
- Durability: explicit `flush()` after battle end and avatar choice (boss
  victories / hatches no longer rely on the 2s debounce surviving).
Cleanups: shared `playerAge` (replaces 4 duplicated DEFAULT_AGE fallbacks),
`heroMaxHp`, `emberStatus` (replaces the crystal-count/stage triplication),
`saveStore.setFlag`/`spendHint` helpers; dead `calcAttackDamage` and dead
legacy types (`QuizRound`, etc.) removed. 137 tests green.

### 2026-06-12 — Quest variety: steps, defeats, deliveries (#42)
Quests (`content/quests.ts`) rebuilt as **ordered steps** over the save:
- New save fields: `kills` (lifetime victories per enemy def, written by
  `BattleArena.victory`) and `questItems` (carried delivery items).
- Step builders: `chestStep` (riddle-chest), `defeatStep` (beat each listed
  enemy once, any order — the hint names whoever's left), `talkStep` (a
  step-target NPC speaks its own lines and advances the quest).
- `questConversation(npcId, save)` resolves giver offers/hints/completions
  AND step-target NPC conversations; `DialogueOverlay` consumes it.
- Five quests now span all mechanics: Tally's chest fetch, Fern's 3-critter
  Firefly Defenders, Rivet's chest→Sage-Cog-polish→report multi-step,
  Doodle's Color Seed delivery to Sage Muse, and Pip's cross-zone Lucky
  Marble hunt (hub → Numbria's Count Bat).
- Menu gains a quest log (active quests + live step hint) and a
  carried-items row. Tests: 138 green (full per-mechanic quest flows).

### 2026-06-12 — Story pass + Ember the dragon (#37)
Narrative layer on top of the phases 0–3 build. **`docs/STORY.md`** is the
story bible (tone rules, cast, structure, flag glossary).
- **Ember, the last dragon of Lumina** (`content/story.ts`): the hero finds
  the last dragon egg in the opening; it hatches on the **first battle
  victory** (flag `ember-hatched`, hatch cutscene plays back in the world)
  and grows with restored crystals (hatchling → whelp → dragon). Ember
  trails the hero on the map (lag-follow in `WorldCanvas`), bounces beside
  them in battle, roars in landed Specials, and appears on the HUD + menu.
  Story-only for now — no battle mechanics (companions are phase 4).
- **Cutscenes**: `components/StoryPanels.tsx` (storybook panels, player-
  paced) drives the opening (`INTRO_PANELS`, first world entry), the hatch,
  and a personalized 5-panel ending (`endingPanels(heroName)`) that replaces
  the old single-modal ending. Cutscenes pause the world canvas.
- **Fiend dialogue** (`BOSS_LINES`): 2-box villain monologue before the
  first command of every boss fight + last words on the victory panel.
- **Zone mini-quests** (`content/quests.ts`): one per zone (Tally's
  Counting Stones, Fern's Glow-Moss, Rivet's Golden Gear, Doodle's Color
  Seed) — villager offers → open the zone's riddle-chest → return for
  reward (25 coins + potion/hint). Pure dialogue+flags; `questDialogue` /
  `applyQuestFinish` are pure and unit-tested. `DialogueOverlay` shows a
  quest title chip and grants rewards on the closing line.
- Elder Lumen + Pip dialogue now reacts to the egg/Ember.
- Tests: 134 green (story stage/panels/boss-lines + quest content/flow).

### 2026-06-12 — Educational JRPG end-to-end build (#37, phases 0–3)
The design doc's phases 0–3, shipped as one build. Highlights:
- **Phase 0 foundations:** `machines/gameFlow.ts` (xstate v5) replaces
  `gameStore.phase` (#11 resolved; `gameStore` deleted, battle session moved
  to a non-persisted `battleStore`). Per-user save files: migration
  `0008_saves.sql` + `saveStore` (localStorage write-through keyed by user id,
  debounced Supabase upsert, legacy `hazel-game` key migrated) — #12 resolved.
  `content/topics.ts` TOPIC_REGISTRY — #33 resolved.
- **Phase 1 overworld:** 5-zone tile world (`content/zones.ts`, ASCII maps +
  invariants test), `WorldCanvas` rewrite (grid collision, bump-to-interact,
  zone exits, position persistence, session defeat-tracking), dialogue trees
  (`content/npcs.ts` + `DialogueOverlay`), gates & question-locked chests
  (`PathQuestionOverlay`), save crystals, mobile `TouchPad`. Old random-NPC
  `lib/npc.ts` deleted in favor of authored, age-scaled `content/enemies.ts`.
- **Phase 2 battles:** `BattleArena` rewritten as an FF-style side-profile
  command battle (Attack/Special/Guard/Potion/Flee; defend questions block
  enemy hits; charge gauge; Sage Specials at level+2 for 2.5×, fizzle on
  miss; boss enrage phases; victory/defeat panels; no game over). Pure math
  in `lib/battleMath.ts`. Shared `components/QuestionCard.tsx` (hint-feather
  support).
- **Phase 3 content:** four Sages, four Fiends + crystal-restoration flags,
  shop/inn/library services, coins + badges economy (`content/items.ts`),
  Library re-answer loop fed by quiz + battle misses, ending celebration.
- **Pipeline:** `fetchQuestions`/edge function gain an optional `context`
  flavor hint (fresh generations only; cache semantics unchanged).
- **Testing:** 123 tests green (was 82); vitest env-stubs Supabase config so
  suites run without a local `.env`. New suites: gameFlow machine, save
  normalization/migration, saveStore, battleMath, zone-map invariants.
- ⚠️ Deploy required: apply `0008_saves.sql` AND redeploy
  `generate-questions` — see ISSUES.md #38.

### 2026-06-12 — JRPG design doc (#37)
- `docs/DESIGN-JRPG.md`: full design for evolving the app into a classic
  NES/SNES-style educational JRPG (FF1/2/4/6 + Dragon Warrior references).
  Covers a review of the current app, target architecture (KaPlay tile-based
  overworld + DOM/Framer side-profile 2.5D battles, xstate game-flow machine,
  Supabase save files, data-driven `src/content/` layer), the question-powered
  battle/encounter design, a 5-phase roadmap, and an explicit can/can't-build
  list. Phase 0 of the roadmap subsumes existing issues #11, #12, #33;
  phase 1 subsumes the #36 follow-ups; phase 4 subsumes #5 and #29.

### 2026-05-26 — Open-world MVP fixes + dev shortcut
Three problems surfaced after the initial #36 ship.
- **StrictMode double-init**: KaPlay maintains internal singleton state that
  survives `quit()`, so React StrictMode's double-effect-run logged
  `KAPLAY already initialized, calling kaplay() multiple times` and
  corrupted the WebGL context (blank / broken canvas). Removed `<StrictMode>`
  in `main.tsx` — standard workaround for canvas game libraries.
- **Container-vs-canvas init**: switched `WorldMap` from a `canvas` ref to a
  `<div>` ref passed as KaPlay's `root` option. KaPlay creates its own
  canvas inside the container each mount, instead of trying to reuse a
  React-owned canvas element across cycles.
- **Loading splash artifact**: KaPlay's built-in "Ka" mascot splash can
  render a broken-image placeholder under Vite lazy chunks. Added
  `loadingScreen: false, debug: false, focus: false` to suppress.
- **Dev shortcut**: `gameStore.devUnlockWorld()` + a `🔧 DEV: skip to world`
  button on `TopicSelect`, gated by `import.meta.env.DEV`. Tree-shaken out
  of production builds.

### 2026-05-17 — Open-world MVP: walkable Zelda-style map (#36)
- New dep: **KaPlay 3001** (`kaplay` on npm) — small canvas-based 2D
  arcade lib. ~190 KB raw / 70 KB gzip.
- `features/world/WorldMap.tsx`: rewritten as a single Zelda-1-style
  640×480 screen. Player avatar walks with arrow keys / WASD; bumping
  into an NPC triggers `startBattle()`. Manual position update + clamp
  + overlap check (no physics body). KaPlay context is `quit()`-ed on
  unmount so it doesn't leak between phases.
- Placeholder graphics (colored rounded rects with emoji labels) —
  real sprite sheets + tilemap are deferred follow-ups.
- `App.tsx`: WorldMap is now `React.lazy` + `Suspense` so the KaPlay
  chunk only loads when the kid enters the world. Auth / quiz / battle
  initial bundle is unchanged (150 KB gzip).
- Stack table updated to reflect KaPlay.

### 2026-05-17 — Smarter cache-vs-AI mix (#30)
- Edge function: replaced `randInt(0, min(count, cached))` with a
  `chooseFreshCount(count, cacheSize)` policy. Empty cache → all fresh;
  rich cache (≥3× count rows available) → ~20% fresh for novelty,
  rest reused; thin cache → use what's there, generate the rest. Saves
  ~30-40% Claude calls once the cache is well-populated, while keeping
  enough novelty that the cache keeps growing.
- ⚠️ Deploy required: `supabase functions deploy generate-questions` —
  no migration needed.

### 2026-05-17 — Battles nudge the skill ramp (#32)
- `lib/age.ts` `nextSkillLevelFromBattle(current, answers)`: applies the
  same shape as `nextSkillLevel` but clamped to never *lower* the current
  skill — NPCs scale to age, not skill, so a tough loss shouldn't punish
  the kid twice (lost battle + easier next quiz).
- `BattleArena.finishBattle` calls `setSkillLevel(npc.topic, …)` with
  the new value when it actually moved. First-time topic battles
  establish a skill level (via `skillLevelFor` fallback to age start).

### 2026-05-17 — Power-up scaling: soft cap + 2-of-4 random offer (#27)
- `lib/powerups.ts` `effectiveStacks(n)`: full credit through 5, half
  credit 6-10, quarter credit 11+. All four bonus functions multiply by
  `effectiveStacks` instead of raw `stacks`, then `Math.round` for clean
  integer HP / damage / XP. At 10 stacks you get 75% of linear; at 20,
  50%. Late-game battles stay interesting.
- `lib/powerups.ts` `choicesForLevel(level, count=2)`: deterministic
  Fisher-Yates seeded by `level` returns 2 of 4 power-ups. Same level
  always offers the same choices (refresh-proof). `LevelUpModal` calls
  it instead of mapping all 4 — kids actually have to choose.
- No migration needed (pure code change). Existing power-up stacks
  smoothly reinterpreted under the new formula.

### 2026-05-17 — Daily-streak hook (#28)
- Migration `0007_add_streak.sql`: adds `current_streak`, `longest_streak`,
  `last_played_on` to `profiles`. Defaults to 0 / 0 / null.
- `lib/streak.ts`: pure date math — `todayIso` (local YYYY-MM-DD),
  `isoOffset`, `nextStreak(prev, lastPlayed, today)`. Same-day → unchanged,
  yesterday → +1, older or null → 1. No timezone surprises (uses local
  calendar day, so a kid's day is whatever day it is on their wall clock).
- `profileStore.recordActivity()`: optimistic update + Supabase write.
  Skips the write entirely on same-day replay.
- Wired into `QuizRound.finishRound` and `BattleArena.finishBattle` —
  every round / battle advances the streak.
- `components/StreakBadge.tsx`: 🔥 + day count, fixed top-16 left-3
  (below `LevelBadge`). Calls out a tie with `longestStreak` as "Best
  streak!". Renders nothing on day zero.
- ⚠️ Deploy required: apply `0007_add_streak.sql` — see ISSUES.md #35.

### 2026-05-17 — Topic-aware loading screen with rotating fun facts
- `lib/funFacts.ts`: 4-topic pool (math / science / engineering / creativity)
  with 5 facts each, plus a `GENERIC_FACTS` fallback for context-free loads.
- `LoadingScreen` now accepts an optional `topic` prop, picks a random
  starting index, and rotates a fact every 4s with a fade transition.
  `QuizRound` and `BattleArena` pass their topic. Turns the AI-generation
  wait from dead air into a brand moment. Resolves #31.

### 2026-05-17 — Closed 5 deploy issues
- #17, #19, #21, #23, #34 all marked 🟢 — migrations 0002 through 0006
  applied to the live Supabase project + `generate-questions` redeployed.
  All question-cache and per-player dedupe features are now live.

### 2026-05-17 — Per-player dedupe + flag-a-question + missed-questions recap
- Migration `0006_question_views_and_flags.sql`: `question_views` (per-profile
  history of every question served) and `question_flags` (any single flag
  quarantines a question from the cache pool). RLS on; explicit grants to
  `service_role` (and `INSERT` to `authenticated` on flags so kids can
  report directly via RLS, no edge function needed).
- `generate-questions` edge function: pulls `auth.uid()` from the caller's
  JWT, excludes flagged + most-recent-100-seen rows from the cache pool,
  then writes a `question_views` row per question returned. Synthetic
  `fresh-…` IDs are skipped on the view insert (FK would fail). Resolves #24.
- `lib/questions.ts` `flagQuestion(id, reason?)`: direct RLS-protected
  insert. New `FlagReason` type covers the three reasons offered in the UI.
- `components/FlagButton.tsx`: small 🚩 affordance inline with the
  post-answer explanation in `QuizRound`. Click opens a 3-reason picker
  (wrong answer / confusing / difficulty) + cancel; on submit shows
  "🚩 Reported — thanks!". Resolves #26.
- `QuizRound` round-result screen now shows a "What you missed" recap —
  each wrong question with the player's pick, the correct answer, and the
  explanation. Tracks the picked option per question (new `picks` state).
  Resolves #25.
- ⚠️ Deploy required: apply `0006_question_views_and_flags.sql` AND redeploy
  the edge function — see ISSUES.md #34.

### 2026-05-17 — Logged 10 UX improvement candidates (#24-#33)
- Logged a batch of player-experience improvements as ISSUES #24-#33: cache
  per-player dedupe, missed-questions recap, flag-a-question, power-up
  scaling, daily streak, parent dashboard, smarter cache mix, loading-screen
  polish, battle skill ramp, topic-registry abstraction.
- Recommended sequencing (in chat): Trust → Engagement → Polish → Growth.

### 2026-05-17 — Question cache grants fix
- Migration `0005_questions_grants.sql`: explicitly grants `select, insert,
  update` on `public.questions` and `execute` on `increment_question_usage`
  to `service_role`. Edge-function logs were showing
  `cache insert failed: permission denied for table questions` — RLS is
  bypassed for the service role, but it still needs the underlying GRANTs
  when a project's public-schema default privileges have been tightened.
  Without this, every batch is generated fresh and nothing is ever cached.
- ⚠️ Deploy required: apply `0005_questions_grants.sql` — see ISSUES.md #23.

### 2026-05-17 — Player-controlled Next button
- `QuizRound` no longer auto-advances on a timer. After answering, the result
  + explanation stay on screen until the player clicks "Next Question" /
  "See Results" — everyone reads at their own pace.

### 2026-05-17 — Level-up celebration + power-ups
- On level-up, `LevelUpModal` celebrates (confetti) and the player chooses a
  power-up: ⚔️ Power Strike, 🛡️ Iron Guard, ❤️ Vitality, 📖 Scholar
  (`lib/powerups.ts`). Power-ups stack on `profiles.power_ups` (migration
  `0004`); owed choices derive from `playerLevel − 1 − chosen`, so they
  survive reloads and multi-level jumps (one celebration per level).
- Effects wired in: battle attack/defense damage, battle HP (`BattleState`
  gains `playerMaxHp`), and XP per correct answer.
- ⚠️ Deploy required: apply `0004_power_ups.sql` — see ISSUES.md #21.

### 2026-05-17 — Level medallion
- `LevelBadge` upgraded from a text chip to a circular level medallion
  (level number + XP progress bar), top-left on every game screen.

### 2026-05-17 — Question cache + prefetch
- Migration `0003_questions_cache.sql`: a `questions` table (level-tagged,
  `times_asked` counter) and an `increment_question_usage` RPC.
- The `generate-questions` edge function now randomly mixes cached questions
  (reused from a ±2 level band around the player) with freshly generated
  ones, caches the fresh ones, bumps the counter, and shuffles the result —
  reuse-vs-API is fully random.
- `lib/questions.ts`: `prefetchQuestions` (consume-once promise cache).
  `WorldMap` prefetches each NPC's battle questions; `QuizRound` prefetches
  the next same-topic round.
- ⚠️ Deploy required: apply `0003_questions_cache.sql` AND redeploy the
  edge function — see ISSUES.md #19.

### 2026-05-17 — App-wide error surfacing (ISSUES #18)
- `lib/errors.ts`: `errorMessage` (sync) and `resolveErrorMessage` (async,
  unwraps a Supabase `FunctionsHttpError` to the function's real body).
- Wired into `fetchQuestions`, `useGeneratedQuestions`, `profileStore`,
  `AuthPage` — real errors instead of generic messages.
- `ErrorBoundary` wraps the app; the edge function's catch-all always
  returns a `detail`.

### 2026-05-17 — Random NPCs + player level system
- `lib/npc.ts` `generateNpcs(age)`: `WorldMap` shows a fresh random NPC set
  each visit; levels randomise around the age-appropriate level, HP scales.
- Battle question difficulty is now the NPC's level (`useGeneratedQuestions`
  gained a `levelOverride` param); battles no longer touch the skill ramp.
- Player level system: `lib/level.ts` derives level from XP; XP comes from
  correct answers (quiz + battle) and NPC defeats, stored in `profiles.xp`
  (migration `0002_add_xp.sql`). `LevelBadge` shows level + XP on game screens.
- ⚠️ Deploy required: apply `0002_add_xp.sql` — see ISSUES.md #17.

### 2026-05-17 — Test runner + battle/dead-code cleanup (ISSUES #4, #8, #9)
- Vitest wired: `test` block in `vite.config.ts` (jsdom), `src/test/setup.ts`
  (jest-dom + RTL cleanup), `test` / `test:watch` / `test:ui` scripts. 21
  cases automated (`utils`, `age`, `gameStore`, `StatusScreens`) — `npm test`.
- #8: battles are independent — `WorldMap` starts the player at
  `avatar.maxHp`. Removed the redundant `hp` field from `Avatar` / `NPC`.
- #9: removed the unused `NPC.questions` field — all flagged dead code is gone.

### 2026-05-17 — Fix pass-threshold bug (ISSUES #2)
- `PASS_THRESHOLD` 0.82 → 0.8 (4 of 5) — 0.82 silently required a perfect 5/5.
- `TopicSelect` copy now derives from `PASS_THRESHOLD` / `ROUNDS_TO_UNLOCK`
  rather than hardcoded "3" / "82%", preventing future drift.

### 2026-05-17 — AI questions in gameplay + skill ramp (Phase 3)
- `QuizRound` & `BattleArena` now fetch AI-generated questions via the new
  `useGeneratedQuestions` hook — the hardcoded `SAMPLE_QUESTIONS` /
  `BATTLE_QUESTIONS` literals are gone. Loading + error/retry screens added
  (`components/StatusScreens.tsx`).
- Persistent per-topic skill ramp: `nextSkillLevel` (`lib/age.ts`) — a
  flawless run climbs fast, a weak round eases off slowly — applied after
  each round/battle and saved with `profileStore.setSkillLevel`.
- Quiz reveals the per-question explanation; dead `'result'` battle phase removed.
- Resolves ISSUES.md #7.

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
