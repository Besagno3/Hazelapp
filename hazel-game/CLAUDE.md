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
| State       | xstate 5 (game flow) + Zustand 5 (`saveStore`, `battleStore`, `quizSessionStore`, `authStore`, `profileStore`, `settingsStore`) |
| Backend     | Supabase (`@supabase/supabase-js`) — auth only so far |
| Animation   | Framer Motion 12, canvas-confetti                   |
| Audio       | Howler 2 (`lib/audio.ts` — music + SFX, off by default) |
| Game canvas | KaPlay 3001 (tile overworld, lazy-loaded with the world screen) |
| Testing     | Vitest 4 + Testing Library + jsdom (`npm test`)     |
| CI          | GitHub Actions (`.github/workflows/ci.yml`): lint + test + build on every PR / push to `main` (check `test`), plus `edge-function` (deno check) and `migrations` (apply + SQL tests) |

`package.json` lists only packages the app actually imports (unused ones
were removed in #87). Still "approved to adopt" when a feature needs them:
react-router-dom + recharts (parent dashboard), vite-plugin-pwa (PWA, #5),
zod, react-query. Add the package in the same change that first uses it.

## Decisions

- **Audience:** general kids' educational game (difficulty tiers, not tuned to
  one child).
- **Question source:** AI-generated via the Claude API, called from a Supabase
  Edge Function (the API key must stay server-side). Revises an earlier
  "external trivia API" choice — trivia APIs can't do age-graded content. See
  ISSUES.md #7.
- **Difficulty = the question level, not XP (2026-09-26):** two separate
  tracks per player. The **question level** per topic
  (`profiles.skill_levels`, 1–10) starts from the child's **sign-up age**
  (`ageToStartLevel(playerAge)` — age recomputes from the birth date, so new
  topics start higher each birthday) and then moves with **performance**
  (quiz ramp, battle ramp, and the battle **speed trigger**: 5 quick correct
  answers in a row → +1 mid-battle). It sets quiz, gate, chest, Spire and
  battle questions and enemy levels. **XP / player level** only tracks
  progress and grants power-ups — leveling up never makes anything harder.
  The defend countdown is age-based only. **Where an enemy roams scales how
  it fights, never what it asks (#75 item 12, 2026-10-08):** each zone's
  danger tier (`content/regions.ts`, by story leg) scales its HP, blows,
  power-move rate, coins and win XP; its questions stay at the child's level.
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
  generated 16-bit art (`tools/assets/`), CC0 packs optional later. See `docs/DESIGN-JRPG.md` §6.
- **Overworld (2026-10-04/05, #75):** the world becomes a two-scale DQ3/FF2-style
  overworld — plan in `docs/ROADMAP-OVERWORLD.md`. Names: world **Lumina**,
  home continent **Dawnreach**, far continent **Taleshore**, inner sea **the
  Silver Shallows**, outer sea **the Starfall Sea**. **Lumina Field retires as
  a hub** (its people + buildings move into Lumina Village, which becomes home
  and `HUB_ZONE` — done in item 8, 2026-10-07). **Every town gets an inn** (reverses #73's one-inn rule —
  done in item 11, 2026-10-07; still one Library, still each item sold in one shop). **`ROADMAP-4X.md`
  Wave 1 (Act II) is paused** until Dawnreach exists — don't build Act II
  zones as edge-linked screens. **Act II is on the sea (#75 item 14,
  2026-10-08):** Marlow's boat arrives after the Spire (roadmap decision 8),
  and Act II's places are islands and coasts of the Silver Shallows — its
  own overworld map east of Dawnreach, reached by sailing off the east edge.

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
  resolves all seven, #33/#55), `zones.ts` (17 tile maps: the **Dawnreach**
  overworld (80×60, `kind: 'overworld'`, with `places` icons and `fogs`,
  #75 — the four crystal regions sit at its corners, item 8) + three roadside
  shrines and the dark Echo Mine (item 9) + 4 crystal zones + Lumina Village (home and `HUB_ZONE`: safe,
  a scrolling 4×2-screen town with enterable buildings, incl. the Library
  and Maple's Trading Post from the retired Lumina Field) + 3 themed combat
  zones (the Clockwork Depths three floors deep, item 10) + the hidden
  Moonwell Grove + the Crystal Spire; every zone but Dawnreach is a place on
  it or a floor below one; every zone has a `kind` that picks its
  transition + music;
  `ZONE_IDS` is the zone-id source of truth, validated by `zones.test.ts`;
  Dawnreach's terrain is painted in **Tiled** — `content/maps/dawnreach.tmj`
  with the `legend.tsj` tileset, read by `tiledRows` (`lib/tiled.ts`); see
  `docs/MAP-AUTHORING.md`), `npcs.ts` (dialogue trees),
  `enemies.ts` (archetypes + fiends, age-scaled at spawn), `abilities.ts`
  (Sage personas + charge tuning), `companion.ts` (battle companions — Ember /
  Pip / Wisp — their strikes, perks + Pair Attacks), `spells.ts` (the Spellbook — castable
  abilities derived from the save), `fieldSpells.ts` (#75 item 9: the field
  spells Return / Glow / Calm — learned at shrines as `spell:<id>` flags —
  plus visited towns and Return landings), `dungeons.ts` (#75 item 10: which
  zones are floors of one dungeon, which way is deeper, floor labels B1… /
  Floor 1…, the boss at the bottom — floors are ordinary zones joined by
  `>` / `<` stairs exits), `regions.ts` (#75 item 12: every zone's region and
  danger tier 0–4, the `DANGER` tuning per tier, map labels "Lv 4 !!", the
  danger banner / defeat tip / arrival warning copy),
  `boat.ts` (#75 item 14: Old Marlow's boat — where it's moored
  (`boatSpot`, home at his dock), leaving it mid-voyage (`moorBoat`), Marlow
  rowing it home (`boatFetch`)),
  `spire.ts` (the endgame climb floors +
  villain), `keys.ts` (warden bosses + the gate keys that unlock 3 of the 4
  Fiends, #58), `items.ts` (shop + economy tuning), `secrets.ts` (hidden secrets per
  zone — claim + progress; `ZoneDef.secrets`), `avatars.ts`.
- **`saveStore`** (`src/store/saveStore.ts`, #12): the per-player save file —
  zone, position, HP, coins, items, badges, sages, story flags, opened chests,
  quiz progress, Library queue, the active battle companion, the defend-timer
  setting, the last inn rested at (`lastRest`, #75 item 11 — additive, so no
  version bump; null = home), where Marlow's boat is moored and whether the
  hero is in it (`boat` / `aboard`, #75 item 14 — additive too; `normalizeSave`
  keeps a mooring only on open sea, and `aboard` only afloat with a boat). Write-through: localStorage immediately
  (keyed `hazel-save-<userId>`), Supabase `saves` table on a 2s debounce;
  `flush()` on save crystals / sign-out. Supabase errors degrade to
  local-only play. Pure logic in `lib/save.ts` (normalize / legacy migration /
  the `MIGRATIONS` ladder — **`SAVE_VERSION` 2** since #75 item 8). A save
  from a *newer* version is never loaded or overwritten: loads check
  `saveIsTooNew`, and the server refuses any write that lowers a save's
  version (migration 0011's trigger → `save_version_conflict`, which `flush`
  catches). Either way status goes `'outdated'` and `App` asks for a refresh.
  Every v2+ save carries the `save:v2` flag (`SAVE_V2_FLAG`) so the v1 → v2
  step never moves a position twice.
- **`battleStore`** holds the ephemeral battle session (enemy, HP, defeated
  instance ids, losses per enemy kind + tier for mercy (`lossKey`), the danger
  tiers already explained) — deliberately not persisted, so a reload is a
  fresh start for mercy.
- **`quizSessionStore`** holds the ephemeral Training-Grounds session — the
  topics passed (80%+) this session, so `TopicSelect` greys them out and stops
  re-picking. Not persisted; reset on sign-out (#64).
- **`authStore`** holds the Supabase user/session; **`profileStore`** holds the
  `profiles` row (birth date, skill levels, xp, power-ups, streak).
- **World** (`features/world/`): `WorldScreen` (HUD + overlays + cutscenes)
  wraps `WorldCanvas` (KaPlay; tile collision, bump-to-interact, zone exits,
  the Spire icon, remounted per zone, paused under overlays via ref). Terrain
  is ONE object that draws only the cells in view each frame, from frames
  worked out once per zone by `lib/terrain.ts` — never add one KaPlay object
  per tile (big maps would crawl; #75). Roofs are one object per building.
  Coasts, beaches and roads are rounded by **edge blending** (`blendLayer`,
  `lib/terrain.ts`): a tile centred on every corner where terrain classes meet
  (water < sand < ground < path), from a per-zone `/tiles/<zone>-blend.png`;
  buildings and Spire floors never blend.
  Moving between edge-joined screens slides; entering or leaving a place on
  the overworld fades (`transitionFor`, `lib/transition.ts`). Overlays:
  dialogue, services (shop/inn/library/sage), path questions (gates/chests),
  key gates (`KeyGateOverlay` — warden-key Fiend gates, #58),
  menu, and the **Spire climb** (`SpireOverlay`, machine substate `world.spire`,
  opened by bumping the Spire icon — the all-crystals-gated endgame; its five
  floors are walkable themed maps drawn by `WorldCanvas`, state in
  `spireStore`, #74). `TouchPad`
  is the mobile d-pad.
  **Field spells** (#75 item 9, `content/fieldSpells.ts`): a shrine keeper
  (`NpcRole` `keeper` → service `trial`, `ShrineTrial`) teaches one by 3 right
  answers; the menu's ✨ Field spells (`FieldSpellsPanel`) casts them through
  `WorldScreen.castFieldSpell`: **Return** sets `travelRef`, which the canvas
  loop takes once the world runs again (fade + `onExit`); **Glow** sets
  `lit:<zone>` in a dark place (`ZoneDef.dark`: a small circle of light and
  `pitch` rects that block like fog until lit; a 🔆 HUD button appears there);
  **Calm** fills `calmRef` (seconds, counted down by the canvas while the world
  runs) — critters fade and don't start battles, bosses still do; when it
  wears off a critter you're touching waits `CALM_GRACE` (1.5 s). Arriving
  anywhere sets `visited:<zone>`.
  **Dungeons** (#75 item 10, `content/dungeons.ts`): a floor is an ordinary
  `dungeon` zone (saves your place, critters, chests, NPCs, maybe bigger than
  a screen, maybe `dark` — `dark.dim` makes it dim rather than black); stairs
  `>` (down) / `<` (up) are exits inside the map, so moving floors fades like
  a place and needs nothing special from the canvas (it just draws the stairs
  sprite). The HUD reads "B2 — The Gear Halls" (like the Spire's "Floor 2 — …");
  routes say "take the stairs down to …", a run of them "down two floors to …".
  The Spire numbers its floors the same way (`spireFloorTitle`)
  but its trial floors stay `SpireOverlay`'s (ISSUES #103).
  **Inns** (#75 item 11): every town in `RETURN_TOWNS` has exactly one
  building with `sign: 'inn'` (`innOf`) and its innkeeper inside. Resting
  (`ServiceOverlay` → Inn) sets `lastRest` to that town; a defeat — battle or
  Spire — goes through `wakeAfterDefeat` (`lib/save.ts`): that inn's
  `innWakeCell` (the floor just inside its door), or home (`HUB_ZONE`, saved
  start) when `lastRest` is null. `wakeInnName` words it for the defeat screens.
  **The sea** (#75 item 14): travel modes are `foot` / `boat`
  (`lib/travel.ts`: `passable`, `canLand`, `BOAT_SPEED` 1.5×). The boat
  sails open sea ('~') only and goes ashore at a beach (':') or a dock ('|',
  new legend char: planks over water). Maps join at sea through
  `ZoneDef.seaLinks` (an edge, the map beyond, a row shift; every link has its
  mirror): sailing off a linked edge slides onto the next map one cell in
  (`seaCrossing`). `WorldCanvas` takes `boat` (its mooring) and `aboard`:
  bump the moored boat to climb in (`onBoard`), sail into a beach or dock to
  go ashore with the boat moored where it floated (`onLand`); collision is
  boat-aware (`heroHit` / `blockerAt(…, afloat)`), and the boat is two
  sprites — under the hero, and its hull's front over them. Return and a lost
  battle leave the boat moored where it was (`moorBoat`); Old Marlow rows it
  home on request. The menu map draws whichever overworld you're on, ⛵ where
  the boat is moored, and the Great Fogbank (a bank no boat passes, lifted
  only in Act III) with its own line.
- **Battle** (`features/battle/BattleArena.tsx`): FF-style side-profile command
  battle — Attack / Spells / Companion / Guard / Items / Swap / Flee, every command resolved by
  a question; enemy counterattacks are blocked by defend questions. **Spells**
  (the Spellbook, `content/spells.ts`): the hero casts any learned spell
  (Mend / Aegis / Sage strikes / Ember's Breath) by answering one *super-hard*
  question (`SPELL_LEVEL_BONUS` = 3 levels up); each spends charge (◆, the mana
  gauge filled by correct answers, `CHARGE_MAX` = 4) and a miss fizzles +
  refunds the charge. **Companions** (`content/companion.ts`): Ember (always;
  fights once hatched), Pip and Wisp (join when their quests are done) — one
  fights beside the hero: a strike with a perk (Ember +◆, Pip crosses out a
  wrong answer on the next question, Wisp mends) and **Pair Attacks** (hero +
  companion power combined, super-hard question, charge cost, fizzle on a
  miss). **🔄 Swap** changes companion as a free action. Enemies sometimes
  **telegraph a power move** (charge turn → 2× blow; Guard blocks it), Sage
  spells are **super effective** vs their topic, **answer streaks** power up
  hits, and after two losses to the same enemy its questions get easier
  (**mercy** — session-only; near home no change to damage, while a critter
  with "!" marks also fights like a tier-1 one from then on: `mercyFor`'s
  `fightTier`, applied at the encounter by `atTier`). **Defend questions are
  timed** (`DefendTimer`, `defendTimeMs(age)`: 25s at age 5, 1.5s less per
  year, 10–25s, +5s under mercy, paused while the tab is hidden; switch off
  per player in 📜 → ⚔️ Battle; running out lands the blow as a wrong
  answer). **Speed trigger:** 5 quick (within half the age countdown, no
  Hint Feather or Pip's peek) correct answers in a row raise the battle's
  question level by 1 on the spot (max +2 per battle, saved at the end or
  on Flee). **Danger tiers** (#75 item 12): `BattleEnemy.tier` (from
  `placementTier` at spawn) scales max HP and coins (`spawnEnemy`), every
  blow (`enemyAttack`), a regular enemy's power-move chance (`nextIntent`) and
  the win XP (`defeatXp`) — never `level`, the question level; the HUD shows
  its "!" marks beside "Lv", the first fight against each tier's marks in a
  session opens with a 💪 tap-to-continue line saying what they mean
  (`toughCallout`, chained after a boss's monologue, then the 💛 mercy line), a
  far defeat says what to do (`defeatTip`), and a healer's mend is capped
  (`HEALER_REGEN_MAX`) so no region makes a fight stall. Fiends (bosses) have enrage phases and restore their
  crystal on defeat. No game over — defeat wakes the player, healed, inside
  the last inn they rested at (`wakeAfterDefeat`; home to Lumina Village,
  `HUB_ZONE`, if they've never rested away from it). **Structure (#87, kept by the #99 port):** the rules of a turn are
  pure resolvers + tuning in `lib/battleTurn.ts` (damage formulas in
  `lib/battleMath.ts`); the fight's live numbers (HP, charge, guard, shield,
  enrage phase, item buffs) live in `battleStore` and are read with
  `combatState()` *at the moment a command resolves* and written back at once
  with `applyCombat` — never write HP from a timer or a render-captured value
  (#70). The HUD may *show* the old HP until a blow lands; that lag is
  display-only. `useBattleFx` owns every cosmetic timer and motion (floats,
  banner, lunges, the per-move choreography from `choreography.ts`,
  fireballs, flinch, cheer); `BattleHud` / `BattleStage` / `BattleMenus`
  (command, Spells, Items, companion, Swap) / `BattleResult` are the view;
  `BattleArena` owns the turn flow. Session-only `battleStore.losses` drives
  mercy, keyed by `lossKey` (kind + the tier it roams at). The callout
  banner is a dark pill over the stage's sky, out of the layout (a zero-height
  live region), so it reads on any backdrop and never moves the answers.
- DB schema lives in `supabase/migrations/` — apply with
  `supabase/apply_all_migrations.sql` (paste into the SQL Editor; generated by
  `npm run db:bundle`, replays every migration and records each in
  `supabase_migrations.schema_migrations`) or `supabase db push`.
  **Migration rules (#90):**
  1. **Forward-only.** Never edit a migration that has been applied anywhere
     (i.e. merged to `main`) — `supabase db push` skips recorded versions, so
     an edit silently never reaches those projects. Fix things in the next
     numbered file (see `0010_access_hardening.sql`).
  2. **Re-runnable.** The bundle replays everything on every run: `create
     table/index/schema if not exists`, `add column if not exists`,
     `create or replace function`, `drop policy|trigger if exists … on …`
     before `create policy|trigger`, grants/revokes (already idempotent).
  3. **No transaction control** (`begin`/`commit`) — the bundle wraps all of
     them in one transaction.
  4. After adding one: `npm run db:bundle`, and put a SQL test in
     `supabase/ci/*.test.sql` if it changes access rules.
  `db:bundle` refuses to build if rules 2–3 are broken; CI applies the bundle
  twice and runs the SQL tests.
- **CI** (`.github/workflows/ci.yml`, #81 + #88): job `test` = lint + bundle
  check + tests + build; `edge-function` = `deno check`
  of the edge function; `migrations` applies every migration to a plain
  Postgres (after `supabase/ci/supabase-stub.sql`) and runs
  `supabase/ci/*.test.sql`. A new migration must apply cleanly there; put
  SQL-level tests for it in `supabase/ci/`.
- **Question-generator access (#88):** `generate-questions` requires a signed-in
  caller (401 otherwise) and calls `begin_question_request` (migration 0009):
  per-player calls/minute (429 over it) + per-player and project-wide daily
  budgets of *fresh* Claude questions. Over budget it serves the cache
  (seen questions as a last resort). Fails OPEN with a loud log if 0009 isn't
  applied. Limits: `QUOTA_DEFAULTS` in the function, overridable by secrets.
- **Password reset (#88):** `AuthPage` "Forgot password?" →
  `resetPasswordForEmail` (redirects back to the app). A recovery link sets
  `authStore.passwordRecovery` (PASSWORD_RECOVERY event or `type=recovery` in
  the URL), and `App` shows `ResetPasswordPage` before the game.
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

# World renderer bench (dev-only; needs Playwright — a global install works)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs fps [cols rows]   # frame times on a big test map
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs shots <dir>       # screenshot every zone + Spire floor
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs diff <dirA> <dirB> # pixel-compare two shot sets
# (bench/world.html also takes __bench.travel(zone, x, y) / __bench.calm(s) — Return / Calm, #75 item 9)

# Tiled maps (docs/MAP-AUTHORING.md) — needs Pillow
python3 tools/tiled/tiled.py to-ascii src/content/maps/dawnreach.tmj    # a Tiled map as ASCII rows
python3 tools/tiled/tiled.py from-ascii rows.txt src/content/maps/x.tmj # ASCII rows → a Tiled map
python3 tools/tiled/tiled.py legend                                    # rebuild the legend tileset (append-only)
python3 tools/assets/build.py spells   # art for the field-spell places + keepers only (#75 item 9)
python3 tools/assets/build.py dungeon  # the Depths' lower floors + the stairs sheet only (#75 item 10)
python3 tools/assets/build.py inns     # the innkeepers + travelers' sprites only (#75 item 11)
python3 tools/assets/build.py sea      # the Silver Shallows, the boat, the dock + Lamplighter Ness only (#75 item 14)
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
- Shared types live in `src/types/index.ts` — **except** unions derived from a
  content registry, which live beside that registry so the ids stay the single
  source of truth (`ZoneId` from `ZONE_IDS` in `content/zones.ts`, `TopicId`
  from `TOPIC_PROMPTS` in `supabase/functions/_shared/topics.ts`), and are
  re-exported through `types/index.ts` / `content/topicPrompts.ts`. Prefer this
  registry-derived pattern over hand-written unions for any new id set.
- **Edge functions must stay single-file.** `generate-questions/index.ts` keeps
  its topic table inline rather than importing `../_shared/topics.ts` — a
  sibling import fails to bundle on dashboard/API deploys (#67). The `_shared`
  copy is canonical for the app; `topicPrompts.test.ts` (`?raw`) fails if the
  function's inline copy drifts from it.

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

### 2026-10-08 — The boat and the Silver Shallows: Act II opens on the sea (#75 item 14, slice 14a)
Roadmap item 14 (Phase 3, "the sea") — the first of four slices (ISSUES #107).
- **Act II opens** (`ACT2_PANELS`, flag `act2-seen`): the morning after the
  Spire's finale, Lumina starts remembering — and the fog rolls back off the
  sea east of Dawnreach. Old Marlow remembers he used to sail.
- **"Marlow's Boat"** (`quests.ts`, `requires: act2-seen` — a quest can now
  wait for a story flag): a sail from Innkeeper Willow (Verdara), his old
  star-compass from Mapmaker Atlas (Chromaria), a clockwork rudder from Sage
  Cog (Gearfall) — three conversations, in turn — then the boat, the
  **Biscuit**, is yours at his dock (+50 coins).
- **The boat** (`content/boat.ts`, `lib/travel.ts`): moored at Marlow's dock
  (two planks, '|', painted onto Dawnreach east of the Starfall Coast icon);
  bump it to climb in, sail open sea at 1.5× walking pace, sail into a beach
  or dock to go ashore — it waits right where you left it (`SaveData.boat` /
  `aboard`, additive). Return or a lost battle mid-voyage moor it where it
  floated; Old Marlow rows it home on request. While sailing the hero sits in
  it (the hull's front drawn over them), Ember alongside, ⛵ in the HUD.
  First boarding plays `FIRST_VOYAGE_PANELS`.
- **The Silver Shallows** (new overworld, 64×44, painted in Tiled —
  `maps/silver-shallows.tmj`): reached by sailing off Dawnreach's east edge
  (`seaLinks`; it slides like neighbouring screens). So far: **Gull Rock**,
  with Lamplighter Ness in her lighthouse (whitewashed cottage style, free
  since Lumina Field retired), and **Sandpiper Cay**, a sandbar with a
  riddle-chest on sea life (`topic: 'nature'`); the **Great Fogbank** walls
  the far side (its first bump plays `GREAT_FOGBANK_PANELS` — it's where
  Ember's flight will matter). Room is left for Act II's islands.
- **Wayfinding:** after the Spire the 🚩 follows Marlow's quest step by step
  (each friend's town), then "Sail the Silver Shallows" with the 🚩 on his
  dock ("Go east to Marlow's dock and sail east."); routes cross the sea
  ("Sail west to Dawnreach, then …"); Elder Lumen's plan covers both. The
  menu map draws the Shallows when you're out there, ⛵ where the boat is
  moored, and the fogbank's own line. Moving between two overworld maps
  slides (`transitionFor`).
- **Art** (`python3 tools/assets/build.py sea`): the Shallows' tileset (a
  new palm scenery), blend sheet and backdrop, the boat sheet
  (`/tiles/boat.png`: whole boat ×2, hull front ×2), the dock as frame 15 of
  the overworld sheet (frames 0–14 unchanged), Ness's sprite; the Tiled
  legend gained '|' (append-only).
- Tests: +19 (boat.test: travel rules, sea links mirrored and every edge
  crossing, docks, island beaches, the fogbank, Ness, the save fields,
  mooring, Marlow rowing home, the quest end to end; WorldMapPanel.test; a
  DialogueOverlay case; existing tests follow two overworlds and the longer
  story); 650 green, lint + tsc + build clean. Played on the bench in
  headless Chromium: the dock, boarding, sailing off the edge into the
  Shallows, landing on Gull Rock and Sandpiper Cay, climbing back in, the
  Great Fogbank.

### 2026-10-08 — Item 12 second review: the explanations a child can actually read (#75 item 12)
A second `/saas-code-review` + `/saas-ux-review` pass on the item 12 branch
(the UX one played real battles in headless Chromium at 375×667 / 390×844).
Code: the critter labels drew over the fog (fixed in the commit before this).
UX — all 7 findings fixed:
- **The battle banner was unreadable on light skies** (amber text, no
  background: 1.2–2:1 on Dawnreach, Gearfall, Verdara, Chromaria). It's now
  a dark pill like the HUD's panels — for every callout, not just item 12's.
- **The banner pushed the answers down a row** on a small phone, then
  pulled them back up when it went — mid-question, so a child could tap the
  wrong answer. It now floats over the stage's sky inside a zero-height
  live region (`role="status"`, so screen readers hear callouts too).
- **💪 and 💛 are tap-to-continue lines now**, not 4-second banners (18
  words want ~8 s for a young reader, and fleeing or a Swap banner could
  lose the 💪 one for the session): chained after a boss's monologue
  before the first command, and a tier counts as explained only once its
  line is on screen.
- **"Far from home" was a rule the map breaks** (the Coast is the nearest
  tough place, Numbria the farthest gentle one): every line now talks about
  the "!" marks instead — "Critters with ! marks hit harder", "💪
  Tough-critter bonus", Tamsin's "Some lands have tougher critters than
  others!".
- **"The 🚩 on your map" pointed at a map you can't see** from the world:
  the arrival toast, the off-road defeat tip and Tamsin now say "Open 📜
  Menu — the 🚩 on the map shows where to go next!", and name the marks
  ("see the !!").
- **After mercy the HUD shows 💛 where the marks were** ("Going easier on
  you" read aloud), and losing an eased fight off the 🚩's road no longer
  calls it "extra tough".
- **Tier-4 map labels** are a lighter red (255,150,140) on a darker plate
  (0.85), so "!!!" reads on sand and pink ground.
- Tests: +3 (BattleArena.test: the 💪 line before the first command, once a
  session; the 💛 line for an eased fight; BattleHud.test: the 💛 mark) and
  the copy tests pinned to the new words; 629 green, lint + tsc + build
  clean. Checked in headless Chromium at 375×667: the pill on Dawnreach's
  light sky, the answer rows unmoved as the banner leaves, the 💪 and 💛
  lines, Chromaria's and the Coast's labels.

### 2026-10-08 — Item 12 UX review: danger a child can read, and no wall far from home (#75 item 12)
A `/saas-ux-review` of regional difficulty (headless Chromium, 375 px)
found the danger wasn't legible or explained to a child. All findings fixed:
- **Map labels on a plate:** a critter's "Lv 4 !!" now sits on a dark
  rounded plate like a place name's, 11 px, drawn above every character
  (`LABEL_Z`) so a passing critter or NPC never hides another's marks — but
  under the fog (z 8), which still hides what's behind it. The plate fades
  with the critter under Calm.
- **The HUD shows the same marks:** "Lv 5 !!!" in the enemy panel's title
  row, coloured like the map's, read aloud as "Far from home: it hits harder
  — and drops more coins". The bottom row is only for a coming power move;
  the "💪 Tough / Fierce / Mighty" word is gone ("Mighty" clashed with the
  "Mighty Blow" power move).
- **Touch players get told:** the first battle against each tier's marks in
  a session opens with a 💪 banner — "See the !! by its level? Far from home,
  critters hit harder — but they drop more coins!" (`toughCallout`,
  `battleStore.toughMet`).
- **No wall far from home:** after two losses to a critter with "!" marks it
  fights like a tier-1 one — HP, blows, power moves and pay (`mercyFor` →
  `fightTier`, applied at the encounter by `atTier`; `eased` remembers where
  it roams) — on top of the easier questions mercy always gave; the 💛 banner
  says "gentler hits and easier questions". Losses now count per kind AND
  tier (`lossKey`), so losing to a Mighty imp by Chromaria doesn't soften the
  gentle ones near home.
- **The result screen explains:** a far defeat adds a 💡 tip — off the 🚩's
  road "…fights extra tough out here. The 🚩 on your map shows a gentler
  road!", on it "after a couple of tries, they go easier on you!"
  (`defeatTip`, `roadTier`); a far win says "💪 Far-from-home bonus: extra
  coins and XP!".
- **Early Coast trips:** first arriving somewhere two or more tiers past the
  🚩's road (`WARN_AHEAD`) toasts "⚔️ Critters here fight fiercely! The 🚩 on
  your map shows a gentler road." (`arrivalWarning`).
- **Scout Tamsin** says it in two short boxes and adds "Follow the 🚩 on
  your map for the gentlest road."
- Tests: +9 (regions.test: mercy's fight tier, `atTier` + `lossKey`, the
  store's per-tier losses and `toughMet`, the banners, defeat tips, the
  arrival warning never firing on the 🚩's road; BattleHud.test: the marks,
  read-aloud text, the power-move row, the result screen's bonus + tip);
  626 green, lint + tsc clean. Checked in headless Chromium at 375 px: the
  plates on Dawnreach, the Coast, Gearfall, Verdara and Chromaria, the HUD at
  tiers 3–4 with a power move and ⚡+2, the defeat tip and victory bonus.

### 2026-10-08 — Regional difficulty: far regions fight tougher, questions stay the child's (#75 item 12)
Roadmap item 12 (finding 5, "distance doesn't mean danger"): every enemy's
level was the child's question level ±1, so Chromaria felt like Numbria.
- **Danger tiers** (`content/regions.ts`): every zone is in one region, and
  each region has a tier by the story leg the 🚩 sends you down — **0** home
  ground (the Village, Dawnreach's heartland, Moonwell Grove, the shrines),
  **1** Numbria + the Whispering Woods, **2** Verdara + the Clockwork Depths
  (+ the Echo Mine), **3** Gearfall Canyon + Starfall Coast, **4** Chromaria.
  The four critters roaming by the corner regions on Dawnreach take their
  region's tier (`EnemyPlacement.tier`, `placementTier`). The world and the
  question prefetch both spawn a placed enemy through `spawnPlaced`, so its
  instance id and tier always agree.
- **What a tier changes** (`DANGER`): HP (×0.85 … ×1.45), every blow (×0.85 …
  ×1.3), a regular enemy's chance to wind up a power move (12% … 35%; bosses
  keep their every-third-turn rhythm), coins (×0.8 … ×2) and the win's bonus
  XP (×0.9 … ×1.45). **Tier 1 is the old balance**, so Numbria plays exactly
  as before; home ground is a little gentler. **The questions never change:**
  `BattleEnemy.level` is still the child's question level for the topic, and
  XP per answer is the same everywhere.
- **You can see it coming:** a critter's map label reads "Lv 4 !!" — the
  level its questions are asked at, then one "!" per tier past 1 — in a
  warmer colour (gold, orange, red), now over a dark shadow so it reads on
  any ground (`mapLabel`). In battle the enemy panel says "💪 Tough / Fierce /
  Mighty" under the HP bar (a coming power move takes the spot). Scout Tamsin
  explains the "!".
- **No stalls:** a far region's beefier healer could out-mend a defensive
  hero's correct hit (Dog-Knight at tier 4: 29 vs 26), so a healer's mend is
  capped at `HEALER_REGEN_MAX` = 20 — the biggest mend before regions.
- Tests: +12 (regions.test: one region per zone, tier 1 = the old balance and
  each tier tougher, the 🚩's road never gets easier, the corner critters'
  tiers, questions the same at every tier, HP/coins/blows/power moves/XP by
  tier, map labels, bosses by leg; BattleHud.test: the danger word; the
  healer test now runs at every tier); 617 green, lint + tsc + build clean.
  Checked in headless Chromium: labels on Dawnreach's heartland and by
  Gearfall / Chromaria / Verdara, inside Chromaria and Numbria, and the
  battle HUD at every tier on a 375 px phone. Follow-ups: #105.

### 2026-10-08 — Pitch dark fades in at its edges (#75 item 10, #103)
A fresh-eyes `/saas-code-review` + `/saas-ux-review` of item 10 after the
builder's own review (all three floors, the stairs, the side hall dark and
lit, the map caption and a B2 battle played in headless Chromium, desktop and
375 px). No new code findings. One UX fix: on the dim Gear Halls the side
hall's pitch dark was one opaque rectangle over a floor you can mostly see,
so it read as a black hole in the map. `WorldCanvas` now draws each pitch
rectangle as stacked layers (`PITCH_FEATHER`: 35 / 45 / 60% rims, 10 px apart,
around an opaque core — a small rectangle skips the inner layers and its
innermost turns opaque),
each fading by its own share when Glow lights the place. The Echo Mine's
doorway gets the same soft edge. 592 tests green, lint + build clean.

### 2026-10-08 — Field spells review fixes: Calm's grace, a darker mine, spells up the menu (#75 item 9, #102h)
`/saas-code-review` + `/saas-ux-review` of item 9, run in a fresh session
(the trial, the menu, Return, Calm and the Echo Mine played in headless
Chromium against a stubbed Supabase, desktop and 375 px). The code held up —
no bugs on a common path; three fixes:
- **Calm's grace:** Calm running out while the hero stood on a critter started
  the battle in the same frame (bench: 0 s in 2 of 3 runs). Now the canvas
  sets `CALM_GRACE` (1.5 s) of trigger cooldown as it wears off, so a kid can
  step away (bench: 1.5–2.5 s).
- **The unlit mine looks dark, not broken:** outside the light circle the map
  was only ~90% dark, so the pitch-dark doorway (fully opaque) showed as a
  hard black box over a visible map. The unlit edge is now 95%: the doorway
  blends into the dark, Miner Mabel's name and the chest still glint faintly.
- **✨ Field spells sits under the menu's map** (was below Ember, battle
  friends, quests and secrets — a long scroll on a phone for Return).
- Logged in #102: the LEVEL / STREAK badges cover the zone name and overlay
  titles on a phone (pre-existing), and the trial's XP skips the Scholar
  bonus like gates and chests do.
- 581 tests green, lint + build clean.

### 2026-10-07 — Inn review fixes (#75 item 11)
`/saas-code-review` + `/saas-ux-review` of item 11 — every finding fixed:
- **🛏️ Rest from the first line:** innkeepers' rumors had pushed the Rest
  button three or four text boxes deep (every other service is on line one).
  `DialogueOverlay` now offers an inn's service on every line (other services
  still wait for the last line — a shrine keeper's trial follows its story),
  and the innkeepers' "Rest here…" line is gone (the Inn panel says it).
- **Defeat copy:** "Friendly hands carry you back to the Square Root Inn in
  Numbria, where you last rested" — so a hero beaten deep in the Depths knows
  why they wake far away. The Spire's lose panel says the same, and its
  button reads "To the inn" (it still said "Back home").
- **No look-alikes:** Chromaria's traveler was a second bard writing a song
  about colors beside Bard Lyra (the Song of Colors quest) — now **Mapmaker
  Atlas** 🗺️; Peddler Fennick hawked wares with no Shop button — now
  **Collector Fennick** (buttons); Pilgrim Oriel no longer tells Wayfarer
  Juniper's "every road twice" joke.
- **Rumors that go quiet:** Poppy's Echo Mine rumor ends once the mine is lit
  (`litFlag`), Willow's Old Wren rumor once Glow is learned (and it says the
  shrine opens when its fog lifts); Hinge places the Shrine of Quiet Paws
  "south-east of Lumina Village"; Poppy no longer says inns are everywhere
  "now" (a new hero doesn't know the history), and "battle goes badly"
  everywhere.
- The Inn panel's "Good morning!" is a `role="status"` (it replaces the
  button that had focus); `BattleArena` reads the wake inn from its
  subscribed save.
- Tests: DialogueOverlay.test (+7: Rest on line one, a keeper's trial still
  waits, the two rumors go quiet, the defeat screen's inn and home copy).

### 2026-10-07 — Dungeon review fixes (#75 item 10)
`/saas-code-review` + `/saas-ux-review` of item 10 — every finding fixed but one:
- **HUD:** the floor title reads "B2 — The Gear Halls", the same shape as the
  Spire's "Floor 2 — …" and the map's "Clockwork Depths · B2 — …", and the
  label never wraps away from the name. On a 375 px phone the stats left any
  place name a ~50 px column (B2's title took four lines, "Lumina Village"
  two), so the HUD row now wraps: the name on its own line, the stats
  right-aligned below. The 🔆 Glow button is just the lamp on a phone
  (`aria-label` "Cast Glow").
- **Routes:** a run of stairs the same way is one step — "Go south-west to the
  Clockwork Depths, then take the stairs down two floors to the Titan's Forge."
- **Key gate:** "beat the Clockwork Titan deep in the Clockwork Depths" (articles
  mid-sentence via `placeName`; "deep in" for a warden below the first floor) —
  the other gates now read "in the Whispering Woods" / "in Starfall Coast" too.
- **Cricket** (on B1) says the forge is *two* floors down.
- **World map caption:** a dungeon floor drops "(past …)" only when its title is
  the place's own name or starts "<place> · " — not on any shared prefix.
- dungeons.test now checks every exit is reachable on the deepest floor too
  (it was skipped there; B3 passes).
- Kept: the "B1 / B2" labels (ISSUES #103h).

### 2026-10-07 — Inns in every town, travelers with rumors, defeat wakes you at your inn (#75 item 11)
Roadmap item 11: with real distances, "one inn in the world" (#73) was a
long walk home, so every town gets one (decided 2026-10-05).
- **Four new inns** (`zones.ts`, `sign: 'inn'`, a 9×6 room of beds and
  tables): the Square Root Inn (Numbria), the Mossy Pillow Inn (Verdara), the
  Wound-Down Inn (Gearfall Canyon) and the Rainbow Quilt Inn (Chromaria),
  each with its own innkeeper — Tabitha 🧶, Willow 🌿, Hinge 🔩, Indigo 🌈 —
  on the same Inn service as Poppy. Numbria, Gearfall and Chromaria had no
  room, so each grew a street south (28 → 37 rows) through a gap in its old
  bottom wall; every other tile, door and saved position is where it was.
  Verdara's inn sits in its open north-east block. Helpers `innOf` /
  `innWakeCell`.
- **More townsfolk + the rumor pass** (`npcs.ts`): a traveler wanders each
  crystal town — Pilgrim Oriel, Peddler Fennick, Courier Zip, Bard Lark —
  so each has 9 people (the Village 14). Innkeepers and travelers name
  another place and what's there ("Verdara, way down in the south-west
  corner, grows flowers taller than houses"); rumors about a field spell, a
  warden key or the Moonwell quest drop away (`unlessFlag`) once it's done.
  Poppy gained two. Directions were checked against Dawnreach's icons.
- **Defeat wakes you at your inn:** new `SaveData.lastRest` (additive; old
  saves read null; `normalizeSave` drops anything that isn't a town with an
  inn). Resting at an inn sets it; losing a battle or the Spire climb now
  wakes the hero on the floor just inside that inn's door (`wakeAfterDefeat`),
  healed — still home when they've never rested away from it. The defeat
  screens say where: "Friendly hands carry you to the Square Root Inn in
  Numbria" / "To the inn". The Inn panel names the inn and says it's where
  you'll wake.
- **Art** (`python3 tools/assets/build.py inns`): 8 NPC sprites; the
  manifest only gained entries.
- Tests: +6 (zones.test: one Library; one inn + innkeeper per town and none
  elsewhere; the wake cell is inn floor with the door below and a walk out
  of town; 8+ people per town and someone names another place; save.test:
  `lastRest` default / normalize / wake position / inn name); 597 green,
  lint + tsc + build clean. Checked in headless Chromium: all four inns in
  their streets, resting with Tabitha sets `lastRest: 'numbria'` and full HP,
  each wake cell puts the hero inside the inn, dialogue and Inn panel on a
  375 px phone. Follow-ups: #104.

### 2026-10-07 — Real dungeons: the Clockwork Depths go three floors down (#75 item 10)
Roadmap item 10: dungeons are now ordinary zones joined by stairs.
- **The engine** (`content/dungeons.ts`): a `DungeonDef` lists its floors
  from the entrance inward, which way is deeper (`goes`), and the boss at
  the bottom. Floors are ordinary `dungeon` zones; new legend chars `>`
  (stairs down) / `<` (stairs up) are exits inside the map (each needs an
  `exits` entry), so changing floors fades like entering a place and the
  canvas only draws the stairs (`/tiles/stairs.png`, `STAIRS_FRAME`). Helpers:
  `dungeonFloor`, `floorLabel` (B1… going down, Floor 1… going up),
  `floorTitle`, `dungeonEntrance`, `stairsChars`. `DarknessDef.dim` makes a
  floor dim instead of black (its own unlit light radius, lighter edge).
- **The Clockwork Depths** (entered from Dawnreach since Phase 1, not the
  Woods): **B1** keeps its map — every chest, gate and save position still
  matches — plus stairs down in the gated vault (the gatekeeper now guards
  the way down); **B2, the Gear Halls** (new, 22×28 — two screens tall):
  dim halls of stopped gears, a save crystal, two critters, and a side hall
  the old lamps never reached, pitch dark until Glow, with a chest; **B3,
  the Titan's Forge** (new): an antechamber with a save crystal and Ratchet
  the Wind-Up (moved down with the boss), the forge where the **Clockwork
  Titan** stands in the way to the hoard chest. The Gearwright Key's
  `fromZone` is now B3. Cricket and Echo point down the stairs.
- **Wayfinding:** routes say "take the stairs down to the Gear Halls";
  Elder Lumen places the Titan "in the Titan's Forge, deep in the Clockwork
  Depths, to the south-west"; the key gate names the Depths. The HUD reads
  "B2 · The Gear Halls"; the world map "You're here: Clockwork Depths · B2 —
  The Gear Halls".
- **The Spire** numbers its floors the same way (`spireFloorTitle`, the
  floor number no longer baked into `SPIRE_FLOORS[].name`) and lights them
  with the same darkness code (camera-aware since item 9); its trial floors
  — rune seals, candles, Umbra — stay `SpireOverlay`'s (ISSUES #103a).
- **Art** (`python3 tools/assets/build.py dungeon`): the stairs sheet and
  B2/B3 tilesets, blend sheets and backdrops (appended to the art table — no
  other zone's art changed). The Tiled legend gained `>` and `<` (append-only).
- Tests: +8 (dungeons.test: floors, stairs both ways landing beside the way
  back, walkable to the bottom without Glow, boss on the deepest floor, labels;
  zones.test: stairs need exits, two dark places; wayfinding.test: the stairs
  route, Lumen's "deep in"); 591 green, lint + tsc + build clean. Checked in
  headless Chromium: B1 → B2 and back, B2's dark side hall (blocks, lit opens),
  B2's far end with the camera two screens down (the light stays on the hero),
  B2 → B3, the Titan fights with or without Calm, the HUD title and map caption
  on a 375 px phone. Follow-ups: #103.

### 2026-10-07 — Field spells: Return, Glow and Calm, learned at roadside shrines (#75 item 9)
Roadmap item 9: magic for out in the world, not for battle.
- **Three spells** (`content/fieldSpells.ts`): 🏠 **Return** flies you to any
  town you've been to (home and the four crystal regions — home's plaza, or
  just inside a town's front door); 🔆 **Glow** lights a dark place for good;
  🕊️ **Calm** makes roaming critters let you pass for 60 s (they fade; bosses
  still fight). Free to cast from the 📜 Menu's new ✨ Field spells section
  (`FieldSpellsPanel`), which also names the shrine that teaches each one not
  learned yet. Knowing one is a `spell:<id>` flag — no save field, no version
  bump; older saves know none.
- **Shrines + trials:** each spell has its own shrine and keeper (new
  `NpcRole` `keeper` → service `trial`): **Wayfarer Juniper** at the new
  Wayfarer's Shrine (just north-west of the Village, open from the start —
  Return, 🪐 space questions), **Old Wren** at the Shrine of First Light
  (behind fog until a crystal — Glow, 🔬 science; her lines now point at the
  mine), **Keeper Thistle** at the new Shrine of Quiet Paws (off the east road
  — Calm, 🦋 nature). The trial (`ShrineTrial`) asks for 3 right answers at
  the player's level; a miss brings another and goes to the Library; the spell
  is learned on the third right answer.
- **The Echo Mine** (new dungeon place in the ridge south of the shrine
  valley): `ZoneDef.dark` — a small circle of light round the hero and a
  pitch-dark doorway that blocks like fog (`darkAt`, part of
  `reachableOnFoot`) until Glow lights it (`litFlag`): the pitch fades and the
  old lamps' wide glow follows you down 2-tile tunnels to a ⏳ history
  riddle-chest. Miner Mabel (a mole who doesn't like the dark) waits at the
  mouth. Bumping the dark says what you need — Old Wren's spell, or "tap 🔆
  Glow" (a HUD button in an unlit dark place once Glow is known).
- **Return** (`travelRef`): the canvas loop takes the trip once the menu has
  closed and fades there like a place exit (a cut under reduced motion), with
  the arrival lock. **Visits** are recorded on arrival (`visited:<zone>`);
  for older saves a town whose crystal is restored counts too.
- **Calm** (`calmRef`): counted down by the canvas only while the world runs;
  the HUD shows "🕊️ 42s" and a toast when it wears off.
- **Darkness follows the camera** (`k.toScreen`), fixing #78 for the Spire's
  candle-light too (no change on its one-screen floors), and is painted every
  frame (`paintDark`), paused and mid-fade included — so a dark place is dark
  as it fades in, and the next place isn't as it fades out.
- Elder Lumen's tip (after the first crystal) names the next field spell you
  can learn at a shrine you can reach (`shrineToVisit`); signposts and the
  world map list the new places automatically.
- **Art** (`python3 tools/assets/build.py spells`): tilesets, blend sheets and
  backdrops for the three places (appended to the art table, so no other
  zone's art changed) and sprites for Juniper, Thistle and Mabel. Dawnreach
  repainted at the three new icons (`maps/dawnreach.tmj`).
- Bench: `__bench.travel(zone, x, y)`, `__bench.calm(s)`; `state()` counts
  encounters, pitch-dark bumps and Calm left.
- +26 tests (field spell registry + shrines + Return + visits, dark places,
  Lumen's shrine tip, the trial, the menu panel); 581 green, lint + tsc +
  build clean. Checked in headless Chromium: the Wayfarer's Shrine trial at
  375 px, Return home → Numbria from the menu, the Echo Mine dark and lit
  (the first, 1-tile-wide tunnels snagged the hero on corners — widened to 2),
  Calm (no battle on top of a critter; the control run battles at once), and
  in/out of each new place. Follow-ups: #102.

### 2026-10-07 — Item 8 review fixes: saves never go backwards, a friendlier update screen, Tamsin split (#101)
The rest of the item 8 `/saas-code-review` + `/saas-ux-review` findings:
- **An old tab can't overwrite a newer save any more (#101h):** new migration
  `0011_save_version_guard.sql` — a `before update` trigger on `saves` refuses
  any write whose `data->>'version'` is lower than the stored one (a missing or
  non-numeric version counts as 1, as `saveVersionOf` reads it), raising
  `save_version_conflict`. `saveStore.flush` turns that error into the same
  `'outdated'` state a too-new load gives (save dropped, nothing more pushed).
  The ladder comment in `lib/save.ts` no longer claims the load check covers
  saves. New `supabase/ci/save_version.test.sql` (same/newer saves, an older
  update and an older upsert refused with the newer data kept, unversioned saves
  upgrade normally); bundle regenerated (11 migrations).
- **No double shift from a v1 tab (#101c):** every v2 save carries the
  `save:v2` flag (`SAVE_V2_FLAG`; `defaultSave` and `normalizeSave` add it).
  A v1 client keeps `flags` as they are, so if it ever re-saves a v2 save as
  "v1", `MIGRATIONS[1]` sees the flag and leaves the Dawnreach position alone
  (still drops `sageEquipped` and moves Lumina Field saves home).
- **The update screen says what happened (#101i):** `ErrorScreen` takes
  optional `title` / `emoji` / `retryLabel` (defaults unchanged, emoji now
  `aria-hidden`); the outdated screen reads "✨ Hazel Quest has been updated!
  — Your adventure was saved by the new version. Refresh the page to keep
  playing — nothing is lost." with a **🔄 Refresh** button.
- **Scout Tamsin (#101j):** her 7-row corner-regions box is now two lines —
  the Woods and the Coast, then "At the four corners lie the crystal lands:
  Numbria north-west, …" (135 characters, ~4 rows on a phone).
- +6 tests (v2 marker on new/loaded saves, the stale-tab round trip, flush on a
  version conflict vs any other error, the update-screen copy, Tamsin's line);
  555 green, lint + tsc + build clean. SQL: the stub + all 11 migrations applied
  twice and the bundle applied twice on Postgres 16; access, quota and
  save_version tests pass.
- ⚠️ Deploy: apply `0011_save_version_guard.sql` (or re-run
  `apply_all_migrations.sql`) **before** shipping this build, so an old tab
  that is still open can't save over a v2 save.

### 2026-10-07 — Elder Lumen greets you on the plaza, then mentors from the Library (#75 item 8)
From the `/saas-ux-review` of item 8: home's welcome (Elder Lumen) and its
potion shop had ended up two screens from where a new game starts. Now:
- **On the plaza:** Elder Lumen stands beside the home spawn until he has
  greeted you ("Welcome home, brave one!…", sets `MET_ELDER`), and ends by
  inviting you to the Lumina Library at the far east end of town. He leaves
  the plaza the moment the conversation closes.
- **In the Library afterwards:** he gives the **big picture** of what to do
  next, not the road (`mentorTips`, `lib/wayfinding.ts`): the plan for this
  stage (start with Numbria — no key needed; the wardens and their keys;
  "you hold the Verdant Key — it opens the Smog Fiend's gate in Verdara";
  the Spire; then secrets and friends), plus one practical tip (Berry Potions
  at Maple's, the Sage spells, the fog map, the Library's missed questions,
  rest before the Spire). Directions stay with the 🚩 map, Grandmother Wick,
  Scout Tamsin and the signposts. `WorldNpcDef.mentor` (with the first
  meeting's `invite`) replaces his `guide` role; `Objective` now carries its
  `crystal` and `key`.
- **NPCs that come and go:** `NpcPlacement.ifFlag` / `unlessFlag`
  (`npcPresent`) — an NPC may have two placements that hand over on one flag.
  `WorldCanvas` spawns NPCs through `spawnNpc` and keeps the conditional ones
  in step with the flags every frame (like gates and chests), so Lumen leaves
  the plaza and appears in the Library within the same visit. zones.test now
  checks no NPC is ever in two places at once.
- Bench: `__bench.setFlag(f)` sets a story flag mid-run, as a conversation
  would.
- +7 tests (mentor tips per stage, first-meeting invite, the hand-over, Lumen's
  two spots); 549 green, lint + build clean. Checked in headless Chromium: a
  new hero on the plaza with Lumen beside them; talking to him; with the flag
  set his plaza spot is empty at once; in the Library he appears live beside
  the Librarian and can be talked to.

### 2026-10-07 — Act I re-staged on Dawnreach: crystal regions at the corners, Lumina Field retired (#75 item 8)
Roadmap item 8 (§3.5): Act I now plays as a journey across one continent.
- **Dawnreach grew to 80×60** (`maps/dawnreach.tmj`, painted from ASCII via
  `tiled.py`). The Phase 1 island is kept whole in the middle (shifted 8
  right, 6 down — every Dawnreach coordinate and inbound landing moved with
  it) and a lobe of land added at each corner for a crystal region:
  **Numbria** (north-west, a lake and stone hills), **Gearfall Canyon**
  (north-east, between rock ridges), **Verdara** (south-west, a wood) and
  **Chromaria** (south-east, a meadow with a pond). Each is a place with its
  own icon (`city` 🏛️ / `canyon` 🕰️ / `garden` 🌻 / `pavilion` 🎪 — new frames
  11–14 of `/tiles/overworld.png`, `python3 tools/assets/build.py icons`,
  the old frames unchanged), its fog pocket beside it (science and
  engineering moved), and a critter of its topic roaming near. Roads: the
  north road now turns west to Numbria; a new road north off the east road
  to Gearfall, south to Chromaria; the Depths road runs on to Verdara. A
  mountain ridge keeps the shrine's valley fog-locked (the new lobe had
  opened a back way in). Two more signposts at the forks.
- **Each crystal zone's one exit** now leads out onto Dawnreach beside its
  icon (it used to lead to Lumina Field); their maps, chests, gates and
  quests are unchanged.
- **Lumina Field retired:** the `lumina-field` zone is gone. Its Library,
  Maple's Trading Post, Elder Lumen, the Librarian and Pip moved into a new
  east end of **Lumina Village** (88×28 now, 4×2 screens; nothing else in it
  moved; the east gate is at column 87). The Village is `HUB_ZONE`: new
  games and defeated heroes wake on its plaza (the spawn moved there from
  the north gate). Its art files were deleted; the art tool keeps its entry
  (`RETIRED`) so the other zones' seeds don't shift.
- **Save v2** (the first `SAVE_VERSION` bump, `MIGRATIONS[1]`): a save on
  Lumina Field wakes in the Village; a position on Dawnreach moves by
  `DAWNREACH_GREW_BY` to the same spot; the four pocket chests keep their
  opened state (`MOVED_CHESTS`); `sageEquipped` is dropped (#53). Plus the
  guard the ladder asked for: a save from a newer version than the code is
  refused (`saveIsTooNew`; the store goes `'outdated'` and writes nothing,
  `App` shows "refresh the page"). An unknown zone now drops its position too.
- **Text:** Elder Lumen ("one at each far corner of Dawnreach"), Scout
  Tamsin (the four corner regions), the defeat panels ("carry you home to
  Lumina Village", "Back home"), the Spire's cast-out panel, comments.
  Elder Lumen's "All four crystals shine again" line was keyed to the first
  (math) crystal; now to `ending-seen`. STORY.md settles home as the Village
  ("Lumina Field" is the open country around it).
- **Bench:** the stress map borrows Dawnreach's tileset (the Field's is gone),
  so it now edge-blends its lakes and roads: 55 / 27 fps (1× / 4× throttle)
  vs ~60 / 31 before — a new bench baseline, not a change to the game.
- Tests: home + moved people, corner regions and their one-way-back exits,
  reachability (regions open, shrine + Spire sealed, pockets per crystal),
  no critter near a doorstep, save v2 with a real v1 save, the outdated guard
  in the store, no NPC pointing at Lumina Field; wayfinding/world-map
  expectations follow the new routes. 543 tests green (+14 net), lint +
  build clean. Checked in headless Chromium: every region's doorstep, in
  and out of all four regions and the Village's east gate, the Library and
  Trading Post interiors, the menu map at 375 px.

### 2026-10-07 — Merge main (battle round 3, #92–#99) into the fog branch
`main` took issue numbers #92–#99 and test cases up to TC-535 while the fog
banks were being built, so the fog follow-ups moved **#92 → #100** and the fog
test cases **TC-452–475 → TC-536–559**. No code conflicts: `main`'s
`skillLevels` prop and the fog work touch different parts of `WorldCanvas` /
`WorldScreen`.

### 2026-10-07 — The world map shows ☁️ for the Spire until its fog lifts (#75 item 7)
The menu map drew the Spire's 🗼 inside its ring of fog, though the world
hides it. Now a place inside a bank that hasn't lifted shows ☁️ on the map and
in the place list (`placeEmoji`, `lib/worldMap.ts` — today just the Spire),
with a legend line "☁️ = a place still hidden in the fog"; once the ring
lifts, the tower is back. The shrine, just past its own bank, is unaffected.
+2 tests (worldMap.test); 490 green, lint + build clean. Checked on a 375 px
menu map in headless Chromium, with no crystal and with one.

### 2026-10-07 — Fog UX review fixes: the script, a skip, the chime, screen readers (#75 item 7)
`/saas-ux-review` of the fog banks; all 4 findings fixed:
- **The script matches the fog:** the leaving-home panels (`DAWNREACH_PANELS`,
  always before any crystal) said the Spire "glitters above the hills" and
  shows the way home, while it sat hidden in its ring of fog. Now: a great
  ring of fog hides the Spire; restore a crystal and the fog starts to lift,
  around the Spire first. Scout Tamsin says the Spire hides in fog until its
  ring has lifted on screen (`fogSeenFlag('spire-fog')`), then calls it the
  landmark to look for.
- **A reveal can be skipped:** "Tap or press a key to skip ⏩" shows at the top
  while one plays; any fresh key, click or tap (the d-pad too) clears every
  bank left at once, marks them seen, and cuts the camera home. A key or
  finger already down when it started doesn't skip (counted presses,
  `pressesRef`, window-level like the movement keys).
- **The lift plays the gate chime** (a way opening), not the level-up fanfare.
- **Toasts are read out:** they render inside an always-present
  `role="status"` live region.
- +2 tests (story.test); 488 green, lint + build clean. Checked in headless
  Chromium on the bench: skip by key / click / tap / under reduced motion
  (all banks seen within ~50 ms, camera home, hero walks after); a held key
  or pointer doesn't skip; the Spire whole after a skip; untouched, the
  reveal plays out as before.

### 2026-10-07 — The Spire hides in its clouds and emerges as they clear (#75 item 7)
The Crystal Spire was drawn above its ring of fog. Now a place inside a fog
bank (`placesInside`, `lib/fog.ts` — today just the Spire) is hidden behind
the clouds, tower and name plate alike, until the bank lifts. As it lifts the
place stays hidden while the clouds start to thin, then fades in slowly
(`revealOpacity`: eased, complete as the last puff goes), drawn under the
puffs so it emerges from behind them. A bank that hides a place clears more
slowly (3.2 s instead of 1.6 s). +2 tests (fog.test); 486 green, lint + build
clean. Filmed in headless Chromium: hidden with no crystal; on the lift, a
faint tower, then a solid one, then the camera glides back.

### 2026-10-07 — Fog banks look like fog: soft puffs drifting around each other (#75 item 7)
The banks were rectangles of square fog tiles. Now each is a cluster of soft
pixel-art cloud puffs (`/tiles/fog-puffs.png`, three shapes, stepped alpha;
`tiles.fog_puff`, `python3 tools/assets/build.py fog`) laid out by
`lib/fog.ts` (`fogPuffs`, seeded by the bank's id): they overlap past the
bank's edge, so the outline is round and wispy, and each drifts in an orbit
plus a slow sway around its spot, neighbours turning opposite ways, so the
bank churns and floats (`puffAt`). Lifting spreads the puffs out, up and away
as they fade. Collision is unchanged (the bank's rectangle). Reduced motion:
puffs stay put, a lift only fades. One updater moves every puff; banks off
screen are hidden and skipped. The bench's fog masks grow by `FOG_OVERHANG`.
- Frame rate (headless Chromium, software GL, alternating runs vs the tile
  fog): in the foggiest view (the Spire ring + a pocket on screen) about 8% lower (38 → 35 fps; it was 14% before off-screen banks were skipped);
  elsewhere unchanged (off-screen banks cost nothing).
- +6 tests (`fog.test`: deterministic, no holes, overhang bound, shapes and
  both turning directions, drift/still, lift) and a size check on the sheet;
  484 green, lint + build clean. A wider puff spacing (25 px) was tried and
  dropped: it thinned the middle of the small shrine bank.

### 2026-10-07 — Fog banks: each crystal lifts its own fog, on screen (#75 item 7)
Roadmap item 7 (§3.2): restoring a crystal now visibly lifts its fog on
Dawnreach and opens what's behind it.
- **Six banks** on Dawnreach (`ZoneDef.fogs`). The first crystal (any one)
  clears the road to the Shrine of First Light (as before) and a new ring of
  fog over the Spire grounds; the tower is drawn above the fog so it still
  rises out of it. Each crystal also clears its own small pocket (`crystalPocket`):
  a nook painted into the map (in Tiled) with a treasure chest you can see
  but not reach — math in the north-west hills, science in a clearing of the
  western forest, engineering among the rocks by the east shore, creativity in
  a little grove in the south-east. The fog hint names the crystal.
- **`FogDef` grows:** `guards` (the cell it keeps you from), `chestTopic` (the
  question topic of a chest on the topic-less overworld; `chestTopicAt`), and
  `lifted` (the line shown as it clears).
- **The lift, on screen:** a bank that has lifted but not been watched
  (`fogsToReveal`, flag `fogSeenFlag(id)`) clears when you're next on its map.
  After a short beat (and only once the map art has loaded) the hero holds
  still, the camera glides to the bank, the fog thins and rises away with a
  toast + chime, and the camera glides back; several banks play nearest
  first. Reduced motion cuts the camera instead. Wanderers hold still too.
- **One storybook panel per crystal** ("Back on Dawnreach, a bank of fog …
  thins and drifts away"), and one in the Spire-wakes scene for the Spire
  ring and the shrine road.
- **Never shut in:** `safeSpawn(z, pos, flags)` sends a save standing inside
  fog, or sealed behind it, to the zone spawn (`behindFog`,
  `reachableOnFoot`) — e.g. an old save at the Spire with no crystal.
- **World map:** each fogged bank shows the crystal that clears it (🔢 🔬 ⚙️ 🎨,
  or 💎 for any crystal; `fogMarker`, `fogMarkerAt`), so the map is a picture
  of what each crystal will open.
- Tests: each bank shuts its reward away until one of its own flags lifts it;
  each crystal has exactly one pocket with a chest on its topic; at every step
  of the story the next goal is walkable with the fog lifted so far (no
  softlock); reveal bookkeeping; safe spawn behind fog. Bench: `fogReveals` in
  `__bench.state()`.
- 478 tests green (+7); lint + build clean. Checked in headless Chromium: the
  reveal filmed (Spire ring, shrine road, math pocket in order; camera glides
  out and back; hero walks again after), reduced motion (cuts), a fresh
  browser (waits for the art), fog bumps, safe spawn, the menu map.

### 2026-10-07 — Battle port onto main's split arena; issue numbers moved again (#99)
`main` merged its own battle refactor (#87) while this branch had grown the
old single-file arena, so the second merge moved every battle feature from
this branch onto main's structure instead of picking one side.
- **Kept from main:** `CombatState` + `battleStore` as the single source of
  truth (`combatState()` / `applyCombat`, #70), the resolvers in
  `lib/battleTurn.ts` (`resolveHeroHit`, `resolveEnemyTurn`, `resolveSpell`,
  `resolveItem`, `itemBlocked`, `applyFocus`, `chargeAfterAnswer`), the view
  split (`BattleHud` / `BattleStage` / `BattleMenus` / `BattleResult`),
  `useBattleFx`, and main's tests (smoke + #70 regression) — unchanged and
  passing.
- **Moved onto it from this branch (#92–#98):** `resolveEnemyTurn` gained
  `intent` (a charged power blow hits ×2; Guard / Ward / Mirror still stop
  it, tested); intents, streaks, weakness, mercy, rewards, the countdown and
  the speed trigger joined `lib/battleTurn.ts` (my `resolveHeroHit` /
  `resolveEnemyAttack` were dropped for main's); `battleStore` gained
  `losses` + `recordLoss`; `useBattleFx` gained the choreography (`perform`
  — hero/companion motions sized to the screen, fireballs), the enemy flinch
  (`hitEnemy`), the cheer, the swap drop and banner icons, and exposes a
  ref-free `stage` object for `BattleStage`; `BattleHud` gained the phone
  layout, ⚡ speed badge, 💢 power-move warning and 🔥 streak; `BattleMenus`
  gained Companion + Swap menus, the Guard highlight, super-effective tags,
  "Need N more ◆" and sticky Back; `BattleResult` gained the first-win and
  drop lines. The arena keeps the timed defends, Pip's peek, Pair Attacks,
  mercy lock and speed-boost pool. The HUD still lags until a blow lands, but
  only for display.
- **Numbers:** main now uses issues up to #91 (incl. #83, #87–#91) and
  TC-451, so this branch's issues moved #83–#89 → **#92–#98** and its test
  cases TC-386–463 → **TC-452–529**; this port is **#99 / TC-530–535**.
  (Main took #91 / TC-447–451 for the Training Grounds, PR #8, during this
  merge — hence one more shift than first planned.)
- 510 tests green; lint + build clean; every sprite rebuilds identical.
  65 headless-Chromium checks on the ported arena: 23 round-3 (swap, peek,
  streak, Wisp, store-first HP, super effective, power move + Guard, mercy,
  rewards, reduced motion), 10 items, 15 speed trigger, 14 defend timer,
  3 portrait/world bench.

### 2026-10-07 — All 7 topics on the Training Grounds + per-session completion (#91)
Written 2026-07-03 (PR #8), merged 2026-10-07 on top of the overworld and
tech-debt work; renumbered from #64, which `main` had since used.
The topic-selection gate players hit after login now offers every topic and
tracks what's been cleared this session.
- **All topics selectable:** `TopicSelect` maps over `ALL_TOPIC_INFO` (now
  exported from `content/topics.ts`) instead of just `TOPIC_REGISTRY`, so the
  three `EXTRA_TOPICS` (Nature 🦋 / Space 🪐 / Time & History ⏳) join the four
  crystal topics — seven total. They were already fully styled and
  question-generable (#55/#57), just never shown here → **no edge-function
  redeploy**.
- **Per-session completion (`store/quizSessionStore.ts`):** a new **ephemeral,
  non-persisted** Zustand store (mirrors `battleStore`) holding
  `completedTopics`. `QuizRound.finishRound` calls `markCompleted(topic)` only
  when the round is **passed** (80%+, reuses `PASS_THRESHOLD`). `TopicSelect`
  greys a completed topic out with a ✓ + "Completed" and disables it (drops the
  hover/tap motion + `onClick`) for the rest of the session. A failed attempt
  stays selectable.
- **Scope:** "session" = the in-memory play session — a reload starts fresh,
  and sign-out clears it (`useAuthInit` resets the store alongside
  `battleStore`) so one player's completed set can't leak into the next.
- The world stays reachable throughout: only 3 passes unlock it, so the "🗺️
  Enter the world" button appears well before all 7 could be cleared.
- +4 tests (`quizSessionStore.test`); 471 green after merging `main`;
  lint + build clean.

### 2026-10-07 — Merge main into the tech-debt/security branch (#87–#90)
- Ported main's village-expansion battle items (#80) into the refactored
  battle (#87): Mirror Charm / Focus Tea / Lucky Clover are `mirrored` /
  `focused` / `lucky` in `CombatState` + `battleStore` (reset per fight by
  `start()`); Sunseed Snack / Turbo Coil in `resolveItem`; the bounce, its
  shield-shatter, a bounce win and the "any damage source" boss enrage live
  in `resolveEnemyTurn`; Focus Tea is `applyFocus`. The HUD uses main's
  `CharacterPortrait`. Same behavior as main's version, now unit-tested.
- My ISSUES entries were renumbered #75–#78 → #87–#90 and my test cases
  TC-316–341 → TC-416–441 (main had used those numbers meanwhile; renumbered twice, as main kept moving).
- CI: kept main's `test` job (the required-check name) and added the bundle
  check step plus the `edge-function` and `migrations` jobs.

### 2026-10-07 — Wayfinding: the 🚩, signposts, "where to next?" (#75 item 6)
Roadmap item 6, so a kid can always answer "where am I?" and "where do I
go?". All of it comes from one pure module, `lib/wayfinding.ts`, worked out
from the story flags and the maps, so it stays right when a map is repainted.
- **The next goal** (`nextObjective`): Numbria's crystal first (no gate);
  then a crystal whose warden key you hold; else the key for the first
  crystal still locked (the warden's zone); at four crystals the Crystal
  Spire; after it, "Explore Lumina". A test walks it from a fresh save to the
  end: 9 goals, each one the hero can do right then, no repeats.
- **Directions** (`routeSteps` / `goalDirections`): the fewest-zones route
  (`routeTo`), told as "Go north to Lumina Field, then take the west path to
  Numbria." On the overworld the bearing (8-way `compass`) is measured from
  where you stand, or from where the last exit set you down; between zones it
  names the edge the path leaves by (`exitSide`). Zones that read "the …"
  mid-sentence set `ZoneDef.the` (Woods, Depths, Shrine).
- **World map** (menu): a 🚩 on the place to head for (the place a zone is
  reached through, e.g. Lumina Field for Numbria), "🚩 Next: <goal>" and the
  route under the ⭐ caption, 🚩 beside the place in the list; the ⭐ steps
  aside when both are on one place. After the Spire: a 🎉 line, no flag.
- **Guides** (`WorldNpcDef.guide`): Elder Lumen, Grandmother Wick and Scout
  Tamsin end their talk with "Where to next? <why> <route from where they
  stand>".
- **Signposts** (`WorldNpcDef.signpost`): two on Dawnreach, beside the
  crossroads on the long east–west road, off the road. They read out every
  place by direction (arrow per line, clockwise from north, nearest first),
  then "🚩 Next: …" with the way from the sign. Pixel-art sign sprite
  (`tiles.signpost`, a one-frame still prop in the sprite manifest:
  `python3 tools/assets/build.py signpost`). `DialogueOverlay` appends
  `wayfindingLines` and keeps line breaks (`whitespace-pre-line`).
- **Bench:** `__bench.state().talks` lists who the hero talked to.
- 430 tests green (+28); lint + build clean. Checked in headless Chromium:
  map, flag and route at five story stages (desktop + phone menu), the guide
  and signpost conversations, both signposts drawn at their crossroads and
  talked to by walking into them.

### 2026-10-07 — Maps painted in Tiled: Dawnreach's terrain (#75 item 5)
Big maps are now edited in **Tiled** (the free map editor) instead of typed
as ASCII — roadmap item 5, decision 7 taken (Tiled for the world map, ASCII
for smaller maps). Guide: `docs/MAP-AUTHORING.md`.
- **Files:** `src/content/maps/dawnreach.tmj` (the map, one `terrain` tile
  layer) and `legend.tsj` + `legend.png` (the tileset: one tile per map
  character — the game's own art with the character in the corner, its
  `char` and `meaning` as tile properties; hidden passages dashed).
- **Loading:** `tiledRows` (`lib/tiled.ts`) turns the map back into the usual
  ASCII rows at load, so every zone invariant runs on it unchanged. Strict on
  purpose: an empty cell, a flipped tile, a compressed layer, a second
  tileset or a missing `terrain` layer fails with where and why. Places,
  exits, fog, NPCs and enemies stay in zones.ts.
- **Tools:** `tools/tiled/tiled.py` — `legend` (rebuilds the tileset;
  append-only, refuses to change an existing tile's character), `from-ascii`,
  `to-ascii` (to read a map diff).
- **Migration:** Dawnreach's 48 rows → `.tmj` → rows round-trip identical; an
  independent Tiled parser (`pytiled_parser`) reads both files.
- **Bench:** the `diff` masks now cover shoreline corner tiles (edge
  blending animates water half a tile off the water cells) and drifting fog
  banks, so coast and fog screens no longer "differ" from animation alone.
- 402 tests green (+5: legend = LEGEND_CHARS, round trip, Dawnreach loads,
  9 bad-map cases); lint + build clean. Every zone screen unchanged (only
  animated water pixels differed — hence the bench fix).
### 2026-10-07 — Merge main into the battle branch: battle items ported, issue numbers moved
Brought `main` (overworld Phases 0–1, edge blending, village expansion,
portraits, giant Umbra) into the battle-system branch.
- **Battle items ported to the refactored arena:** Sunseed Snack, Turbo
  Coil, Mirror Charm, Focus Tea and Lucky Clover work as on `main`. The Mirror
  Charm moved into the pure `resolveEnemyAttack` (since folded into main's `resolveEnemyTurn`, #99) (`mirrored` /
  `enemyShielded` → `reflected`, `shieldBroke`, `defeated`): it blocks the blow
  and bounces it back, a shield takes the bounce instead, a bounce that
  finishes the enemy is a win, and a healer mends from its HP after the
  bounce (tested). A Mirror Charm takes the blow before a Guard, so the Guard
  stays up for the next one. Focus Tea doubles an Attack after the streak
  bonus and keeps its focus while the enemy is shielded. A Lucky Clover
  doubles the coins after the first-win bonus (🍀 on the victory panel). Boss
  enrage now also triggers on bounced damage (`checkBossPhase`).
- **Portraits:** the hero status panel uses `CharacterPortrait` (from
  `main`); the menu keeps the Battle friends row.
- **Sprites:** `battle_frames` honours both `ch.giant` (Umbra, from `main`)
  and `ch.battle_poses` (Ember, from this branch); every sheet rebuilds
  byte-identical.
- `bench/world.tsx` passes the new `skillLevels` prop.
- **Numbers:** `main` already used issues #75–#80/#82 and TC-316–385, so this
  branch's battle issues moved #75–#81 → #83–#89 and its test cases
  TC-316–393 → TC-386–463 (moved again by the #99 port below: **#92–#98**,
  **TC-452–529**).

### 2026-10-07 — Edge-blending review fixes: no vanishing roads, sheets on demand (#71b)
`/saas-code-review` + `/saas-ux-review` of the edge blending; all 3 findings fixed:
- **Roads vanished until the blend sheet loaded (medium):** cells whose four
  corners blend skip their base tile — but before the zone's blend sheet
  arrived nothing covered them, so a one-tile road (all such cells) showed as
  bare ground for seconds on a slow first load. `WorldCanvas` now waits for
  `getSprite(blendKey).loaded` before skipping or drawing corner tiles: square
  edges first, rounded once the sheet lands.
- **Sheets on demand (low):** blend sheets load per zone as it's built — its
  own plus its neighbours' (`blendSheetsFor` / `ensureBlendSheets`,
  `worldSprites.ts`) — instead of all 13 (~265 KB) on first entry.
- **`blendPairFrame` throws on a wrong pair (low)** instead of silently
  returning another pair's tile.
- Verified in headless Chromium with the blend sheets delayed: the road shows
  (square) before they arrive and rounded after; Dawnreach fetches 9 sheets,
  the Village 2; every zone screen unchanged; the Phase 1 walk-through passes.
- 397 tests green (+2); lint + build clean.

### 2026-10-06 — Rounded coasts, beaches and roads: edge blending (#75 item 3, #71b)
Water, beaches and roads no longer meet in hard squares — the last part of
roadmap item 3 ("no square-edged water") and ISSUES #71b.
- **How:** a "dual grid". Each cell has a blend class — water < sand < ground
  < path (`blendClass`); buildings have none and keep square walls. Wherever
  classes meet at a tile corner, the renderer draws a 32px tile centred on
  that corner (`blendLayer`, `lib/terrain.ts`, worked out once per zone; drawn
  between the base tiles and the overlays). Two-class corners (almost all)
  draw ONE ready-made opaque pair tile; three- or four-class corners add the
  higher classes' rounded shapes on top. Shapes get a foam line on water and
  a darker rim on land. Cells whose four corners all blend skip their (hidden)
  base tile.
- **Art:** `tools/assets/tiles.py` `blend_sheet` writes
  `/tiles/<zone>-blend.png` per zone (180 frames, 16×12) from each zone's own
  textures (smoothstep-rounded shapes); `python3 tools/assets/build.py blend`
  writes only these — no existing file changed. Spire floors don't blend
  (their `~` are pits).
- **Checked (headless Chromium):** all 46 zone screens + Spire floors
  reviewed before/after; Spire floors pixel-identical. Frame rate (software GL,
  same machine, alternating runs): stress map unchanged (59.7 / 31.3 fps vs
  59.4 / 30.2); walking Dawnreach ~5% lower unthrottled and ~12% lower at 4×
  CPU throttle (pair tiles + the hidden-cell skip halved the first version's
  cost). The Phase 1 walk-through still passes.
- 395 tests green (+9); lint + build clean.

### 2026-10-06 — Phase 1 review fixes: map, toasts, arrival lock (#75)
`/saas-code-review` (2 findings) and `/saas-ux-review` (6 findings) of Phase 1;
all fixed:
- **World map tells places apart:** each place has its own emoji
  (`PLACE_EMOJI`, `lib/worldMap.ts`) on the map and beside its name in the
  list; inside a place the ⭐ perches above its emoji; a legend explains the
  fog square while any fog is left. The caption is "You're here: <name>" /
  "You're out on Dawnreach" (`mapCaption` — no articles to get wrong); list
  emoji are hidden from screen readers.
- **The ⭐ is where you are:** pausing (menu, dialogue, cutscene) now saves
  the hero's real position — walking only saved every 1.5 s, so the star (and
  a refresh) could be ~8 tiles behind.
- **Reduced motion walks smoothly again:** the arrival lock follows the link
  (`needsArrivalLock`, `lib/transition.ts`): only into/out of places, never
  between edge-joined screens — reduced motion had locked every edge cut.
- **Toasts:** time on screen follows the text (`toastMs`, `lib/toast.ts`: ~2
  words a second, 2.5–8 s), and a new toast replaces the old timer (an earlier
  toast's timer used to hide a newer one early). The fog hint is shorter: "Too
  foggy to pass! Restore a crystal to clear it." (~6.5 s).
- **Place names** on the overworld use 11 px like building names (were 9 px —
  ~4.6 px on a phone). **Menu:** a ✕ "Back to the world" button in the header
  (44 px), so the way out never scrolls away.
- Bench: `__bench.pause(on)` pauses the world like a menu does.
- 386 tests green (+9); lint + build clean. Verified in headless Chromium: map
  in four situations, the real menu at 1024 px and 375 px, labels, pause
  saving and reduced-motion walking (both fail on the previous code).

### 2026-10-06 — Overworld Phase 1: the Dawnreach vertical slice (#75, #77)
The world gets its first real overworld: walk out of Lumina Village onto a
64×48 map of Dawnreach and into every old place from there.
- **Zone kinds** (`ZoneDef.kind`, `ZONE_KINDS`): overworld / town / field /
  dungeon / shrine. The kind picks the transition and the music.
- **Places** (`ZoneDef.places`, legend `P`): one-tile icons on the overworld
  that act as exits (town, hamlet, forest, cave, shrine, coast, grove, and the
  Spire's tower). New legend chars: `^` mountain (solid), `:` sand. Every gate
  out of a place lands right beside its own icon.
- **Transitions** (`transitionFor`, `lib/transition.ts`): screens joined edge
  to edge still slide; going into or out of a place fades through black
  (`FADE_MS`); reduced motion cuts. Each fade step waits for the black
  overlay's own `transitionend` (a safety timeout unfreezes the hero if one
  is lost) — fixed timers dropped the old screen at 11% black on a 4×-slowed
  CPU, so the new zone popped in. After a fade or cut the hero waits for the
  keys to be released, so a held key can't walk straight back out.
- **Fog banks** (`ZoneDef.fogs`, `FogDef`, `fogAt`): drifting fog blocks a
  rectangle of the map until any of its `liftedBy` flags is set. The first
  one seals the **Shrine of First Light** pocket until any crystal is
  restored (`ANY_CRYSTAL`); bumping it shows a hint toast.
  (Item 7, 2026-10-07: six banks — the shrine road and the Spire ring on any
  crystal, plus one pocket per crystal — each `guards` something, and lifts on
  screen with a camera pan; see the feature log.)
- **Content:** `dawnreach` (overworld: the Village, Lumina Field, the Woods,
  the Depths cave, the Grove, the Spire, the Coast and the shrine; a road
  network; 5 roaming critters; Scout Tamsin with directions) and
  `dawn-shrine` (Old Wren, the shrine keeper — field spells come in Phase 2).
  Every old link out of the Village, Field, Woods, Coast, Depths, Grove and
  Spire onto another place now goes through Dawnreach instead; zone-to-zone
  links inside a region (Field ↔ crystal zones, Woods ↔ Depths) are unchanged.
  A first-visit cutscene (`DAWNREACH_PANELS`) plays after the Grove's.
- **World map** (menu): `WorldMapPanel` draws Dawnreach small with fog, places
  and a pulsing ⭐ "you are here" (`lib/worldMap.ts`: `whereOnMap` follows
  exits back to the nearest place for zones not on the map yet), plus a 🚩 on
  the next goal and the way there (`lib/wayfinding.ts`, item 6).
- **Music by kind** (`ZONE_KIND_TRACK`, `lib/audio.ts`): new `town`, `cave`
  and `shrine` loops; the overworld and fields keep the overworld theme.
- **Art:** `/tiles/overworld.png` (mountain, sand, 2-frame fog, place icons),
  tilesets + backdrops for both new zones, two NPC sprites
  (`tools/assets`: targeted `overworld` build; existing files untouched).
- **Bench cleanup (#77, all four):** Vite stderr inherited, Vite killed if it
  never starts, `diff` exits 1 on a difference, the frame sampler is capped
  with a running max. The bench can also follow exits between zones and
  report its zone/position (`__bench.state()`), and takes `flags=`.
- No save change: places are zones, so positions save as before.
- **Verified in headless Chromium:** all 33 existing zone screens + Spire
  floors pixel-identical to main; the Village fade / arrival lock / walk back
  out, fog block + lift and shrine entry walked on the bench; Dawnreach walks
  at the same frame rate as the stress map (Phase 1 adds no cost); the world
  map panel in four situations.
- 377 tests green (354 on main before this); lint + build clean.

### 2026-10-06 — CI: lint + test + build on every PR (#81)
First CI for the repo: `.github/workflows/ci.yml` (repo root) runs `npm ci`,
`npm run lint`, `npm test` and `npm run build` in `hazel-game/` on every pull
request, every push to `main`, and on demand. Node 22 (Vite 8 needs
^20.19 || >=22.12), npm cache, `contents: read` only, checkout without
persisted credentials, a newer push cancels the outdated run. No `paths:`
filter on purpose — a required check must report on every PR. The job's check
is named `test`: add it to the `main` ruleset as a required check (source:
GitHub Actions) once it has run once. Verified locally in a clean worktree
(fresh `npm ci`, no `.env`): lint clean, 335 tests, build clean.

### 2026-10-05 — Phase 0 code-review fixes (#75)
`/saas-code-review` of Phase 0 found no player-facing bugs; two fixes ahead of
Phase 1, the rest logged:
- **Exit check ready for multi-gate towns:** the #76 test is now a pure
  helper, `edgeLinkProblem` (`lib/transition.ts`). It checks only the way back
  you'd actually take (the return exit nearest where you land) and skips links
  that fade (place entrances, gates that lead out beside an overworld icon), so
  a town with several gates onto the overworld no longer trips it. Still fails
  on the pre-fix Field/Village map (verified).
- **Camera zoom:** new `worldView` (`lib/camera.ts`) gives the camera's view in
  world pixels; `WorldCanvas` uses it for BOTH the terrain culling and the
  camera's edge clamp (the clamp had the same 1:1 assumption). Verified with a
  temporary 2× zoom-out: edge-to-edge drawing and correct clamping, vs. bare
  edges and an off-centre town before.
- **Logged:** ISSUES #77 (bench cleanup, Phase 1) and #78 (Spire candle-light
  ignores the camera — fix with real dungeons, Phase 2).
- 335 tests green (was 328: +5 transition, +2 camera); lint + build clean.
- **Second review pass (1 low finding, fixed):** the zones.test exit check
  now collects every `edgeLinkProblem` and asserts the list is empty, so a
  failure prints every broken link with its full reason (it used to stop at
  the first one, with the reason cut off by Vitest).

### 2026-10-05 — Overworld Phase 0: big-map renderer + Field/Village exit fix (#75, #76)
- **Renderer:** `WorldCanvas` no longer creates one KaPlay object per tile.
  New pure `lib/terrain.ts` works out every cell's base + overlay frames once
  per zone (`terrainLayers` — the same rules the old loop used: ground
  variants, paths/exits, water, scenery/flower/exit overlays, walls/facades/
  interiors in each building's style), and a single `terrain` object draws
  only the cells in view each frame (`visibleRange`). Water animates from the
  clock (`waterFrame`, `WATER_FPS` in `content/tiles.ts`; the unused tileset
  `water` sprite anims were removed). Each building's roof is now one object.
  Props that change on their own and all characters are unchanged.
- **Measured** (`bench/`, headless Chromium, software GL): 160×112 map 3.2 →
  60 fps, and 0.5 → 37 fps at 4× CPU throttle; Lumina Village 10.5 → 39 fps
  at 4×; load hitch 1.4 s → 0.17 s. All 18 zone screens + 5 Spire floors are
  pixel-identical to the old renderer outside animated tiles/idle cycles.
- **#76 fixed:** the Field's road to the Village leaves from its south edge
  (2–3, 13) and the Village's north exit lands at the Field's bottom-left
  (3, 12) — no more walking north both ways. New zones.test invariant: every
  edge exit lands near the opposite edge, and the way back is on the opposite
  edge.
- **Bench** (`hazel-game/bench/`, dev-only, not in the app build):
  `world.html`/`world.tsx` mount the real `WorldCanvas` on a real zone or a
  generated 160×112 overworld-like map; `run-world-bench.cjs` runs fps /
  shots / diff via Playwright.
- 328 tests green (was 301: +26 terrain, +1 exits); lint + build clean.

### 2026-10-05 — Overworld decisions recorded (docs only, #75)
Three roadmap decisions made: retire Lumina Field as a hub, an inn in every
town (reverses #73), and pause `ROADMAP-4X.md` Wave 1 until Dawnreach exists.
Recorded in this file's Decisions section, `ROADMAP-OVERWORLD.md` (§2.4,
§3.5, §7, §8), `ROADMAP-4X.md` (header + Wave 1 marked paused), `STORY.md`
§8 and ISSUES #73/#75. Building happens in overworld Phase 2. Doc-only.

### 2026-10-04 — World names chosen (docs only, #75)
The world stays **Lumina**; its home continent is **Dawnreach**, the far
continent (Act III) **Taleshore**, the inner sea of islands (Act II) **the
Silver Shallows**, and the open sea between the continents **the Starfall
Sea** (already used by STORY-4X). Recorded in `ROADMAP-OVERWORLD.md` (§2.1,
§3, §8 decision 2 closed), `STORY.md` §8 and `STORY-4X.md` (header note +
Act III premise). Doc-only.

### 2026-10-04 — Overworld roadmap (docs only, #75)
New `docs/ROADMAP-OVERWORLD.md`: analysis of why the world feels small (18
screens, two hubs with spokes, 8 of 11 zones dead ends, one scale only,
Field ↔ Village both north exits — logged as #76) plus a phased plan for a
DQ3/FF2-style overworld — enterable places, two continents + islands, a
travel ladder (walk → boat → Ember flight → descend), fog banks that lift per
crystal, field spells at shrines, generalized dungeons — with a ranked work
list and open decisions. Key engineering risk: `WorldCanvas` makes one KaPlay
object per tile, so chunked rendering comes first. Re-sequences
`ROADMAP-4X.md` (header note added); `STORY.md` §8 points at it. World atlas
image at `docs/images/lumina-world-atlas.png`. Doc-only.

### 2026-10-01 — Review fixes for the village expansion (#80)
Code review of the expansion; all five findings fixed in `BattleArena`:
- Focus Tea is no longer wasted on a shielded foe — the focus waits for the
  next swing while the shield is up.
- Boss enrage banners now fire from any damage (new `checkBossPhase`, shared
  by attacks and Mirror Charm bounces), so the phase never desyncs.
- Mirror Charm vs a shielded foe: the bounced hit shatters the shield (any
  landed hit does), instead of bypassing it.
- Item buffs (mirror / focus / clover) reset per enemy alongside the shield.
- `secretFlag` moved to `zones.ts`, breaking the secrets.ts ↔ quests.ts
  import cycle (`secrets.ts` re-exports it).
320 tests green; lint + build clean; mocked battle replayed in headless Chromium.

### 2026-10-01 — Village expansion: bigger towns, side quests, secrets, new shops (#80)
The five main towns grew, with more to do in each.
- **Bigger maps (`zones.ts`):** Lumina Village 44→66 wide (east district:
  Town Hall, Clover's Market, Dot's Bakery, Nib's House, a hedge garden);
  Numbria 14→28 rows (south: Schoolhouse, Chai's Tea Room, Sundial House);
  Verdara + Gearfall 22→44 wide (east districts; Gearfall also a Clockwork
  Plaza with the Clocktower); Chromaria 14→28 rows (south: Mirror Hall,
  Grand Gallery, Music House). Maps only grew right/down, so every chest,
  gate, key gate, save crystal and spawn keeps its coordinates (old saves
  and quests stay valid). Fiend areas stay sealed off from the new land.
  The village's east exit moved to col 65 (the Coast's spawn back updated).
- **Secrets (`ZoneDef.secrets`, new `content/secrets.ts`):** 15 secrets (3 per
  town). On a solid tile (shelf, bed, crate, fountain) you bump it; on open
  ground you step on it. Rewards: coins, items, or a quest item. Found once
  (`secret:<id>` flag). `WorldCanvas` draws a faint ✦ twinkle over unfound
  ones (under roofs) and calls `onSecret`; `WorldScreen` claims it and shows
  a "Secret found!" card. New map char **`H`** = hidden passage: drawn as
  solid scenery but walkable for the hero (wanderers treat it as solid).
- **21 new townsfolk (`npcs.ts`)** with generated sprites (`characters.py`
  NPCS): five merchants, ten side-quest givers, and villagers whose lines
  hint at the secrets.
- **10 side quests (`quests.ts`):** two per town, tagged `side: true`. New
  `secretStep` (find listed secrets; hint names what's still hidden),
  `takesItems` (quest items handed back on completion) and `reward.items`.
  Mix: find-the-secret, delivery chains, talk chains, defeat + report.
- **5 new shops + items (`items.ts`):** Clover's Market (🍀 Lucky Clover —
  2× coins this battle), Chai's Tea Room (🍵 Focus Tea — next Attack 2×),
  Sunseed Stand (🌻 Sunseed Snack — +30 HP, +1 ◆), Coil & Spring (🌀 Turbo
  Coil — fill ◆), Mirror Hall (🪞 Mirror Charm — bounce the next hit back),
  each with a badge. Effects in `BattleArena` (`mirrored`/`focused`/`lucky`
  state); a bounced hit can win the battle.
- **Menu:** secrets found here / across Lumina, side-quest tags, and the hero
  card now uses the sprite.
- Tests: new secrets.test; side-quest flows in quests.test; items/zones tests
  updated. 320 tests green; lint + build clean. Played in headless Chromium
  (fake auth + seeded save): every new district, the hedge-garden passage,
  the fountain secret, Glint's counter, and a battle using Mirror Charm,
  Focus Tea and Lucky Clover.

### 2026-10-01 — Sprite portraits everywhere + Umbra redesign (#79)
- `components/CharacterPortrait.tsx`: animated sprite portrait for UI panels
  (battle view, else the world view facing the player; emoji fallback). Used
  by the dialogue box, Sage screen, HUD + menu Ember and the battle name tag.
- **Umbra:** new `giant` size tier in the generator (64px world, 96px battle;
  bosses are 48). Redrawn as an armoured purple shadow-lord in a white
  war-helm with a violet energy blade (an original design, not a copy of any
  film character). He stands on the throne floor (no hover) and looms
  oversized over the Spire throne-hall panels.

### 2026-09-28 — Speed-trigger review fixes: stuck card, pool race, Flee, Pip's peek (#98)
From a code review of #97:
- **Stuck question (medium):** the battle's question card was keyed by
  `id + qIndex + spellIdx`; `qIndex` doesn't move while the harder pool
  serves, so a short pool could repeat a key and leave an answered card on
  screen. `ask()` now stamps every question turn with its own `seq`
  (`qKey = id:seq`).
- **Pool race / failure:** only the pool fetched for the *current* boost is
  kept (a late, easier one is dropped, and nothing lands after the arena
  closes — `live` ref). The ⚡ banner + badge now wait for the harder
  questions; if the fetch fails or comes back empty the banner says "Your
  level goes up to N after this battle" (the boost still saves).
- **Flee keeps the boost:** Flee saves `skillAfterBattle(current, [], boost)`.
- **Pip's peek doesn't count:** a question with a crossed-out answer is
  treated like a Hint Feather (`helped` ref → `ms = Infinity`), so it breaks
  the quick run.
- 349 tests green; lint + build clean. 15 checks in headless Chromium: the
  normal boost, a one-question pool asked 4× without sticking, a failed pool,
  Flee with/without a boost, and Pip's peek breaking the run.

### 2026-09-26 — Difficulty follows the question level + a speed trigger; XP no longer scales anything (#97)
Revises #96: leveling up (XP) should not make the game harder — answering
well and fast should.
- **Removed** `lib/growth.ts` (XP-based `growthSteps` / `challengeLevel`).
  XP / player level is back to progress + power-ups only.
- **Battles use the question level:** `spawnEnemy(…, age, skillLevels)` sets
  the enemy (and so its battle questions, HP, coins) from the player's
  question level for the enemy's topic (`skillLevelFor` — the age baseline
  if they've never played it). `WorldScreen` + `WorldCanvas` pass
  `profile.skillLevels`. The Spire asks each topic at the player's level for
  that topic. (Before #96 battles used age only, per #32.)
- **Speed trigger (`lib/battleTurn.ts`, tested):** answers are timed from the
  question appearing; `fastAnswerMs(age)` = half the age countdown (≈9.5s at
  9, 12s at 6). `speedStep` counts quick correct answers in a row — a slow,
  wrong or Hint-Feathered answer resets it; `FAST_STREAK` = 5 → the battle's
  question level rises by 1 at once (`MAX_SPEED_BOOST` = 2 per battle): a
  "⚡ So quick! The questions just got harder — level 4 → 5" banner, a ⚡+1
  badge by the enemy's level, and a harder pool fetched and served for the
  rest of the fight. `skillAfterBattle` saves it: the usual battle ramp
  (never lowers), but never below `current + boost`.
- **Countdown:** `defendTimeMs(age, mercy)` — age only again.
- 348 tests green; lint + build clean. Verified in headless Chromium (fake
  clock): 5 quick correct → banner + ⚡+1 + level-5 pool requested and served
  (L4 ×5 → L5 after); battle end saves math 4 → 6; slow (12s) answers and a
  hinted answer don't trigger it; 9000 XP meets the same enemy as 0 XP; math
  level 7 → Count Bat Lv 7 with level-7 questions.

### 2026-09-26 — Age-based growth rule, age-based countdown, timer setting (#96)
*(The XP-based growth part was reverted by #97 above.)*
- **One growth rule (`lib/growth.ts`, tested):** age (from the sign-up birth
  date, recomputed so it rises each birthday) is the baseline;
  `growthSteps(level)` adds +1 per 5 player levels (max +3) as the kid levels
  up; `challengeLevel(age, level)` = `ageToStartLevel(age)` + steps, 1–10;
  `playerStanding(profile)` → `{ age, level }`.
- **Enemies + battle questions now grow with the player:** `spawnEnemy(…,
  age, playerLevel)` uses `challengeLevel` (was age only — revises #32's
  "battles scale to age, not progress"). `WorldScreen` (prefetch) and
  `WorldCanvas` (spawn) pass the same level so prefetched pools match. The
  Spire's floor level uses it too. Quiz / gates / chests keep their per-topic
  skill ramp (also age-based).
- **Countdown by age + level:** `defendTimeMs(age, level, mercy)` — 25s at 5,
  −1.5s per year (≈24s at 6, 19s at 9, 15s at 12), −1s per growth step,
  clamped 10–25s, +5s under mercy. Replaces the flat 15s.
- **Timer setting:** `SaveData.defendTimer` (per player, synced with the save;
  default on; older saves default on) toggled in 📜 Menu → ⚔️ Battle ("Take
  as long as you need" when off). Off → defend questions show the plain
  header and never time out.
- 349 tests green (growth.test, enemies scaling, save field, age-based
  `defendTimeMs`); lint + build clean. Verified in headless Chromium: 6y/9y/12y
  start at 24/19/15s; a 9y at Lv 16 gets 16s and meets Lv 7 enemies/questions
  (Lv 4 at Lv 1); timer off = no countdown and no timeout after 60s; the menu
  toggle flips it.

### 2026-09-26 — Defend countdown is a flat 15 seconds (#95 follow-up)
The defend clock no longer scales with question length: every defend
question gets `DEFEND_MS` = 15s (10s was considered and rejected — too fast
for young kids still learning to read), still +5s under mercy and paused while
the page is hidden. `defendTimeMs(mercy)` lost its question argument. 338
tests green; lint + build clean; the countdown starts at 15s in headless
Chromium.

### 2026-09-26 — Timed defend questions (#95)
Resolves the STORY-4X §12 "timer" decision for defending: the enemy's blow
now comes on a clock.
- **`DefendTimer`** (`features/battle/`): replaces the defend header with the
  same prompt plus a "⏳ 16s" pill and a shrinking bar — amber, then red and
  pulsing for the last 5s, a soft `select` tick for the last 3; freezes on
  "✓ In time!" the moment an answer is picked. Time only runs while the page
  is visible (switching tabs / locking the phone pauses it). `onExpire` fires
  once.
- **Timing (`lib/battleTurn.ts` `defendTimeMs`):** 8s + 350ms per word of the
  question and options, clamped 15–30s, +5s under mercy.
- **Running out** (`defendTimedOut`): the blow lands exactly as for a wrong
  answer — wrong SFX, streak broken, the question queued for the Library
  (`picked: -1`; the Library never displays the pick) — with "⏰ Time's up!"
  in front of the result. Guard / Rainbow Ward still block a timed-out blow.
  Attack, spell, companion and pair questions stay untimed.
- Layout: the timer bar fits on a 360×640 phone (arena padding and the
  QuestionCard padding trimmed on phones to make room).
- 339 tests green (3 new `defendTimeMs` tests); lint + build clean. Verified
  in headless Chromium with a fake clock: countdown shown only on defend
  questions and counting down, timeout → "⏰ Time's up!" + HP loss, 3 ticks
  then wrong/hit sounds, answering freezes it (40s later still waiting on
  Go!), paused while hidden (10s hidden = 0s lost), fits at 360×640.

### 2026-09-26 — Battle UX pass: fits on phones, bigger touch targets, readable hints (#94)
From a UX review at phone widths (measured in headless Chromium). Before: on a
390×844 phone "Go!" sat below the fold after every answer; on 390×667 answers
3–4 were hidden before answering; the command menu cut off Flee.
- **Fits on phones:** the arena's floor shrinks on phones (`min-h-[112px]`,
  tighter padding — `flex-1` still grows it into spare height); sub-menus
  (Swap / Items / Companion / Spells, `SUBMENU`) scroll inside the panel on
  phones with a sticky ← Back; `QuestionCard` scrolls Continue into view
  (`block: 'nearest'`) once an answer is picked. The root uses
  `overflow: clip` (hidden as fallback) so focusing/scrolling to a button can
  never slide the arena sideways.
- **Touch targets ≥ 44px:** answer options, crossed-out slots, the Hint
  Feather button (was 16px tall) and ← Back.
- **Readable hints:** every 10–11px / 50%-opacity hint is now 12px at 70%;
  disabled buttons fade to 60% (not 40%) and say why — "Need N more ◆" /
  "Getting ready…" (`NeedMore`).
- **Status panels:** tighter on phones; names truncate instead of wrapping
  "Lv 5" onto two lines.
- **Copy:** companions gain `perkLine` ("Right answer: +1◆ toward a Pair
  Attack.") replacing the stitched "A right answer also: …"; the command
  header is "Your move!" on phones.
- 336 tests green; lint + build clean. 36 layout checks pass in headless
  Chromium at 360×640, 390×667, 390×844 and 900×760 (command menu + all
  answers on screen, Go! on screen after answering, ≥44px targets, one-line
  names, Back visible, no sideways shift).

### 2026-09-26 — Review fixes: saved HP after a healing finisher, timers cancelled on exit (#93)
From a SaaS code review of the companion/mercy commit (security came up clean:
`saves` RLS limits every row to its owner; `companionId` is re-validated on load).
- **Medium:** `victory()` saved the render-captured `playerHp`, so when Wisp's
  Glimmer / Starlight Chorus landed the killing blow its heal (already in the
  store) was dropped from the saved HP. `victory()` and Flee now read
  `useBattleStore.getState().playerHp`.
- **Low:** fire-and-forget battle timers (hit landings, pop-ups, delayed SFX,
  fireball cleanup) now go through a tracked `later()` that is cleared on
  unmount — no stray impact/heal sound after the arena closes. Effect-owned
  and banner timers already cleaned up.
- 336 tests green; lint + build clean. Verified in headless Chromium: a Wisp
  finisher heals 92 → 112 and the save records 112; unmounting mid-attack
  plays no landing sound and logs no errors.

### 2026-09-26 — Companion pick survives reloads; mercy = easier questions only (#93 follow-up)
- **Companion persists:** the 🔄 Swap pick moved from `battleStore` into the
  save (`SaveData.companionId`, default `'ember'`). Additive + defaulted in
  `normalizeSave` (older saves and unknown ids → Ember), like #73's item
  slots — no `SAVE_VERSION` bump. Syncs to Supabase with the rest of the save.
- **Mercy reworked:** still session-only (a reload resets it) and still
  kicks in after 2 losses to the same enemy, but it now ONLY makes the
  questions one level easier — the ×0.75 enemy-damage reduction is gone
  (`mercyFor` → `{ levelDrop }`; `resolveEnemyAttack` lost `attackScale`).
  Banner: "Tough one last time? …'s questions will be a little easier now."
- 336 tests green (new save.test for the companion field; the softer-hits
  test removed); lint + build clean. Verified in headless Chromium: swap is
  written to the save, a save round-tripped through JSON + `normalizeSave`
  starts with Pip, mercy drops the question level with identical damage.

### 2026-09-26 — Battle round 3: party + free swap, power moves, streaks, mercy, rewards (#93)
- **Companions (`content/companion.ts`, rewritten as a registry):** Ember
  (Striker, +1◆), **Pip** (Helper — Slingshot; a correct strike crosses out a
  wrong answer on the *next* question) and **Wisp** (Healer — Glimmer mends 20
  HP). Pip joins on finishing "Pip's Lucky Marble", Wisp on "The Darkened
  Moonwell" (derived from quest flags — no save change; those quests now end
  with a recruit line). New Pair Attacks: Marble Volley (Pip, 2◆ ×1.8) and
  Starlight Chorus (Wisp, 2◆ ×1.6 + heals 30). Pip/Wisp got battle sheets
  (`BATTLE_COMPANIONS` in characters.py). `battleMath` generalised to
  `companionAttackDamage(correct, power)` / `pairDamage(…, companionPower, …)`.
- **🔄 Swap** — a free action: pick a companion, they drop in, and it's still
  your move. Locked companions show how to recruit them. The pick persists
  across fights this session (`battleStore.companionId`). The 📜 menu lists
  "Battle friends".
- **Pure turn rules (`lib/battleTurn.ts`, tested):** `resolveHeroHit`,
  `resolveEnemyAttack`, `nextIntent`, `powerMoveName`, `streakMultiplier`,
  `mercyFor`, `victoryCoins`, `rollDrop`.
- **#70 fixed:** HP is written to the store immediately; only the displayed
  HP waits for the blow to land (`commitHp`), so fast taps act on true HP.
- **Telegraphed power moves:** enemies sometimes spend a turn gathering power
  (bosses every 3rd turn, others 20%) — banner, glow, "💢 Zero Crush next!",
  a pulsing Guard button — then hit 2× next turn unless guarded. Every boss
  has a named signature move.
- **Weakness:** a Sage spell whose topic matches the enemy's is ×1.5 ("Super
  effective!", tagged in the Spellbook).
- **Streaks:** correct answers in a row (any question) — ×1.2 damage at 3,
  ×1.4 at 5, with a float, chime, 🔥 badge and a companion cheer.
- **Mercy:** after 2 losses to the same enemy (this session) it hits ×0.75 and
  asks questions one level easier, with a 💛 banner. Locked per encounter so
  recording a loss can't re-key the question pool mid-defeat.
- **Rewards:** first win over an enemy kind pays +50% coins; enemies may drop
  a potion / hint / spark, bosses always a Honey Elixir.
- **Misses teach:** a wrong answer now shows "✅ The answer is: …" and the
  explanation under "Here's why:" (explanations already showed — now clearer).
  `QuestionCard` gains `preHidden` (Pip's peek); a Hint Feather still works
  after a peek and always leaves one wrong option.
- **Reduced motion:** with prefers-reduced-motion, no lunges/dives/knockback/
  idle bobbing/fireballs, confetti off, floats fade in place.
- **SFX:** `swap`, `charge`, `streak` (generated, `tools/assets/audio.py`).
- 336 tests green (was 316); lint + build clean. 23 scripted checks in
  headless Chromium (swap keeps the turn, peek, Wisp mend, streak, the #70
  race, boss charge → Guard block, super effective, mercy level drop, first-win
  + drop, reduced motion). The run caught and fixed a stale-closure bug in
  Pip's peek and screen-reader-visible hidden labels. See ISSUES #93.

### 2026-09-26 — Ember animations: attack, fire breath, pair choreography, cheer (#92 follow-up)
- **Ember's own battle sheet** (`tools/assets/characters.py`): new `Pose`
  fields `mouth` (open / puff / breath), `rear` (head lift) and `happy` (^ ^
  eyes) drive `EMBER_BATTLE_POSES` — a clear wind-up → open-mouthed lunge
  attack, a `breath` clip (inhale → fire cone ×2) and a `cheer` hop.
  `Char.battle_poses` / `battle_anims` let one character override the shared
  battle sheet. New FX sprite `fx-fireball` (4-frame flicker). Every other
  sprite re-renders byte-identical.
- **Choreography** (`features/battle/choreography.ts`, pure + tested): per-move
  Framer keyframes for hero (`lunge` / `comet` / `duet`) and Ember (`lunge` /
  `breath` / `toss` / `duet`), when each blow lands (`hitMs`), fireball volleys
  timed so the last one lands on the hit, and `fitReach` — comet/duet dives are
  rescaled to the measured hero↔enemy gap so they reach the enemy on any screen.
  `dealHeroDamage` takes a `Choreo` (replacing `actor`); `perform()` starts it.
- **In the arena:** Ember now faces the enemy (was facing away); Ember's
  Breath is performed by Ember (inhale + 3 fireballs); Twin Strike = joint
  lunge, Blazing Comet = Ember tosses the hero who crashes down in a fireball,
  Dragon Duet = both rise and dive behind a volley. The enemy flinches and is
  knocked back when a blow *lands* (`enemyHit`), not when the attacker sets off.
  On victory Ember cheers (the egg wobbles).
- **Fix:** Ember's stage is locked per fight — a first win used to hatch the
  egg on the victory panel (and a Fiend win grew Ember there), spoiling the
  world cutscene that reveals it.
- 316 tests green (was 310); lint + build clean. Verified in headless Chromium
  (frame captures at each stage, dive distance measured per frame at 390 / 900
  / 1280px).

### 2026-09-26 — Ember fights + Pair Attacks + battle sound effects (#92)
Ember, the companion dragon, now fights beside the hero instead of just
bouncing in the background, and battles got a full set of sound effects.
- **🐉 Ember command** (`BattleArena`): disabled while Ember is an egg. Opens a
  menu with **Ember Attack** (stage-named: Ember Nip / Flame Claw / Dragon Tail)
  — a normal question like Attack, a bit softer than the hero
  (`EMBER_POWER` 18/26/36), but a correct answer stokes an extra ◆
  (`EMBER_BONUS_CHARGE`), so it's the move that sets up a combo. A wrong answer
  is a glancing puff (effort never zero).
- **Pair Attacks** (`content/companion.ts` `PAIR_ATTACKS`): Twin Strike
  (hatchling, 2◆, ×1.6), Blazing Comet (whelp, 3◆, ×2.0), Dragon Duet (dragon,
  4◆, ×2.4). Like spells they use the super-hard pool and fizzle harmlessly on
  a miss; damage is `pairDamage` = (hero power + Ember power) × multiplier
  (`lib/battleMath.ts`), so a Pair Attack always beats a solo spell of the same
  cost (test-enforced). Hero and Ember lunge together, with a pair-attack
  banner + fire-coloured confetti. A shield-absorbed combo refunds its charge.
- **Battle SFX** (`tools/assets/audio.py`, `lib/audio.ts`): 9 new generated
  sounds — `impact` (enemy takes damage), `enemyAttack` (enemy lunges),
  `spell` (spell cast), `heal`, `guard` (guard/Aegis/Rainbow Ward raised),
  `block` (hit fully blocked), `shatter` (enemy shield breaks), `roar` (Ember),
  `pair` (the combo, with its own impacts). The `attack` swoosh moved out of the
  hero-lunge effect into explicit calls so heals no longer swoosh. Existing SFX
  re-render byte-identical.
- `dealHeroDamage` now takes `{ refundCharge, actor, sound }` so every
  damage-dealing move (Attack, spells, Ember, Pair) shares the shield/boss-phase
  logic. The phase banner takes an icon (⚠️ for warnings, the combo's emoji for
  Pair Attacks).
- 310 tests green (was 301); lint + build clean. Played in headless Chromium
  with a seeded save + mocked questions (egg / hatchling / dragon, shielded
  enemy, fizzle) with a Howl.play spy confirming sound order. See ISSUES #92.

### 2026-09-26 — Access hardening (0010) + migration guardrails (#90)
From the migrations review:
- `0010_access_hardening.sql`: explicit `select/insert/update` grants on
  `profiles` for `authenticated` + `service_role` (the only client-written
  table without them — likely part of #61); `handle_new_user` now skips
  seeding when birth-date metadata is missing/invalid instead of failing the
  whole sign-up (dashboard users, invites, future OAuth/parent accounts —
  `profileStore` creates the row on first load) and uses `on conflict do
  nothing`; `increment_question_usage` EXECUTE revoked from PUBLIC too.
- Fixes shipped as a NEW migration (not edits to 0001/0003) — see the new
  migration rules above.
- `scripts/build-apply-all.mjs` lints every migration (no BEGIN/COMMIT; no
  non-idempotent CREATE/ADD COLUMN; policy/trigger needs a prior DROP IF
  EXISTS) and refuses to build otherwise.
- New `supabase/ci/access.test.sql` (fails without 0010). Verified on Postgres
  16: migrations in order, bundle applied twice (10 recorded), both SQL tests.

### 2026-09-26 — One-shot, re-runnable "apply all migrations" script
- `supabase/apply_all_migrations.sql` (generated by
  `scripts/build-apply-all.mjs`, `npm run db:bundle`): all migrations in one
  transaction, each recorded in `supabase_migrations.schema_migrations` (the
  CLI's history table, created if missing). Paste into the SQL Editor and Run.
- Migrations 0001/0006/0008 made idempotent: `drop policy if exists` before
  each `create policy` (fresh-DB result unchanged; re-runs also repair a
  missing/wrong policy — the #61 XP-reset cause).
- CI: bundle-is-current check + apply-twice job.
- Verified on Postgres 16: fresh DB; applied twice; and a drifted "prod" (old
  0001 missing the UPDATE policy, CLI history table with extra columns, a real
  player + question) → policy restored, columns added, data kept, 9 recorded.

### 2026-09-26 — Critical fixes: locked-down question generator, CI, password reset (#88)
- **Question generator (security/cost):** `generate-questions` now rejects
  callers who aren't signed in (the anon key ships in the bundle, so before
  this anyone could spend the Claude budget). New migration
  `0009_question_quota.sql`: `question_requests` log + `begin_question_request`
  RPC (advisory-locked per player; EXECUTE revoked from anon/authenticated).
  Defaults: 20 calls/min/player, 200 fresh questions/day/player, 5000 fresh/day
  overall. Over budget → served from the cache so play continues; the
  question bank is still never pruned.
- **CI:** first GitHub Actions workflow (app, edge-function type-check,
  migrations + SQL tests). `supabase/ci/` holds the Supabase stub and
  `quota.test.sql`.
- **Password reset:** "Forgot password?" on the sign-in screen and a
  `ResetPasswordPage` for the reset-email link.
- ⚠️ Deploy: apply `0009_question_quota.sql`, redeploy `generate-questions`,
  and add the site URL to Supabase Auth → Redirect URLs. See ISSUES #88.
- Verified: vitest + lint + build; `deno check` of the function; all 9
  migrations applied to a fresh Postgres 16 and `quota.test.sql` passing.

### 2026-09-26 — Review fixes on the battle refactor (#87)
- The #70 regression test now uses fake timers and advances past every
  pending impact/animation timer after the potion, so a future delayed HP
  write fails it (verified by re-inserting one: 35 ≠ 85).
- `BattleArena` subscribes via one `useShallow` selector instead of the
  whole `battleStore`.

### 2026-09-26 — Tech-debt pass: battle refactor, tap-race fix, README, deps (#87)
- **Tap-race fixed (#70):** the battle's numbers moved into `battleStore`
  (`charge`, `guarded`, `enemyShielded`, `lastPhase` joined HP; `start()`
  resets them and derives the shield from the archetype). Every command reads
  `combatState()` at resolve time and writes via `applyCombat` immediately —
  the old 260ms delayed `setHp` could drop a potion heal or healer mend. Only
  floats/SFX are still delayed (`IMPACT_MS`).
- **Battle refactor (#44, #69b):** `BattleArena` went from 926 to ~590 lines.
  New pure `lib/battleTurn.ts` (`resolveHeroHit`, `resolveEnemyTurn`,
  `resolveSpell`, `resolveItem`, `itemBlocked`, `chargeAfterAnswer`); new
  `features/battle/useBattleFx.ts` (all cosmetic timers, cleared on unmount);
  view split into `BattleHud`, `BattleStage`, `BattleMenus`, `BattleResult`.
  `resolveSprite` now returns a named `ResolvedSprite` type.
- **Question bank is never pruned** (product decision): #68 closed won't-do.
- **Deps:** 22 unused packages removed (see ISSUES #87); `package-lock.json`
  and `bun.lock` regenerated. JS bundle unchanged in behavior.
- **README:** replaced the Vite template with real setup/deploy/layout docs;
  root README points at it.
- 324 tests green (was 301 on main + 23 new: `battleTurn.test`,
  `BattleArena.test`); lint + build clean.

### 2026-09-23 — Spire review fixes: softlock, leave button, double-tap (#74)
Code review of the Spire climb; all four findings fixed:
- **Softlock (high):** a short question batch (the edge function can return
  fewer than asked) left a seal with no question — the bump paused the hero
  and resolved straight back to 'explore', and `setExploring` only re-ran on a
  phase-*kind* change, so the hero froze and the stairs could never open.
  `loadFloor` now treats `pool < floor.questions` as the retryable error
  ("only N of M riddles…"), and exploring follows every phase change.
- **Dead Menu / no way out (medium):** the world HUD's Menu button was live
  mid-climb but `world.spire` ignores `OPEN_MENU`. It's hidden during the
  climb, and the Spire HUD gains **🚪 Leave the Spire** — back to the door,
  keeping XP earned so far and queueing misses for the Library.
- **Double-tap skip (low):** message panels ignore clicks for 250ms after
  opening, so a double-tap can't skip the next panel (e.g. a floor's taunt).
- `loseCandle` no longer returns an unused boolean.
301 tests green; lint + build clean; each fix verified in headless Chromium.

### 2026-09-23 — The Spire becomes five walkable, spooky floors (#74)
Each Spire floor is now a themed map the hero explores instead of a bare list
of questions.
- **Floors (`content/spire.ts`):** `SPIRE_FLOOR_MAPS` — 22×14 maps per theme:
  the Whispering Stair (dusty archive: shelf stacks, cobwebs, a pit of lost
  pages), the Overgrown Landing (dead trees, glow-shrooms, a murky pool), the
  Star Gallery (void pits full of stars, broken telescopes), the Engine Vault
  (gear walls, conveyor belts, oil pits) and the Forgotten Throne (obsidian
  hall, purple carpet, Umbra on his throne). New map chars: `Q` rune seal
  (bump → one of the floor's questions), `U` stairs (open once every seal is
  broken), `Y` throne. `floorZone()` renders a floor through `WorldCanvas`
  (borrowing the `crystal-spire` id, own `tileset`); `floorWards` /
  `floorSpawnPx` helpers. Each floor names its `theme` + `music`.
- **Climb engine:** new `store/spireStore.ts` bridges the canvas and the
  overlay (floor, broken seals, candles, pending bump). `WorldCanvas` draws
  seals/stairs/throne props, Umbra (new boss sprite) and a candle-light
  darkness layer whose circle narrows per lost candle; it reports bumps via
  `onWard` / `onStairs` / `onUmbra`. `WorldScreen` shows the floor map,
  unpauses the world only while exploring, and never saves floor positions.
  `SpireOverlay` is now a slim HUD while exploring and opens question /
  story panels on bumps (bump handling via a store subscription). Rules are
  unchanged: wrong answers snuff candles, running out casts you back to the
  field; the throne floor's Umbra gauntlet keeps the 5-question boss run.
- **Spooky music (`tools/assets/audio.py` `compose_spooky`):** detuned organ
  drone, music-box melody with long echo, heartbeat bass, tritone bells, plus a
  per-floor flavour (clock ticks / wind / star glitter / clanking gears) —
  `spireArchive` / `spireThicket` / `spireStars` / `spireEngine`, and the
  `spire` theme (intro + throne hall) regenerated spooky. `finalBoss` still
  takes over once the Umbra fight starts.
- **Art:** `/tiles/spire-<theme>.png` ×5, `/tiles/spire-props.png` (glowing /
  broken seals, sealed / open stairs, throne), Umbra sprite (world + battle).
- Tests: spire.test (themes + music unique, maps one screen + legend-only,
  one seal per question, seals/stairs/Umbra reachable), spireStore.test,
  tiles.test (Spire sheets). 301 tests green; lint + build clean. Played
  through in headless Chromium with mocked questions (real seal bump, a lost
  candle, all five floors, Umbra's challenge).

### 2026-09-23 — Second place to buy Berry Potions (#73 follow-up)
Berry Potions are now also sold at Tadpole's Tonics in Verdara (same 30-coin
price as Maple's Trading Post on Lumina Field), so heroes away from the field
can restock. The one-seller rule stays for everything else: new
`SHARED_STOCK` (items.ts) lists the staples allowed exactly two sellers, and
items.test enforces both rules plus equal pricing. `ALL_SHOP_ITEMS` is now
de-duplicated. Trader Tadpole's greeting updated to match his stock. 290 tests
green; lint + build clean.

### 2026-09-23 — Every place unique: one of each service, own shops, own architecture (#73)
No more duplicated services — each place has its own layout, buildings and stores.
- **One of each service:** the only Inn is the Sleepy Sheep Inn in Lumina
  Village (Innkeeper Poppy moved in; id `hub-innkeeper` kept); the only
  Library is the Lumina Library on Lumina Field (Librarian Sage). The
  duplicate village innkeeper/librarian were removed; the town's library
  became Lantern-Keeper Sol's Lantern Workshop.
- **Unique stores (`content/items.ts`):** `SHOP_CATALOG` → `SHOPS` keyed by
  merchant id; every item is sold in exactly one shop. Maple's Trading Post
  (field): Berry Potion · Plus's Quill & Count (Numbria): Hint Feather ·
  Tadpole's Tonics (Verdara): Honey Elixir · Volt's Gadgets (Gearfall): Spark
  Cell · Swirl's Paint & Charms (Chromaria): Rainbow Ward · Clove's Curios
  (village): collectible badges — plus a signature badge in each. (Berry
  Potions later gained a second seller — see the follow-up entry above.)
- **New battle items:** Honey Elixir (full heal), Spark Cell (+2 ◆ charge),
  Rainbow Ward (blocks the next enemy hit). `CONSUMABLE_IDS` drives the save
  (`SaveData.items` is now `Record<ConsumableId, number>`; older saves
  default new slots to 0 — no version bump needed). Battle **Potion** command
  → **🎒 Items** menu (`BATTLE_ITEMS`; each use spends the turn, with
  "HP is full" / "Charge is full" / "Already warded" guards).
- **Unique layouts + buildings:** Lumina Field redrawn around the Library and
  Trading Post; Numbria + Chromaria gained an east district, Verdara +
  Gearfall a south district (each: a Sage hall + the merchant's shop, Numbria
  also a Counting House); the Woods (Spellwright's Hut), Coast (Vela's
  Observatory) and Depths (Cricket's Tinkery) each gained a signature
  building. All chest / gate / key-gate / save-crystal coordinates are
  unchanged (saves + quests stay valid); moved exits and inbound spawns
  updated. Every merchant, sage, innkeeper and librarian now works indoors.
- **Architecture styles:** `BuildingDef.style` — cottage (field), timber
  (town), stone (Numbria), leaf (Verdara), brass (Gearfall), paint
  (Chromaria), log (Woods), driftwood (Coast), cave (Depths); one tile sheet
  each (`/tiles/town-<style>.png`), 12 roof colours, new sage/tools/star
  signs.
- New tests: items.test (each item sold once, every merchant has a shop,
  save slots), zones.test (one Inn + one Library, service NPCs indoors, one
  style per place, unique building names), tiles.test (every style sheet).
  288 tests green; lint + build clean. Verified in headless Chromium (all 9
  places, a shop interior, two shop screens).

### 2026-09-23 — Zelda-style screen slide between zones
Leaving a zone by an edge exit now slides screens instead of hard-cutting:
`WorldCanvas` snapshots the outgoing frame (`k.screenshot()`), the new zone
builds in the canvas shifted one viewport away, then both move together
(`SLIDE_MS` = 480ms, linear) — heading east the old screen leaves left and the
new one arrives from the right, etc. The hero's update loop is frozen for the
slide (`slidingRef`, which also re-arms the trigger cooldown on arrival);
wanderers keep moving. Pure `lib/transition.ts`: `exitSide` (which map edge an
exit is on) + `slideFrom` (entry vector). Respects `prefers-reduced-motion`
(instant cut). A safety timeout clears the slide if the zone never changes.
New zones.test invariant: every exit sits on a map edge. 275 tests green;
lint + build clean; verified in headless Chromium (west, north, into the town).

### 2026-09-23 — Lumina Village becomes a scrolling town with enterable buildings (#72)
- **Town map:** the village is now 44×28 (2×2 screens) — avenues, a plaza
  with the save crystal and fountain, hedges, and four buildings: Item Shop
  (Shopkeep Clove, merchant), Inn (Innkeeper Bess), Library (Archivist
  Quill) and Grandmother Wick's house. Inbound exits in the field / woods /
  coast / grove / spire now land on the new town coordinates.
- **Buildings (`zones.ts`):** new legend chars `W` wall, `D` door, `F` floor,
  `K` counter, `B` shelf, `T` table, `Z` bed, and `ZoneDef.buildings`
  (`BuildingDef` rect + roof colour + sign). Helpers `buildingAt` (footprint)
  and `buildingInside` (interior). Outside, a nine-slice roof + name label
  covers every row but the facade; stepping inside fades that roof away
  (`ROOF_FADE`). Bumping a counter talks to the NPC behind it. Wanderers
  never cross a building wall (townsfolk stay outside, clerks inside).
- **Camera:** the KaPlay canvas is a fixed one-screen viewport (`VIEW_COLS`
  × `VIEW_ROWS`); maps larger than that scroll with `setCamPos` via pure
  `lib/camera.ts` `camAxis` (clamped to the map; single-screen zones don't
  move).
- **Old saves:** `safeSpawn` drops a saved position that's no longer walkable
  (e.g. inside a new wall) back to the zone spawn.
- **Art:** `tools/assets/tiles.py` adds `public/tiles/town.png` (walls,
  facades with windows, door, floor, counter, shelf, table, bed, 4 signs) and
  `roofs.png` (4 colours × 9-slice); a hedge border for the town; 3 new NPC
  sprites.
- 271 tests green (was 258); lint + build clean. Verified in headless
  Chromium: roof on/off at the shop + house, camera scroll, counter talk.

### 2026-09-23 — 4-way facing for world characters (#71 follow-up)
World sheets now carry three views (18 frames): side (0-5, drawn facing
right, `flipX` for left), down/toward camera (6-11) and up/away (12-17),
each idle ×2 + walk ×4 — anims `idle/walk`, `idleDown/walkDown`,
`idleUp/walkUp`. Generator: new `humanoid_fb` / `dragon_fb` front+back
drawers; blobs, jellies, ghosts, golems, gears and hourglasses re-aim or hide
their faces; other creatures reuse their side art. New pure `lib/facing.ts`
(`facingFor` — dominant axis wins, diagonals favour side, standing still
keeps the last facing; `animFor` — falls back to side anims, then `idle`,
for sheets without a view). `WorldCanvas` drives the hero (spawns facing
down), wanderers and Ember with it. 258 tests green; lint + build clean.

### 2026-09-23 — 16-bit asset set: sprites, tiles, backdrops, chiptune audio (#71)
The placeholder emoji and flat-colour tiles are gone: a deterministic
generator in **`tools/assets/`** (Python: Pillow + NumPy + lameenc;
`python3 tools/assets/build.py`) produces a cohesive SNES-style set.
- **Characters** (`characters.py`): parametric pixel drawers (humanoid,
  beast, blob, flyer, golem, dragon, spirit…) with auto 3-tone hue-shifted
  shading + selective outlines. Every hero, Ember stage, enemy (incl. bosses
  at 1.5×) and NPC gets `public/sprites/<id>/world.png` (16px art at 2×:
  idle + 4-frame walk) and combatants also `battle.png` (32px: idle / attack
  / hurt). All face right (world flips, battle mirrors the hero via CSS).
  The manifest is written to `src/content/sprites.generated.ts` and spread
  into `SPRITES`. `spawnEnemy` and new `npcSpriteId()` default `spriteId` to
  the def id; avatars got `blaze` / `shield` / `nova`.
- **Environment** (`tiles.py`, `src/content/tiles.ts`): one 9-frame tileset
  per zone (ground ×3, path, animated water ×2, solid, deco, exit), a props
  strip (glowing save crystal, chest closed/open, gate), a 32×64 Spire tower,
  and a 256×144 battle backdrop per zone. `WorldCanvas` now draws tiles from
  these sprites (`TILE_FRAME` / `PROP_FRAME` keep generator ↔ renderer in
  sync); `loadWorldSprites` registers them. `BattleArena` layers the zone
  backdrop over the sky gradient.
- **Audio** (`audio.py`): chiptune synth (pulse / 4-bit triangle / noise,
  SNES-ish echo) → `public/audio/16bit/{sfx,music}/*.mp3` (32 kHz mono).
  All 9 SFX + 7 seamless music loops; `lib/audio.ts` points at them (old
  mp3s stay in `public/audio/` for easy swap-back). `attack` (hero lunge) and
  `select` (hero pick) are now wired.
- Wanderers play walk/idle and face their heading; hero cards on
  `AvatarSelect` show the animated battle sprite.
- 252 tests green (was 241); lint + build clean. Follow-ups in ISSUES #71.

### 2026-07-07 — Fix edge-function deploy: self-contained again (#67)
A live deploy failed with `Module not found "_shared/topics.ts"` — the
Wave 0.4 `../_shared` import doesn't bundle on dashboard/API deploys (only the
CLI uploads siblings). Reverted the function to inline its own topic table so
`generate-questions/index.ts` is a single self-contained file that deploys any
way. `_shared/topics.ts` stays canonical for the app (compile-lock + tests
unchanged); a new `topicPrompts.test.ts` case reads the function source via
Vite `?raw` and fails if the inline copy drifts from canonical. 241 tests
green; lint + build clean.

### 2026-07-07 — Wave 0 review pass: bug + gap fixes (8-angle review)
Multi-agent review of the whole Wave 0 branch; fixes applied:
- **Archetype banner never seen (correctness):** the shielded/trickster/healer
  callout was on mount-anchored timers that expired behind the question
  LoadingScreen on a slow generation — the "twist, never a gotcha" contract
  broken. Now gated on `!loading` + a shared `showBanner(text, ttl)` helper
  (one banner lifecycle; a stale hide-timer can't wipe a fresh banner — also
  fixed the boss-enrage banner's leaked timeout).
- **Ember stage regression (correctness):** `EMBER_STAGE_AT` was a
  `ceil(TOTAL/2)`/`TOTAL` formula; STORY-4X §8 pins whelp=2/dragon=4 even at
  6 crystals, so crystal #5 would have regressed a live full-grown Ember to a
  whelp (losing Ember's Breath). Now explicit values + a story.test TRIPWIRE
  that fails on a `TOTAL_CRYSTALS` change to force a deliberate retune.
- **Shield state leak (correctness/altitude):** `enemyShielded` re-derives on
  `enemy.instanceId` change (adjust-state-during-render) instead of a
  mount-only initializer — no longer relies on the arena unmounting per fight.
- **Spell charge wasted on shield (correctness):** an offensive spell absorbed
  by a shield now refunds its charge (effort never punished).
- **Save-migration masking (correctness):** documented that `normalizeSave`
  stamps `version` unconditionally (a missing step would mask itself / a stale
  client would downgrade a newer save); added a save.test TRIPWIRE asserting
  the ladder has a step for every version < `SAVE_VERSION`.
- **Topic drift now a compile error:** `topicPrompts.ts` proves `Topic ≡
  TopicId` at build time (was test-only — dangerous with no CI).
- **Edge fn is multi-file now:** ISSUES #67 upgraded to a CLI-only deploy
  warning (dashboard single-file paste boot-fails on `_shared`).
- **Test de-hardcoding (reuse):** `ENEMY_BEHAVIORS` const-array derives the
  union (enemies.test imports it, no private copy); the no-stall invariant
  moved to enemies.test and derives max HP from `ENEMY_DEFS` via `spawnEnemy`.
- **Known/deferred:** a pre-existing 260ms tap-race (ISSUES #70), logged not
  fixed (needs turn-machine rework — Wave 2).
- 240 tests green (was 238); lint + build clean.

### 2026-07-07 — Wave 0.7: story-doc sync (Moonwell Grove into the bible)
STORY.md caught up with the code: 11 zones (was "10" — the Grove was
uncounted), the Grove's cast (Lune/Glim/Ripple) and quest (The Darkened
Moonwell) added to the cast/quest tables, `grove-seen` added to the flag
glossary, and §8's future hooks now point at their full specs in
`STORY-4X.md` (Acts II–IV) / `ROADMAP-4X.md` (delivery waves). CLAUDE.md's
content-layer description updated to match (11 maps, `ZONE_IDS`). Doc-only.

### 2026-07-07 — Wave 0.5: enemy behavior archetypes (#69, ROADMAP-4X)
Zones can now differ in play, not just palette. `EnemyBehavior`
(`types/index.ts`): **shielded** — the first landed hit (even a glancing
blow) shatters its shield for 0 damage, then it fights unprotected (🛡️ shows
by its name); **trickster** — Hint Feathers don't work in that fight (button
hidden, no feather consumed); **healer** — mends `healerRegen(maxHp)` (10%)
at the end of its turn while below half HP (`healerMends`/`healerRegen` in
`battleMath.ts`; test-guarded so a landed hit always out-damages the mend).
Every archetype is announced by the phase banner at battle start — a twist,
never a gotcha. `EnemyDef.behavior` carries through `spawnEnemy`; first
users: Relic Golem (shielded), Pixel Witch (trickster), Moon Moth (healer).
Bosses stay archetype-free (their twist is the enrage formula; test-
enforced). "Swift"/timed deferred pending the STORY-4X §12 timer decision.
238 tests green; lint + build clean.

### 2026-07-07 — Wave 0.4: shared topic config for generate-questions (#67, #68)
The edge function's topic whitelist + persona lines moved to
`supabase/functions/_shared/topics.ts` — imported by the function (bundled at
deploy) and re-exported to the app as `src/content/topicPrompts.ts`.
`topicPrompts.test.ts` locks the shared `TOPIC_IDS` to the game's
`ALL_TOPICS`, so a topic added on one side fails the suite. Adding a topic no
longer edits function internals (see the checklist in _shared/topics.ts);
a redeploy is still required. Question-table pruning deliberately deferred
with a concrete plan (#68) — no new migration while prod drift (#61) is the
live risk. ⚠️ Deploy: redeploy `generate-questions` once for the module
layout (identical behavior). 231 tests green; lint + build clean.

### 2026-07-07 — Wave 0.3: ZoneId derives from the zone registry (#66, ROADMAP-4X)
`ZONE_IDS` (`content/zones.ts`) is now the single source of truth for the
`ZoneId` union; `types/index.ts` re-exports it type-only (the types↔zones
circular import is erased at compile time). Adding a zone = one id + one
`ZONES` entry in zones.ts — the `Record<ZoneId, ZoneDef>` shape errors on a
missing or extra entry, and a new zones.test asserts key/id consistency.
Lazy zone loading deliberately deferred to Wave 3 (see ISSUES #66). No
behavior change. 227 tests green; lint + build clean.

### 2026-07-07 — Wave 0.2: versioned save-migration ladder (#65, ROADMAP-4X)
`lib/save.ts` gains `runMigrations` + a `MIGRATIONS` ladder (v N → N+1 steps
over raw payloads), run inside `normalizeSave` so every load path upgrades
old saves before field coercion. Ladder is empty at `SAVE_VERSION` 1 — the
mechanism + tests land ahead of the first real shape change (Wave 2 party
state), which must bump the version, add a step + real-v1 fixture test, and
drop the vestigial `sageEquipped` (#53). Missing steps stop the walk safely
(normalize field-defaults the rest); payloads at/above target are never
touched. 226 tests green; lint + build clean.

### 2026-07-07 — Wave 0.1: crystal count registry-derived (#64, ROADMAP-4X)
First foundation refactor for the 4× expansion (`docs/ROADMAP-4X.md`,
`docs/STORY-4X.md`). Adding a crystal topic is now: add its id to
`CRYSTAL_TOPIC_IDS` (`types/index.ts` — the new single source of truth for
the `CrystalTopic` union) and let the compiler + tests walk you through the
rest (exhaustive `Record<CrystalTopic,…>`s error; `topics.test.ts` enforces
the `TOPIC_REGISTRY` entry). `TOTAL_CRYSTALS` is derived — never hardcode 4.
`EMBER_STAGE_AT` (`story.ts`) replaces the literal `>=2`/`>=4` Ember growth
thresholds (whelp = half, dragon = all; re-tune explicitly when crystal #5
ships, see ISSUES #64). `EXTRA_TOPIC_IDS` likewise anchors the extra-topic
union; topic tests are consistency checks against the id registries instead
of hardcoded 4s and 7s. Stale "all four crystals" comments updated
(`spells.ts`, `SpireOverlay.tsx`). No behavior change. 220 tests green
(was 218); lint + build clean.

### 2026-06-27 — Wandering NPCs/enemies + ambient life + Moonwell Grove
Made the overworld feel alive and grew the world by one region.
- **Wandering actors (`lib/wander.ts` + `WorldCanvas`):** every non-boss enemy
  and every pure-flavor villager now roams a slow, leashed random walk; bosses
  and "key ally" NPCs stay put. The rule is `npcWanders(def)` — villagers roam
  unless `stationary`, and **service roles never roam**. New optional
  `WorldNpcDef.stationary` marks quest-givers (Pip/Tally/Fern/Rivet/Doodle),
  key story NPCs (Elder Lumen, Grandmother Wick, Keeper Aurora) and the warden
  signposts as fixed. Pure decision math (`npcWanders`, `pickWanderDir`,
  `clampToLeash`, `withinLeash`, `pickAmbientLine`) is unit-tested; the canvas
  closure wires it to `k.dt()`, the existing `hitAt` collision, and `pausedRef`.
  Each wanderer keeps its `actor.x/y` (the contact point) in lockstep with all
  its sprite pieces, so bump-to-talk / walk-into-battle still work unchanged.
- **Idle speech bubbles:** new optional `WorldNpcDef.ambient` (short one-liners)
  occasionally float above an NPC and fade — seeded on flavor villagers + the
  new grove critters. Bubbles are children of the NPC sprite so they ride along.
- **Moonwell Grove (`zones.ts`, new `ZoneId`):** a hidden nature-themed region
  off Lumina Village (south-west exit) — a dark Moonwell, a gated south chamber
  with the riddle-chest, three nature critters. New NPCs (`npcs.ts`): Lune the
  Moonkeeper (quest-giver) + Glim/Ripple flavor critters. New quest
  `grove-moonwell` (`quests.ts`, chest → defeat-3) and an entry cutscene
  `GROVE_PANELS` (`story.ts`, flag `grove-seen`), slotted into `WorldScreen`'s
  one-cutscene-at-a-time selection. Reuses the `nature` topic → **no edge
  function redeploy**.
- **Richer reactive dialogue:** Elder Lumen + Pip now react to `spire-cleared`.
- **Self-review fixes (#63):** on talk, a wandering NPC is now pushed clear of
  the contact radius so it can't re-open dialogue on a standing player (the old
  player-only nudge was a no-op when the NPC walked into a motionless hero);
  wander collision is tested on the leash-clamped target so a steer-home
  correction can't seat a sprite in a wall.
- **Polish (#63):** wander speed/leash + ambient timing now live in
  `WANDER_TUNING` / `AMBIENT_TUNING` (`lib/wander.ts`), not inline in the
  canvas; idle speech bubbles render dark text on a light, outlined pill so they
  read on any ground (e.g. the dark Grove/Depths zones).
- **No-overlap (#63):** wanderers now steer around every other character (other
  wanderers, stationary NPCs, the boss, the Spire) — pure `approachBlocked`
  (`lib/wander.ts`) + per-actor `ACTOR_RADIUS`, checked against the live
  `actors` list each step; the wall check uses the sprite footprint
  (`WANDER_WALL_HALF`) via a generalized `hitBox`. The player and Ember are
  intentionally excluded, so bump-to-talk / walk-into-battle is unchanged.
- 218 tests green (was 194); lint + tsc build clean. No deploy step.

### 2026-06-18 — Fix music not restarting after a page refresh (#62)
Music played when first enabled (the menu toggle is a user gesture) but went
silent after a refresh: on reload the setting is already "on", so `playMusic`
runs before any new gesture and the browser blocks `play()` — and the engine,
thinking that track was already current, never retried. `lib/audio.ts` now
`armUnlock()`s a one-time `pointerdown`/`keydown`/`touchstart` listener whenever
it tries to start a track; the first interaction re-asserts the intended track
(no-op if already playing). The "same track" branch also re-checks and restarts
a track that autoplay had blocked. SFX were unaffected (they fire on gestures).

### 2026-06-18 — Fix XP/level reset on refresh; profile now durable (#61)
The profile (XP→level, skill levels, power-ups, streak) lived **only** in
Supabase with no local backup, so a failed write or an empty read on reload
reset the player to Level 1 — and worse, `loadProfile`'s fallback **upserted a
zeroed default over the real row**, permanently destroying XP.
- **Non-destructive load** (`profileStore.loadProfile`): a read *error* no longer
  writes anything (was the data-loss path); a genuinely-missing row is created
  with `ignoreDuplicates` (ON CONFLICT DO NOTHING) so an existing row is never
  clobbered.
- **localStorage write-through** (`lib/profile.ts`, mirrors `saveStore`): every
  change is cached locally; on load the remote row is reconciled with the local
  cache keeping the higher progress (`mergeProfiles`), so a remote row stuck at
  0 (e.g. an RLS policy not applied on the live DB) can't wipe a real Level 23.
- **Surfaced failures**: new `profileStore.remoteError`, shown in `MenuOverlay`
  — XP writes no longer fail silently.
- ⚠️ Root DB cause is separate: the production Supabase is missing profile
  migrations (the `update` RLS policy and/or the 0002/0004/0007 columns), so
  writes silently affect 0 rows. Apply 0001–0008 to prod. See ISSUES #61.
- 194 tests green (was 187); lint + build clean.

### 2026-06-18 — Wire real audio files into the scaffold (#60)
Player-supplied mp3s dropped into `public/audio/` and mapped in `lib/audio.ts`.
- **Music:** `Overworld` (map), `Battle_Music` (regular battles), `Boss_Battle`
  (area bosses — Fiends/wardens, via `enemy.isBoss`), `Spire_Music` (the Spire
  climb), and `Boss_Battle - Final Battle` (the Umbra fight).
- **SFX:** `Character_Grunt` (player takes damage — `BattleArena`), `Wrong_Answer`
  (wrong pick — `QuestionCard`), `Level_Up` (`LevelUpModal`), `Victory-jingle`
  (battle won — `victory()` stops the battle loop, plays the jingle).
- **Spire owns its own music:** `SpireOverlay` plays the Spire theme while
  climbing and switches to the Final Battle track only once the **Umbra fight is
  underway** (boss floor + question phase), not on arrival. `App.useScreenMusic`
  steps aside while the Spire is open (`inSpire` guard) so the two never fight
  over the track. New `MusicTrack` `finalBoss`; the spaced filename is URL-encoded.
- Still silent (no file): correct / gate / chest / attack / select SFX; title
  music. Still off by default. Lint + audio tests + tsc build green.

### 2026-06-18 — Audio scaffold: music + SFX (Howler), off by default (#60)
Adopted Howler (was "installed, not yet used") for game audio. Off by default —
sound is opt-in via the menu (kid-friendly / classroom-safe).
- **`lib/settings.ts` + `store/settingsStore.ts`:** device-level audio settings
  (music/sfx booleans + volumes), localStorage write-through, NOT per-user or
  synced. `normalizeSettings` defaults everything off and clamps volumes.
- **`lib/audio.ts`:** the engine. `sfx(name)` fires one-shot effects;
  `useScreenMusic(screen, isBoss)` loops background music that follows the
  top-level screen (`trackForScreen` — title / overworld / battle / boss);
  both honour settings, so every call is a silent no-op until enabled. Lazy
  Howls; load/play errors are swallowed so **missing files never break play**.
- **Wired hooks:** `QuestionCard` (correct/wrong — covers quiz, battle, gates,
  chests, Library), `LevelUpModal` (levelup, beside the confetti),
  `PathQuestionOverlay` + `KeyGateOverlay` (gate/chest open), `App` (screen
  music). Reserved/unwired: battle attack/hit/victory, select, volume sliders.
- **Assets:** drop CC0 files into `public/audio/{sfx,music}/` (see its README +
  ISSUES #60); the engine already references the exact paths.
- 187 tests green (was 180); lint + build clean.

### 2026-06-18 — Gates are double-wide openings (easier to walk through)
Every gate went from a 1-tile gap to a **2-tile opening** along its wall, so the
player no longer has to pixel-align to pass when it's open. Two adjacent `G`
tiles now act as ONE gate: new `gateIdAt()` (`zones.ts`) flood-fills each
connected `G` run and keys its flag / question / key-check / open-state off the
run's canonical (top-left) cell — so one question opens both tiles and both
sprites clear together. Widened toward the original tile, so existing saves'
opened-gate flags still match; `keyGate` matching now compares gate groups.
`WorldCanvas` tracks a sprite list per gate. 2 new zone tests (every gate spans
2 adjacent tiles sharing an id; keyGate cells resolve to a group).

### 2026-06-16 — Warden signposts + keys themed to their destination (#59)
Follow-up to #58. Keys are now named for the **crystal zone they unlock** (the
destination that awards a crystal), not the warden's keyless home zone:
Verdant Key→Verdara, Gearwright Key→Gearfall, Prism Key→Chromaria (ids +
dialogue updated in `keys.ts`). Added a signpost NPC beside each warden
(`*-warden-sign` in `npcs.ts`, placed in `zones.ts`) that warns of the boss and
points the reward home, flipping to a congratulations line once the key flag is
set. No mechanic change — `keyForBoss`/`keyForZone`/`bossDefeated` untouched.

### 2026-06-15 — Warden bosses + gate keys gate the Fiends (#58)
The three themed zones became real prerequisites for the crystals.
- **Warden bosses:** each themed zone now holds a boss (`enemies.ts`) — the
  Thicket Warden (Woods/nature), Tide Colossus (Coast/space), Clockwork Titan
  (Depths/history). Same difficulty band as the Fiends (`levelOffset +1`).
- **Gate keys (`content/keys.ts`):** beating a warden drops a key that **opens
  one Fiend's gate** — Woods→Verdara, Depths→Gearfall, Coast→Chromaria. Math/
  Numbria stays question-gated as the guaranteed first crystal. A crystal zone
  marks its Fiend gate `ZoneDef.keyGate`; bumping it routes to `KeyGateOverlay`
  (a new `PathTarget.kind: 'keygate'`), which opens the gate if the key is held
  or names the warden to go beat. Key possession is a flag (`keyFlag`); the key
  is also pushed to `save.badges` as a trophy (shown in `MenuOverlay`).
- **Reward:** key + trophy badge + the usual boss XP. `BattleArena` branches its
  boss intro/victory on `keyForBoss(enemy.id)` — wardens grant a key (not a
  crystal) and have their own dialogue (`keys.ts`).
- **Stay-dead fix:** new `bossDefeated()` helper unifies despawn — Fiends key
  off the crystal flag, wardens off the key flag — used by both the canvas
  spawn loop and the world prefetch so beaten wardens don't respawn.
- 176 tests green (was 172); lint + build clean. No new deploy step beyond #57.

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
