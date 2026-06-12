# Hazel Quest — JRPG Design Doc

> **Vision:** an educational game for kids that *feels* like a classic NES/SNES
> JRPG — Dragon Warrior / Final Fantasy 1, 2, 4, 6 — where exploring a 2D open
> world and fighting side-profile battles is powered by answering educational
> questions. Learning is the magic system.

Status: **draft for review** · Author: Claude (design pass) · Date: 2026-06-12

This document covers: (1) a review of the app as it stands, (2) the target
architecture, (3) the game/systems design referencing FF1/2/4/6, (4) a phased
roadmap, and (5) an explicit list of what Claude can and cannot build.

---

## 1. Review — where the app is today

The good news: **the hard, boring infrastructure is already done and done
well.** The current app is a quiz-battle web game with a production-grade
education pipeline. The gap is almost entirely on the *game* side.

### What exists and should be kept as-is

| System | State | Verdict |
|---|---|---|
| AI question pipeline | Claude API via Supabase edge function; server-side key; level-tagged cache; smart fresh-vs-cached mix; per-player dedupe; flag/quarantine loop; missed-question recap | **Keep.** This is the most valuable asset in the repo and maps 1:1 onto every JRPG mechanic below. |
| Difficulty model | Age-derived starting level + persistent per-topic skill ramp (up fast on streaks, down slowly) | **Keep.** This *is* FF2's "skills grow by use" system, already built. |
| Progression | XP → player level (`lib/level.ts`), level-up power-up choices with soft-capped stacking, daily streaks | **Keep**, extend into JRPG stats. |
| Auth + profiles | Supabase auth gates the app; `profiles` row with birth date, skills, XP, power-ups, streaks | **Keep.** |
| Testing/tooling | Vitest wired, ~100 test cases, strict TS, doc-update pre-commit ritual | **Keep.** |

### What exists but is a placeholder for the JRPG vision

