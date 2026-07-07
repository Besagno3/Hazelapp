# Hazel Quest — 4× Expansion Roadmap

Goal: grow the story and game to roughly **4× today's content and playtime**
(~3–5 h → ~15–20 h) without breaking the tone, the learning loop, or existing
saves. Companion docs: `STORY.md` (writing bible), `DESIGN-JRPG.md` (original
design), `CLAUDE.md` (architecture + feature log), and **`STORY-4X.md` — the
expansion bible**: the full end-to-end content spec for Acts II–IV (every
zone, NPC, enemy, boss, quest, spell, item, cutscene, and flag). This doc is
the *delivery plan*; STORY-4X.md is *what gets built*.

---

## 1. Where the game is today (baseline audit)

### Content inventory

| Dimension | Today | 4× target |
|---|---|---|
| Zones | 11 (7 combat, hub, village, Spire, Grove) | ~40 |
| Crystal topics (full zone + Sage + Fiend) | 4 | 6 |
| Question topics total | 7 | 10–12 |
| NPCs | 33 | ~120 |
| Enemy defs | 28 (+ Umbra) | ~100 |
| Bosses | 8 (4 Fiends, 3 wardens, Umbra) | ~28 |
| Quests | 6 | ~25 |
| Cutscene panels | ~37 | ~150 |
| Spells | 7 | ~18 |
| Shop items | 4 | ~20 |
| Companions with mechanics | 0 (Ember is story-only) | 3–4 |
| Playable acts | 1 saga (crystals → Spire → Umbra) | 4 acts |

### What's strong (build on it, don't rebuild it)

- **The core loop is proven and complete.** Quiz training → open-world
  crystals → wardens/keys → Spire finale is a full FF1-style arc with a real
  ending. Expansion means *more acts*, not fixing act one.
- **The content layer is data-driven.** Adding same-shaped content — enemies,
  NPCs, quests, spells, Spire floors, zones — is "add an entry to a registry,"
  test-guarded (218 tests, zone invariants, quest flows).
- **Learning IS the mechanic.** Questions power attacks, spells, gates,
  chests, and the Spire. Every new topic instantly multiplies across all of
  it via the AI question generator (age + skill scaled, cached).
- **The story bible works.** One warm register, formulaic-but-effective
  patterns (Sage + villager + merchant per zone, Fiend voice formula, warden
  signposts), a flag glossary, and pre-planted hooks (STORY.md §8:
  companions, New Game+, a 5th crystal, Ember side-moments).

### What will resist a 4× expansion (fix these first)

1. **The four-crystal assumption is hardwired.** `CrystalTopic` is a closed
   union of exactly 4 (`types/index.ts:5`); `SAGES`, `BOSS_LINES`,
   `CRYSTAL_PANELS` are exhaustive `Record<CrystalTopic, …>`; Ember's growth
   stages and the Spire seal are keyed to crystal counts 2/4. A 5th crystal
   touches ~8 files today.
2. **No real save migration.** `SaveData.version` is a literal `1`;
   `normalizeSave` coerces fields but there is no versioned ladder. Any
   structural save change (party, inventory, world-map position) risks
   existing players.
3. **Everything loads eagerly.** `ZoneId` is a closed union, `ZONES` a single
   static record imported at once; `topicInfo`/`spawnEnemy` use non-null
   `.find()!`. Fine at 11 zones, worth restructuring before 40.
4. **New topics require an edge-function redeploy.** The topic whitelist and
   persona prompt are hardcoded in `generate-questions/index.ts` — every
   topic launch is a manual Supabase deploy (bitten repeatedly per ISSUES).
5. **Enemy variety is cosmetic.** All 7 combat zones use the same 3-critter
   ladder (−1/0/+1) with identical mechanics; only sprite/name/topic differ.
   4× more of the same template will feel like reskins.
6. **Art is still emoji.** The sprite pipeline (`sprites.ts`, `SpriteSheet`,
   KaPlay anims) is fully built but the `SPRITES` manifest is empty. Content
   4× with placeholder art undersells the work.
7. **Unbounded growth risks:** `questions`/`question_views` tables have no
   pruning; save `flags`/`kills`/`badges` grow with content (fine, but the
   JSONB blob should be watched); docs already drifted (STORY.md says 10
   zones, code has 11 — Moonwell Grove is not in the bible).

---

## 2. The expanded story — one saga → four acts

Everything below grows from seeds already planted in STORY.md. Umbra's voice
("ancient, tired, oddly lonely — never cruel") is the thread: the expansion
is the story of *why the world chose to forget*, and it ends in redemption,
not a bigger monster. Tone rules unchanged: wonder over peril, effort praised,
learning heroic.

