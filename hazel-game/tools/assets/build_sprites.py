"""Render every character to public/sprites/<id>/{world,battle}.png."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from characters import (BATTLE_ANIMS, BATTLE_POSES, DRAWERS, NPCS, ROSTER,
                        WORLD_ANIMS, WORLD_POSES, Char)
from pix import Canvas, strip, upscale

WORLD_SCALE = 2  # world art is authored at 16px/tile and shown 2× (32px tiles)


def render(ch: Char, n: int, poses) -> list[Image.Image]:
    frames = []
    for p in poses:
        c = Canvas(n, 32)
        DRAWERS[ch.drawer](c, p, dict(ch.params))
        frames.append(c.image())
    return frames


def world_frames(ch: Char) -> list[Image.Image]:
    n = 24 if ch.boss else 16
    return [upscale(f, WORLD_SCALE) for f in render(ch, n, WORLD_POSES)]


def battle_frames(ch: Char) -> list[Image.Image]:
    n = 48 if ch.boss else 32
    return render(ch, n, BATTLE_POSES)


def build(public: Path) -> dict:
    """Write the sheets; return manifest data {id: {emoji, world?, battle?}}."""
    manifest = {}
    for ch in ROSTER + NPCS:
        out = public / 'sprites' / ch.id
        out.mkdir(parents=True, exist_ok=True)
        entry = {'emoji': ch.emoji}
        if ch.world:
            fr = world_frames(ch)
            strip(fr).save(out / 'world.png', optimize=True)
            entry['world'] = {
                'sheet': f'/sprites/{ch.id}/world.png',
                'frameW': fr[0].width,
                'frameH': fr[0].height,
                'frames': len(fr),
                'anims': WORLD_ANIMS,
            }
        if ch.battle:
            fr = battle_frames(ch)
            strip(fr).save(out / 'battle.png', optimize=True)
            entry['battle'] = {
                'sheet': f'/sprites/{ch.id}/battle.png',
                'frameW': fr[0].width,
                'frameH': fr[0].height,
                'frames': len(fr),
                'anims': BATTLE_ANIMS,
            }
        manifest[ch.id] = entry
    return manifest


def contact_sheet(path: Path, scale: int = 3):
    """Preview: one row per character — world frames then battle frames."""
    rows = []
    for ch in ROSTER + NPCS:
        parts = world_frames(ch) if ch.world else []
        if ch.battle:
            parts += [upscale(f, 1) for f in battle_frames(ch)]
        rows.append(parts)
    cell = 52
    cols = max(len(r) for r in rows)
    img = Image.new('RGBA', (cols * cell, len(rows) * cell), (70, 110, 80, 255))
    for y, r in enumerate(rows):
        for x, f in enumerate(r):
            bg = (70, 110, 80, 255) if x < 6 else (60, 70, 110, 255)
            tile = Image.new('RGBA', (cell, cell), bg)
            tile.alpha_composite(f, ((cell - f.width) // 2, (cell - f.height) // 2))
            img.paste(tile, (x * cell, y * cell))
    img = upscale(img, scale)
    img.save(path)
