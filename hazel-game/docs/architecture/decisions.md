# Hazel Quest — Stack and Decisions

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

## Stack

| Layer       | Choice                                              |
|-------------|-----------------------------------------------------|
| Build       | Vite 8 (`@vitejs/plugin-react`, Oxc)                |
| UI          | React 18.3 + TypeScript 5.8                         |
| Styling     | Tailwind CSS 3.4 (`@tailwind` directives in `src/index.css`) |
| State       | xstate 5 (game flow) + Zustand 5 (`saveStore`, `battleStore`, `authStore`, `familyStore`, `grownUpsStore`, `profileStore`, `settingsStore`, `spireStore`, `finaleStore`, `keyboardStore`) |
| Backend     | Supabase (`@supabase/supabase-js`) — auth only so far |
| Animation   | Framer Motion 12, canvas-confetti                   |
| Audio       | Howler 2 (`lib/audio.ts` — music on, SFX off by default) |
| Game canvas | KaPlay 3001 (tile overworld, lazy-loaded with the world screen) |
| Testing     | Vitest 4 + Testing Library + jsdom (`npm test`)     |
| CI          | GitHub Actions (`.github/workflows/ci.yml`): lint + test + build (with placeholder Supabase settings, so it bundles the real app, #175) on every non-draft PR / push to `main` (check `test`), plus `edge-function` (deno check) and `migrations` (apply + SQL tests); draft PRs skip CI and Vercel previews (see Pull requests) |

`package.json` lists only packages the app actually imports (unused ones
were removed in #87). Still "approved to adopt" when a feature needs them:
react-router-dom + recharts, vite-plugin-pwa (PWA, #5), zod, react-query.
Add the package in the same change that first uses it. The parent dashboard
(#29) needed neither: it is a page inside 👪 Grown-ups (no router), and its
bars are plain HTML/CSS — recharts measured ~106 KB gzipped for one bar chart.

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
  topics start higher each birthday; where each topic really started is
  noted in the save the first time its level is saved, `topicStarts`, #29
  review round 2) and then moves with **performance**
  (quiz ramp, battle ramp, and the battle **speed trigger**: 5 quick correct
  answers in a row → +1 mid-battle). It sets quiz, gate, chest, Spire and
  battle questions and enemy levels. **XP / player level** only tracks
  progress and grants power-ups — leveling up never makes anything harder.
  The Training Grounds' opening rounds (before the world opens) pay **no
  XP** — XP starts in the world (#122, 2026-10-10).
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
  (settings, leaderboard). The parent dashboard became 👪 Grown-ups → 📈
  Progress (#29, 2026-10-21): a page inside the gated area, not a route.
- **Parent dashboard (#29, 2026-10-21):** it shows only what the database
  stores — no invented history. The days a kid played are stored for it
  (migration 0025 `play_days`, kept 14 days); XP over time is not, so there is
  no XP chart (#169). Charts follow the dataviz method: forms by job (one hero
  number, meters and cells with their values in words), one sequential hue
  plus the de-emphasis grey, validated against the card's surface.
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
  **Items 14–16 planned (2026-10-09):** the world is a **chain of overworld
  maps joined at their edges** (Dawnreach → the Silver Shallows → Taleshore
  past the Great Fogbank), not one big map; **Ember flies at crystal #5**
  (Memory — roadmap decision 9) and flight crosses map edges and fog; the rest
  is one PR per sub-item (14b–14i, 15a–15h, 16a–16f, roadmap §5.1), each
  followed by `/saas-code-review` + `/saas-ux-review`, groundwork first (a
  fifth crystal must leave Act I untouched). Scope is what the acts need —
  charms / the 4× economy, Vela and Aster as companions, New Game+ and side
  dungeons stay in `ROADMAP-4X.md`.

