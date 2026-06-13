# Demo Asset Sourcing Guide (Pixel-Art Character Sprites)

Reference for sourcing/creating the pixel-art sprites that replace the emoji
characters. The code pipeline is already built and ships everything behind an
emoji fallback, so assets can be dropped in incrementally — a character only
switches to a sprite once it has a manifest entry **and** the PNG exists.

See also: `docs/superpowers/specs/2026-06-13-pixel-art-character-graphics-design.md`
(design) and `docs/superpowers/plans/2026-06-13-pixel-art-character-graphics.md`
(plan, Task 8 = asset production). The manifest lives in `src/content/sprites.ts`.

---

## 1. Quick vetting checklist (apply to every asset)

| Check | Requirement |
|-------|-------------|
| **License** | **CC0** preferred (no strings). At minimum "free for commercial use." Beware "free = non-commercial, pay for commercial" (e.g. Kenmi *Cute Fantasy*). |
| **Perspective** | **Top-down/overhead** for the overworld; **side-view/profile** for battle. They are different art — don't substitute one for the other. |
| **Animations** | Overworld: `idle` + `walk`. Battle: `idle` + `attack` + `hurt` (death optional). Pack names can differ (map "take hit"→`hurt`, "run"→`walk`). |
| **Format** | PNG, transparent background, **frames in a single horizontal row**, **uniform frame size**. |
| **Pixel size** | Overworld ~16–32px (tiles are 32px). Battle can be larger/more detailed (rendered ~2.5–3×). True pixel art (crisp), not anti-aliased/HD. |
| **Style cohesion** | One consistent palette/outline/pixel-density **within each screen**. Top-down vs. side-view differing is fine and expected. |

---

## 2. The demo (Verdara slice) shopping list

The slice = **3 heroes + Ember (4 stages) + the Verdara/Science zone cast**. Hub
NPCs and the other three zones stay on emoji until a later rollout.

