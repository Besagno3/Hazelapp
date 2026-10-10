"""
Environment art: per-zone 16px tilesets (shown 2× as 32px tiles), shared
props (save crystal, chest, gate, Spire tower) and 256×144 battle backdrops.

Tileset strip layout (frames are 32×32 after the 2× upscale) — keep in sync
with `TILE_FRAME` in src/content/tiles.ts:
  0-2 ground variants · 3 path · 4-5 water (animated) · 6 solid overlay
  7 deco overlay · 8 exit marker overlay
Props strip: 0-1 save crystal (glow) · 2 chest closed · 3 chest open · 4 gate
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image

from pix import Canvas, dark, hexc, light, mix, strip, upscale

T = 16  # logical tile size

# Zone themes. ground/path mirror zones.ts; the rest choose scenery.
# A zone's position here seeds its art, so a retired zone keeps its entry (and
# is skipped by the builds) — removing it would redraw every zone after it.
RETIRED = {'lumina-field'}  # #75 item 8: Lumina Field folded into Lumina Village
ZONES = {
    'lumina-field': dict(ground=(104, 168, 104), path=(196, 178, 128), solid='tree', deco='flower', deco_c='#ffe066',
                         sky=('#6ab8ff', '#bfe6ff'), far='#7aa0c8', mid='tree', water='#3a7ad0'),
    'numbria': dict(ground=(110, 138, 188), path=(160, 176, 214), solid='mountain', deco='shard', deco_c='#5ac8ff',
                    sky=('#3a5ab0', '#9ab8ff'), far='#5a6aa0', mid='mountain', water='#3a5ac0'),
    'verdara': dict(ground=(92, 158, 102), path=(150, 192, 140), solid='pine', deco='mushroom', deco_c='#e04848',
                    sky=('#4aa070', '#bfeecc'), far='#3a7a5a', mid='pine', water='#3a8ab0'),
    'gearfall': dict(ground=(176, 142, 100), path=(205, 180, 140), solid='rock', deco='gear', deco_c='#8c96a4',
                     sky=('#d08a4a', '#ffd8a0'), far='#a0704a', mid='gears', water='#4a7ab0'),
    'chromaria': dict(ground=(172, 122, 168), path=(206, 162, 200), solid='statue', deco='flower', deco_c='#ff8fc8',
                      sky=('#b060c0', '#ffc8f0'), far='#9a5aa0', mid='crystals', water='#5a7ae0'),
    'lumina-village': dict(ground=(120, 160, 110), path=(196, 178, 128), solid='hedge', deco='tulip', deco_c='#ff5a7a',
                           sky=('#6ab8ff', '#dff0ff'), far='#8ab0c8', mid='houses', water='#3a7ad0'),
    'whispering-woods': dict(ground=(70, 110, 78), path=(120, 150, 110), solid='pine', deco='leaves', deco_c='#e0883a',
                             sky=('#2a5a4a', '#8ac0a0'), far='#2a4a3a', mid='pine', water='#2a6a8a'),
    'starfall-coast': dict(ground=(210, 195, 140), path=(225, 210, 160), solid='rock', deco='shell', deco_c='#ffb0b0',
                           sky=('#1a1a4a', '#6a5ab0'), far='#3a3a7a', mid='sea', water='#2a6ac0', stars=True),
    'clockwork-depths': dict(ground=(90, 84, 110), path=(130, 120, 150), solid='darkrock', deco='gear', deco_c='#c8a040',
                             sky=('#1a1626', '#4a3a5a'), far='#2a2436', mid='gears', water='#3a4a8a', cave=True),
    'moonwell-grove': dict(ground=(60, 78, 110), path=(120, 140, 180), solid='pine', deco='lavender', deco_c='#b08aff',
                           sky=('#101a3a', '#3a4a8a'), far='#1a2a4a', mid='pine', water='#3a5ab0', stars=True, moon=True),
    'crystal-spire': dict(ground=(120, 110, 180), path=(180, 170, 220), solid='pillar', deco='sparkle', deco_c='#fff4b0',
                          sky=('#2a1a5a', '#9a7ae0'), far='#4a3a8a', mid='crystals', water='#5a5ae0', stars=True),
    # Overworld (#75 Phase 1): Dawnreach's grass and the Shrine of First Light.
    'dawnreach': dict(ground=(100, 164, 98), path=(196, 178, 128), solid='tree', deco='flower', deco_c='#ffe066',
                      sky=('#6ab8ff', '#cfeeff'), far='#7aa0c8', mid='mountain', water='#3a7ad0'),
    'dawn-shrine': dict(ground=(196, 188, 170), path=(190, 90, 80), solid='shrinepillar', deco='candle', deco_c='#ffd24a',
                        sky=('#2a1a4a', '#7a6ab0'), far='#4a3a6a', mid='crystals', water='#6ad0f0', cave=True),
    # Field-spell places (#75 item 9): a starlit shrine, a mossy one, a dark mine.
    'wayfarer-shrine': dict(ground=(70, 78, 120), path=(150, 160, 210), solid='shrinepillar', deco='sparkle', deco_c='#bfe0ff',
                            sky=('#0e1030', '#3a3a7a'), far='#2a2a5a', mid='crystals', water='#3a4ab0', stars=True),
    'quiet-shrine': dict(ground=(96, 140, 92), path=(176, 160, 120), solid='pine', deco='lavender', deco_c='#ff9ad0',
                         sky=('#5ab07a', '#d8f4d0'), far='#4a8a5a', mid='pine', water='#3a8ab0'),
    'echo-mine': dict(ground=(84, 72, 70), path=(140, 116, 92), solid='darkrock', deco='shard', deco_c='#ffb030',
                      sky=('#140e0a', '#3a2a20'), far='#2a1e18', mid='mountain', water='#3a4a6a', cave=True),
    # The Clockwork Depths' lower floors (#75 item 10): gear halls, then the forge.
    'clockwork-depths-b2': dict(ground=(78, 72, 98), path=(124, 114, 140), solid='darkrock', deco='gear', deco_c='#c8a040',
                                sky=('#120f1c', '#3a3050'), far='#221c30', mid='gears', water='#3a4a8a', cave=True),
    'clockwork-depths-b3': dict(ground=(104, 78, 70), path=(150, 112, 88), solid='darkrock', deco='shard', deco_c='#ff7a3a',
                                sky=('#1c0e0a', '#5a2a1a'), far='#2e1610', mid='gears', water='#6a3a2a', cave=True),
    # The Silver Shallows (#75 item 14): a calm, bright sea of sandy islands.
    'silver-shallows': dict(ground=(118, 176, 112), path=(220, 204, 150), solid='palm', deco='shell', deco_c='#ffc0b0',
                            sky=('#5ab0e8', '#d8f4ff'), far='#8ac0e0', mid='sea', water='#4a9ad8'),
    # Remembrance Hill (#75 item 14e): a quiet hilltop town of pale stone and forget-me-nots, at sunset.
    'remembrance-hill': dict(ground=(112, 168, 118), path=(214, 206, 186), solid='hedge', deco='flower', deco_c='#7aa8ff',
                             sky=('#e8906a', '#ffe2c4'), far='#b88aa0', mid='houses', water='#4a8ad0'),
    # Eldergrove (#75 item 14f): ancient ring-trees in late-summer gold, on an island of the Shallows.
    'eldergrove': dict(ground=(96, 132, 84), path=(176, 150, 108), solid='eldertree', deco='leaves', deco_c='#e0a03a',
                       sky=('#c8a050', '#fff0c0'), far='#7a8a50', mid='tree', water='#3a8a9a'),
}

# Added with the boat (#75 item 14) — `build_sea` writes only these (+ the boat, the overworld sheet).
SEA_ZONES = ('silver-shallows',)

# Added with Remembrance Hill (#75 item 14e) — `build_hill` writes only these
# (+ the marble town sheet and the overworld sheet with the hill icon appended).
HILL_ZONES = ('remembrance-hill',)

# Added with Eldergrove (#75 item 14f) — `build_elder` writes only these
# (+ the bark town sheet and the overworld sheet with the elder icon appended).
ELDER_ZONES = ('eldergrove',)

# Added for the field spells (#75 item 9) — `build_spell_places` writes only these.
SPELL_ZONES = ('wayfarer-shrine', 'quiet-shrine', 'echo-mine')
# Added with real dungeons (#75 item 10) — `build_dungeon` writes only these (+ the stairs).
DUNGEON_ZONES = ('clockwork-depths-b2', 'clockwork-depths-b3')

# Zones added after the first asset run (#75 Phase 1) — `build_overworld` writes
# only these (plus the overworld sheet), so existing files stay untouched.
NEW_ZONES = ('dawnreach', 'dawn-shrine')


def _c() -> Canvas:
    return Canvas(T, T)


def _speckle(c: Canvas, base, seed: int, density=0.18, tufts=True):
    rnd = random.Random(seed)
    c.a[:, :, :3] = base
    c.a[:, :, 3] = 255
    for _ in range(int(T * T * density)):
        x, y = rnd.randrange(T), rnd.randrange(T)
        c.a[y, x, :3] = light(base, 0.06) if rnd.random() < 0.5 else dark(base, 0.07)
    if tufts:
        for _ in range(3):
            x, y = rnd.randrange(1, T - 2), rnd.randrange(2, T - 1)
            c.a[y, x, :3] = dark(base, 0.14)
            c.a[y - 1, x + 1, :3] = light(base, 0.1)
            c.a[y, x + 2, :3] = dark(base, 0.14)


def ground(base, seed):
    c = _c()
    _speckle(c, base, seed)
    return c


def path_tile(base):
    c = _c()
    _speckle(c, base, 99, density=0.12, tufts=False)
    rnd = random.Random(7)
    for _ in range(4):
        x, y = rnd.randrange(1, T - 2), rnd.randrange(1, T - 2)
        c.dot(x, y, dark(base, 0.18), w=2, h=1)
        c.dot(x, y - 1, light(base, 0.12))
    return c


def water(col, frame):
    col = hexc(col)
    c = _c()
    c.a[:, :, :3] = col
    c.a[:, :, 3] = 255
    for y in range(0, T, 4):
        for x in range(T):
            wave = math.sin((x + frame * 2 + y * 1.3) * 0.8)
            if wave > 0.75:
                c.a[(y + 1) % T, x, :3] = light(col, 0.22)
            elif wave < -0.8:
                c.a[(y + 3) % T, x, :3] = dark(col, 0.08)
    c.dot(3 + frame * 6, 6, (230, 245, 255))
    return c


def solid(kind, zone):
    c = _c()
    g = zone['ground']
    if kind == 'tree':
        c.rect(7, 11, 9, 16, '#7a4a2a')
        c.ellipse(8, 7, 7, 6.5, '#3a9a4a')
        c.dot(5, 4, light(hexc('#3a9a4a'), 0.2), w=2, h=1)
        c.dot(10, 8, '#e04848')
    elif kind == 'pine':
        c.rect(7, 13, 9, 16, '#6a3a2a')
        for i, (y, w) in enumerate(((2, 3.5), (6, 5.5), (10, 7.5))):
            c.poly([(8, y - 2), (8 + w, y + 4), (8 - w, y + 4)], mix(hexc('#2a7a4a'), g, 0.15))
    elif kind == 'rock':
        c.ellipse(8, 10, 7, 5.5, '#9a8a7a')
        c.ellipse(6, 8, 3, 2, '#b8a898')
    elif kind == 'hedge':
        c.ellipse(8, 9, 7.5, 6.5, '#3a8a4a')
        c.ellipse(5, 7, 3, 2.5, '#4aa05a')
        c.ellipse(11, 7.5, 3, 2.5, '#4aa05a')
        c.dot(6, 11, '#ff8fb8')
        c.dot(11, 10, '#fff4b0')
    elif kind == 'darkrock':
        c.poly([(1, 15.5), (4, 3), (9, 1), (14, 6), (15, 15.5)], '#4a4458')
        c.dot(6, 5, '#8a7aa0', w=2, h=1)
        c.dot(10, 9, '#c8a040')
    elif kind == 'mountain':
        c.poly([(0, 15.5), (8, 1), (16, 15.5)], '#7a8ab0')
        c.poly([(5, 6.5), (8, 1), (11, 6.5), (9, 5.5), (8, 7), (7, 5.5)], '#f0f4ff', shade=False)
    elif kind == 'statue':
        c.rect(3, 12, 13, 16, '#8a7a9a')
        c.rect(5, 3, 11, 12, '#b0a0c0')
        c.rect(4.5, 5, 11.5, 7, '#9a8aaa')
        c.dot(9, 7.5, '#3a2a4a', w=1, h=1)
        c.dot(6.5, 7.5, '#3a2a4a', w=1, h=1)
    elif kind == 'house':
        c.rect(2, 7, 14, 16, '#e8d8b0')
        c.poly([(0.5, 8), (8, 1), (15.5, 8)], '#c0503a')
        c.rect(6.5, 11, 9.5, 16, '#7a4a2a')
        c.rect(10.5, 9, 13, 11.5, '#8ad0ff')
    elif kind == 'shrinepillar':
        c.rect(2, 13, 14, 16, '#c8a060')
        c.rect(4, 3, 12, 13, '#f4eee2')
        c.rect(2, 1, 14, 3.5, '#c8a060')
        for x in (5.5, 8, 10.5):
            c.rect(x, 4, x + 0.8, 12.5, '#ddd4c0', shade=False)
    elif kind == 'eldertree':
        # An ancient ring-tree (#75 item 14f): a broad trunk with a ring-knot, a golden-green crown.
        c.rect(5.5, 10, 10.5, 16, '#6a4428')
        c.rect(6.5, 10, 7.3, 16, '#80583a', shade=False)
        c.ellipse(8, 13, 1.6, 1.4, '#c8a070', shade=False)
        c.ellipse(8, 13, 0.8, 0.7, '#8a5a32', shade=False)
        c.ellipse(8, 6.5, 7.6, 6.2, '#5a8a3a')
        c.ellipse(5, 5, 3, 2.4, '#7aa04a')
        c.dot(11, 4, '#e0b040', w=2, h=1)
        c.dot(4, 8, '#e0a03a')
        c.dot(12, 9, '#e0a03a')
    elif kind == 'palm':
        # An island palm (#75 item 14): a leaning trunk, fronds, a coconut or two.
        c.poly([(7, 16), (9.5, 16), (10, 9), (9, 5), (7.8, 5.5), (8.6, 9)], '#a8783e')
        for (x0, y0, x1, y1) in ((9, 5, 2, 7.5), (9, 5, 15.5, 7), (9, 5, 4, 1.5), (9, 5, 14, 1.8)):
            c.poly([(x0, y0 - 1), (x1, y1), (x0, y0 + 1.2)], '#3aa060')
        c.dot(8, 6, '#6a4020', w=1, h=1)
        c.dot(10, 6.4, '#6a4020', w=1, h=1)
    elif kind == 'pillar':
        c.rect(2, 13, 14, 16, '#9a8ad0')
        c.rect(4, 3, 12, 13, '#d8d0f8')
        c.rect(2, 1, 14, 3.5, '#9a8ad0')
        for x in (5.5, 8, 10.5):
            c.rect(x, 4, x + 0.8, 12.5, '#b0a4e0', shade=False)
    return _outlined(c)


def deco(kind, colr):
    c = _c()
    if kind == 'flower':
        for (x, y) in ((4, 5), (11, 10), (6, 12)):
            c.dot(x, y + 1, '#3a8a3a')
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                c.dot(x + dx, y + dy, colr)
            c.dot(x, y, '#ffffff')
    elif kind == 'tulip':
        for (x, y) in ((4, 6), (11, 9)):
            c.rect(x, y + 1, x + 1, y + 4, '#3a8a3a', shade=False)
            c.rect(x - 1, y - 1, x + 2, y + 1.5, colr)
    elif kind == 'shard':
        c.poly([(5, 13), (7, 5), (9, 13)], colr)
        c.poly([(9.5, 13), (11.5, 8), (13, 13)], colr)
    elif kind == 'mushroom':
        c.rect(7, 9, 9, 13, '#f4e8d0')
        c.ellipse(8, 8, 4, 2.6, colr)
        c.dot(6, 7, '#ffffff')
        c.dot(9, 7.5, '#ffffff')
    elif kind == 'gear':
        for t in range(6):
            a = t * math.pi / 3
            c.dot(8 + math.cos(a) * 4, 9 + math.sin(a) * 4, colr, w=2, h=2)
        c.ellipse(8.5, 9.5, 3.5, 3.5, colr)
        c.dot(8, 9, dark(hexc(colr), 0.3), w=2, h=2)
    elif kind == 'leaves':
        for (x, y) in ((4, 5), (10, 9), (6, 12), (12, 4)):
            c.ellipse(x, y, 1.6, 1.0, colr, rot=0.6)
    elif kind == 'shell':
        c.ellipse(8, 10, 3.5, 3, colr)
        for x in (6.5, 8, 9.5):
            c.line(8, 12.5, x, 7.8, dark(hexc(colr), 0.15), w=0.5)
    elif kind == 'lavender':
        for x in (5, 8, 11):
            c.rect(x, 7, x + 1, 13, '#3a7a4a', shade=False)
            for y in (4, 5.5, 7):
                c.dot(x, y, colr)
    elif kind == 'candle':
        for (x, y) in ((4.5, 7), (11, 10)):
            c.rect(x - 1, y, x + 1, y + 5, '#f4ecd8')
            c.ellipse(x, y - 1.2, 0.9, 1.6, '#ff8a3a', shade=False)
            c.dot(x, y - 1, colr)
        return c
    elif kind == 'sparkle':
        for (x, y) in ((5, 5), (11, 10)):
            c.dot(x, y - 2, colr, h=5)
            c.dot(x - 2, y, colr, w=5)
            c.dot(x, y, '#ffffff')
    return _outlined(c) if kind not in ('sparkle', 'leaves') else c


def exit_marker():
    c = _c()
    for (x, y, col) in ((4, 4, '#ffffff'), (11, 6, '#fff4b0'), (7, 11, '#ffffff'), (12, 12, '#fff4b0')):
        c.dot(x, y - 1, col, h=3)
        c.dot(x - 1, y, col, w=3)
    return c


def _outlined(c: Canvas) -> Canvas:
    out = Canvas(c.n, c.design)
    out.paste(c, outline=True)
    return out


def props():
    frames = []
    for glow in (0, 1):
        c = _c()
        c.ellipse(8, 14.5, 5, 1.5, '#3a2a5a', shade=False)
        col = '#7ae0ff' if not glow else '#b8f4ff'
        c.poly([(8, 1), (13, 7), (8, 14.5), (3, 7)], col)
        c.poly([(8, 1), (8, 14.5), (3, 7)], light(hexc(col), 0.1))
        c.dot(6, 5, '#ffffff', w=1, h=2)
        frames.append(_outlined(c))
    for opened in (False, True):
        c = _c()
        c.rect(2, 7, 14, 15, '#a0602a')
        c.rect(2, 10, 14, 11, '#e0b040', shade=False)
        if opened:
            c.rect(2, 3, 14, 7, '#6a3a1a', shade=False)
            c.rect(3, 6, 13, 8, '#ffe066', shade=False)
            c.dot(6, 2, '#ffffff')
            c.dot(10, 3, '#fff4b0')
        else:
            c.ellipse(8, 7, 6.2, 3, '#b8702e')
            c.rect(7, 9, 9, 12, '#ffe066')
        frames.append(_outlined(c))
    c = _c()
    for x in (2, 13):
        c.rect(x, 2, x + 2, 16, '#7a4a2a')
    for y in (4, 10):
        c.rect(1, y, 16, y + 2.5, '#c08a4a')
    c.line(3, 5, 13, 11, '#e04848', w=1.2)
    c.ellipse(8, 8, 2.2, 2.2, '#ffd24a')
    c.dot(8, 8, '#3a2a1a')
    frames.append(_outlined(c))
    return frames


def spire():
    c = Canvas(32, 32)  # 16 wide × 32 tall logical, drawn on a 32 grid then cropped
    c.poly([(10, 31), (12, 8), (16, 2), (20, 8), (22, 31)], '#9a8ad0')
    c.rect(11, 12, 21, 13, '#d8d0f8', shade=False)
    c.rect(11.5, 20, 20.5, 21, '#d8d0f8', shade=False)
    c.rect(14, 25, 18, 31, '#3a2a5a')
    c.poly([(16, -1), (18.5, 4), (16, 8), (13.5, 4)], '#7ae0ff')
    c.dot(15, 2, '#ffffff')
    c.dot(15.5, 15.5, '#fff4b0', w=2, h=2)
    out = _outlined(c)
    return out.image().crop((8, 0, 24, 32))


# ─── Towns: building interiors, facades, signs and roofs (#72, #73) ─────────
# Keep in sync with TOWN_FRAME / ROOF_COLORS / BUILDING_STYLES in src/content.
# One town sheet per architecture style: every place builds differently.

STYLES = {
    #            wall        trim       pattern    window    floor      floor colours
    'cottage':   ('#f4f0e6', '#4a7ab0', 'plaster', 'square', 'planks', ('#d8b48a',)),
    'timber':    ('#e8d8b0', '#7a4a2a', 'timber',  'square', 'planks', ('#c49662',)),
    'stone':     ('#8a9ab8', '#4a5a78', 'bricks',  'arch',   'tiles',  ('#9aa4b8', '#7a849a')),
    'leaf':      ('#9a7040', '#3f8a3a', 'vines',   'round',  'planks', ('#8a9a50',)),
    'brass':     ('#c8a060', '#7a5a2a', 'panels',  'round',  'grate',  ('#8a8e98', '#6a6e78')),
    'paint':     ('#ffd6ea', '#e0609a', 'stripes', 'arch',   'checker', ('#fff0f6', '#f0b8d8')),
    'log':       ('#7a5030', '#4a3020', 'logs',    'square', 'planks', ('#9a6a40',)),
    'driftwood': ('#a8b4b4', '#4a6a7a', 'planks',  'round',  'planks', ('#d8c49a',)),
    'cave':      ('#5a5470', '#2e2a40', 'bricks',  'arch',   'tiles',  ('#6a6480', '#545068')),
    # Remembrance Hill (#75 item 14e): pale marble, lavender trim.
    'marble':    ('#eee8f4', '#7a6aa8', 'bricks',  'arch',   'checker', ('#f6f2fa', '#dcd4ea')),
    # Eldergrove (#75 item 14f): a hut in a hollow ring-tree — bark walls, a round window.
    'bark':      ('#6a4a30', '#3e2a1a', 'bark',    'round',  'planks', ('#b08a5a',)),
}


WOOD = '#b07840'


def _floor(kind='planks', cols=('#c49662',)):
    c = _c()
    base = hexc(cols[0])
    c.a[:, :, :3] = base
    c.a[:, :, 3] = 255
    if kind == 'planks':
        for y in range(0, T, 4):
            c.a[y, :, :3] = dark(base, 0.08)  # plank seams
            off = 5 if (y // 4) % 2 else 11
            c.a[y:y + 4, off, :3] = dark(base, 0.1)
        c.a[1::4, :, :3] = light(base, 0.04)
    elif kind in ('tiles', 'checker'):
        alt = hexc(cols[1])
        for ty in range(2):
            for tx in range(2):
                if (tx + ty) % 2:
                    c.a[ty * 8:(ty + 1) * 8, tx * 8:(tx + 1) * 8, :3] = alt
        if kind == 'tiles':
            c.a[::8, :, :3] = dark(base, 0.2)
            c.a[:, ::8, :3] = dark(base, 0.2)
    elif kind == 'grate':
        alt = hexc(cols[1])
        c.a[::3, :, :3] = alt
        c.a[:, ::3, :3] = alt
        c.dot(1, 1, '#c8ccd4')
        c.dot(14, 14, '#c8ccd4')
    return c


def _wall_face(style, window=False, door=False):
    wall, trim, pattern, win, floor, fcols = STYLES[style]
    base = hexc(wall)
    c = _c()
    c.a[:, :, :3] = base
    c.a[:, :, 3] = 255
    if pattern == 'bricks':
        for y in range(0, T, 4):
            c.a[y, :, :3] = dark(base, 0.18)
            off = 0 if (y // 4) % 2 else 4
            for x in range(off, T, 8):
                c.a[y:y + 4, x, :3] = dark(base, 0.18)
        c.a[1::4, :, :3] = light(base, 0.05)
    elif pattern in ('planks', 'logs'):
        step = 4 if pattern == 'planks' else 5
        for y in range(0, T, step):
            c.a[y, :, :3] = dark(base, 0.22)
            if pattern == 'logs' and y + 1 < T:
                c.a[y + 1, :, :3] = light(base, 0.08)
                c.dot(1 + (y % 3), y + 2, dark(base, 0.3))
    elif pattern == 'panels':
        c.rect(0, 0, 16, 16, base)
        for (x, y) in ((1, 1), (14, 1), (1, 14), (14, 14)):
            c.dot(x, y, '#f0e0a0')
        c.a[:, 8, :3] = dark(base, 0.2)
    elif pattern == 'stripes':
        for x in range(0, T, 4):
            if (x // 4) % 2:
                c.a[:, x:x + 2, :3] = hexc('#c8e8ff')
    elif pattern == 'vines':
        for y in range(0, T, 4):
            c.a[y, :, :3] = dark(base, 0.2)
        for (x, y) in ((2, 1), (3, 2), (2, 3), (3, 4), (12, 9), (13, 10), (12, 11), (13, 12)):
            c.dot(x, y, trim)
        c.dot(4, 3, '#ff8fb8')
    elif pattern == 'timber':
        c.rect(0, 0, 1.5, 16, trim, shade=False)
    elif pattern == 'bark':
        # A hollow ring-tree's wall (#75 item 14f): deep grooves and a knot.
        for x in (2, 6, 10, 13):
            c.a[:, x, :3] = dark(base, 0.25)
        for (x, y) in ((4, 5), (11, 9), (8, 12)):
            c.dot(x, y, light(base, 0.12))
        c.ellipse(8, 8, 1.4, 1.1, dark(base, 0.3), shade=False)
    # every facade gets a top beam + base course in the trim colour
    c.rect(0, 0, 16, 2, trim, shade=False)
    c.rect(0, 14, 16, 16, dark(base, 0.3), shade=False)
    if window:
        glass = '#8ad0ff' if style != 'cave' else '#ffd86a'  # lantern-lit in the depths
        if win == 'square':
            c.rect(4, 4, 12, 11, trim, shade=False)
            c.rect(5, 5, 11, 10, glass, shade=False)
            c.rect(7.5, 5, 8.5, 10, trim, shade=False)
        elif win == 'arch':
            c.rect(4, 6, 12, 12, trim, shade=False)
            c.ellipse(8, 6.5, 4, 3, trim, shade=False)
            c.rect(5, 6.5, 11, 11, glass, shade=False)
            c.ellipse(8, 6.8, 3, 2.2, glass, shade=False)
        else:
            c.ellipse(8, 8, 4.5, 4.5, trim, shade=False)
            c.ellipse(8, 8, 3.2, 3.2, glass, shade=False)
        c.dot(6, 6, '#ffffff')
    if door:
        fl = hexc(fcols[0])
        c.rect(3, 3, 13, 16, trim, shade=False)
        c.rect(4, 4, 12, 16, fl, shade=False)
        c.rect(4, 4, 12, 6, dark(fl, 0.2), shade=False)
        c.rect(2, 14.5, 14, 16, '#c8a070', shade=False)  # doormat
    return c


def town_tiles(style):
    wall, trim, pattern, win, floor, fcols = STYLES[style]
    fl = lambda: _floor(floor, fcols)
    frames = []
    # 0 wall top (seen from above: a thick beam in the style's trim colour)
    c = _c()
    c.a[:, :, :3] = hexc(trim)
    c.a[:, :, 3] = 255
    c.rect(0, 0, 16, 3, light(hexc(trim), 0.12), shade=False)
    c.rect(0, 13, 16, 16, dark(hexc(trim), 0.15), shade=False)
    frames.append(c)
    frames.append(_wall_face(style))               # 1 facade
    frames.append(_wall_face(style, window=True))  # 2 facade with window
    frames.append(_wall_face(style, door=True))    # 3 door
    frames.append(fl())                            # 4 floor
    c = fl()                                       # 5 counter
    c.rect(0, 4, 16, 13, WOOD)
    c.rect(0, 4, 16, 6, '#d8a060', shade=False)
    c.dot(4, 7, '#ffe066', w=2, h=2)
    frames.append(c)
    c = fl()                                       # 6 shelf (books / jars / parts by style)
    c.rect(1, 0, 15, 15, '#6a3a20' if style not in ('brass', 'cave') else '#4a4a58')
    goods = {'leaf': ('#6fcf5a', '#e04848', '#f0e0a0', '#8a5ab0', '#4aa0e0'),
             'brass': ('#c8a040', '#8c96a4', '#e07030', '#c8a040', '#8c96a4'),
             'paint': ('#ff5a9a', '#5ac8ff', '#ffe066', '#9aff7a', '#b07cff')}.get(
        style, ('#d04040', '#4070d0', '#40a060', '#e0b040', '#9050c0'))
    for y0 in (2, 7):
        c.rect(2, y0, 14, y0 + 4, '#3a2014', shade=False)
        for i, col in enumerate(goods):
            c.rect(2.5 + i * 2.3, y0 + 0.5 + (i % 2), 4.3 + i * 2.3, y0 + 4, col, shade=False)
    frames.append(c)
    c = fl()                                       # 7 table
    c.ellipse(8, 8, 6.5, 5, '#a86a3a')
    c.ellipse(8, 7, 5.5, 3.8, '#c8884a')
    c.ellipse(6, 6.5, 1.5, 1.2, '#ffffff', shade=False)
    frames.append(c)
    c = fl()                                       # 8 bed
    c.rect(2, 1, 14, 15.5, '#7a4a2a')
    c.rect(3, 2, 13, 6, '#ffffff')
    c.rect(3, 6, 13, 15, {'leaf': '#5aa04a', 'cave': '#6a5ab0', 'log': '#c05a3a', 'bark': '#6a9a4a'}.get(style, '#d05a5a'))
    c.rect(3, 6, 13, 7, '#f0c0a0', shade=False)
    frames.append(c)
    # 9-15 hanging signs (transparent overlays on the facade)
    for icon in ('shop', 'inn', 'library', 'house', 'sage', 'tools', 'star'):
        c = _c()
        c.rect(3, 1, 13, 2, '#5a3420', shade=False)
        c.rect(3, 3, 13, 11, '#e8c88a')
        if icon == 'shop':
            c.ellipse(8, 7.5, 2.5, 2.5, '#d04060')
            c.rect(7, 3.5, 9, 5, '#8ad0ff', shade=False)
        elif icon == 'inn':
            c.rect(4.5, 6, 11.5, 9, '#d05a5a', shade=False)
            c.rect(4.5, 5, 7, 6.5, '#ffffff', shade=False)
        elif icon == 'library':
            c.rect(5, 4.5, 11, 9.5, '#4070d0', shade=False)
            c.rect(7.8, 4.5, 8.2, 9.5, '#ffffff', shade=False)
        elif icon == 'house':
            c.poly([(4.5, 7), (8, 4), (11.5, 7)], '#d04040')
            c.rect(5.5, 7, 10.5, 10, '#fff4d0', shade=False)
        elif icon == 'sage':
            c.poly([(8, 3.5), (9.2, 6.2), (12, 6.5), (9.8, 8.3), (10.5, 11), (8, 9.5), (5.5, 11), (6.2, 8.3), (4, 6.5), (6.8, 6.2)], '#8a5ae0')
        elif icon == 'tools':
            c.line(5, 10, 10, 5, '#8c96a4', w=1.4)
            c.rect(9, 3.5, 12, 6, '#8c96a4')
            c.line(6, 5, 11, 10, '#a86a3a', w=1.2)
        elif icon == 'star':
            c.ellipse(8, 7, 3, 3, '#3a3a8a', shade=False)
            c.dot(7, 6, '#fff4b0')
            c.dot(9, 8, '#ffffff')
        frames.append(_outlined(c))
    return frames


# Order must match ROOF_COLORS in src/content/zones.ts.
ROOFS = {'red': '#c0503a', 'blue': '#3a6ab0', 'green': '#4a8a4a', 'purple': '#7a4ab0',
         'slate': '#5a6478', 'leaf': '#6aa83a', 'copper': '#b0703a', 'pink': '#e070a8',
         'teal': '#3aa0a0', 'thatch': '#c8a050', 'sea': '#4a8ab8', 'dusk': '#4a3a6a'}


def roof_tiles():
    """Nine-slice roof per colour: TL T TR / L M R / BL B BR (9 frames each)."""
    frames = []
    for name, col in ROOFS.items():
        base = hexc(col)
        for sy in range(3):
            for sx in range(3):
                c = _c()
                c.a[:, :, :3] = base
                c.a[:, :, 3] = 255
                if name == 'thatch':  # straw bundles instead of shingles
                    for x in range(0, T, 2):
                        c.a[:, x, :3] = dark(base, 0.1)
                    c.a[::5, :, :3] = light(base, 0.1)
                else:
                    for y in range(0, T, 4):
                        c.a[y + 3, :, :3] = dark(base, 0.14)
                        for x in range((y // 4 % 2) * 4, T, 8):
                            c.a[y:y + 3, x, :3] = dark(base, 0.08)
                    c.a[0::4, :, :3] = light(base, 0.06)
                if sy == 0:  # ridge
                    c.rect(0, 0, 16, 3, light(base, 0.18), shade=False)
                    c.rect(0, 3, 16, 4, dark(base, 0.2), shade=False)
                if sy == 2:  # eave with its shadow line
                    c.rect(0, 12, 16, 14, dark(base, 0.22), shade=False)
                    c.rect(0, 14, 16, 16, (40, 26, 30), shade=False)
                if sx == 0:
                    c.rect(0, 0, 2, 16, dark(base, 0.25), shade=False)
                if sx == 2:
                    c.rect(14, 0, 16, 16, dark(base, 0.25), shade=False)
                frames.append(c)
    return frames


# ─── The Crystal Spire's floors (#74) ────────────────────────────────────────
# One 9-frame tileset per floor theme (same layout as zone tilesets) plus a
# shared props strip. Keep in sync with SPIRE_THEMES / SPIRE_PROP_FRAME.

SPIRE_THEMES = {
    #           ground           path (carpet/belt)  pit kind  pit colour   solid        deco
    'archive': ((70, 62, 58),   (120, 36, 48),      'pit',    '#120c10',   'bookstack', 'cobweb'),
    'thicket': ((46, 62, 50),   (84, 72, 52),       'murk',   '#2a3a2a',   'deadtree',  'glowshroom'),
    'stars':   ((26, 24, 48),   (62, 56, 100),      'void',   '#06061a',   'telescope', 'mote'),
    'engine':  ((64, 60, 66),   (96, 90, 70),       'oil',    '#141018',   'gearwall',  'steam'),
    'throne':  ((30, 20, 40),   (96, 36, 130),      'void',   '#0a0612',   'shadowpillar', 'brazier'),
}


def spire_ground(base, seed, theme):
    c = _c()
    _speckle(c, base, seed, density=0.2, tufts=theme == 'thicket')
    if theme in ('archive', 'throne'):  # flagstone seams
        c.a[::8, :, :3] = dark(base, 0.12)
        for y in range(0, T, 8):
            off = 0 if (y // 8) % 2 else 4
            c.a[y:y + 8, off::8, :3] = dark(base, 0.12)
    elif theme == 'engine':  # riveted plates
        c.a[::8, :, :3] = dark(base, 0.15)
        c.a[:, ::8, :3] = dark(base, 0.15)
        for (x, y) in ((2, 2), (10, 2), (2, 10), (10, 10)):
            c.dot(x, y, light(base, 0.2))
    elif theme == 'stars':
        rnd = random.Random(seed * 7)
        for _ in range(3):
            c.dot(rnd.randrange(T), rnd.randrange(T), (200, 200, 255) if rnd.random() < 0.5 else (140, 120, 220))
    return c


def spire_path(base, theme):
    c = _c()
    c.a[:, :, :3] = base
    c.a[:, :, 3] = 255
    if theme in ('archive', 'throne'):  # a worn carpet runner with a gold hem
        c.a[:, 0:2, :3] = hexc('#c8a040')
        c.a[:, 14:16, :3] = hexc('#c8a040')
        for y in range(2, T, 6):
            c.dot(7, y, light(base, 0.15), w=2, h=2)
    elif theme == 'engine':  # conveyor belt
        for y in range(0, T, 3):
            c.a[y, :, :3] = dark(base, 0.25)
        c.a[:, 0, :3] = hexc('#3a3a44')
        c.a[:, 15, :3] = hexc('#3a3a44')
    elif theme == 'thicket':  # root-tangled dirt
        _speckle(c, base, 11, density=0.15, tufts=False)
        c.line(1, 4, 12, 7, dark(base, 0.2), w=0.8)
        c.line(4, 13, 15, 10, dark(base, 0.2), w=0.8)
    else:  # stars: a glowing walkway
        c.a[::4, :, :3] = light(base, 0.08)
        c.dot(3, 3, (220, 220, 255))
        c.dot(12, 10, (220, 220, 255))
    return c


def spire_pit(kind, col, frame):
    col = hexc(col)
    c = _c()
    c.a[:, :, :3] = col
    c.a[:, :, 3] = 255
    rnd = random.Random(3 + frame)
    if kind == 'void':
        for _ in range(6):
            x, y = rnd.randrange(T), rnd.randrange(T)
            c.dot(x, y, (255, 255, 230) if rnd.random() < 0.6 else (150, 160, 255))
    elif kind == 'pit':  # drifting lost pages in the dark
        for _ in range(2):
            x, y = rnd.randrange(1, T - 3), rnd.randrange(1, T - 2)
            c.rect(x, y, x + 3, y + 2, '#8a7a60', shade=False)
    else:  # murk / oil: slow sheen bands
        for y in range(0, T, 4):
            for x in range(T):
                if math.sin((x + frame * 3 + y) * 0.7) > 0.8:
                    c.a[(y + 1) % T, x, :3] = light(col, 0.18)
    return c


def spire_solid(kind):
    c = _c()
    if kind == 'bookstack':
        c.rect(1, 1, 15, 15.5, '#4a2a1a')
        for y0 in (2, 7, 11.5):
            c.rect(2, y0, 14, y0 + 3.5, '#1e1210', shade=False)
            for i, col in enumerate(('#7a2a2a', '#2a4a7a', '#4a6a2a', '#7a6a2a', '#5a3a6a')):
                c.rect(2.3 + i * 2.35, y0 + 0.3 + (i % 2) * 0.6, 4.1 + i * 2.35, y0 + 3.5, col, shade=False)
        c.line(1, 1, 5, 5, '#d8d8e0', w=0.4)  # cobweb strand
    elif kind == 'deadtree':
        c.rect(7, 7, 9, 16, '#3a2a22')
        c.line(8, 8, 3, 3, '#3a2a22', w=1.2)
        c.line(8, 7, 13, 2, '#3a2a22', w=1.2)
        c.line(4, 4, 2, 5, '#3a2a22', w=0.8)
        c.line(12, 3, 14, 5, '#3a2a22', w=0.8)
        c.dot(5, 9, '#7a3aff')  # a watching eye in the bark
        c.dot(10, 10, '#7a3aff')
    elif kind == 'telescope':
        c.rect(6, 12, 10, 16, '#5a5a70')
        c.line(8, 12, 4, 15.5, '#5a5a70', w=1)
        c.line(8, 12, 12, 15.5, '#5a5a70', w=1)
        c.line(5, 11, 13, 3, '#8a7a9a', w=3)
        c.line(11, 5, 14, 2, '#b0a0c0', w=3.5)
        c.dot(9, 7, '#2a2040', w=2, h=1)  # the crack
    elif kind == 'gearwall':
        c.rect(0, 0, 16, 16, '#4a4650')
        for (cx, cy, r) in ((5, 5, 4), (11, 11, 4)):
            for t in range(6):
                a = t * math.pi / 3
                c.dot(cx + math.cos(a) * r, cy + math.sin(a) * r, '#8a7a5a', w=2, h=2)
            c.ellipse(cx, cy, r - 1, r - 1, '#a08a5a')
            c.dot(cx, cy, '#2a2630', w=2, h=2)
    elif kind == 'shadowpillar':
        c.rect(3, 1, 13, 16, '#2a1e3a')
        c.rect(2, 0, 14, 2.5, '#3a2a50')
        c.rect(2, 13.5, 14, 16, '#3a2a50')
        for x in (5.5, 8, 10.5):
            c.rect(x, 3, x + 0.8, 13, '#1a1228', shade=False)
        c.dot(8, 7, '#b07cff')
    return _outlined(c)


def spire_deco(kind):
    c = _c()
    if kind == 'cobweb':
        for (a, b) in (((0, 0), (8, 8)), ((0, 5), (6, 3)), ((3, 0), (5, 6)), ((0, 9), (9, 0))):
            c.line(a[0], a[1], b[0], b[1], (220, 220, 230), w=0.35)
        c.dot(6, 6, '#2a2a2a', w=2, h=2)  # a small spider
    elif kind == 'glowshroom':
        for (x, y, col) in ((5, 10, '#6affd0'), (10, 8, '#b07cff'), (11, 12, '#6affd0')):
            c.rect(x - 0.5, y, x + 0.5, y + 3, '#d8d0c0', shade=False)
            c.ellipse(x, y, 2, 1.4, col, shade=False)
    elif kind == 'mote':
        for (x, y) in ((4, 4), (11, 9), (7, 13)):
            c.dot(x, y - 1, '#fff4b0', h=3)
            c.dot(x - 1, y, '#fff4b0', w=3)
    elif kind == 'steam':
        c.rect(5, 12, 11, 15, '#4a4650')
        for (x, y, r) in ((8, 9, 2.5), (6, 6, 2), (9, 3, 1.6)):
            c.ellipse(x, y, r, r, (200, 200, 210), shade=False)
    elif kind == 'brazier':
        c.rect(6, 10, 10, 15, '#3a2a50')
        c.rect(5, 9, 11, 10.5, '#5a4a70', shade=False)
        c.poly([(5.5, 9), (8, 2), (10.5, 9)], '#9a4aff')
        c.poly([(6.8, 9), (8, 5), (9.2, 9)], '#e0b0ff')
    return c if kind in ('cobweb', 'mote', 'steam') else _outlined(c)


def stairs_sheet():
    """Dungeon stairs (#75 item 10): 0 = down into the dark, 1 = up toward the light."""
    down = _c()
    down.rect(1, 1, 15, 15, '#5a5464')  # the stone rim
    down.rect(3, 3, 13, 13, '#141018', shade=False)  # the dark below
    for i, col in enumerate(('#9a94a4', '#76707f', '#524c5c', '#302a38')):
        down.rect(3, 3 + i * 2.5, 13, 5 + i * 2.5, col)  # each step further down, darker
    up = _c()
    for i in range(4):
        up.rect(2 + i, 2 + i * 3, 14 - i, 5 + i * 3, '#8a8494' if i % 2 else '#7a7484')
    up.rect(5, 0, 11, 3, '#fff4b0', shade=False)  # light from above
    return [_outlined(down), _outlined(up)]


def spire_props():
    frames = []
    for glow in (0, 1):  # rune seal, glowing
        c = _c()
        c.rect(3, 10, 13, 15, '#3a3448')
        c.rect(4, 3, 12, 11, '#4a4460')
        col = '#b07cff' if not glow else '#e0c8ff'
        c.poly([(8, 4), (11, 7), (8, 10), (5, 7)], col)
        c.dot(8, 7, '#ffffff' if glow else '#e0c8ff')
        c.dot(4, 2, col)
        c.dot(12, 2, col)
        frames.append(_outlined(c))
    c = _c()  # broken seal
    c.rect(3, 10, 13, 15, '#3a3448')
    c.poly([(4, 10), (6, 4), (9, 6), (7, 10)], '#4a4460')
    c.poly([(9, 10), (10, 5), (12, 7), (12, 10)], '#4a4460')
    c.dot(7, 12, '#6a6480', w=2, h=1)
    frames.append(_outlined(c))
    for opened in (False, True):  # stairs up
        c = _c()
        for i in range(4):
            c.rect(2 + i, 2 + i * 3, 14 - i, 5 + i * 3, '#6a6080' if i % 2 else '#5a5070')
        if not opened:
            for x in range(2, 15, 3):
                c.line(x, 1, x, 15, '#b07cff', w=0.6)
            c.ellipse(8, 8, 2.2, 2.2, '#b07cff')
        else:
            c.rect(5, 0, 11, 3, '#fff4b0', shade=False)  # light from above
        frames.append(_outlined(c))
    for side in (0, 1):  # Umbra's throne (two tiles)
        c = _c()
        if side == 0:
            c.rect(4, 1, 16, 15, '#2a1a3a')
            c.rect(6, 4, 16, 12, '#5a2a7a')
            c.poly([(4, 1), (6, -2), (8, 1)], '#b07cff')
        else:
            c.rect(0, 1, 12, 15, '#2a1a3a')
            c.rect(0, 4, 10, 12, '#5a2a7a')
            c.poly([(8, 1), (10, -2), (12, 1)], '#b07cff')
        frames.append(_outlined(c))
    return frames


# ─── Battle backdrops ────────────────────────────────────────────────────────

BW, BH = 256, 144


HORIZON = 92


def _sky(z: dict) -> np.ndarray:
    """The sky down to the horizon: a banded gradient with a 2×2 ordered dither
    between bands (SNES look). No randomness, so it's the same on every call."""
    a = np.zeros((BH, BW, 3), dtype=np.uint8)
    top, bot = hexc(z['sky'][0]), hexc(z['sky'][1])
    bands = 10
    for y in range(HORIZON):
        t = y / HORIZON
        tb = t * bands
        lo = math.floor(tb) / bands
        hi = min(1.0, (math.floor(tb) + 1) / bands)
        frac = tb - math.floor(tb)
        for x in range(BW):
            thresh = ((x % 2) * 2 + (y % 2)) / 4 + 0.125
            tt = hi if frac > thresh else lo
            a[y, x] = mix(top, bot, tt)
    return a


def _sun_and_clouds(img: np.ndarray):
    """A daytime sky's sun and three flat clouds (no randomness)."""
    cx, cy, r = 210, 22, 9
    for y in range(cy - r, cy + r):
        for x in range(cx - r, cx + r):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                img[y, x] = (255, 250, 210)
    for (cx, cy, w) in ((50, 20, 26), (120, 34, 20), (170, 14, 16)):
        for y in range(cy - 4, cy + 4):
            for x in range(cx - w, cx + w):
                if ((x - cx) / w) ** 2 + ((y - cy) / 4) ** 2 <= 1:
                    img[y, x] = (250, 252, 255) if y < cy + 1 else (220, 232, 250)


def backdrop(z: dict, seed: int) -> Image.Image:
    rnd = random.Random(seed)
    horizon = HORIZON
    img = _sky(z)
    if z.get('stars'):
        for _ in range(60):
            x, y = rnd.randrange(BW), rnd.randrange(horizon - 20)
            img[y, x] = (255, 255, 230) if rnd.random() < 0.7 else (180, 200, 255)
    if z.get('moon'):
        cx, cy, r = 200, 24, 11
        for y in range(cy - r, cy + r):
            for x in range(cx - r, cx + r):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    img[y, x] = (255, 244, 200)
    elif not z.get('stars') and not z.get('cave'):
        _sun_and_clouds(img)
    # far hills
    far = hexc(z['far'])
    ph = rnd.random() * 10
    for x in range(BW):
        h = horizon - 18 - 10 * math.sin(x * 0.03 + ph) - 5 * math.sin(x * 0.09 + ph * 2)
        for y in range(int(h), horizon):
            img[y, x] = far if y > h + 1 else light(far, 0.08)
    # mid layer silhouettes
    g = z['ground']
    midc = mix(dark(g, 0.2), far, 0.35)
    mid = z['mid']
    for i in range(14):
        x0 = i * 20 + rnd.randrange(-4, 5)
        _mid_shape(img, mid, x0, horizon, midc, rnd)
    # ground band with perspective stripes
    for y in range(horizon, BH):
        t = (y - horizon) / (BH - horizon)
        row = mix(dark(g, 0.12), g, t)
        stripe = int((y - horizon) ** 1.35) % 6 < 2
        for x in range(BW):
            img[y, x] = light(row, 0.04) if stripe else row
    for _ in range(90):
        x, y = rnd.randrange(BW), rnd.randrange(horizon + 2, BH)
        img[y, x] = dark(g, 0.18)
    return Image.fromarray(img, 'RGB')


def _mid_shape(img, kind, x0, base, col, rnd):
    def fill(pred, x_lo, x_hi, y_lo, y_hi, c=col):
        for y in range(max(0, y_lo), min(BH, y_hi)):
            for x in range(max(0, x_lo), min(BW, x_hi)):
                if pred(x, y):
                    img[y, x] = c
    h = rnd.randrange(14, 26)
    if kind in ('tree', 'houses'):
        r = h // 2
        cx, cy = x0 + 8, base - r - 2
        fill(lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r, cx - r, cx + r, cy - r, cy + r)
        fill(lambda x, y: True, cx - 1, cx + 2, cy, base)
        if kind == 'houses' and rnd.random() < 0.5:
            fill(lambda x, y: True, x0, x0 + 14, base - 10, base, c=light(col, 0.05))
            fill(lambda x, y: abs(x - (x0 + 7)) < (y - (base - 17)), x0 - 1, x0 + 15, base - 17, base - 9, c=dark(col, 0.05))
    elif kind == 'pine':
        cx = x0 + 8
        fill(lambda x, y: abs(x - cx) * 2.2 < (y - (base - h - 6)), cx - 12, cx + 12, base - h - 6, base)
    elif kind == 'mountain':
        cx = x0 + 10
        fill(lambda x, y: abs(x - cx) < (y - (base - h - 8)), cx - 30, cx + 30, base - h - 8, base)
    elif kind == 'gears':
        cx, cy, r = x0 + 8, base - h // 2, h // 2
        fill(lambda x, y: (r * 0.5) ** 2 <= (x - cx) ** 2 + (y - cy) ** 2 <= r * r
             or (abs(x - cx) < 2 and abs(y - cy) < r + 2) or (abs(y - cy) < 2 and abs(x - cx) < r + 2),
             cx - r - 3, cx + r + 3, cy - r - 3, cy + r + 3)
    elif kind == 'crystals':
        cx = x0 + 8
        fill(lambda x, y: abs(x - cx) * 3 < (y - (base - h - 6)) and y < base, cx - 8, cx + 8, base - h - 6, base,
             c=light(col, 0.08))
    elif kind == 'sea':
        fill(lambda x, y: True, x0 - 2, x0 + 22, base - 8, base, c=mix(col, (60, 120, 200), 0.5))
        fill(lambda x, y: (x + y) % 7 == 0, x0 - 2, x0 + 22, base - 8, base - 6, c=(200, 230, 255))


def sea_backdrop(z: dict, seed: int) -> Image.Image:
    """A battle out at sea (#75 item 14d): the zone's daytime sky, a few low
    islands on the horizon, then open water all the way to the front — lighter
    far off, deeper near, with wave crests in perspective and sparkles. The
    hero fights from Marlow's boat (the battle screen draws it), and a sea
    critter rises out of the water."""
    rnd = random.Random(seed)
    img = _sky(z)
    _sun_and_clouds(img)
    water = hexc(z['water'])
    deep = dark(water, 0.18)
    far_sea = light(water, 0.22)
    # Low islands on the horizon: the Shallows' own sandy humps, one mid-picture
    # so a phone's narrow crop (background-size: cover — only about x 88–168
    # shows at 375×667) has one. Just humps, nothing standing on them: the
    # battle screen's water band (`SeaFloor`) rises over the horizon as the
    # menu squeezes the stage, and a hump half-covered still reads as an island
    # — a palm left standing on the water wouldn't (#75 item 14d review).
    isl = mix(hexc(z['far']), hexc(z['ground']), 0.4)
    for (cx, w, h) in ((30, 22, 5), (128, 15, 4), (218, 30, 6)):
        for x in range(max(0, cx - w), min(BW, cx + w)):
            t = (x - cx) / w
            for y in range(int(HORIZON - h * (1 - t * t)), HORIZON):
                img[y, x] = isl
    # The sea, horizon to front.
    shade = lambda t: mix(far_sea, deep, t ** 0.8)  # noqa: E731
    for y in range(HORIZON, BH):
        img[y, :] = shade((y - HORIZON) / (BH - HORIZON))
    for y in range(HORIZON + 1, BH):
        if int((y - HORIZON) ** 1.3) % 5:
            continue
        t = (y - HORIZON) / (BH - HORIZON)
        dash, gap = 3 + int(t * 12), 6 + int(t * 18)
        crest = light(shade(t), 0.22)
        for x0 in range(-rnd.randrange(gap + dash), BW, dash + gap):
            img[y, max(0, x0):max(0, min(BW, x0 + dash))] = crest
    for x in range(0, BW, 6):
        img[HORIZON, x:x + 3] = light(far_sea, 0.35)
    for _ in range(40):
        img[rnd.randrange(HORIZON + 2, BH), rnd.randrange(BW)] = (240, 250, 255)
    return Image.fromarray(img, 'RGB')


def sea_backdrop_path(zid: str) -> str:
    """Where a sea map's battle-at-sea backdrop is written (src: `battleBackdrop(zone, 'sea')`)."""
    return f'{zid}-sea.png'


# ─── Overworld sheet (#75 Phase 1) ───────────────────────────────────────────
# One 32px strip shared by every overworld (keep in sync with OVERWORLD_FRAME in
# src/content/tiles.ts): 0 mountain overlay · 1 sand · 2-3 fog (drifting) ·
# 4 town · 5 hamlet · 6 forest · 7 cave · 8 shrine · 9 coast · 10 grove ·
# 11 city · 12 canyon · 13 garden · 14 pavilion (the four crystal regions, #75 item 8).


def ow_mountain():
    c = _c()
    c.poly([(0, 15.5), (5.5, 4), (9, 9), (12, 3), (16, 15.5)], '#8a90a8')
    c.poly([(5.5, 4), (9, 9), (7.5, 15.5), (0, 15.5)], '#767c94')
    c.poly([(4, 7.2), (5.5, 4), (7.2, 7.4), (5.6, 6.6)], '#f0f4ff', shade=False)
    c.poly([(10.4, 6.4), (12, 3), (13.8, 6.8), (12, 6)], '#f0f4ff', shade=False)
    return _outlined(c)


def ow_sand():
    c = _c()
    _speckle(c, (226, 210, 156), 311, density=0.2, tufts=False)
    c.dot(4, 11, '#ffffff')
    c.dot(12, 5, '#f8d0c0')
    return c


def ow_fog(frame):
    c = _c()
    for (x, y, rx, ry) in ((4 + frame * 2, 5, 5, 3.4), (12 - frame * 2, 9, 5.5, 3.6), (6 + frame, 13, 5, 3)):
        c.ellipse(x, y, rx, ry, '#eef0fa')
    # a soft bank: every pixel at least lightly fogged, the puffs denser
    a = c.a
    a[:, :, :3] = np.where(a[:, :, 3:4] > 0, a[:, :, :3], np.array([226, 228, 242], dtype=np.uint8))
    a[:, :, 3] = np.where(a[:, :, 3] > 0, 210, 150).astype(np.uint8)
    return c


# Fog puffs (#75 item 7 follow-up): soft, lumpy clouds that a fog bank is
# built from in the game — many overlapping puffs drifting around each other,
# so a bank has rounded, wispy edges instead of square tiles. Drawn at 24px
# (shown 2× as 48px) with stepped alpha so they stay pixel-art.
FOG_PUFF = 24
FOG_PUFF_SHAPES = (
    ((12, 13, 7.5), (6.5, 14.5, 5), (17.5, 14, 5.5), (11, 8.5, 5.5), (15.5, 9.5, 4)),
    ((12, 12.5, 8), (6, 13.5, 5.5), (18, 13, 4.5), (9, 8, 4.5)),
    ((11.5, 13, 7), (17, 12.5, 6), (6.5, 14, 4.5), (14, 8, 5)),
)


def fog_puff(shape) -> Image.Image:
    n = FOG_PUFF
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    # Signed distance to the union of the puff's circles (negative inside).
    d = np.min([np.hypot(xx - cx, yy - cy) - r for (cx, cy, r) in shape], axis=0)
    depth = -d
    alpha = np.select([depth > 3, depth > 1.5, depth > 0], [228, 165, 90], 0).astype(np.uint8)
    cy0 = np.mean([c[1] for c in shape])
    base = np.array([238, 240, 250], dtype=float)
    shade = np.array([204, 208, 230], dtype=float)
    light = np.array([255, 255, 255], dtype=float)
    # Shadow underneath, a bright rim on top: a cloud lit from above.
    low = np.clip((yy - cy0) / 6, 0, 1)[..., None]
    rgb = base * (1 - low) + shade * low
    top_rim = ((depth > 0) & (depth <= 2) & (yy < cy0 - 1))[..., None]
    rgb = np.where(top_rim, light, rgb)
    img = np.zeros((n, n, 4), dtype=np.uint8)
    img[..., :3] = rgb.round().astype(np.uint8)
    img[..., 3] = alpha
    return Image.fromarray(img, 'RGBA')


def build_fog(public: Path):
    """Write only the fog-puff sheet (#75): `/tiles/fog-puffs.png`."""
    tdir = public / 'tiles'
    strip([upscale(fog_puff(sh), 2) for sh in FOG_PUFF_SHAPES]).save(tdir / 'fog-puffs.png', optimize=True)


def ow_icon(kind):
    c = _c()
    if kind == 'town':
        for (x0, y0, roof) in ((1, 7, '#d0503a'), (8, 5, '#3a6ad0')):
            c.rect(x0 + 1, y0 + 3, x0 + 7, y0 + 9, '#f0e0c0')
            c.poly([(x0, y0 + 3.5), (x0 + 4, y0 - 0.5), (x0 + 8, y0 + 3.5)], roof)
            c.rect(x0 + 3.5, y0 + 6, x0 + 5, y0 + 9, '#7a4a2a')
        c.dot(12, 9, '#8ad0ff')
    elif kind == 'hamlet':
        c.rect(1.5, 9, 8, 15, '#f4ecd8')
        c.poly([(0.5, 9.5), (4.8, 5), (9, 9.5)], '#c0703a')
        c.rect(4, 12, 5.5, 15, '#7a4a2a')
        c.rect(11, 6, 14, 15, '#e8dcc0')
        c.line(9, 3, 16, 10, '#8a6a4a', w=1.0)
        c.line(16, 3, 9, 10, '#8a6a4a', w=1.0)
        c.dot(12.5, 6.5, '#5a3a2a', w=1, h=1)
    elif kind == 'forest':
        for (x, y, h) in ((4, 4, 11), (12, 4, 11), (8, 2, 12)):
            c.rect(x - 0.6, y + h - 1, x + 0.6, y + h + 1, '#5a3a2a')
            c.poly([(x, y), (x + 4.2, y + h), (x - 4.2, y + h)], '#2a7a4a')
        c.ellipse(8, 14.5, 2, 1.4, '#1a2a1a', shade=False)
    elif kind == 'cave':
        c.poly([(0.5, 15.5), (3, 6), (8, 2.5), (13, 5.5), (15.5, 15.5)], '#8a7a6a')
        c.ellipse(8, 13.5, 3.6, 4, '#1a1420', shade=False)
        c.rect(4.4, 13.5, 11.6, 15.6, '#1a1420', shade=False)
        c.dot(5, 6, '#b0a090', w=2, h=1)
    elif kind == 'shrine':
        c.rect(2, 13, 14, 15.5, '#c8a060')
        for x in (3.5, 11):
            c.rect(x, 7, x + 1.6, 13, '#f4eee2')
        c.rect(5.5, 9, 10.5, 13, '#fff4d0', shade=False)
        c.poly([(1, 7.5), (8, 2), (15, 7.5)], '#e0b040')
        c.ellipse(8, 10.5, 1, 1.6, '#ffb03a', shade=False)
    elif kind == 'coast':
        c.ellipse(8, 14.5, 7, 2, '#8a8a8a')
        for i, y in enumerate(range(4, 14, 2)):
            c.rect(6, y, 10, y + 2, '#e04848' if i % 2 == 0 else '#f4f4f4')
        c.rect(5.5, 2, 10.5, 4, '#3a3a4a')
        c.dot(8, 2.8, '#ffe066', w=2, h=1)
    elif kind == 'grove':
        c.ellipse(8, 11, 5, 3, '#3a5ab0')
        c.ellipse(9, 10.5, 1.6, 1.6, '#fff4c8', shade=False)
        c.ellipse(9.8, 10.1, 1.4, 1.4, '#3a5ab0', shade=False)
        for (x, y) in ((2.5, 6), (13.5, 6)):
            c.ellipse(x, y, 2.6, 3.4, '#2a6a4a')
        c.dot(5, 4, '#fff27a')
        c.dot(11, 3, '#fff27a')
    elif kind == 'city':
        # Numbria: blue-stone towers with domed roofs behind a wall and gate.
        c.rect(1, 9, 15, 15.5, '#9aa6c4')
        for x in (1.5, 4.5, 7.5, 10.5, 13.5):
            c.rect(x, 8, x + 1.5, 9, '#9aa6c4')
        c.rect(2, 4, 6, 9, '#b4bed8')
        c.ellipse(4, 4, 2.2, 1.8, '#3a6ad0')
        c.rect(10, 2.5, 14, 9, '#b4bed8')
        c.ellipse(12, 2.5, 2.2, 1.8, '#3a6ad0')
        c.dot(12, 0.5, '#ffe066')
        c.rect(6.5, 11.5, 9.5, 15.5, '#3a3048')
        c.dot(4, 6, '#ffe066')
        c.dot(12, 5, '#ffe066')
        c.dot(12, 7, '#ffe066')
    elif kind == 'canyon':
        # Gearfall Canyon: a brass gear turning between two red-rock cliffs.
        c.poly([(0.5, 15.5), (1, 5), (3.5, 2.5), (5.5, 6), (6, 15.5)], '#8a4a36')
        c.poly([(10, 15.5), (10.5, 5.5), (13, 3), (15.5, 6), (15.5, 15.5)], '#7a3e2c')
        c.rect(1.5, 9, 5, 10, '#6a3424', shade=False)
        c.rect(11, 11, 15, 12, '#5e2e1e', shade=False)
        for i in range(8):
            a = i * math.pi / 4
            c.dot(8 + math.cos(a) * 3.6, 9.5 + math.sin(a) * 3.6, '#f0c848', w=2, h=2)
        c.ellipse(8, 9.5, 3, 3, '#ffd860')
        c.ellipse(8, 9.5, 1.1, 1.1, '#5a3a1a', shade=False)
    elif kind == 'garden':
        # Verdara: a glass greenhouse dome full of leaves.
        c.rect(2, 13, 14, 15.5, '#8a6a4a')
        c.ellipse(8, 11.5, 6, 6, '#bce8dc')
        c.rect(1.5, 11.5, 14.5, 13.2, '#bce8dc')
        for x in (5, 8, 11):
            c.line(x, 6, x, 13, '#6aa898', w=0.6)
        c.line(2.5, 10, 13.5, 10, '#6aa898', w=0.6)
        c.ellipse(6, 11.5, 2, 1.6, '#3a9a4a', shade=False)
        c.ellipse(10, 11, 2.2, 1.8, '#2a8a3e', shade=False)
        c.dot(10, 10, '#ff8ab0')
        c.dot(6.5, 11, '#ffe066')
        c.dot(8, 4.5, '#ffffff')
    elif kind == 'pavilion':
        # Chromaria: a striped pavilion with a flag — every colour at once.
        stripes = ('#e04848', '#ffd23a', '#3a8ae0', '#4ac06a', '#c05ad8')
        for i, col in enumerate(stripes):
            x0 = 2 + i * 2.4
            c.rect(x0, 10, x0 + 2.4, 15.5, col)
        c.poly([(1, 10.5), (8, 3), (15, 10.5)], '#ffd23a')
        c.poly([(4.5, 10.5), (8, 3), (8, 10.5)], '#e04848', shade=False)
        c.poly([(8, 3), (11.5, 10.5), (8, 10.5)], '#3a8ae0', shade=False)
        c.rect(7, 12, 9, 15.5, '#3a2a40', shade=False)
        c.line(8, 0.5, 8, 3, '#5a4a4a', w=0.6)
        c.poly([(8, 0.5), (11, 1.3), (8, 2.1)], '#e04848', shade=False)
    elif kind == 'hill':
        # Remembrance Hill (#75 item 14e): a green hill crowned by the pale Hall of Names.
        c.poly([(0.5, 15.5), (2.5, 10), (6, 7.5), (10, 7.5), (13.5, 10), (15.5, 15.5)], '#5aa05a')
        c.rect(4.5, 6.5, 11.5, 11, '#f2eef8')
        for x in (5.4, 7.6, 9.8):
            c.rect(x, 7, x + 0.8, 11, '#c8c0dc', shade=False)
        c.poly([(3.5, 6.8), (8, 3), (12.5, 6.8)], '#9a8ad0')
        c.rect(7.2, 9, 8.8, 11, '#5a4a7a', shade=False)
        for fx, fy in ((2.5, 13), (5, 14.2), (11, 13.6), (13.5, 14.4), (8, 14.6)):
            c.dot(fx, fy, '#7aa8ff', w=1, h=1)
    elif kind == 'elder':
        # Eldergrove (#75 item 14f): one great ring-tree, a ring-cut stump beside it.
        c.rect(6, 9, 10, 15.5, '#6a4428')
        c.rect(6.8, 9, 7.5, 15.5, '#80583a', shade=False)
        c.ellipse(8, 6, 7.2, 5.6, '#5a8a3a')
        c.ellipse(4.8, 4.6, 2.8, 2.2, '#7aa04a')
        c.ellipse(11.4, 4.2, 2.4, 2, '#7aa04a')
        c.dot(9, 2.5, '#e0b040', w=2, h=1)
        c.dot(3.5, 7, '#e0a03a')
        c.ellipse(13, 13.5, 2.4, 1.6, '#c8a070')
        c.ellipse(13, 13.5, 1.4, 0.9, '#a07a4a', shade=False)
        c.dot(13, 13.5, '#6a4428', w=1, h=1)
    return _outlined(c)


def signpost():
    """A crossroads signpost (#75 item 6): a post with two arrow boards, one
    pointing each way. Stands in the world like an NPC — talk to it."""
    c = _c()
    c.shadow(8, 15.2, 4, 1)
    c.rect(7, 2, 9, 15.5, '#8a5a32', shade=False)
    c.rect(7, 2, 7.6, 15.5, '#a8743e', shade=False)
    # Top board points right, bottom board points left.
    c.poly([(2, 3), (12, 3), (15, 5.5), (12, 8), (2, 8)], '#dcaa64', shade=False)
    c.poly([(14, 9), (4, 9), (1, 11.5), (4, 14), (14, 14)], '#c8904a', shade=False)
    c.rect(2, 3, 12, 4, '#ecc488', shade=False)
    c.rect(4, 9, 14, 10, '#dcaa64', shade=False)
    for (x, y) in ((4, 5), (6, 5), (8, 5), (10, 5), (5, 6), (7, 6), (9, 6),
                   (6, 11), (8, 11), (10, 11), (12, 11), (7, 12), (9, 12), (11, 12)):
        c.dot(x, y, '#6a4020')
    return _outlined(c)


def ow_dock():
    """Marlow's dock (#75 item 14): plank boards on pilings, drawn over the water."""
    c = _c()
    for i, y in enumerate((1, 4.2, 7.4, 10.6)):
        col = '#b8864e' if i % 2 else '#a47640'
        c.rect(0, y, 16, y + 2.8, col, shade=False)
        c.rect(0, y, 16, y + 0.7, '#d4a46a', shade=False)  # each board's lit top edge
        c.dot(2 + (i % 2) * 5, y + 1.6, '#5a3a20')
        c.dot(11 + (i % 2) * 2, y + 1.6, '#5a3a20')
    for x in (1, 13):  # mooring posts at the end of the boards
        c.ellipse(x + 1, 14.4, 1.4, 1.3, '#6a4426')
        c.dot(x + 0.6, 13.8, '#9a6a3e')
    return c


def boat_sheet():
    """Marlow's boat, the Biscuit (#75 item 14), afloat and facing right.

    0, 1: the whole boat (two frames of a bob) — moored, or under the hero.
    2, 3: just the front of the hull, drawn OVER the hero while they sail, so
          they sit in the boat rather than on it.
    """
    frames = []
    for front_only in (False, True):
        for f in (0, 1):
            c = _c()
            lift = 0.5 if f else 0
            if not front_only:
                # Mast and sail (behind the hero), a little red pennant on top.
                c.rect(11.2, 1 + lift, 12, 11 + lift, '#7a4a2a', shade=False)
                c.poly([(11, 1.6 + lift), (11, 9.6 + lift), (3.5, 9.6 + lift)], '#f4eedc')
                c.poly([(12, 1 + lift), (14.6, 1.8 + lift), (12, 2.8 + lift)], '#e04848', shade=False)
            # The hull: planks, a lighter rim, a stripe of red paint.
            c.poly([(0.5, 10.2 + lift), (15.5, 10.2 + lift), (13.2, 14.6 + lift), (2.6, 14.6 + lift)], '#9a5a30')
            c.rect(0.8, 10.2 + lift, 15.2, 11 + lift, '#c8884e', shade=False)
            c.rect(2.2, 12.2 + lift, 13.8, 12.9 + lift, '#d05a3a', shade=False)
            if not front_only:
                for x in ((2, 6, 10, 14) if f else (4, 8, 12)):  # foam where the hull meets the water
                    c.dot(x, 15, '#e8f4ff')
            frames.append(_outlined(c))
    return frames


def lighthouse_sheet():
    """Gull Rock's lighthouse (#75 item 14 review): a tower 2 tiles wide and 4
    tall, standing on a grey rock that fills the 2×2 cells at its foot —
    whitewashed, two red bands, a black gallery, a red dome. Four frames of
    the lamp pulsing (bright, warm, low, warm); the canvas adds the glow and
    the sweeping beam.
    """
    lamps = (('#fff8c8', True), ('#ffe88a', True), ('#ffd45a', False), ('#ffe88a', True))
    frames = []
    for glass, core in lamps:
        c = Canvas(64, 64)
        o = 16  # draw in the middle 32 columns, cropped below

        def x(v):
            return o + v

        def edge(y):  # the tower's sides at height y: it narrows as it rises
            t = (y - 16) / 34
            return x(11 - 2 * t), x(21 + 2 * t)

        # The rock it stands on — Gull Rock itself — with a few cracks and tufts of moss.
        c.poly([(x(1), 64), (x(0), 54), (x(2), 46), (x(7), 41), (x(13), 39), (x(20), 39.5),
                (x(26), 42), (x(30), 47), (x(32), 55), (x(31), 64)], '#8e8c98')
        for (ax, ay), (bx, by) in (((5, 52), (8, 57)), ((23, 50), (26, 55)), ((14, 58), (18, 61))):
            c.line(x(ax), ay, x(bx), by, '#64626e', w=0.8)
        for mx, my in ((3, 47), (27, 46), (9, 42)):
            c.dot(x(mx), my, '#6a9a4a', w=2)
        # The tower: whitewashed, tapering, with two red bands.
        l0, r0 = edge(50)
        l1, r1 = edge(16)
        c.poly([(l0, 50), (l1, 16), (r1, 16), (r0, 50)], '#f4f2ec', shade=False)
        for y0, y1 in ((22, 28), (35, 41)):
            a0, b0 = edge(y0)
            a1, b1 = edge(y1)
            c.poly([(a1, y1), (a0, y0), (b0, y0), (b1, y1)], '#d84848', shade=False)
        # Round it off: a shadow down the right-hand side, sun on the left.
        for y0, y1, col in ((16, 22, '#cfcbc4'), (22, 28, '#a83434'), (28, 35, '#cfcbc4'), (35, 41, '#a83434'), (41, 50, '#cfcbc4')):
            _, b0 = edge(y0)
            _, b1 = edge(y1)
            c.poly([(b0 - 3, y0), (b0, y0), (b1, y1), (b1 - 3, y1)], col, shade=False)
        for y0, y1, col in ((16, 22, '#ffffff'), (22, 28, '#f07070'), (28, 35, '#ffffff'), (35, 41, '#f07070'), (41, 50, '#ffffff')):
            a0, _ = edge(y0)
            a1, _ = edge(y1)
            c.poly([(a0, y0), (a0 + 1.5, y0), (a1 + 1.5, y1), (a1, y1)], col, shade=False)
        c.rect(x(15), 31, x(17), 33.5, '#3a3a52', shade=False)  # a little window
        c.rect(x(14), 45, x(18), 50, '#4a3424', shade=False)  # the door
        c.ellipse(x(16), 45, 2, 1.6, '#4a3424', shade=False)
        # The gallery with its railing, the lantern room, the dome and its finial.
        c.rect(x(8), 14, x(24), 16.5, '#34344a')
        for px in (9, 12, 15, 18, 21):
            c.rect(x(px), 12, x(px + 1), 14, '#34344a', shade=False)
        c.rect(x(8), 11.5, x(24), 12.5, '#34344a', shade=False)
        c.ellipse(x(16), 7.5, 5.5, 4, '#d04040')
        c.rect(x(11), 7.5, x(21), 14, glass, shade=False)
        for mx in (13.5, 18.5):
            c.rect(x(mx), 7.5, x(mx + 0.8), 14, '#34344a', shade=False)
        if core:
            c.ellipse(x(16), 10.8, 1.6, 1.8, '#ffffff', shade=False)
        c.rect(x(15.5), 1.5, x(16.5), 4, '#34344a', shade=False)
        c.dot(x(15.5), 1, '#ffd84a', w=1)
        out = _outlined(c).image().crop((o, 0, o + 32, 64))
        frames.append(out)
    return frames


OW_ICONS = ('town', 'hamlet', 'forest', 'cave', 'shrine', 'coast', 'grove', 'city', 'canyon', 'garden', 'pavilion')


def overworld_sheet():
    # Frame 15 (#75 item 14): the dock; frame 16 (#75 item 14e): Remembrance Hill;
    # frame 17 (#75 item 14f): Eldergrove — each appended, so every earlier frame keeps its place.
    return ([ow_mountain(), ow_sand(), ow_fog(0), ow_fog(1)] + [ow_icon(k) for k in OW_ICONS]
            + [ow_dock(), ow_icon('hill'), ow_icon('elder')])


# ─── Edge blending (#75, #71b): smooth coasts, beaches and roads ──────────────
#
# A "dual grid": the renderer draws a 32px tile centred on every tile corner
# where different terrain meets, so coastlines and road edges come out rounded
# instead of square. Terrain classes stack low → high: water, sand, ground,
# path. A class's shape at a corner is a 4-bit mask of which of the 4 cells
# around it reach that class (top-left 1, top-right 2, bottom-left 4,
# bottom-right 8). Shapes get a foam line where they sit on water and a darker
# rim on land. Textures are the zone's own, shifted half a tile so they line up
# with the cells around them.
#
# Most corners hold just two classes, so each pair comes ready-made as one
# opaque tile (one draw). The rare corner with three or four classes draws its
# lowest pair, then the higher shapes on top — those always sit on land (water
# is always the lowest class), so single shapes only need the rim.
#
# Sheet layout (32×32 frames, 16 per row; mask m indexes as m-1) — keep in sync
# with src/content/tiles.ts:
#   0–44     shapes (rim): sand, ground, path × 15 masks
#   45–134   water pairs: upper sand, ground, path × water frame 0, 1 × 15 masks
#   135–179  land pairs: sand|ground, sand|path, ground|path × 15 masks

BLEND_CLASSES = ('water', 'sand', 'ground', 'path')
BLEND_LAND_PAIRS = ((1, 2), (1, 3), (2, 3))
BLEND_COLS = 16
BLEND_ROWS = 12
FOAM = (236, 246, 255)


def _half_shift(c: Canvas) -> np.ndarray:
    """The tile's texture moved half a tile, so a corner tile matches its cells."""
    return np.roll(np.roll(c.a.copy(), T // 2, axis=0), T // 2, axis=1)


def blend_mask_field(mask: int):
    """Per pixel: inside the shape?, and signed distance to its edge (px, + inside)."""
    tl, tr, bl, br = (mask >> 0) & 1, (mask >> 1) & 1, (mask >> 2) & 1, (mask >> 3) & 1
    c = (np.arange(T) + 0.5) / T
    x, y = np.meshgrid(c, c)  # across, down
    # Smoothstep before blending the corners: plain bilinear contours are
    # nearly straight diagonals (octagonal coasts); this rounds them.
    u, v = x * x * (3 - 2 * x), y * y * (3 - 2 * y)
    du, dv = 6 * x * (1 - x), 6 * y * (1 - y)
    f = tl * (1 - u) * (1 - v) + tr * u * (1 - v) + bl * (1 - u) * v + br * u * v
    fu = ((1 - v) * (tr - tl) + v * (br - bl)) * du
    fv = ((1 - u) * (bl - tl) + u * (br - tr)) * dv
    grad = np.maximum(np.hypot(fu, fv), 1e-6)
    dist = (f - 0.5) / grad * T  # in logical pixels
    return f > 0.5, dist


def blend_shape(tex: np.ndarray, mask: int, foam: bool) -> Canvas:
    """One class's shape: its texture inside, a rim or a foam line at the edge."""
    inside, dist = blend_mask_field(mask)
    c = _c()
    a = c.a
    a[:] = 0
    a[inside] = tex[inside]
    edge = inside & (dist < 1.0)
    if foam:
        # Wet edge inside, a bright foam line just outside (over the water).
        for y, x in zip(*np.nonzero(edge)):
            a[y, x, :3] = dark(tuple(int(v) for v in tex[y, x, :3]), 0.1)
        line = ~inside & (dist > -1.25)
        a[line] = (*FOAM, 230)
        halo = ~inside & (dist <= -1.25) & (dist > -2.25)
        a[halo] = (*FOAM, 90)
    else:
        for y, x in zip(*np.nonzero(edge)):
            a[y, x, :3] = dark(tuple(int(v) for v in tex[y, x, :3]), 0.16)
    return c


def blend_pair(lower: np.ndarray, upper: np.ndarray, mask: int, on_water: bool) -> Canvas:
    """A ready-made opaque corner: the lower class everywhere, the upper's shape on top."""
    top = blend_shape(upper, mask, on_water).a.astype(np.float32)
    alpha = top[:, :, 3:4] / 255.0
    c = _c()
    c.a[:, :, :3] = np.round(top[:, :, :3] * alpha + lower[:, :, :3] * (1 - alpha)).astype(np.uint8)
    c.a[:, :, 3] = 255  # opaque: it fully replaces the square corners beneath
    return c


def blend_sheet(z: dict, i: int) -> Image.Image:
    """The edge-blend sheet for one zone (see the layout above)."""
    tex = {
        1: _half_shift(ow_sand()),
        2: _half_shift(ground(z['ground'], 1 + i * 10)),
        3: _half_shift(path_tile(z['path'])),
    }
    waters = [_half_shift(water(z['water'], f)) for f in (0, 1)]
    frames: list[Canvas] = []
    for cls in (1, 2, 3):
        frames += [blend_shape(tex[cls], m, False) for m in range(1, 16)]
    for cls in (1, 2, 3):
        for w in waters:
            frames += [blend_pair(w, tex[cls], m, True) for m in range(1, 16)]
    for lo, hi in BLEND_LAND_PAIRS:
        frames += [blend_pair(tex[lo], tex[hi], m, False) for m in range(1, 16)]
    sheet = Image.new('RGBA', (BLEND_COLS * T * 2, BLEND_ROWS * T * 2), (0, 0, 0, 0))
    for n, fr in enumerate(frames):
        sheet.paste(upscale(fr.image(), 2), ((n % BLEND_COLS) * T * 2, (n // BLEND_COLS) * T * 2))
    return sheet


def build_blend(public: Path):
    """Write only the edge-blend sheets (#75 / #71b) — every other file untouched."""
    tdir = public / 'tiles'
    for i, (zid, z) in enumerate(ZONES.items()):
        if zid in RETIRED:
            continue
        blend_sheet(z, i).save(tdir / f'{zid}-blend.png', optimize=True)


# ─── Build ───────────────────────────────────────────────────────────────────


def _write_zone(tdir: Path, bdir: Path, i: int, zid: str, z: dict):
    g = z['ground']
    frames = [ground(g, 1 + i * 10), ground(g, 2 + i * 10), ground(g, 3 + i * 10), path_tile(z['path']),
              water(z['water'], 0), water(z['water'], 1), solid(z['solid'], z), deco(z['deco'], z['deco_c']),
              exit_marker()]
    strip([upscale(f.image(), 2) for f in frames]).save(tdir / f'{zid}.png', optimize=True)
    upscale(backdrop(z, 100 + i), 1).save(bdir / f'{zid}.png', optimize=True)


def build_overworld_sheet(public: Path):
    """Write only the overworld sheet (#75 item 8 adds the four region icons)."""
    strip([upscale(f.image(), 2) for f in overworld_sheet()]).save(public / 'tiles' / 'overworld.png', optimize=True)


def build_overworld(public: Path):
    """Write only the Phase 1 overworld art (#75): its zones + the overworld sheet."""
    tdir = public / 'tiles'
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in NEW_ZONES:
        _write_zone(tdir, bdir, ids.index(zid), zid, ZONES[zid])
    strip([upscale(f.image(), 2) for f in overworld_sheet()]).save(tdir / 'overworld.png', optimize=True)


def build_spell_places(public: Path):
    """Write only the field-spell places' art (#75 item 9): tilesets, backdrops, blend sheets."""
    tdir = public / 'tiles'
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in SPELL_ZONES:
        i = ids.index(zid)
        _write_zone(tdir, bdir, i, zid, ZONES[zid])
        blend_sheet(ZONES[zid], i).save(tdir / f'{zid}-blend.png', optimize=True)


def build_dungeon(public: Path):
    """Write only the dungeon additions (#75 item 10): the lower floors' art and the stairs."""
    tdir = public / 'tiles'
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in DUNGEON_ZONES:
        i = ids.index(zid)
        _write_zone(tdir, bdir, i, zid, ZONES[zid])
        blend_sheet(ZONES[zid], i).save(tdir / f'{zid}-blend.png', optimize=True)
    strip([upscale(f.image(), 2) for f in stairs_sheet()]).save(tdir / 'stairs.png', optimize=True)


def build_sea(public: Path):
    """Write only the boat's additions (#75 item 14): the Shallows' art, the boat, the overworld sheet."""
    tdir = public / 'tiles'
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in SEA_ZONES:
        i = ids.index(zid)
        _write_zone(tdir, bdir, i, zid, ZONES[zid])
        blend_sheet(ZONES[zid], i).save(tdir / f'{zid}-blend.png', optimize=True)
    strip([upscale(f.image(), 2) for f in boat_sheet()]).save(tdir / 'boat.png', optimize=True)
    strip([upscale(f.image(), 2) for f in overworld_sheet()]).save(tdir / 'overworld.png', optimize=True)
    build_lighthouse(public)
    build_sea_backdrops(public)


def build_hill(public: Path):
    """Write only Remembrance Hill's art (#75 item 14e): its tileset, blend sheet,
    backdrop, the marble town sheet and the overworld sheet with the hill icon."""
    tdir = public / 'tiles'
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in HILL_ZONES:
        i = ids.index(zid)
        _write_zone(tdir, bdir, i, zid, ZONES[zid])
        blend_sheet(ZONES[zid], i).save(tdir / f'{zid}-blend.png', optimize=True)
    strip([upscale(f.image(), 2) for f in town_tiles('marble')]).save(tdir / 'town-marble.png', optimize=True)
    strip([upscale(f.image(), 2) for f in overworld_sheet()]).save(tdir / 'overworld.png', optimize=True)


def build_elder(public: Path):
    """Write only Eldergrove's art (#75 item 14f): its tileset, blend sheet,
    backdrop, the bark town sheet and the overworld sheet with the elder icon."""
    tdir = public / 'tiles'
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in ELDER_ZONES:
        i = ids.index(zid)
        _write_zone(tdir, bdir, i, zid, ZONES[zid])
        blend_sheet(ZONES[zid], i).save(tdir / f'{zid}-blend.png', optimize=True)
    strip([upscale(f.image(), 2) for f in town_tiles('bark')]).save(tdir / 'town-bark.png', optimize=True)
    strip([upscale(f.image(), 2) for f in overworld_sheet()]).save(tdir / 'overworld.png', optimize=True)


def build_lighthouse(public: Path):
    """Write only Gull Rock's lighthouse tower (#75 item 14 review)."""
    strip([upscale(f, 2) for f in lighthouse_sheet()]).save(public / 'tiles' / 'lighthouse.png', optimize=True)


def build_sea_backdrops(public: Path):
    """Write only the battle-at-sea backdrops (#75 item 14d), one per sea map."""
    bdir = public / 'backgrounds'
    ids = list(ZONES)
    for zid in SEA_ZONES:
        sea_backdrop(ZONES[zid], 300 + ids.index(zid)).save(bdir / sea_backdrop_path(zid), optimize=True)


def build(public: Path) -> list[str]:
    tdir = public / 'tiles'
    tdir.mkdir(parents=True, exist_ok=True)
    bdir = public / 'backgrounds'
    bdir.mkdir(parents=True, exist_ok=True)
    for i, (zid, z) in enumerate(ZONES.items()):
        if zid in RETIRED:
            continue
        _write_zone(tdir, bdir, i, zid, z)
        blend_sheet(z, i).save(tdir / f'{zid}-blend.png', optimize=True)
    strip([upscale(f.image(), 2) for f in props()]).save(tdir / 'props.png', optimize=True)
    strip([upscale(f.image(), 2) for f in overworld_sheet()]).save(tdir / 'overworld.png', optimize=True)
    for i, (theme, (g, pc, pit, pitc, solid_kind, deco_kind)) in enumerate(SPIRE_THEMES.items()):
        frames = [spire_ground(g, 40 + i * 5, theme), spire_ground(g, 41 + i * 5, theme), spire_ground(g, 42 + i * 5, theme),
                  spire_path(pc, theme), spire_pit(pit, pitc, 0), spire_pit(pit, pitc, 1),
                  spire_solid(solid_kind), spire_deco(deco_kind), exit_marker()]
        strip([upscale(f.image(), 2) for f in frames]).save(tdir / f'spire-{theme}.png', optimize=True)
    strip([upscale(f.image(), 2) for f in spire_props()]).save(tdir / 'spire-props.png', optimize=True)
    strip([upscale(f.image(), 2) for f in stairs_sheet()]).save(tdir / 'stairs.png', optimize=True)
    strip([upscale(f.image(), 2) for f in boat_sheet()]).save(tdir / 'boat.png', optimize=True)
    build_lighthouse(public)
    build_sea_backdrops(public)
    for style in STYLES:
        strip([upscale(f.image(), 2) for f in town_tiles(style)]).save(tdir / f'town-{style}.png', optimize=True)
    strip([upscale(f.image(), 2) for f in roof_tiles()]).save(tdir / 'roofs.png', optimize=True)
    upscale(spire(), 2).save(tdir / 'spire.png', optimize=True)
    return list(ZONES)


def preview(path: Path):
    rows = []
    for zid, z in ZONES.items():
        g = z['ground']
        frames = [ground(g, 1), path_tile(z['path']), water(z['water'], 0), solid(z['solid'], z), deco(z['deco'], z['deco_c'])]
        row = Image.new('RGBA', (len(frames) * 34 + 260, 146), (30, 30, 40, 255))
        for i, f in enumerate(frames):
            bgc = Canvas(T, T)
            _speckle(bgc, g, 5)
            bgc.paste(f)
            row.paste(upscale(bgc.image(), 2), (i * 34, 2))
        row.paste(backdrop(z, 1), (len(frames) * 34 + 2, 1))
        rows.append(row)
    img = Image.new('RGBA', (rows[0].width, 146 * len(rows)))
    for i, r in enumerate(rows):
        img.paste(r, (0, i * 146))
    pr = [upscale(f.image(), 2) for f in props()] + [upscale(spire(), 2)]
    x = 0
    for f in pr:
        img.alpha_composite(f, (x, 146 * len(rows) - 70))
        x += 36
    img.save(path)