- **"Open world" (#36)** — a single 640×480 KaPlay screen, solid green fill,
  colored rectangles with emoji for the player and 4 corner NPCs. No tiles, no
  obstacles, no screens-to-walk-between, no dialogue, keyboard-only. It proves
  KaPlay works in the React lifecycle (StrictMode removed, container-div
  mounting, `quit()` on unmount — real lessons already learned), but it is a
  tech demo, not a world.
- **Battle (`BattleArena.tsx`)** — a quiz screen with HP bars and two giant
  emoji that shake via Framer Motion. Mechanically it's already turn-based
  (player attack round / NPC attack round, damage from % correct) — the *bones*
  of an FF battle loop are here — but there is no scene, no sprites, no
  abilities, no party, no commands. It's "answer 3 questions, watch a bar move."
- **World/NPC structure** — NPCs are random per visit (`lib/npc.ts`), nothing
  persists (defeated NPCs respawn, player respawns at center after battles).
  There is no notion of *place*, *quest*, or *story* anywhere in the data model.

### Structural debts that block the JRPG (already logged as issues)

- **#11** — phase routing is a flat `gameStore.phase` string; guarded
  transitions are already leaking into render logic (`App.tsx`'s avatar gate).
  A JRPG flow (world ⇄ dialogue ⇄ battle ⇄ menu ⇄ results ⇄ cutscene) will
  not survive this; the planned xstate migration becomes a prerequisite.
- **#12** — progress lives in localStorage under one fixed key, not per user.
  "My daughter and friends" on a shared tablet = they overwrite each other.
  A JRPG needs real save files; this must move to Supabase.
- **#33** — the four topics are hardcoded in 4+ places. The JRPG makes topics
  load-bearing (zones, crystals, bosses are per-topic), so the topic registry
  abstraction graduates from nice-to-have to required.
- **#5** — PWA unconfigured; matters for tablets/Chromebooks at school.

**Overall review verdict:** strong educational engine, disciplined codebase,
near-zero game layer. The right move is *not* a rewrite — it's to build the
JRPG shell around the existing pipeline. Nothing in the current data flow
(profiles → skill level → edge function → questions → XP) needs to change.

---

## 2. Creative direction — the FF references, made concrete

What each reference game actually contributes to this design:

| Game | What we take from it |
|---|---|
| **FF1** | The macro-structure: **four elemental crystals, four fiends, four regions**. We map them 1:1 to the four topics. Restore the crystals by mastering the subjects. Towns + overworld + dungeons loop. |
| **FF2** | **Skills grow by use.** Already implemented as the per-topic skill ramp — answering math questions makes you better at (and challenged by) math. We surface it in-fiction: "Your Math arts grew to Lv 6!" |
| **FF4** | **ATB and character drama.** We take the *visual language* of ATB (a charging action gauge) but not its time pressure — kids mid-read must never be rushed. The gauge charges from *correct answers*, not wall-clock time. Also FF4's scripted party moments → our recruited companions. |
| **FF6** | **Espers/magicite → learnable abilities, ensemble cast.** Topic Sages (Esper analogues) grant Special Attacks; equipping a Sage shapes what you learn. Multiple playable kids (avatar roster) with distinct fight styles already exist in embryo (`fightStyle`). |
| **Dragon Warrior** | Tile-by-tile readability, talk-to-everyone NPC dialogue, "thou hast learned" tone for level-ups. |

> ⚠️ **Legal line:** these are *mechanical and structural* references only. No
> Square Enix sprites, music, names, monster designs, or trademarked terms
> (chocobo, Esper, Cure, etc.) may appear in the game. All assets must be CC0 /
> properly licensed, and all naming original.

### The fiction (one paragraph)

The world of **Lumina** is lit by four Crystals of Knowing — **Numbers**
(math), **Nature** (science), **Gears** (engineering), and **Wonder**
(creativity). A fog of Forgetting has dimmed them, and four Fiends hoard the
light. The hero (the player's avatar) journeys across Lumina, learning from
Sages, helping townsfolk, and battling the Fiends' minions — every question
answered returns a spark of light to a crystal. Restore all four to win…
and then a New Game+ at higher skill levels, because the skill ramp never ends.

### Educational beats woven into JRPG furniture

| JRPG furniture | Educational mechanic |
|---|---|
| Random/visible encounters | Battle = answer questions to attack/defend (exists today) |
| Special attacks / magic | Answer a **harder** (level +2) bonus question to unleash a Special — bigger damage, cool animation. Wrong answer = fizzle (no damage to self; never punish trying) |
| Locked doors, bridges, gates | A Gatekeeper asks 1–3 questions to pass ("questions along the path") |
| Treasure chests | Question-locked; the loot is coins/badges/a fun fact |
| Towns → Library | The missed-questions recap, reskinned: re-answer past misses for bonus XP |
| Towns → Inn | Restore HP, advance the day (ties into the daily streak) |
| Sages (Esper analogue) | Equip a Sage → your Specials draw from that topic; mastering a topic (skill level milestones) unlocks new Specials |
| Boss = topic Fiend | Multi-phase battle, question difficulty ramps per phase, beating it "restores the crystal" (major story flag) |
| Save crystals | Diegetic save points that write the Supabase save file |

Design rules for kids (deviations from the classics, on purpose):

1. **No random encounters.** All encounters are visible on the map and
   approachable/avoidable (modern kid-friendly standard; random battles are
   the #1 frustration of the originals).
2. **No game over.** Losing a battle returns you to the last town with HP
   restored and a kind word. Lost XP/items: never.
3. **No time pressure on reading.** Turn-based, player-paced (the Next-button
   lesson from #22 applies everywhere).
4. **Wrong answers teach.** Every miss shows the explanation (exists) and gets
   queued for the Library.

---

## 3. Target architecture

### 3.1 The big split: canvas world, DOM battles

Two render technologies, chosen per job:

```
┌────────────────────────────────────────────────────────────┐
│ App shell (React)                                          │
│  ├─ xstate game-flow machine  (replaces gameStore.phase)   │
│  │    world ⇄ dialogue ⇄ battle ⇄ menu ⇄ results ⇄ scene  │
│  ├─ Zustand stores (data only: profile, save, settings)    │
│  │                                                         │
│  ├─ OVERWORLD — KaPlay canvas (lazy chunk, exists)         │
│  │    Tiled JSON maps → addLevel(); sprite-sheet actors;   │
│  │    grid-ish movement; interaction zones; screen-edge    │
│  │    transitions; on-screen d-pad for touch               │
│  │                                                         │
│  └─ BATTLE — React DOM + Framer Motion (no canvas)         │
│       layered parallax backdrop (3–4 PNGs)                 │
│       side-profile sprite sheets (CSS steps() animation)   │
│       command menu / question card / damage numbers / HP   │
│       pseudo-3D: perspective ground plane, scale-by-depth, │
│       camera-punch transforms on hits                      │
└──────────────┬─────────────────────────────────────────────┘
               │
   Supabase: auth · profiles · questions cache · views/flags
             · NEW: saves · story_flags via save · content is
               client-side data, not DB
               edge fn: generate-questions (unchanged contract,
               + optional "context" hint for flavored questions)
```

**Why DOM for battles (the "more 3D / side profile" requirement):** FF-style
battles are, mechanically, a UI: menus, text, numbers, and a handful of sprite
poses on a painted backdrop. DOM + Framer Motion gives us free text rendering,
accessibility, and the question card we already have — while CSS 3D transforms
(`perspective`, `rotateX` on the ground plane, depth-scaled actors, parallax
layers) deliver the "lightly 3D" SNES-Mode-7 feel. True 3D (Three.js, models,
rigs) was considered and **rejected**: the asset pipeline alone (modeling,
rigging, animation) dwarfs the rest of the project and can't be sourced CC0 at
consistent quality. Side-profile 2.5D is both the stated preference and the
achievable target.

**Why KaPlay stays for the overworld:** it's already integrated (with the
React-lifecycle scars healed), it loads Tiled-style ASCII/JSON levels via
`addLevel`, handles sprite sheets and collisions, and is 70 KB gzip in a lazy
chunk. Swapping to Phaser/Excalibur now would re-pay the integration tax for
marginal gain. Revisit only if KaPlay's maintenance stalls.

### 3.2 Game-flow state machine (resolves #11)

One xstate machine owns *where the player is*; Zustand keeps *what the player
has*. Sketch:

```
worldMachine
├─ exploring            (KaPlay scene active)
│   ├─ on TALK    → dialogue
│   ├─ on ENCOUNTER → battle
│   ├─ on CHEST/GATE → pathQuestion
│   ├─ on EDGE    → exploring (new zone, guarded by story flags)
│   └─ on MENU    → menu
├─ dialogue             (DOM overlay; canvas paused, not unmounted)
├─ pathQuestion         (question card overlay; success/fail branches)
├─ battle
│   ├─ intro → playerTurn → resolveAction → npcTurn → resolveAction
│   ├─ playerTurn: { command: attack | special | guard | flee }
│   │     attack  → question(level = npc.level)
│   │     special → question(level = npc.level + 2), gated on Sage + charge
│   └─ → victory | defeat → results
├─ results              (XP, loot, skill-ramp toast, level-up modal)
└─ menu                 (party, sages, badges, library, save, settings)
```

Guarded transitions (the thing the flat phase string can't do): zone edges
check story flags; `special` checks Sage equipped + charge; `defeat` routes to
town, never to game-over.

**Battle ⇄ overworld handoff:** the KaPlay context *pauses* for overlays
(dialogue, path questions) and fully unmounts only for battles (different
screen). Player position, facing, and zone persist in the save state so
returning from battle restores the exact spot (fixes the respawn-at-center
issue from #36).

### 3.3 Content layer — data-driven world (resolves #33)

All world content is **typed TypeScript data + Tiled JSON**, versioned in the
repo under `src/content/`. No CMS, no DB tables for content — content ships
with the build, saves reference it by ID.

```
src/content/
├─ topics.ts        TOPIC_REGISTRY: id, label, icon, color, claudePersonaHint,
│                   crystalName, fiendName, zoneId   ← single source of truth
├─ zones/
│   ├─ index.ts     ZONE_REGISTRY: id, displayName, topicId?, tilesetId,
│   │               mapFile, music, encounters[], exits[], requiredFlags[]
│   ├─ overworld.json     ← Tiled exports (or hand-authored ASCII grids
│   ├─ town-numbria.json     for v1 — KaPlay addLevel accepts both)
│   └─ …
├─ npcs.ts          Keyed NPC defs: sprite, dialogue tree, role
│                   (villager | sage | gatekeeper | merchant | enemy | fiend)
├─ encounters.ts    Enemy formations per zone: enemyId, level offset, loot
├─ abilities.ts     Specials: id, sageId, name, animationId, damage curve,
│                   unlock skill-level milestone
├─ dialogue.ts      Dialogue trees (typed; supports flag checks/sets)
└─ quests.ts        Quest defs: trigger, steps, flags, reward
```

Random per-visit NPCs (`lib/npc.ts`) are retired in favor of authored
encounters; the level-randomization logic survives inside encounter defs
(level = playerAgeLevel + offset). Adding a fifth topic (history…) becomes:
one `topics.ts` entry + one zone folder + edge-function persona hint.

### 3.4 Save system (resolves #12)

New Supabase table `saves` (one row per profile, JSONB snapshot + updated_at):

```ts
interface SaveData {
  version: number;            // migration-able
  zoneId: string;
  position: { x: number; y: number; facing: Dir };
  party: { avatarId: string; companions: string[] };
  sageEquipped: string | null;
  hp: number;
  flags: Record<string, boolean>;   // story: 'crystal-numbers-restored', …
  badges: string[];                  // equipment-lite
  coins: number;
  defeatedNpcIds: string[];          // per-session-or-permanent per def
  libraryQueue: MissedQuestion[];    // misses awaiting re-answer
}
```

Write-through: localStorage immediately (offline/latency), Supabase on save
points + auto-save on zone change and battle end. Load order: Supabase wins;
localStorage is a cache keyed by user id (kills the shared-tablet bug). The
existing `gameStore` shrinks to ephemeral session state (current battle,
active overlay); `progress`/`avatar` migrate into `SaveData`.

### 3.5 Battle system (the FF layer on the existing loop)

The current loop (alternating attack/defend rounds, damage = f(% correct))
generalizes into commands:

| Command | Question? | Effect |
|---|---|---|
| ⚔️ **Attack** | 1 question at enemy level | Hit for base × style × power-ups (the existing `calcAttackDamage`) |
| ✨ **Special** | 1 question at enemy level **+2** | Requires equipped Sage + full charge gauge; 2–3× damage + big animation; fizzles harmlessly on a miss |
| 🛡️ **Guard** | 1 question at enemy level −1 | Halve the next enemy hit on success (an *easier* question — the self-mercy option) |
| 🏃 **Flee** | none | Always succeeds outside boss battles (no-game-over principle) |

- **Charge gauge** (the FF4 ATB homage): +1 segment per correct answer, 3 to
  fill. Visible, satisfying, zero time pressure.
- **Enemy turns** stay as defend-questions (current mechanic) — correct
  answers block damage. It works; keep it.
- **Companions** (FF6 ensemble nod, phase 4): up to 2 recruited story NPCs
  who auto-act each round with small effects (heal, chip damage) so the kid's
  answers stay the only skill input.
- **Bosses (Fiends):** 3 phases, +1 question level per phase, scripted
  mid-battle dialogue, Special-only final blow for drama.
- XP/streak/skill-ramp writes at battle end are already correct — untouched.

**Presentation:** enemy side-profile sprite left, party right (the FF
convention), 2–4 frame idle bounce, attack lunge, hit flash, floating damage
numbers, backdrop themed per zone. All achievable with sprite sheets + Framer
Motion + CSS keyframes — "light animation" exactly as scoped.

### 3.6 Question pipeline integration (almost untouched)

The edge function contract stays. Two additive changes:

1. Optional `context` field ("battle vs the Gear Fiend", "gatekeeper at the
   Numbers Bridge") appended to the prompt for lightly-flavored questions —
   cached questions remain context-free and reusable, so cache economics are
   unaffected (flavor only on fresh generations).
2. The **Library** consumes the existing missed-question recap data: re-answer
   old misses in town for bonus XP. Closes the learning loop and reuses
   `question_views`.

Prefetch discipline (already in `lib/questions.ts`) extends naturally: entering
a zone prefetches its encounter questions; opening battle prefetches the
Special-tier (level +2) batch.

### 3.7 Asset plan

| Asset | Source | Notes |
|---|---|---|
| Tilesets (overworld, town, dungeon) | Kenney (CC0), OpenGameArt CC0 packs (e.g. "Tiny 16", "Zelda-like" sets) | 16×16, `imageRendering: pixelated` already in place |
| Character/enemy sprite sheets | Same CC0 sources; consistent 16/32 px scale | 4-dir walk for overworld; side idle+attack for battle |
| Battle backdrops | CC0 pixel landscapes, or layered gradients + tile props as v1 | 3–4 parallax layers each |
| Music/SFX | CC0 chiptune packs (OpenGameArt, Pixabay CC0) via **howler** (installed, unused) | Per-zone theme, battle theme, fanfare |
| Fonts | A pixel font (e.g. "Press Start 2P", OFL) for the JRPG chrome | Keep a readable font for question text — legibility beats theme |

Everything must be license-verified before commit; a `docs/CREDITS.md`
attribution file is created in phase 1 and maintained per asset.

---

## 4. Roadmap

Phases ship independently playable improvements; the existing quiz game keeps
working throughout (the JRPG grows around it, never breaks it).

### Phase 0 — Foundations (debt that blocks everything)
- xstate game-flow machine replacing `gameStore.phase` (#11); Zustand → data only
- Supabase `saves` table + write-through save system; per-user persistence (#12)
- `TOPIC_REGISTRY` in `src/content/topics.ts`; thread through UI + edge fn (#33)
- **Exit:** same game as today, but flow is a machine and progress follows the user.

### Phase 1 — A real overworld
- Tiled/ASCII tilemap loading in KaPlay; real CC0 tileset; collision layer
- 1 town + 1 overworld zone + zone-edge transitions; position persists
- Sprite-sheet player with 4-dir walk animation; on-screen d-pad (touch)
- NPC dialogue overlay (DOM) with typed dialogue trees; gatekeeper path-questions
- Authored encounters replace random NPCs; defeated state persists in save
- **Exit:** walk from town through a gate (answer to pass) to a field, talk to villagers, fight a visible enemy, return — position and defeats remembered.

### Phase 2 — The FF battle scene
- Side-profile battle screen: parallax backdrop, sprite actors, pseudo-3D ground
- Command menu (Attack / Special / Guard / Flee) on the xstate battle machine
- Charge gauge; Specials with question-level +2 and a signature animation each
- First Sage (grants the first Special); damage numbers, hit flash, victory fanfare
- **Exit:** a battle a kid would screenshot.

### Phase 3 — Story & content build-out
- All 4 topic zones (town + field + small dungeon each) and the 4 Fiend bosses
- Quest system + story flags; crystal-restoration arc; opening/ending scenes
- Library (missed-question re-answer), Inn (heal + streak tie-in), save crystals
- Treasure chests, badges (equipment-lite), coins + a simple shop
- **Exit:** the game is completable start-to-finish (~4–6 hours of kid play).

### Phase 4 — Polish & the grown-ups
- Music + SFX throughout (howler); settings (volume, text size)
- PWA (#5): installable on tablets, offline shell, question-cache offline mode
- Parent dashboard (#29): per-topic progress, streaks, missed questions
- Companions; New Game+; friends leaderboard (the "and friends" hook)
- **Exit:** shippable to other families.

Sequencing rationale: 0 before everything (machine + saves are load-bearing);
1 before 2 because the world produces the encounters battles consume; content
(3) only after both loops are fun; polish (4) last because it multiplies
whatever exists.

---

## 5. What Claude can and cannot build

### ✅ Can build (code — the large majority of this doc)

- The xstate game-flow machine, save system, and all Supabase migrations/SQL
- The entire content layer: registries, dialogue trees, quests, zone defs —
  including **authoring the maps themselves** as ASCII/JSON grids (hand-placing
  a Tiled-equivalent map in code/data is normal work)
- KaPlay overworld: tilemap loading, collision, sprite animation wiring,
  zone transitions, interaction zones, touch d-pad
- The full DOM battle scene: layout, command system, charge gauge, sprite-sheet
  CSS/Framer animations, damage numbers, pseudo-3D transforms
- Edge-function changes, prefetch strategy, Library, shop, badges, bosses
- Audio wiring (howler), PWA config, parent dashboard, tests for all of it
- **Placeholder/simple pixel art generated programmatically** (small PNGs,
  SVG sprites) — functional but visibly "programmer art"

### ⚠️ Can do partially / with caveats

- **Sourcing CC0 asset packs:** Claude can identify exact packs, write the
  loading code, and document licenses — but downloading binaries depends on
  this environment's network policy, and binary assets are better reviewed by
  a human before committing. Expect a "here are the 3 packs to grab, drop them
  in `public/assets/`, everything is pre-wired" handoff.
- **Tiled editor files:** Claude can write Tiled-compatible JSON by hand and
  it will load fine, but visually *designing* a beautiful map iteratively is
  much faster for a human in the Tiled GUI. Claude's maps will be competent,
  not gorgeous.
- **Balancing:** damage curves, XP pacing, question-difficulty feel — Claude
  ships sane first values + tuning constants in one file, but real kids
  playtesting (your daughter!) is the only true balancing tool.

### ❌ Cannot build

- **Original production-quality pixel art or animation frames** — character
  designs, monster art, portraits. Source: CC0 packs or a human artist.
- **Music composition / audio recording** — same: CC0 packs or a human.
- **True 3D battle scenes** (models, rigs, Three.js pipeline) — explicitly
  out of scope per §3.1; the side-profile 2.5D approach is the deliverable.
- **Anything derived from Square Enix / Enix IP** — no FF sprites, music,
  names, or designs, full stop. Inspiration only.
- **Live operations:** applying Supabase migrations to your project, deploying
  edge functions, and setting secrets remain manual steps (as they have been
  for migrations 0001–0007) — Claude writes them, you run them.
- **Device testing:** real-tablet touch feel, Chromebook performance — needs
  human hands on hardware.

---

## 6. Open questions (for the product owner)

1. ~~**Party fantasy:**~~ **DECIDED (2026-06-12): hero + story companions.**
   One hero (the player's avatar); companions are recruited story NPCs
   (FF6-style ensemble, AI-controlled in battle per §3.5). Friends each play
   their own save/hero; the "friends" social layer stays leaderboard/async
   (phase 4), not a shared party.
2. **Reading level for dialogue:** should NPC dialogue text adapt to age the
   way questions do, or is one kid-friendly register fine? (Doc assumes one
   register; adaptive dialogue is possible via the same edge function later.)
3. **Coins/shop economy:** include (more JRPG-authentic, more to balance) or
   defer behind badges-only? (Doc includes a *simple* shop in phase 3.)
4. **"Friends" mode:** is leaderboard/async enough, or is same-screen co-op a
   real wish? (Co-op is a major scope add; not in this doc's phases.)