| Character | id (manifest) | World view | Battle view | Source plan | Maps to / notes |
|-----------|---------------|------------|-------------|-------------|-----------------|
| Blaze (hero) | `blaze` | ✅ idle+walk | ✅ idle+attack+hurt | **Generate** | lion / aggressive warrior |
| Shield (hero) | `shield` | ✅ | ✅ | **Generate** | turtle / defensive tank |
| Nova (hero) | `nova` | ✅ | ✅ | **Generate** | eagle / balanced |
| Ember — egg | `ember-egg` | ✅ idle | ✅ idle | **Generate** | small egg |
| Ember — hatchling | `ember-hatchling` | ✅ | ✅ | **Generate** | baby dragon |
| Ember — whelp | `ember-whelp` | ✅ | ✅ | **Generate** | young dragon |
| Ember — dragon | `ember-dragon` | ✅ | ✅ | **Generate** | full dragon |
| Spore Puff | `spore-puff` | ✅ | ✅ | **LuizMelo** *Monsters Creatures Fantasy* → Mushroom | regular enemy |
| Static Jelly | `static-jelly` | ✅ | ✅ | **Generate** (no good CC0 slime+animations) | slime/jelly |
| Comet Crab | `comet-crab` | ✅ | ✅ | itch CC0 crab, or generate | regular enemy |
| The Smog Fiend (boss) | `smog-fiend` | ✅ | ✅ | **LuizMelo** monster (larger) or generate | boss — needs presence |
| Sage Flora (NPC) | `sage-flora` | ✅ idle(+walk) | — (NPCs don't battle) | **Kenney** Tiny Town townsperson | robed/elder villager |
| Fern (NPC) | `fern` | ✅ | — | **Kenney** Tiny Town child | kid |
| Trader Tadpole (NPC) | `trader-tadpole` | ✅ | — | **Kenney** Tiny Town merchant | merchant |

> NPCs only appear on the overworld, so they need a **world view only**.
> Enemies and heroes need **both** views.

---

## 3. File format & placement (build-critical)

The renderer assumes one PNG per view, all frames in a **single horizontal
strip**, transparent, every frame the same size.

```
hazel-game/public/sprites/<character-id>/world.png     # top-down strip
hazel-game/public/sprites/<character-id>/battle.png    # side-view strip
```
Example: `public/sprites/blaze/world.png`, `public/sprites/blaze/battle.png`.

- **Single row only.** KaPlay loads world sprites as `sliceX = frames, sliceY = 1`.
- **Transparent PNG** (no baked/colored background; not JPG).
- **Uniform frame size** across the whole strip.

If a pack ships a grid sheet, individual frame PNGs, or an RPG-Maker sheet,
convert it to a single horizontal row first:
```bash
# individual frames frame_00.png … frame_NN.png  →  one horizontal strip
convert frame_*.png +append world.png
identify -format "%w x %h\n" world.png    # width should == frames * frameW
```
(or in Aseprite: File → Export Sprite Sheet → Type: "Horizontal Strip".)

---

## 4. Numbers to record for the manifest

For each view you add to `src/content/sprites.ts`, you need:

```ts
{
  sheet: '/sprites/blaze/battle.png', // public path (leading slash, .png)
  frameW: 64,                         // width of ONE frame, px
  frameH: 80,                         // height of ONE frame, px
  frames: 12,                         // total frames in the strip
  anims: {
    idle:   { from: 0, to: 3,  fps: 6 },              // frame indices (0-based), inclusive
    attack: { from: 4, to: 9,  fps: 12, loop: false },
    hurt:   { from: 10, to: 11, fps: 8,  loop: false },
  },
}
```
- World views use `idle` + (optionally) `walk`. A `walk` anim drives the walk
  cycle; without it, the engine applies a small hop while moving.
- Battle views should define `idle`, `attack`, `hurt` (missing ones fall back to
  `idle` automatically). `idle` is **required** for every view.
- `loop: false` for one-shot clips (attack/hurt); omit (defaults true) for
  looping clips (idle/walk).

So when evaluating an asset, make sure you can read off: **frame size**, **how
many frames**, and **which frame ranges are which animation**.

---

## 5. Recommended CC0 sources

| Pack | URL | License | Use for |
|------|-----|---------|---------|
| Kenney — Tiny Town | https://kenney.nl/assets/tiny-town | CC0 | Top-down NPCs (villager/child/merchant), props |
| Kenney — Tiny Dungeon | https://kenney.nl/assets/tiny-dungeon | CC0 | Top-down generic enemies/heroes |
| LuizMelo — Monsters Creatures Fantasy | https://luizmelo.itch.io/monsters-creatures-fantasy | CC0 | Side-view battlers: **Mushroom**→Spore Puff, Flying Eye, etc. |
| LuizMelo — Hero Knight 2 / Martial Hero / Wizard | https://luizmelo.itch.io/ | CC0 | Side-view humanoid battler references |

Kenney sprites are largely single-frame (use the in-engine hop for movement).
LuizMelo packs include full idle/attack/take-hit/death — ideal for battle.
**Confirm CC0 in each pack's readme on download.**

**Generated mascots** (Blaze, Shield, Nova, all Ember stages, Static Jelly): no
reliable CC0 source covers animal heroes / a growing dragon / an animated slime,
so generate these (Retro Diffusion / PixelLab + Aseprite cleanup, or commission)
to match the chosen base style, in **both** perspectives, animated. Do **Blaze
first** end-to-end as the quality gate before producing the rest.

---

## 6. Red flags (skip these)

- "Free version is non-commercial; pay for commercial" (license trap).
- Side-view art offered for the overworld, or top-down art for battle.
- Grid/multi-row sheets you can't cleanly slice into one horizontal row.
- Non-uniform / trimmed frame sizes (won't align in the strip).
- JPG or baked background (no transparency).
- Anti-aliased/HD art that won't hold up under pixelated scaling.

---

## 7. Workflow per asset

1. **Find** a candidate (right perspective + animations + license).
2. **Vet** it against §1. (You can paste the itch.io link to get a second opinion.)
3. **Normalize** to a horizontal strip PNG (§3) and drop it in `public/sprites/<id>/`.
4. **Record** the numbers (§4) and add/extend the entry in `src/content/sprites.ts`.
5. **Assign** the `spriteId` on the character (`avatars.ts` / `enemies.ts` /
   `npcs.ts`; Ember stages are already mapped via `EMBER_SPRITE_IDS`).
6. **Verify**: `npm test` (manifest validation) + `npm run dev` (walk Verdara,
   start a battle, watch idle/walk/attack/hurt). Log the source in `CREDITS.md`.