### Act I — The Four Crystals *(shipped)*
Fog, Fiends, Ember, four crystals, the Spire climb, Umbra falls
("out-remembered… by a child…").

### Act II — The Crystal of Memory
When Umbra unravels, the world *remembers* — and remembered places wake up.
The **History** topic (already live as an extra topic) becomes the **5th
crystal**: the Crystal of Memory, exactly the pairing STORY.md §8 predicted.

- **New region cluster (4 zones):** the Sunken Archive (a library the world
  forgot it had), the Eldergrove (trees that remember every season), a
  Memory-themed crystal zone with **Sage Chronicle** and a new Fiend — the
  **Hollow Fiend**, a leftover *hand* of Umbra that never got the news.
- **Narrative engine:** returning memories change existing zones — villagers
  gain "now I remember…" dialogue lines (pure flag-reactive `npcs.ts` work),
  Grandmother Wick and Elder Lumen reveal what the world forgot: **who Umbra
  used to be** (setup for Act IV).
- **Mechanical payoff:** proving the crystal system is now open (Act 0
  refactor) by shipping crystal #5 through it.

### Act III — Across the Starfall Sea
Old Marlow's fish "forgot the way home" and Vela's stars all have question
names — the Coast has been pointing across the water since #55. Ember, now
full-grown, can **fly the hero to a second landmass**.

- **A new continent (~10 zones):** islands themed to **new question topics**
  — Geography/World ("the Wayfinder Isles"), Reading & Words ("the Story
  Reef"), Music & Art expansion of Wonder. One new crystal (#6, the Crystal
  of Voices) + wardens, following the proven region template.
- **Travel system:** a world map / fly-travel screen (Ember as the vehicle —
  affection made mechanical), fast-travel back to any save crystal.
- **The mystery deepens:** the fog never touched this continent — because
  the people here *never forgot*. They remember Umbra's name.

### Act IV — The Name of the Forgotten One
The finale: Umbra was **Lumina's first Sage**, who took every sad and
forgotten thing into itself so the world could stay bright — until it was
forgotten too. The fog was never an attack; it was loneliness.

- **The Dream Root dungeon:** a below-the-Spire gauntlet (Spire-climb
  engine reused, descending) through Lumina's oldest memories.
- **The true ending:** the hero doesn't defeat Umbra again — they **answer
  its question**: its forgotten name. Umbra becomes **the sixth Sage**,
  teacher of the hardest questions, and a New Game+ companion.
- **New Game+ proper:** Fiends return with "trickier riddles" (higher skill
  bands, remixed dialogue — already hooked in `spireVictoryPanels`).

### Continuous story texture (cheap, high-impact, any time)
- **Ember side-moments:** snack-finding micro-beats per zone (STORY.md §8).
- **Reactive dialogue passes:** every act flips more villager lines.
- **Seasonal/ambient beats:** Lantern-Keeper Sol's lanterns, Bramble's bread,
  Wisp growing more solid as questions get answered.

---

## 3. Delivery roadmap — six waves

Each wave is shippable on its own; story acts alternate with system waves so
the game gets deeper, not just wider.

### Wave 0 — Foundations (unblocks everything; no visible content)
1. **Open the crystal system:** derive `CrystalTopic` from `TOPIC_REGISTRY`,
   replace exhaustive `Record`s with registry lookups, derive Ember stages
   and the Spire seal from `TOTAL_CRYSTALS` instead of literal 2/4.
2. **Versioned save migrations:** a `migrations: {1→2, 2→3…}` ladder in
   `lib/save.ts` ahead of any `SaveData` shape change (party, travel, NG+).
3. **Registry-driven zones:** `ZoneId` derived from the `ZONES` record; add
   region grouping and (optionally) lazy per-region zone modules.
4. **Topic config out of the edge function:** move the topic whitelist +
   persona lines to a Supabase table (or a shared generated constant) so new
   topics don't require hand-edited redeploys. Add `questions` /
   `question_views` pruning (e.g. cap views per profile, retire never-reused
   rows).
5. **Enemy behavior variants:** 3–4 mechanical archetypes (e.g. *shielded* —
   must Guard first; *swift* — answers are timed; *trickster* — decoy
   options; *healer* packs) so new zones differ in play, not just palette.
6. **Art first slice:** fill the empty `SPRITES` manifest for heroes + Ember
   stages + one zone (plan already in `ASSET-SOURCING.md`). Content waves
   then ship art zone-by-zone.
7. **Doc sync:** fold Moonwell Grove into STORY.md; add the act structure.

