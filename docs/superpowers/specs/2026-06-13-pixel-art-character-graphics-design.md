# Pixel-Art Character Graphics — Design Spec

**Date:** 2026-06-13
**Status:** Approved (design); pending implementation plan
**Scope:** Vertical slice — replace emoji character graphics with animated pixel-art sprites for the Verdara (Science) zone cast plus always-present characters, behind a reusable sprite system with emoji fallback.

---

## 1. Goal

Raise the visual quality of character graphics in both the open world and battle by replacing the current emoji-only rendering with **animated pixel-art sprites**. Deliver a reusable sprite pipeline and prove it end-to-end on a small slice before rolling out to the full roster.

## 2. Decisions (locked)

| Decision | Choice | Notes |
|----------|--------|-------|
| Art style | **Pixel art** | Matches the JRPG; aligns with the existing "CC0 packs later" note in CLAUDE.md. |
| Identity vs cohesion | **Hybrid** | Iconic characters (3 heroes + Ember) stay faithful; minor enemies/NPCs may flex to fit a base pack. |
| Animation level | **Full** | World: idle + 4-directional walk. Battle: idle + attack + hurt. |
| First-pass scope | **Vertical slice** | Build the full pipeline; apply to Verdara cast + heroes + Ember. Roll out the rest later. |
| Licensing | **All-CC0** | Public-domain-equivalent only (Kenney + LuizMelo + generated mascots). No attribution or share-alike obligations. LPC (CC-BY-SA) rejected to avoid copyleft. |
| Iconic characters | **Generate to match** | Free packs lack animal heroes/dragon/slime; generate (or commission) those mascots to match the base style. |

## 3. Current state (baseline)

- **World:** KaPlay (`src/features/world/WorldCanvas.tsx`) renders every character with `k.text(emoji, {size})`. No `loadSprite`/`sprite`/`play` calls exist yet. KaPlay init already sets `crisp: true` (good for pixel art) and uses a single shared session instance with `destroyAll('*')` scene rebuilds.
- **Battle:** React + Framer Motion (`src/features/battle/BattleArena.tsx`) renders emoji inside motion wrappers — idle bob (`y` loop) and lunge (`x:[0,±70,0]`) for hero/enemy, plus a separate Ember bob.
- **Data model:** `sprite: string` (emoji) on `Avatar`, `EnemyDef`, `WorldNpcDef`, `NPC` (`src/types/index.ts`, `src/content/*.ts`), and `EMBER_SPRITES` stage→emoji map in `src/content/story.ts`.
- **Assets:** only legacy files (`favicon.svg`, `hero.png`); no sprite sheets. Vite default static handling; no path aliases.
- **Tests:** only `src/content/story.test.ts` references `.emoji` (story panels). No tests assert character `.sprite` values, so the data-model change is low-risk.

## 4. Slice roster

**Always-present (generated mascots):**
- Heroes: Blaze (🦁, aggressive), Shield (🐢, defensive), Nova (🦅, balanced)
- Ember stages: egg (🥚), hatchling (🐲), whelp (🐲), dragon (🐉)

**Verdara / Science zone:**
- Enemies: Spore Puff (🍄), Static Jelly (🪼), Comet Crab (🦀), Smog Fiend (🌫️, boss)
- NPCs: Sage Flora (🧝), Fern (👦), Trader Tadpole (🐸)

Hub-zone NPCs and the other three zones remain on emoji via fallback until a follow-up rollout. Mixed rendering is acceptable because every character degrades gracefully to its emoji.

## 5. Art sourcing (all-CC0)

All sourced art must be CC0 (public-domain-equivalent). No CC-BY/share-alike packs.

- **Battle (side-view):** LuizMelo CC0 packs (idle/attack/hurt/death) for the humanoid hero base and generic monsters; their Mushroom maps to Spore Puff. URL: https://luizmelo.itch.io/ (Hero Knight 2, Monsters Creatures Fantasy). Confirm CC0 in each pack's readme on download.
- **World (top-down):** Kenney Tiny Town / Tiny Dungeon (CC0) for NPCs/humanoids and generic enemy tokens. URL: https://kenney.nl/assets/tiny-town, https://kenney.nl/assets/tiny-dungeon. Kenney sprites are largely single-frame, so **overworld movement animation is driven in code** (e.g., a hop/squash-stretch on the static sprite, or a 2-frame bob) rather than a full walk cycle. LPC is explicitly **not** used (CC-BY-SA copyleft).
- **Generated mascots:** 3 heroes + Ember's 4 stages + the slime (Static Jelly), drawn to match the chosen base style in **both** perspectives and animated. Generated/commissioned art is original work and inherently free of pack-license constraints. Tooling: a pixel-art-specialized generator (Retro Diffusion / PixelLab) plus Aseprite cleanup, or a commission.
- **Attribution:** none required under CC0. Still maintain `CREDITS.md` listing pack, author, source URL, and license per asset as good practice and provenance tracking.

