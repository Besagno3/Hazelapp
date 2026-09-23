# 16-bit asset generator

Deterministic Python generator for all the game's art and audio. It needs
no external art or network access, and it gives the same output on every
run.

```bash
pip install pillow numpy lameenc
python3 tools/assets/build.py                 # everything (from hazel-game/)
python3 tools/assets/build.py sprites tiles   # or just some parts
```

| Module | Produces |
|--------|----------|
| `pix.py` | Pixel toolkit: design-unit canvas, auto 3-tone hue-shifted shading, selective outlines |
| `characters.py` | Drawers + `ROSTER` / `NPCS` → `public/sprites/<id>/{world,battle}.png` |
| `build_sprites.py` | Renders poses into strips; writes the `src/content/sprites.generated.ts` manifest |
| `tiles.py` | `public/tiles/<zone>.png`, `props.png`, `spire.png`, `public/backgrounds/<zone>.png` |
| `audio.py` | Chiptune synth → `public/audio/16bit/{sfx,music}/*.mp3` |

## Conventions
- **World sprites** are 16px art upscaled 2× (bosses are 24px, so 48px on
  screen). 18 frames: side 0–5, down 6–11, up 12–17 (each idle ×2 + walk ×4),
  matching `FACING_ANIMS` in `src/lib/facing.ts`.
- **Battle sprites** are 32px (bosses 48px), and the game scales them 2.5–3×
  in CSS. Frames: idle 0–1, attack 2–4, hurt 5–6.
- All characters face **right**.
- **Tileset frame order** must match `TILE_FRAME` / `PROP_FRAME` in
  `src/content/tiles.ts`. `tiles.test.ts` checks the sizes.

## Adding a character
Add a `Char(...)` to `ROSTER` (combatant) or `NPCS` (world-only) with a
drawer name and its parameters, then re-run the build. It's keyed by the game
id: enemy def ids and NPC ids pick up their art automatically.
