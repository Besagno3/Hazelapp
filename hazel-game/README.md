# Hazel Quest

An educational JRPG for kids (roughly ages 7–11). Players train in quiz rounds
to unlock the world of Lumina, then explore a tile-based 2D overworld, talk to
villagers, and fight Final Fantasy–style command battles where **every attack,
spell, and block is powered by answering a question**. Questions are generated
by Claude and pitched to the player's age and per-topic skill level.

- **Topics:** math, science, engineering, creativity (the four crystal
  topics), plus nature, space, and history.
- **Progression:** player level from XP, a per-topic skill ramp that sets the
  difficulty of each question, a daily streak, and power-ups.
- **Story:** restore the four crystals, raise Ember the dragon, climb the
  Crystal Spire, and face Umbra, the Forgotten One.

## Tech stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + TypeScript 5.8 |
| UI | React 18, Tailwind CSS 3, Framer Motion |
| State | xstate 5 (game flow) + Zustand 5 (save, battle, profile, settings) |
| Overworld | KaPlay (canvas, lazy-loaded) |
| Audio | Howler (off by default, toggled in the menu) |
| Backend | Supabase: auth, Postgres (profiles, saves, question cache), and an Edge Function that calls the Claude API |
| Tests | Vitest + Testing Library + jsdom |

## Getting started

Requires Node 20+.

```bash
cd hazel-game
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

The app gates on a Supabase session, so it needs a Supabase project even
locally. The test suite does **not** need one (it stubs the config).

### Enable the git hook (once per clone)

```bash
git config core.hooksPath .githooks
```

The pre-commit hook blocks commits that change `hazel-game/src/` without also
updating `CLAUDE.md`, `docs/ISSUES.md`, and `docs/TEST-CASES.md` (see
`CLAUDE.md` → *Pre-commit ritual*).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` / `test:ui` | Watch mode / browser UI for tests |

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull
request: lint + tests + build, a Deno type-check of the edge function, and a
job that applies every migration to a fresh Postgres and runs
`supabase/ci/*.test.sql`. Run `npm run lint && npm test && npm run build`
locally before pushing.

## Supabase setup

1. **Create a project**, then copy its URL and anon key into `.env.local`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. **Apply the migrations.** Easiest: paste `supabase/apply_all_migrations.sql`
   into the SQL Editor and Run. It applies and records every migration, and is
   safe to re-run on a project that already has some or all of them. Or apply
   the files in `supabase/migrations/` in order (0001 → 0009)
   either with `supabase db push` or by pasting each one into the SQL Editor.
   If players' XP resets on refresh, the production DB is missing migrations;
   see `docs/PRODUCTION-DB-SETUP.md`.
3. **Deploy the question generator** and give it your Anthropic key:

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy generate-questions
   ```

   The function is one self-contained file on purpose, so it also deploys from
   the dashboard (see `CLAUDE.md` → Conventions). Redeploy it whenever a topic
   is added.

   It only answers signed-in players, and migration 0009 adds a per-player
   rate limit plus daily budgets for brand-new Claude questions (once spent,
   players are served from the saved question bank). Optional secrets tune
   the limits: `QUESTION_RATE_PER_MINUTE` (default 20),
   `FRESH_PER_PLAYER_PER_DAY` (200), `FRESH_GLOBAL_PER_DAY` (5000).
4. **Password reset:** in Authentication → URL Configuration, add your site
   URL (and `http://localhost:5173` for dev) to **Redirect URLs** so reset
   emails can link back to the game.

The `questions` table is a shared, growing question bank. Every generated
question is cached and reused across players (with per-player dedupe), so
variety grows as more kids play. It is intentionally never pruned.

## Project layout

```
hazel-game/
├── src/
│   ├── machines/gameFlow.ts   # xstate machine: which screen the player is on
│   ├── store/                 # Zustand stores: save, battle, profile, settings, auth
│   ├── content/               # data-driven game content: zones, NPCs, enemies, quests, spells, story
│   ├── features/
│   │   ├── auth/              # sign-in / sign-up
│   │   ├── quiz/              # training rounds + topic select
│   │   ├── world/             # KaPlay overworld + DOM overlays (dialogue, shops, Spire)
│   │   └── battle/            # command battle (BattleArena + HUD/stage/menus/result)
│   ├── lib/                   # pure logic: battle math + turn rules, save migration, age/skill, audio
│   └── components/            # shared UI (QuestionCard, LevelBadge, StatusScreens…)
├── supabase/
│   ├── migrations/            # SQL schema, applied in order
│   └── functions/generate-questions/   # Deno Edge Function → Claude API
├── tools/assets/              # deterministic Python generator for sprites, tiles, and audio
├── public/                    # generated art + audio
└── docs/                      # design docs, story bible, roadmap, issues, test cases
```

## Documentation

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Architecture, decisions, conventions, and the feature log. Start here. |
| `docs/DESIGN-JRPG.md` | The JRPG design and target architecture |
| `docs/ROADMAP-4X.md` | The expansion plan (Acts II–IV, companions, parent dashboard) |
| `docs/STORY.md`, `docs/STORY-4X.md` | Story bible: cast, tone rules, story flags |
| `docs/ISSUES.md` | Running log of bugs, shortcuts, and open work |
| `docs/TEST-CASES.md` | Manual and automated test cases per feature |
| `docs/PRODUCTION-DB-SETUP.md` | Diagnose and fix a production Supabase that is missing migrations |
| `tools/assets/README.md` | Regenerating the art and audio |