### Wave 1 — Act II: The Crystal of Memory
- 4 zones, ~12 NPCs, 1 Sage, 1 Fiend + 1 warden, 4 quests, ~20 panels.
- History graduates from extra topic → crystal topic (validates Wave 0.1).
- "The world remembers" reactive-dialogue pass across all existing zones.
- 2 new quest mechanics: **escort** (walk an NPC through a zone) and
  **collection** (multi-chest scavenger with riddle hints).

### Wave 2 — Companions & Ember in battle
- **Party of two:** recruit Pip after Act II (he has begged since #37); one
  companion action per turn cycle (Pip: hint — removes a wrong option;
  Wisp: charge boost; later, Sage Chronicle: reveal enemy weakness).
- **Ember battle action** finally lands (deferred from phase 4): one
  fetch/roar assist per battle, scaling with Ember's stage.
- Save v2 (party state) rides the Wave 0 migration ladder.
- New spells tier: each companion adds 1–2 Spellbook entries (~12 total).

### Wave 3 — Act III: The Starfall Sea
- Fly-travel + world map screen; ~10 island zones in 2–3 sub-regions.
- 2–3 new question topics (Geography, Reading & Words, Music/Art) — cheap
  now that topics are table-driven; crystal #6 (Voices), 2 wardens, 1 Fiend.
- ~30 NPCs, 8 quests (new mechanics: **puzzle chains** — ordered riddle
  sequences; **lighthouse timed challenge** — soft timer, kid-gentle).
- Economy 4×: equipment-lite (charms with power-up-style bonuses), ~20 shop
  items, a badge/collection book in the menu, coins sinks (inn upgrades,
  cosmetic Ember accessories).

### Wave 4 — Depth pass: replayability & parents
- **New Game+**: remixed Fiends, +2 skill bands, remixed dialogue.
- **Side dungeons:** 2–3 optional mini-Spires (the climb engine is reusable)
  with topic-focused gauntlets and trophy rewards.
- **Daily play loop:** rotating "Wonder of the Day" question challenge at
  the Library (streak system already exists to hook into).
- **Parent dashboard** (react-router page, per the standing decision):
  per-topic skill progression, streaks, flagged questions — recharts is
  already installed and "approved to adopt."

### Wave 5 — Act IV: The Name of the Forgotten One
- The Dream Root descent (5–7 floors), Umbra's memory zones (3–4), the
  name-answering finale, Umbra as sixth Sage + NG+ companion.
- Full-cast epilogue pass (every named NPC gets an ending line — the
  gratitude-flip system already does this per-crystal).
- ~25 panels; the true-true ending.

---

## 4. Cross-cutting workstreams

| Workstream | Cadence | Notes |
|---|---|---|
| **Writing** | per wave | STORY.md grows a §per act; keep the voice rules, Fiend formula, one-joke-per-villager |
| **Art (sprites)** | 1 zone-cluster per wave | pipeline exists; emoji remains the automatic fallback so art never blocks |
| **Audio** | per wave | new region themes; engine (#60) already handles missing files gracefully |
| **Question quality** | continuous | flag-review loop exists; add per-topic sampling review when a topic launches |
| **Testing** | per wave | keep the invariant style: zone reachability BFS, quest flows, registry exhaustiveness — these are what make data-driven 4× safe |

## 5. Ops & risks

- **No CI:** every wave merges only after local `npm run lint && npm test
  && npm run build` — keep the 218-test bar green.
- **Supabase prod drift is the #1 live risk** (see ISSUES #61): every wave
  that adds a migration or topic must include applying it to prod +
  redeploying `generate-questions` (CLI/dashboard, not the SQL editor).
  Wave 0.4 (table-driven topics) shrinks this risk permanently.
- **Save safety:** never change `SaveData` shape without a ladder step +
  tests against real v1 fixtures.
- **KaPlay density:** wanderer collision is per-frame vs the live actor
  list; keep per-zone actor counts near current levels (~8–10) and prefer
  more zones over denser ones.
- **Claude API cost:** more topics × more players = more fresh generations;
  the `chooseFreshCount` cache policy already amortizes this — monitor the
  cache hit rate as topics launch.

## 6. Suggested sequencing summary

```
Wave 0  Foundations            engine refactors, art slice, topic table
Wave 1  Act II — Memory        5th crystal, 4 zones, world reacts
Wave 2  Companions             Pip + Ember in battle, save v2
Wave 3  Act III — Starfall Sea new continent, 6th crystal, new topics, economy
Wave 4  Depth                  NG+, side dungeons, daily loop, parent dashboard
Wave 5  Act IV — The Name      Dream Root, Umbra's redemption, epilogue
```

Waves 1–5 each land roughly +6–10 zones' worth of content/systems; together
they take the game from one 3–5 hour saga to a four-act, ~15–20 hour world —
the 4× target — while every intermediate state is a complete, shippable game.
