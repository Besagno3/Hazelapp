# Architecture reference

How each system of Hazel Quest works, one file per area. Until 2026-10-22
all of this was the Architecture section of `CLAUDE.md`; it moved here
verbatim so that `CLAUDE.md` (loaded every session) holds only what applies
everywhere, and an area's detail loads only when it's needed. Keep these
accurate: **when you change how a system works, change its file in the same
commit.** The matching `.claude/rules/*.md` file (repo root) names each
area's non-negotiables and points here when a file of the area is read.

| File | Covers |
|---|---|
| `decisions.md` | The stack table and every project decision, with its date and reasons |
| `auth-and-family.md` | Sign-in, the family and kids, PINs and their limits, the database-held 👪 Grown-ups window and password wait, 📈 Progress and days played, closing an account, password reset |
| `state-and-flow.md` | The game-flow machine, feature folders, `saveStore` (versions, revisions, which copy wins), `battleStore`, `authStore` / `profileStore`, the two progression systems |
| `content.md` | `src/content/`: topics and acts, zones and Tiled maps, NPCs, enemies and boss roles, companions, spells, field spells, dungeons, regions and danger tiers, the boat, the Spire, keys, items, quests, secrets, avatars |
| `world.md` | The overworld canvas and screen: terrain, transitions, overlays (`ModalLayer`), using things, the top bar, field spells, dungeons, inns, reachability, flying, Taleshore and Acts III–IV, the sea and sea critters, after the Spire |
| `minigames.md` | The mini-games (#189): the host's button, the stage (zoom, title card, play, reward), bands, pages and stars paid once, the shared look, each game's rules |
| `battle.md` | The command battle: spells, companions, hero types, timers, the speed trigger, danger tiers, mercy, the pure turn resolvers and the view split |
| `typing.md` | Touch typing (#165): lessons, the home-row hold, scribe bursts, the name race, the Scriptorium, the song, Falling Leaves, pangram chests, pen-pal replies |
| `questions.md` | `generate-questions`: access and budgets, the four screening layers and model settings, rechecks and reports, the review page and alerts, answer shuffling, loading without waiting, the cache and seen window |
| `backend-and-ci.md` | Applying the schema, the migration rules, the CI jobs and SQL tests, pull requests and Vercel |
| `errors.md` | Error handling in full: which helper words which screen, boundaries, lazy pages |
| `conventions.md` | The conventions in full |

Related: `../OPERATIONS.md` (benches, asset generation, deploy order, Supabase
settings), `../MAP-AUTHORING.md`, `../STORY.md`, `../ROADMAP-OVERWORLD.md`,
`../feature-log/` (what changed, by month), `../ISSUES.md`, `../TEST-CASES.md`.
