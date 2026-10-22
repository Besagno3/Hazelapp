# Hazel Quest — Project Context

Educational JRPG for kids 6–18 (#37, `docs/DESIGN-JRPG.md`): quiz rounds unlock
the world of Lumina, and every attack, spell and block in its FF-style battles
is answered with an AI-generated question. Claude Code loads this file every
session, so it holds only what applies everywhere; how each system works is in
`docs/architecture/` (map below) and loads on demand. Keep it under 150 lines.

## Stack

| Layer | Choice |
|---|---|
| Build / UI | Vite 8 (`@vitejs/plugin-react`, Oxc) · React 18.3 · TypeScript 5.8 `strict` · Tailwind 3.4 · Framer Motion 12 · canvas-confetti · Howler 2 |
| State | xstate 5 (`src/machines/gameFlow.ts`: where the player is) + Zustand 5 stores (`src/store/`: what they have) |
| Backend | Supabase: auth, Postgres (`supabase/migrations/`), Deno edge functions (`generate-questions` → Claude API, `delete-account`) |
| Game canvas | KaPlay 3001 (tile overworld, lazy-loaded with the world screen) |
| Tests / CI | Vitest 4 + Testing Library + jsdom · `.github/workflows/ci.yml`: `test` (lint, bundle check, tests, `build:web`), `edge-function` (deno check), `migrations` (applied twice + `supabase/ci/*.test.sql`) |
| Hosting | Vercel: `site/` at `/`, the game at `/play/` (`npm run build:web`) |

`package.json` lists only what the app imports. Approved to adopt when a
feature first needs them (add in that same change): react-router-dom (non-game
pages only), recharts, vite-plugin-pwa (offline play, #5; the home-screen app is a manifest), zod, react-query.

## Commands (in `hazel-game/`)

```bash
npm install && npm run dev                      # Vite dev server; needs .env.local (VITE_SUPABASE_URL / _ANON_KEY)
npm run lint && npm test && npm run build:web   # what CI runs — run before every push
npm run build                                   # tsc -b && vite build (the game alone)
npm run db:bundle                               # regenerate supabase/apply_all_migrations.sql after a migration
node ../.claude/hooks/check-claude-md.mjs       # this file's line budget
```

Benches, Tiled maps, asset generation, the question-bank recheck, deploy
order and the Supabase settings the app relies on: `docs/OPERATIONS.md`.

## Decisions that hold (full text and history: `docs/architecture/decisions.md`)

- **Questions come from Claude** through the `generate-questions` edge function;
  the API key never reaches the browser and only fixed, whitelisted text reaches
  the prompt. A general kids' game: difficulty tiers, not one child.
- **Difficulty is the per-topic question level** (`profiles.skill_levels`, 1–10:
  from sign-up age, then performance) — never XP. XP / player level only tracks
  progress and grants power-ups. Where an enemy roams scales how it fights
  (danger tier), never what it asks.
- **Routing is the xstate machine, not react-router:** `boot → topicSelect ⇄ quiz
  → avatarSelect → world ⇄ battle`; world substates `exploring / dialogue /
  service / path / menu / spire`. The machine owns where the player is; the
  stores own what they have.
- **A login is a grown-up's; kids are profiles.** PINs are hashed and
  rate-limited in the database; 👪 Grown-ups is enforced by the database (a
  15-minute window per sign-in). Every grown-up action goes through `asGrownUp`.
- **The world is a chain of overworld maps joined at their edges** (Dawnreach →
  the Silver Shallows → Taleshore), Act II on the sea; `docs/ROADMAP-4X.md` Wave 1
  is paused. One kid-friendly dialogue register, a simple coin/shop economy,
  async-only friends, generated 16-bit art (`tools/assets/`).
- **The parent dashboard shows only what the database stores** — no invented
  history. The privacy notice is a draft until a lawyer reviews it (`PRIVACY_IS_DRAFT`).

## Layout

```
src/machines/gameFlow.ts (the screen the player is on) · src/store/ (save, battle, auth, family, grownUps, profile, settings, spire, finale, keyboard)
src/content/ (zones, NPCs, enemies, quests, spells, story) · src/features/ (auth, family, quiz, world, battle, typing) · src/lib/ (pure logic) · src/components/ (shared UI)
supabase/ (migrations/, ci/*.test.sql, functions/ — single-file edge functions, scripts/) · docs/architecture/ · docs/feature-log/ · docs/ISSUES.md · docs/TEST-CASES.md
```

## Rules that apply everywhere

- **Errors:** log with `errorMessage(err)` (`src/lib/errors.ts`); kids and
  grown-ups see `friendlyMessage` / `authErrorMessage(err, { where })` /
  `questionErrorMessage` / `plainErrorOr` — never a hardcoded "something went
  wrong", never raw `errorMessage` on a screen (#130 S6); `resolveErrorMessage`
  for `functions.invoke`. Buttons wait with `aria-disabled`, never `disabled`
  (#159). Full rules: `docs/architecture/errors.md`.
- **Edge functions stay single-file (#67).** `_shared/*.ts` is canonical and a
  test fails when the inline copy drifts (`topicPrompts`, `questionFlavors`,
  `questionScreen`, `closeAccount`, `notify`). Redeploy `generate-questions`
  after a topic change.
- **Migration rules (#90):** forward-only (never edit one merged to `main` — fix
  it in the next numbered file); re-runnable (`if not exists`, `create or
  replace`, `drop … if exists` before `create policy|trigger`); no `begin` /
  `commit`; then `npm run db:bundle` and a SQL test in `supabase/ci/` when access rules change.
- **Ids come from registries:** derive the union from the registry (`ZoneId` from
  `ZONE_IDS`, `TopicId` from `TOPIC_PROMPTS`) and re-export through
  `types/index.ts`; other shared types live there. Check a save's zone id with `isZoneId`, never `in`.
- **TypeScript `strict` + `noUnusedLocals` / `noUnusedParameters` are on.** For an
  inner function, copy a narrowed value into a non-null `const` rather than sprinkling `!`.
- **Tailwind:** inline utilities, `cn()` (`src/lib/utils.ts`) to merge. `min-[…]:` /
  `max-[…]:` / `max-sm:` make no CSS here (the `touch` screens are objects) — write
  `[@media(max-width:359px)]:…` (#164).
- **UI:** every world overlay goes in a `ModalLayer`; nothing else sets `inert`;
  password fields use `PasswordInput`; lazy pages sit in a `LazyBoundary`; a
  screen with no button to land on moves focus to its heading.
- **Questions:** never rely on the order options come back in (`shuffleAnswers`,
  #121). Starter questions fill what the server can't give and never move a
  skill level or pay XP (#153).
- **Canvas:** terrain is ONE object drawing only the cells in view — never one
  KaPlay object per tile; every "can the hero get there?" goes through
  `lib/reach.ts` — never another BFS; nothing usable goes off on a bump (`lib/interact.ts`).
- **Battle:** read `combatState()` when a command resolves and write back with
  `applyCombat` — never HP from a timer or a render-captured value (#70).
- **Tuning lives in** `lib/utils.ts` (quiz gate), `lib/battleMath.ts` /
  `lib/battleTurn.ts` (battle), `content/items.ts` (economy), `content/regions.ts` (danger tiers).

## Read before you change it

| Working on | Read first |
|---|---|
| Sign-in, the family, kids, PINs, 👪 Grown-ups, 📈 Progress, closing an account, password reset | `docs/architecture/auth-and-family.md` |
| The game-flow machine, saves (`SAVE_VERSION`, revisions, which copy wins), the profile, XP / levels | `docs/architecture/state-and-flow.md` |
| Zones, topics and acts, NPCs, enemies, quests, keys, items, Tiled maps | `docs/architecture/content.md`, `docs/MAP-AUTHORING.md` |
| The overworld canvas, overlays, HUD, field spells, dungeons, inns, the sea, flying, story panels | `docs/architecture/world.md` |
| Battles, spells, companions, hero types, timers, danger tiers, mercy | `docs/architecture/battle.md` |
| Touch typing (lessons, scribe bursts, the Scriptorium, leaves, pangrams, pen pals) | `docs/architecture/typing.md` |
| Question generation, screening, review and alerts, the cache, loading, budgets | `docs/architecture/questions.md` |
| Migrations, SQL tests, the CI jobs, PR / Vercel rules | `docs/architecture/backend-and-ci.md` |
| Story, acts, cast and tone · roadmaps and design | `docs/STORY.md`, `docs/STORY-4X.md`, `docs/STORY-OVERVIEW.md` · `docs/ROADMAP-OVERWORLD.md`, `docs/ROADMAP-4X.md`, `docs/DESIGN-JRPG.md`, `docs/ASSET-SOURCING.md` |
| What happened, in order | `docs/feature-log/` (newest month first), `docs/ISSUES.md` |

The path-scoped rules in `.claude/rules/` carry each area's non-negotiables and
the same pointer, and load on their own when a matching file is read or edited.

## Workflow

- **PRs open as drafts** (CI and Vercel previews skip drafts). Don't mark one
  ready on your own; when the owner says merge: mark it ready, wait for every
  check to go green (fix and push on red), then merge. `claude/**` branches never
  deploy on Vercel (#126). Details: `docs/architecture/backend-and-ci.md`.
- **A feature PR is followed by `/saas-code-review` and `/saas-ux-review`,**
  fixing what they find in review rounds.
- **Before every commit that touches `src/`** — enforced by `.githooks/pre-commit`
  (activate once per clone: `git config core.hooksPath .githooks`):
  1. `docs/feature-log/<YYYY-MM>.md` — an entry at the top (`### YYYY-MM-DD — title
     (#issue)`; a new month gets a new file, `docs/feature-log/README.md`). Never in this file.
  2. `docs/ISSUES.md` — any bug, shortcut or thing to revisit.
  3. `docs/TEST-CASES.md` — cases for the new or changed behaviour.
  4. When you changed **how a system works**, update its `docs/architecture/` file
     too; change this file only when a rule, a decision or the map changed.
- Bypass only on purpose: `git commit --no-verify`.

## Keeping this file small

Target 150 lines: **180 warns, 200 fails** (`.claude/hooks/check-claude-md.mjs`, run
as a SessionStart / PostToolUse hook, by the pre-commit hook and by CI). When it
warns, say so to the owner at the start of your reply and propose the trim: move
any "how it works" paragraph to `docs/architecture/`, any rule that only matters
for some files to a `paths:`-scoped file in `.claude/rules/`, any procedure to
`docs/OPERATIONS.md` or a skill; delete what the code already says. Ask of every
line: would removing it cause a mistake? If not, cut it.
