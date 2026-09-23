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
}


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


# ─── Towns: building interiors, facades, signs and roofs (#72) ───────────────
# Keep in sync with TOWN_FRAME / ROOF_* in src/content/tiles.ts.

WALL = '#e8d8b0'
WOOD = '#b07840'
FLOOR = (196, 150, 98)


def _floor():
    c = _c()
    c.a[:, :, :3] = FLOOR
    c.a[:, :, 3] = 255
    for y in range(0, T, 4):
        c.a[y, :, :3] = dark(FLOOR, 0.08)  # plank seams
        off = 5 if (y // 4) % 2 else 11
        c.a[y:y + 4, off, :3] = dark(FLOOR, 0.1)
    c.a[1::4, :, :3] = light(FLOOR, 0.04)
    return c


def town_tiles():
    frames = []
    # 0 wall top (seen from above: thick timber beam)
    c = _c()
    c.a[:, :, :3] = hexc('#7a4a2a')
    c.a[:, :, 3] = 255
    c.rect(0, 0, 16, 3, '#9a6a3a', shade=False)
    c.rect(0, 13, 16, 16, '#5a3420', shade=False)
    frames.append(c)
    # 1 facade (plaster + timber frame) · 2 facade with a window
    for window in (False, True):
        c = _c()
        c.a[:, :, :3] = hexc(WALL)
        c.a[:, :, 3] = 255
        c.rect(0, 0, 16, 2, '#7a4a2a', shade=False)
        c.rect(0, 14, 16, 16, '#8a7a6a', shade=False)
        c.rect(0, 0, 1.5, 16, '#7a4a2a', shade=False)
        if window:
            c.rect(4, 4, 12, 11, '#5a3420', shade=False)
            c.rect(5, 5, 11, 10, '#8ad0ff', shade=False)
            c.rect(7.5, 5, 8.5, 10, '#5a3420', shade=False)
            c.dot(5, 5, '#ffffff', w=2, h=1)
            c.rect(3.5, 11, 12.5, 12, '#9a6a3a', shade=False)
        frames.append(c)
    # 3 door (open doorway into a warm room)
    c = _c()
    c.a[:, :, :3] = hexc(WALL)
    c.a[:, :, 3] = 255
    c.rect(0, 0, 16, 2, '#7a4a2a', shade=False)
    c.rect(3, 3, 13, 16, '#5a3420', shade=False)
    c.rect(4, 4, 12, 16, FLOOR, shade=False)
    c.rect(4, 4, 12, 6, dark(FLOOR, 0.15), shade=False)
    c.rect(2, 14.5, 14, 16, '#c8a070', shade=False)  # doormat
    frames.append(c)
    # 4 floor
    frames.append(_floor())
    # 5 counter
    c = _floor()
    c.rect(0, 4, 16, 13, WOOD)
    c.rect(0, 4, 16, 6, '#d8a060', shade=False)
    c.dot(4, 7, '#ffe066', w=2, h=2)  # a coin on the counter
    frames.append(c)
    # 6 bookshelf
    c = _floor()
    c.rect(1, 0, 15, 15, '#6a3a20')
    for y0 in (2, 7):
        c.rect(2, y0, 14, y0 + 4, '#3a2014', shade=False)
        for i, col in enumerate(('#d04040', '#4070d0', '#40a060', '#e0b040', '#9050c0')):
            c.rect(2.5 + i * 2.3, y0 + 0.5 + (i % 2), 4.3 + i * 2.3, y0 + 4, col, shade=False)
    frames.append(c)
    # 7 table
    c = _floor()
    c.ellipse(8, 8, 6.5, 5, '#a86a3a')
    c.ellipse(8, 7, 5.5, 3.8, '#c8884a')
    c.ellipse(6, 6.5, 1.5, 1.2, '#ffffff', shade=False)
    frames.append(c)
    # 8 bed
    c = _floor()
    c.rect(2, 1, 14, 15.5, '#7a4a2a')
    c.rect(3, 2, 13, 6, '#ffffff')
    c.rect(3, 6, 13, 15, '#d05a5a')
    c.rect(3, 6, 13, 7, '#f0c0a0', shade=False)
    frames.append(c)
    # 9-12 hanging signs (transparent overlays on the facade)
    for icon in ('shop', 'inn', 'library', 'house'):
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
        else:
            c.poly([(4.5, 7), (8, 4), (11.5, 7)], '#d04040')
            c.rect(5.5, 7, 10.5, 10, '#fff4d0', shade=False)
        frames.append(_outlined(c))
    return frames


ROOFS = {'red': '#c0503a', 'blue': '#3a6ab0', 'green': '#4a8a4a', 'purple': '#7a4ab0'}


def roof_tiles():
    """Nine-slice roof per colour: TL T TR / L M R / BL B BR (9 frames each)."""
    frames = []
    for col in ROOFS.values():
        base = hexc(col)
        for sy in range(3):
            for sx in range(3):
                c = _c()
                c.a[:, :, :3] = base
                c.a[:, :, 3] = 255
                # overlapping shingle rows
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


# ─── Battle backdrops ────────────────────────────────────────────────────────

BW, BH = 256, 144


def backdrop(z: dict, seed: int) -> Image.Image:
    rnd = random.Random(seed)
    a = np.zeros((BH, BW, 3), dtype=np.uint8)
    top, bot = hexc(z['sky'][0]), hexc(z['sky'][1])
    horizon = 92
    bands = 10
    for y in range(horizon):
        t = y / horizon
        # banded gradient with a 2×2 ordered dither between bands (SNES look)
        tb = t * bands
        lo = math.floor(tb) / bands
        hi = min(1.0, (math.floor(tb) + 1) / bands)
        frac = tb - math.floor(tb)
        for x in range(BW):
            thresh = ((x % 2) * 2 + (y % 2)) / 4 + 0.125
            tt = hi if frac > thresh else lo
            a[y, x] = mix(top, bot, tt)
    img = a
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


# ─── Build ───────────────────────────────────────────────────────────────────


def build(public: Path) -> list[str]:
    tdir = public / 'tiles'
    tdir.mkdir(parents=True, exist_ok=True)
    bdir = public / 'backgrounds'
    bdir.mkdir(parents=True, exist_ok=True)
    for i, (zid, z) in enumerate(ZONES.items()):
        g = z['ground']
        frames = [ground(g, 1 + i * 10), ground(g, 2 + i * 10), ground(g, 3 + i * 10), path_tile(z['path']),
                  water(z['water'], 0), water(z['water'], 1), solid(z['solid'], z), deco(z['deco'], z['deco_c']),
                  exit_marker()]
        strip([upscale(f.image(), 2) for f in frames]).save(tdir / f'{zid}.png', optimize=True)
        upscale(backdrop(z, 100 + i), 1).save(bdir / f'{zid}.png', optimize=True)
    strip([upscale(f.image(), 2) for f in props()]).save(tdir / 'props.png', optimize=True)
    strip([upscale(f.image(), 2) for f in town_tiles()]).save(tdir / 'town.png', optimize=True)
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