### Risks (called out, not blockers)
- **Mascot animation quality** is the primary risk: a consistent animated mascot across idle/walk/attack/hurt in two perspectives is hard to generate. The slice deliberately validates **one** mascot (Blaze) end-to-end before committing to the rest.
- **Style mismatch:** top-down (cute ~16/32px Kenney) vs side-view (detailed LuizMelo) will look somewhat different. Acceptable and common in JRPGs (Pokémon, Octopath); flagged so it's a conscious choice.
- **No free top-down walk cycles:** Kenney sprites are largely single-frame, so overworld walk must be faked in code (hop / squash-stretch / 2-frame bob). This is a deliberate cost of staying all-CC0 (LPC, which has true walk cycles, is excluded for its copyleft).
- **Two perspectives = two sheets per character**, roughly doubling per-character art effort.

## 6. Technical architecture

### 6a. Sprite manifest + registry (single source of truth)
New `src/content/sprites.ts`. Per `spriteId`:
```ts
{
  world:  { sheet: '/sprites/blaze/world.png',  frame: [32, 32], anims: { idle, walkDown, walkUp, walkSide } },
  battle: { sheet: '/sprites/blaze/battle.png', frame: [W, H], baseline, anims: { idle, attack, hurt } },
  emoji:  '🦁',
}
```
Each anim is `{ from, to, fps, loop }`. Both world and battle read this one module.

### 6b. Data model (backward-compatible)
Keep `sprite: string` as the **emoji fallback** (no churn to ~20 existing consumers). Add optional `spriteId?: string` to `Avatar`, `EnemyDef`, `WorldNpcDef`, `NPC`, and an Ember stage→`spriteId` map. Only slice characters set `spriteId`; everything else keeps working on emoji.

### 6c. World (KaPlay)
- Add an asset-load phase at init: `k.loadSprite(id, url, { sliceX, sliceY, anims })` for each slice `spriteId`, before scene build.
- New helper `addCharacter(k, { spriteId, emoji, pos, ... })`: if the sprite loaded → `k.sprite(id)` + `k.play('idle')`; else `k.text(emoji)`. Replaces the four `k.text(...)` character call sites (NPC ~L247, enemy ~L273, avatar ~L308, Ember ~L312).
- Drive movement animation from velocity: for sprites that ship walk frames (generated mascots), play `walk<Dir>` while moving and `idle` when stopped; for single-frame Kenney sprites, apply a code-driven hop/squash-stretch while moving. The `addCharacter` helper abstracts this so call sites don't care which.

### 6d. Battle (DOM / Framer Motion)
- New `<SpriteSheet spriteId state />` component: steps frames via CSS `steps()` background-position animation, driven by `state` (`idle` default → `attack` on lunge → `hurt` on damage). Falls back to rendering the emoji when no sheet exists.
- Mounted **inside** the existing Framer Motion wrappers so lunge and bob are preserved untouched. `heroLunge`/`enemyLunge` map to `attack`; damage events map to `hurt`.

### 6e. Asset pipeline
- Sprite sheets in `public/sprites/<character>/` (static serving works for both KaPlay URL loads and CSS backgrounds; avoids Vite import churn).
- The manifest in `src/content/sprites.ts` is the typed index into those files.

## 7. Testing & verification
- Unit test: every `spriteId` in the manifest has well-formed frame/anim data; every character resolves to either a valid `spriteId` or a non-empty emoji fallback.
- Existing tests unaffected.
- Manual visual check: walk through Verdara, trigger a battle, confirm idle/walk/attack/hurt and emoji fallback for non-slice characters.

## 8. Build order within the slice
1. Manifest + registry + data-model fields + fallback (no art yet — everything still emoji, nothing breaks).
2. KaPlay loader + battle `<SpriteSheet>` wired to the registry.
3. **Spike: Blaze end-to-end** (generate + animate, both views) — quality gate before producing the rest.
4. Generate/source the remaining Verdara cast; populate the manifest.
5. `CREDITS.md` + in-game credits entry + visual verification.

## 9. Out of scope (this slice)
- Hub-zone NPCs and the other three zones (Numbria, Gearfall, Chromaria) — handled in follow-up rollout once the pipeline is proven.
- Tile/environment art beyond what already exists.
- Sound/SFX.
