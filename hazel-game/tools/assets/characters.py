"""
Character art: parametric drawers for every archetype in the game, plus the
roster that maps each manifest id (heroes, Ember, enemies, NPCs) to a drawer
and its parameters.

All characters face RIGHT in a 3/4 SNES-JRPG view. The world renderer flips the
hero with `flipX` when walking left, and the battle screen mirrors the hero with
CSS so it faces the enemy — so one facing direction serves both screens.

Coordinates are in a 32-unit design grid: feet on y≈30, centred on x≈16.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

from pix import Canvas, hexc, dark, light, mix

# ─── Poses ───────────────────────────────────────────────────────────────────


@dataclass
class Pose:
    bob: float = 0  # output px, + = down
    lean: float = 0  # output px, + = forward (right)
    step: int = 0  # -1 / 0 / 1 leg phase
    arm: str = 'rest'  # rest | swingf | swingb | raise | strike | follow
    wing: int = 0  # 0 up · 1 mid · 2 down
    squash: float = 0  # blobs: + squashed, - stretched
    hurt: bool = False
    blink: bool = False
    flash: str | None = None  # 'white' | 'red'
    frame: int = 0  # raw frame index (for cyclic effects)
    facing: str = 'side'  # side (facing right) · down (toward camera) · up (away)
    # Expressive extras (only Ember's battle sheet sets these so far):
    mouth: str = 'closed'  # closed · open (bite / roar) · puff (inhaling) · breath (open + big flame)
    rear: float = 0  # head lifted back by this many design px (wind-up / inhale)
    happy: bool = False  # ^ ^ eyes


_WORLD_SIDE = [
    Pose(frame=0),
    Pose(bob=1, blink=True, wing=2, squash=1, frame=1),
    Pose(step=1, arm='swingb', wing=0, squash=-1, frame=2),
    Pose(step=0, bob=-1, wing=1, squash=1, frame=3),
    Pose(step=-1, arm='swingf', wing=2, squash=-1, frame=4),
    Pose(step=0, bob=-1, wing=1, squash=1, frame=5),
]
# 18 frames: side 0-5, down 6-11, up 12-17 (each: idle ×2, walk ×4).
# Keep in sync with FACING_ANIMS in src/lib/facing.ts.
WORLD_POSES = [replace(p, facing=f) for f in ('side', 'down', 'up') for p in _WORLD_SIDE]
WORLD_ANIMS = {
    'idle': {'from': 0, 'to': 1, 'fps': 3},
    'walk': {'from': 2, 'to': 5, 'fps': 8},
    'idleDown': {'from': 6, 'to': 7, 'fps': 3},
    'walkDown': {'from': 8, 'to': 11, 'fps': 8},
    'idleUp': {'from': 12, 'to': 13, 'fps': 3},
    'walkUp': {'from': 14, 'to': 17, 'fps': 8},
}

BATTLE_POSES = [
    Pose(frame=0),
    Pose(bob=1, wing=2, squash=1, frame=1),
    Pose(lean=-2, arm='raise', wing=0, squash=1, frame=2),
    Pose(lean=5, arm='strike', wing=2, squash=-1, frame=3),
    Pose(lean=2, arm='follow', wing=1, frame=4),
    Pose(lean=-4, hurt=True, flash='white', wing=0, squash=1, frame=5),
    Pose(lean=-2, hurt=True, flash='red', wing=1, frame=6),
]
BATTLE_ANIMS = {
    'idle': {'from': 0, 'to': 1, 'fps': 3},
    'attack': {'from': 2, 'to': 4, 'fps': 9, 'loop': False},
    'hurt': {'from': 5, 'to': 6, 'fps': 7, 'loop': False},
}

# Ember's battle sheet: the shared idle/hurt frames, a punchier attack
# (rear back → lunge with an open-mouthed bite → follow through), plus two
# Ember-only clips — `breath` (inhale → fire blast ×2, for Ember's Breath and
# the Pair Attacks) and `cheer` (a happy wing-flap hop on victory).
EMBER_BATTLE_POSES = [
    BATTLE_POSES[0],
    BATTLE_POSES[1],
    Pose(lean=-3, rear=2, wing=0, squash=1, frame=2),
    Pose(lean=5, mouth='open', wing=2, squash=-1, frame=3),
    Pose(lean=2, wing=1, frame=4),
    BATTLE_POSES[5],
    BATTLE_POSES[6],
    Pose(lean=-3, rear=2, mouth='puff', wing=0, frame=7),
    Pose(lean=-2, mouth='breath', wing=1, frame=8),
    Pose(lean=-2, bob=-1, mouth='breath', wing=2, frame=9),
    Pose(bob=-4, happy=True, mouth='open', wing=0, frame=10),
    Pose(bob=1, happy=True, wing=2, squash=1, frame=11),
]
EMBER_BATTLE_ANIMS = {
    **BATTLE_ANIMS,
    'breath': {'from': 7, 'to': 9, 'fps': 8, 'loop': False},
    'cheer': {'from': 10, 'to': 11, 'fps': 5},
}

EYE = (30, 22, 40)
WHITE = (250, 248, 240)
BLUSH = (240, 130, 140)


class D:
    """Drawing context: per-part layers, outlined at battle resolution."""

    def __init__(self, c: Canvas, p: Pose):
        self.c = c
        self.p = p
        self.u = 1 / c.k  # design units per output pixel
        self.sep = c.k >= 1
        self.bob = p.bob * self.u
        self.lean = p.lean * self.u

    def part(self, dx=0.0, dy=0.0) -> Canvas:
        L = self.c.layer()
        L.dx, L.dy = dx, dy
        return L

    def put(self, L: Canvas, outline=True):
        self.c.paste(L, outline=self.sep and outline)

    def eyes(self, L: Canvas, pts, color=EYE, h=2, shine=True):
        p = self.p
        for (x, y) in pts:
            if p.hurt:
                L.dot(x - 0.5, y, color)
                L.dot(x + 0.5, y + 1, color)
                L.dot(x - 0.5, y + 2 if self.sep else y + 1, color)
            elif p.blink:
                L.dot(x - 0.5, y + 1, color, w=2 if self.sep else 1, h=1)
            else:
                L.dot(x, y, color, w=1, h=h)
                if shine and self.sep and h >= 2:
                    L.dot(x, y, WHITE, w=1, h=1)
                    L.dot(x, y + 1, color, w=1, h=h - 1)


def face_x(p: Pose, side_x: list[float], front_x: list[float]):
    """Eye x-positions for the pose's facing; [] (no face) when facing away."""
    return {'side': side_x, 'down': front_x, 'up': []}[p.facing]


def finish(c: Canvas, d: D, shadow=None):
    """Silhouette outline at world res, hurt flash, ground shadow."""
    if not d.sep:
        tmp = c.layer()
        tmp.a = c.a.copy()
        c.a[:] = 0
        c.paste(tmp, outline=True)
    if d.p.flash == 'white':
        c.tint((255, 255, 255), 0.55)
    elif d.p.flash == 'red':
        c.tint((255, 60, 60), 0.35)
    if shadow:
        c.shadow(*shadow)


# ─── Held items ──────────────────────────────────────────────────────────────

ARM_HAND = {
    'rest': (20.5, 23.0),
    'swingf': (22.0, 22.5),
    'swingb': (19.0, 23.5),
    'raise': (13.0, 12.5),
    'strike': (27.0, 19.0),
    'follow': (24.5, 22.5),
}
ITEM_ANGLE = {'rest': -75, 'swingf': -65, 'swingb': -85, 'raise': -150, 'strike': -8, 'follow': 30}


def draw_item(L: Canvas, item: str, hx: float, hy: float, arm: str, col=None):
    a = math.radians(ITEM_ANGLE[arm])
    ca, sa = math.cos(a), math.sin(a)
    if item == 'sword':
        blade = col or '#dfe6f2'
        L.line(hx, hy, hx + ca * 11, hy + sa * 11, blade, w=2.2)
        L.line(hx + ca * 2, hy + sa * 2, hx + ca * 10, hy + sa * 10, WHITE, w=0.8)
        L.line(hx - sa * 2.5, hy + ca * 2.5, hx + sa * 2.5, hy - ca * 2.5, '#e0b040', w=1.6)
        L.dot(hx - ca * 1.5, hy - sa * 1.5, '#8a4b2a')
    elif item == 'spear':
        L.line(hx - ca * 5, hy - sa * 5, hx + ca * 12, hy + sa * 12, '#9a6a3a', w=1.3)
        tx, ty = hx + ca * 12, hy + sa * 12
        L.poly([(tx + ca * 4, ty + sa * 4), (tx - sa * 2, ty + ca * 2), (tx + sa * 2, ty - ca * 2)], '#e8eef8')
    elif item in ('staff', 'wand', 'orbstaff'):
        length = 7 if item == 'wand' else 13
        # staffs stay upright except while striking
        aa = a if arm in ('strike', 'follow', 'raise') else math.radians(-95)
        cb, sb = math.cos(aa), math.sin(aa)
        L.line(hx - cb * 4, hy - sb * 4, hx + cb * length, hy + sb * length, '#8a5a30', w=1.4)
        tip = col or '#9ae0ff'
        L.ellipse(hx + cb * (length + 1.5), hy + sb * (length + 1.5), 2.4, 2.4, tip)
        L.dot(hx + cb * (length + 1.5) - 1, hy + sb * (length + 1.5) - 1, WHITE)
    elif item == 'shield':
        sx = hx + (2.5 if arm != 'raise' else 1)
        L.ellipse(sx, hy - 1.5, 4.2, 5.2, col or '#c8d2e0')
        L.ellipse(sx, hy - 1.5, 2.6, 3.4, '#e0b040')
        L.dot(sx - 0.5, hy - 2.5, WHITE)
    elif item == 'wrench':
        L.line(hx, hy, hx + ca * 8, hy + sa * 8, '#aab4c0', w=1.6)
        L.ellipse(hx + ca * 9, hy + sa * 9, 2.2, 2.2, '#aab4c0')
        L.dot(hx + ca * 9.8, hy + sa * 9.8, (40, 30, 50))
    elif item == 'hammer':
        L.line(hx, hy + 2, hx + ca * 9, hy + sa * 9, '#8a5a30', w=1.3)
        L.rect(hx + ca * 9 - 3, hy + sa * 9 - 2, hx + ca * 9 + 3, hy + sa * 9 + 2, '#8c96a4')
    elif item == 'brush':
        L.line(hx, hy, hx + ca * 8, hy + sa * 8, '#c89a5a', w=1.3)
        L.ellipse(hx + ca * 9.5, hy + sa * 9.5, 1.8, 1.8, col or '#ff4f8b')
    elif item == 'rod':
        L.line(hx, hy, hx + 9, hy - 12, '#8a5a30', w=1.1)
        L.line(hx + 9, hy - 12, hx + 11, hy + 2, '#dfe6f2', w=0.5)
        L.dot(hx + 11, hy + 2, '#ff5050')
    elif item == 'telescope':
        L.line(hx - 1, hy + 1, hx + 7, hy - 6, '#c8a040', w=2.4)
        L.line(hx + 5, hy - 4, hx + 9, hy - 8, '#e0c060', w=3.0)
    elif item == 'book':
        L.rect(hx - 1, hy - 3, hx + 4, hy + 2, col or '#7a3fb0')
        L.rect(hx + 3, hy - 3, hx + 4, hy + 2, '#f4ecd8', shade=False)
    elif item == 'orb':
        L.ellipse(hx + 1.5, hy - 2.5, 3.2, 3.2, col or '#b07cff')
        L.dot(hx + 0.5, hy - 4, WHITE)
    elif item == 'lantern':
        L.line(hx, hy, hx, hy + 2, '#5a4a3a', w=0.8)
        L.rect(hx - 2, hy + 2, hx + 2, hy + 7, '#ffd24a')
        L.dot(hx - 0.5, hy + 3.5, WHITE)
    elif item == 'ladle':
        L.line(hx, hy, hx + ca * 7, hy + sa * 7, '#c0c8d4', w=1.0)
        L.ellipse(hx + ca * 8.5, hy + sa * 8.5, 2.0, 1.6, '#c0c8d4')
    elif item == 'broom':
        L.line(hx - ca * 4, hy - sa * 4, hx + ca * 9, hy + sa * 9, '#8a5a30', w=1.2)
        L.ellipse(hx - ca * 6, hy - sa * 6, 2.6, 2.0, '#d8b050')
    elif item == 'can':
        # The Gardener's watering can (#75 item 16c): a round green can with a long spout and a sprinkle.
        cx, cy = hx + 2.6, hy + 1.6
        L.ellipse(cx, cy, 3.4, 2.8, col or '#4a9a5a')
        L.line(cx + 2.4, cy - 0.4, cx + 6.4, cy - 3.6, col or '#4a9a5a', w=1.0)
        L.ellipse(cx + 6.8, cy - 3.9, 1.0, 0.8, '#c8d8e0')
        L.line(cx - 2, cy - 2.6, cx + 1.6, cy - 3.6, dark(hexc(col or '#4a9a5a'), 0.3), w=0.7)
        for (dx, dy) in ((8.2, -2.2), (8.8, 0), (7.6, 1.2)):
            L.dot(cx + dx, cy + dy, '#8ad0ff')
    elif item == 'violin':
        # Maestro Brio's (#75 item 15g): a little fiddle tucked under the arm, and its bow.
        L.ellipse(hx + 2, hy - 1, 2.6, 3.4, col or '#b0602a')
        L.ellipse(hx + 2, hy - 1, 1.0, 1.2, '#3a2010', shade=False)
        L.line(hx + 2, hy - 4, hx + 2, hy - 8, '#3a2010', w=0.9)
        L.line(hx - 2, hy + 3, hx + 7, hy - 5, '#e8d8b0', w=0.5)
    elif item == 'abacus':
        L.rect(hx - 1, hy - 4, hx + 6, hy + 2, '#8a5a30')
        for i in range(3):
            L.dot(hx + 0.5 + i * 1.6, hy - 2.5, '#ff6b6b')
            L.dot(hx + 1.2 + i * 1.6, hy - 0.5, '#4fc3f7')


# ─── Humanoid (people + anthropomorphic animals) ─────────────────────────────


def humanoid(c: Canvas, p: Pose, s: dict):
    if p.facing != 'side':
        return humanoid_fb(c, p, s)
    d = D(c, p)
    skin = hexc(s.get('skin', '#f5c9a0'))
    outfit = hexc(s.get('outfit', '#4a7bd0'))
    trim = hexc(s.get('trim', '#f0d060'))
    pants = hexc(s.get('pants', mix(outfit, (40, 30, 50), 0.45)))
    boots = hexc(s.get('boots', '#5a3a2a'))
    hair = s.get('hair')
    hair_c = hexc(s.get('hair_color', '#6b3f22'))
    robe = s.get('robe', False)
    item = s.get('item')
    lean, bob = d.lean, d.bob
    up = lean * 0.3  # legs lean less than the torso

    # --- back layer: tail / wings / shell / cape / pack
    back = d.part(lean, bob)
    tail = s.get('tail')
    if tail == 'lion':
        back.line(11, 25, 6, 22, skin, w=1.4)
        back.ellipse(5.5, 21.5, 2.0, 2.0, hair_c)
    elif tail == 'fox':
        back.ellipse(8, 23, 4.5, 3.0, skin, rot=-0.5)
        back.ellipse(5, 21.3, 2.0, 1.6, WHITE)
    elif tail == 'long':
        back.line(11, 26, 5, 24, skin, w=1.0)
        back.line(5, 24, 4, 20, skin, w=1.0)
    elif tail == 'ringed':
        back.ellipse(8, 22.5, 4.0, 2.4, skin, rot=-0.6)
        back.dot(7, 21.5, dark(skin, 0.3), w=2, h=2)
        back.dot(5, 20, dark(skin, 0.3), w=1, h=2)
    elif tail == 'flat':
        back.ellipse(9, 26, 4.0, 1.8, skin, rot=-0.3)
    wings = s.get('wings')
    if wings:
        wc = hexc(s.get('wing_color', '#d8f4ff'))
        flap = {0: -3, 1: 0, 2: 3}[p.wing]
        if wings == 'feather':
            back.ellipse(9, 16 + flap * 0.5, 4.5, 6.5, wc, rot=0.4)
            back.ellipse(7, 20 + flap * 0.3, 3.0, 4.5, dark(wc, 0.08), rot=0.6)
        else:
            ws = s.get('wing_scale', 1.0)
            back.ellipse(9 - 2 * (ws - 1), 13 + flap * 0.4, 4.2 * ws, 5.2 * ws, wc, rot=0.5)
            back.ellipse(10 - 2 * (ws - 1), 21, 3.0 * ws, 3.2 * ws, wc, rot=-0.3)
    if s.get('shell'):
        sc = hexc(s['shell'])
        back.ellipse(10.5, 20, 6.0, 6.8, sc)
        for (x, y) in ((9, 17), (12, 19), (9, 22), (11.5, 23.5)):
            back.dot(x, y, light(sc, 0.2), w=2, h=2)
    if s.get('cape'):
        back.poly([(12, 16), (18, 16), (13, 29), (6, 28)], s['cape'])
    if s.get('pack'):
        back.rect(6.5, 15.5, 12.5, 25, s['pack'])
        back.rect(6.5, 18, 12.5, 19, dark(hexc(s['pack']), 0.2), shade=False)
    d.put(back)

    # --- back arm
    arm_back = d.part(lean, bob)
    swing_b = {'swingf': -1.5, 'swingb': 1.5}.get(p.arm, 0)
    arm_back.line(13, 18, 11.5 + swing_b, 23, dark(outfit, 0.12), w=2.6)
    arm_back.ellipse(11.5 + swing_b, 23.5, 1.5, 1.5, dark(skin, 0.1))
    d.put(arm_back)

    # --- legs
    legs = d.part(up, 0)
    if s.get('mermaid'):
        # Verse (#75 item 15e): a mermaid's fish tail where the legs would be, a fin at its tip.
        mt = hexc(s['mermaid'])
        legs.poly([(11.5, 24), (20.5, 24), (19, 28), (16.5, 30)], mt)
        legs.poly([(16.5, 29), (12, 31.4), (14.5, 28.4)], light(mt, 0.15))
        legs.poly([(16.5, 29), (21, 31.4), (18.6, 28.4)], light(mt, 0.15))
        for y in (25.6, 27.2):
            legs.line(13.4, y, 18.6, y, dark(mt, 0.25), w=0.4)
    elif not robe:
        for i, lx in enumerate((13.2, 18.2)):
            off = p.step * (1.8 if i == 1 else -1.8)
            lift = 1 if (p.step != 0 and ((i == 1) == (p.step > 0))) else 0
            col = pants if i == 1 else dark(pants, 0.08)
            legs.rect(lx - 1.8 + off, 24.5, lx + 1.8 + off, 29 - lift, col)
            legs.rect(lx - 2.0 + off, 28 - lift, lx + 2.4 + off, 30.5 - lift, boots)
    else:
        legs.rect(12 + p.step, 28, 15 + p.step, 30.5, boots)
        legs.rect(17 - p.step, 28, 20.5 - p.step, 30.5, boots)
    d.put(legs)

    # --- torso
    body = d.part(lean, bob)
    if robe:
        body.poly([(11.5, 16.5), (21, 16.5), (23.5, 29.5), (9, 29.5)], outfit)
        body.rect(11, 22, 22, 23, trim, shade=False)
        body.rect(15.8, 17, 16.8, 29.5, trim, shade=False)
    else:
        body.ellipse(16, 21.5, 5.8, 4.8, outfit)
        body.rect(10.8, 23.2, 21.2, 24.2, trim, shade=False)  # belt
        body.dot(18.5, 23.2, light(trim, 0.2))
    if s.get('apron'):
        body.rect(15, 19, 21.5, 27, s['apron'])
    if s.get('scarf'):
        body.ellipse(16.5, 17.5, 5.0, 1.6, s['scarf'])
    d.put(body)

    # --- head
    head = d.part(lean, bob)
    hcx, hcy = 16.5, 12.5
    ears = s.get('ears')
    if ears == 'round':
        head.ellipse(11, 6, 2.6, 2.6, skin)
        head.ellipse(18.5, 5.2, 2.6, 2.6, skin)
        head.dot(18.5, 5, BLUSH if d.sep else skin)
    elif ears == 'pointed':
        head.poly([(9.5, 8), (11, 1.5), (14.5, 6)], skin)
        head.poly([(16.5, 6), (19.5, 1), (21.5, 7)], skin)
    elif ears == 'long':
        head.ellipse(12.5, 2.5, 1.8, 5.0, skin, rot=-0.25)
        head.ellipse(16.5, 2.0, 1.8, 5.0, skin, rot=0.15)
    elif ears == 'elf':
        head.poly([(8.5, 12), (4.5, 8.5), (9.5, 10)], skin)
    elif ears == 'tufts':
        head.poly([(10, 7), (10.5, 2), (13.5, 6)], skin)
        head.poly([(19, 6), (22, 2.5), (22, 7.5)], skin)
    if hair == 'long':
        head.ellipse(11, 15, 5, 7.5, hair_c)
    if hair == 'mane':
        for ang in range(0, 360, 36):
            r = math.radians(ang)
            head.ellipse(hcx - 1.5 + math.cos(r) * 7.5, hcy + math.sin(r) * 7.0, 3.6, 3.6, hair_c)
    head.ellipse(hcx, hcy, 8.5, 7.5, skin)
    # hair
    if hair in ('short', 'long', 'bob', 'spiky', 'bun', 'crest', 'ponytail'):
        head.ellipse(15.3, 8.6, 8.8, 5.0, hair_c)
        head.ellipse(10.2, 12.0, 3.6, 5.5, hair_c)
        head.ellipse(21.5, 7.2, 3.2, 2.2, hair_c)
    if hair == 'bob':
        head.ellipse(10, 15, 3.5, 4.5, hair_c)
    if hair == 'spiky':
        head.poly([(8, 9), (6, 3), (12, 5), (13, 0.5), (17, 4.5), (21, 1.5), (22, 6), (26, 5), (23.5, 9)], hair_c)
    if hair == 'bun':
        head.ellipse(10, 4.5, 3.0, 3.0, hair_c)
    if hair == 'ponytail':
        head.ellipse(6.5, 12, 2.5, 4.5, hair_c, rot=0.4)
    if hair == 'crest':
        head.poly([(9, 7), (5, 2), (11, 4.5), (12, 0.5), (15, 5)], hair_c)
    if hair == 'fringe':  # elders: bald top, white fringe
        head.ellipse(10, 13, 3.0, 4.0, hair_c)
    if s.get('mask'):
        head.rect(17.5, 10.5, 25, 14.2, s['mask'])
    # face
    snout = s.get('snout')
    if snout == 'muzzle':
        mc = hexc(s.get('muzzle', '#f4e2c8'))
        head.ellipse(23.2, 15.3, 3.4, 2.6, mc)
        head.dot(25.8, 13.8, (50, 30, 40), w=2, h=1)
    elif snout == 'beak':
        head.poly([(22.5, 12.5), (28.5, 14.8), (22.5, 17)], s.get('beak', '#ffc23a'))
    elif snout == 'pointy':
        mc = hexc(s.get('muzzle', '#f4e2c8'))
        head.poly([(20.5, 12.5), (28.5, 15.5), (20.5, 18)], mc)
        head.dot(27.5, 14.8, (40, 25, 35), w=2, h=1)
    elif snout == 'wide':
        head.rect(20, 16.5, 25, 17.5, dark(skin, 0.25), shade=False)
    elif snout == 'nose':
        head.dot(24.5, 14, dark(skin, 0.1))
    if s.get('beard'):
        head.ellipse(21.5, 17.5, 4.0, 3.6, s['beard'])
    ecol = hexc(s.get('eye', '#1e1628'))
    eye_y = 11.3 if not s.get('mask') else 11.5
    d.eyes(head, [(19.5, eye_y), (23.0, eye_y)], color=ecol)
    if d.sep and not snout and not s.get('beard'):
        head.dot(23, 15.8, dark(skin, 0.35))  # mouth
    if d.sep and s.get('blush', True) and not s.get('beard') and snout not in ('beak',):
        head.dot(24.5, 14.6 if not snout else 12.5, BLUSH)
    if s.get('glasses'):
        head.dot(18.5, 10.8, '#e0e8f0', w=2, h=2)
        head.dot(22.5, 10.8, '#e0e8f0', w=2, h=2)
        d.eyes(head, [(19, 11.3), (23, 11.3)], color=ecol, h=1, shine=False)
    # hats
    hat = s.get('hat')
    hc = s.get('hat_color', '#5a3fa0')
    if hat == 'wizard':
        head.poly([(7.5, 7.5), (25.5, 7.5), (13, -2.5)], hc)
        head.ellipse(16.5, 7.4, 11.5, 2.0, hc)
        head.dot(15, 3, '#ffe066', w=2, h=2)
    elif hat == 'witch':
        head.poly([(7.5, 7.5), (24.5, 7.5), (10.5, -2.5)], hc)
        head.ellipse(16.5, 7.6, 12, 1.9, hc)
        head.rect(9.5, 5, 23, 6.5, '#9aff7a', shade=False)
    elif hat == 'cap':
        head.ellipse(15.5, 6.5, 8.5, 3.8, hc)
        head.ellipse(23.5, 7.8, 4.0, 1.3, hc)
    elif hat == 'hood':
        head.ellipse(14.5, 9.5, 9.8, 7.5, hc)
        head.ellipse(19.5, 13, 5.8, 5.0, skin)
        d.eyes(head, [(19.5, 11.8), (23.0, 11.8)], color=ecol)
    elif hat == 'hardhat':
        head.ellipse(16, 6.5, 8.5, 4.0, hc)
        head.rect(7, 7.5, 26, 9, hc)
    elif hat == 'beret':
        head.ellipse(14.5, 5.5, 8.0, 3.0, hc)
        head.dot(14, 2.5, dark(hexc(hc), 0.2))
    elif hat == 'chef':
        head.ellipse(15, 3.5, 6.5, 4.0, '#ffffff')
        head.rect(9.5, 5, 21, 8, '#ffffff')
    elif hat == 'helmet':
        head.ellipse(15.5, 8.0, 9.0, 5.5, hc)
        head.rect(20, 5, 25.5, 9.8, hc)
    elif hat == 'straw':
        head.ellipse(16, 6.5, 12.5, 2.2, '#e8c86a')
        head.ellipse(15.5, 4.5, 6.5, 3.2, '#e8c86a')
        head.rect(9, 5.5, 22, 6.5, '#d04040', shade=False)
    elif hat == 'band':
        head.rect(8, 7.5, 25, 9.5, hc, shade=False)
        head.poly([(8, 8), (4, 6), (4.5, 11)], hc)
    elif hat == 'crown':
        head.poly([(10, 6), (10, 1.5), (13, 4), (16, 0.5), (19, 4), (22, 1.5), (22, 6)], '#ffd24a')
    elif hat == 'flower':
        fr = s.get('flower_r', 2.2)
        head.ellipse(12, 5, fr, fr, s.get('flower', '#ff8fb8'))
        head.dot(11.5, 4.5, '#ffe066', w=2 if fr > 2.5 else 1, h=2 if fr > 2.5 else 1)
    d.put(head)

    # --- front arm + item
    front = d.part(lean, bob)
    hx, hy = ARM_HAND[p.arm]
    if item and p.arm in ('rest', 'swingf', 'swingb') and item not in ('rod', 'telescope', 'lantern'):
        hx, hy = hx + 0.5, hy - 1
    front.line(18.5, 18, hx, hy, outfit, w=2.6)
    d.put(front)
    if item:
        it = d.part(lean, bob)
        draw_item(it, item, hx, hy, p.arm, s.get('item_color'))
        d.put(it)
    hand = d.part(lean, bob)
    hand.ellipse(hx, hy, 1.6, 1.6, skin)
    d.put(hand)
    _shell_bits(d, s, lean, bob)
    finish(c, d)


def _shell_bits(d, s, lean, bob):
    """Little extras on a person: Barnacle Bess's pink scallop clip and two grey
    barnacles (`shells`, #75 item 15e review); Reso's music note (`tune`, 15f)."""
    if s.get('tune'):
        # Choir-Mistress Reso (15f round 3): a gold music note by her head.
        n = d.part(lean, bob)
        n.ellipse(24.6, 7.4, 1.6, 1.3, '#ffc828', shade=False)
        n.line(25.9, 7.4, 25.9, 2.4, '#ffc828', w=0.8)
        n.line(25.9, 2.4, 28, 3.6, '#ffc828', w=0.8)
        d.put(n)
    if not s.get('shells'):
        return
    sh = d.part(lean, bob)
    sh.ellipse(19.5, 5.4, 1.8, 1.5, '#ff9ab8')
    sh.line(19.5, 4.2, 19.5, 6.6, '#d0607a', w=0.4)
    for (x, y) in ((14.2, 21.2), (16.8, 23.4)):
        sh.ellipse(x, y, 1.2, 1.0, '#a8a8b0', shade=False)
        sh.dot(x, y, '#5a5a66', w=0.6, h=0.6)
    d.put(sh)


def humanoid_fb(c: Canvas, p: Pose, s: dict):
    """Front (facing down) and back (facing up) views of a humanoid."""
    d = D(c, p)
    front = p.facing == 'down'
    skin = hexc(s.get('skin', '#f5c9a0'))
    outfit = hexc(s.get('outfit', '#4a7bd0'))
    trim = hexc(s.get('trim', '#f0d060'))
    pants = hexc(s.get('pants', mix(outfit, (40, 30, 50), 0.45)))
    boots = hexc(s.get('boots', '#5a3a2a'))
    hair = s.get('hair')
    hair_c = hexc(s.get('hair_color', '#6b3f22'))
    robe = s.get('robe', False)
    item = s.get('item')
    bob = d.bob
    ecol = hexc(s.get('eye', '#1e1628'))

    def tail_layer(L):
        tail = s.get('tail')
        if tail == 'lion':
            L.line(16, 24, 15, 28, skin, w=1.4)
            L.ellipse(15, 28.5, 1.8, 1.8, hair_c)
        elif tail in ('fox', 'ringed'):
            L.ellipse(16, 26.5, 2.8, 3.5, skin)
            L.ellipse(16, 29, 1.6, 1.2, WHITE if tail == 'fox' else dark(skin, 0.3))
        elif tail == 'long':
            L.line(16, 25, 18, 30, skin, w=1.0)
        elif tail == 'flat':
            L.ellipse(16, 28, 2.4, 2.0, skin)

    def wings_layer(L):
        wings = s.get('wings')
        if not wings:
            return
        wc = hexc(s.get('wing_color', '#d8f4ff'))
        spread = {0: 1.0, 1: 0.8, 2: 0.6}[p.wing]
        for side in (-1, 1):
            if wings == 'feather':
                L.ellipse(16 + side * (8 + 2 * spread), 17, 3.5 * spread + 1, 6.5, wc, rot=side * 0.3)
            else:
                L.ellipse(16 + side * (8 + 2 * spread), 14, 3.2 * spread + 1, 4.8, wc, rot=side * 0.4)
                L.ellipse(16 + side * (7 + spread), 21, 2.4 * spread + 0.8, 2.8, wc)

    # --- behind the body
    back = d.part(0, bob)
    if front:
        wings_layer(back)
        if s.get('shell'):
            back.ellipse(16, 20, 8.2, 6.5, s['shell'])
        if s.get('cape'):
            back.poly([(9.5, 17), (22.5, 17), (24, 29), (8, 29)], s['cape'])
    d.put(back)

    # --- legs (alternate lifting; no forward stride in these views)
    legs = d.part(0, 0)
    for i, lx in enumerate((13.6, 18.4)):
        lift = 1 if (p.step == 1 and i == 0) or (p.step == -1 and i == 1) else 0
        col = pants if (i == 1) == front else dark(pants, 0.08)
        if s.get('mermaid'):
            break
        if robe:
            legs.rect(lx - 1.8, 28 - lift, lx + 1.8, 30.5 - lift, boots)
        else:
            legs.rect(lx - 1.8, 24.5, lx + 1.8, 29 - lift, col)
            legs.rect(lx - 2.0, 28 - lift, lx + 2.0, 30.5 - lift, boots)
    if s.get('mermaid'):
        mt = hexc(s['mermaid'])
        legs.poly([(11.5, 24), (20.5, 24), (18.5, 29), (13.5, 29)], mt)
        legs.poly([(16, 28.4), (10.5, 31.4), (13.4, 28)], light(mt, 0.15))
        legs.poly([(16, 28.4), (21.5, 31.4), (18.6, 28)], light(mt, 0.15))
        for y in (25.6, 27.2):
            legs.line(13.4, y, 18.6, y, dark(mt, 0.25), w=0.4)
    d.put(legs)

    # --- arms (swing opposite the lifted leg)
    arms = d.part(0, bob)
    for side in (-1, 1):
        sw = (p.step * side) * 1.0
        hx, hy = 16 + side * 7.2, 23 + sw
        arms.line(16 + side * 5, 18, hx, hy, outfit if front else dark(outfit, 0.05), w=2.6)
        arms.ellipse(hx, hy + 0.5, 1.5, 1.5, skin)
    d.put(arms)

    # --- torso
    body = d.part(0, bob)
    if robe:
        body.poly([(10.5, 16.5), (21.5, 16.5), (23.5, 29.5), (8.5, 29.5)], outfit)
        body.rect(9.5, 22, 22.5, 23, trim, shade=False)
        if front:
            body.rect(15.5, 17, 16.5, 29.5, trim, shade=False)
    else:
        body.ellipse(16, 21.5, 6.2, 4.8, outfit)
        body.rect(10, 23.2, 22, 24.2, trim, shade=False)
        if front:
            body.dot(15.5, 23.2, light(trim, 0.2), w=2, h=1)
    if front and s.get('apron'):
        body.rect(12.5, 19, 19.5, 27, s['apron'])
    if s.get('scarf'):
        body.ellipse(16, 17.5, 5.5, 1.6, s['scarf'])
    d.put(body)

    # --- back-view extras that sit in front of the torso
    if not front:
        over = d.part(0, bob)
        tail_layer(over)
        if s.get('shell'):
            sc = hexc(s['shell'])
            over.ellipse(16, 20.5, 7.2, 7.0, sc)
            for (x, y) in ((13, 18), (17, 17), (14.5, 22), (18.5, 21.5)):
                over.dot(x, y, light(sc, 0.2), w=2, h=2)
        if s.get('pack'):
            over.rect(11.5, 16, 20.5, 25.5, s['pack'])
            over.rect(11.5, 19, 20.5, 20, dark(hexc(s['pack']), 0.2), shade=False)
        if s.get('cape'):
            over.poly([(10, 16.5), (22, 16.5), (24, 29), (8, 29)], s['cape'])
        wings_layer(over)
        d.put(over)

    # --- head
    head = d.part(0, bob)
    ears = s.get('ears')
    for side in (-1, 1):
        if ears == 'round':
            head.ellipse(16 + side * 6.5, 6, 2.6, 2.6, skin)
            if front:
                head.dot(16 + side * 6.5 - 0.5, 5.5, BLUSH if d.sep else skin)
        elif ears == 'pointed':
            head.poly([(16 + side * 3.5, 6), (16 + side * 6.5, 0.5), (16 + side * 8.5, 8)], skin)
        elif ears == 'long':
            head.ellipse(16 + side * 3, 1.5, 1.8, 5.0, skin, rot=side * 0.15)
        elif ears == 'elf':
            head.poly([(16 + side * 8, 11), (16 + side * 12, 8), (16 + side * 8, 13.5)], skin)
        elif ears == 'tufts':
            head.poly([(16 + side * 4, 6), (16 + side * 6.5, 1.5), (16 + side * 8, 7.5)], skin)
    if hair == 'mane':
        for ang in range(0, 360, 36):
            r = math.radians(ang)
            head.ellipse(16 + math.cos(r) * 8.2, 12.5 + math.sin(r) * 7.3, 3.6, 3.6, hair_c)
    if hair == 'long':
        head.ellipse(16, 15, 9.5, 7.5, hair_c)
    head.ellipse(16, 12.5, 8.5, 7.5, skin)
    has_hair = hair in ('short', 'long', 'bob', 'spiky', 'bun', 'crest', 'ponytail')
    if front:
        if has_hair:
            head.ellipse(16, 8.2, 9, 4.6, hair_c)
            head.ellipse(8.6, 12, 2.4, 4.8, hair_c)
            head.ellipse(23.4, 12, 2.4, 4.8, hair_c)
            head.ellipse(13, 9.5, 3, 1.6, hair_c)
        if hair == 'bob':
            head.ellipse(8.5, 15.5, 2.5, 3.5, hair_c)
            head.ellipse(23.5, 15.5, 2.5, 3.5, hair_c)
        if hair == 'fringe':
            head.ellipse(8.5, 13, 2.2, 3.5, hair_c)
            head.ellipse(23.5, 13, 2.2, 3.5, hair_c)
    else:
        if has_hair:
            head.ellipse(16, 11.5, 9, 7.2, hair_c)
        if hair == 'fringe':
            head.ellipse(16, 14.5, 8.2, 3.2, hair_c)
        if hair == 'long':
            head.rect(8, 12, 24, 20, hair_c)
        if hair == 'ponytail':
            head.ellipse(16, 18.5, 2.4, 4.2, hair_c)
    if hair == 'spiky':
        head.poly([(7, 10), (6, 3), (10.5, 5), (13, 0), (16, 4), (19, 0), (21.5, 5), (26, 3), (25, 10)], hair_c)
    if hair == 'bun':
        head.ellipse(16, 3.8, 3.0, 3.0, hair_c)
    if hair == 'crest':
        head.poly([(13.5, 5), (16, -1), (18.5, 5)], hair_c)
    if front:
        if s.get('mask'):
            head.rect(9.5, 10.3, 22.5, 14, s['mask'])
        snout = s.get('snout')
        if snout == 'muzzle':
            head.ellipse(16, 15.6, 3.6, 2.5, hexc(s.get('muzzle', '#f4e2c8')))
            head.dot(15, 14.3, (50, 30, 40), w=2, h=1)
        elif snout == 'beak':
            head.poly([(13.8, 13.5), (18.2, 13.5), (16, 18)], s.get('beak', '#ffc23a'))
        elif snout == 'pointy':
            head.poly([(12.5, 13.5), (19.5, 13.5), (16, 19)], hexc(s.get('muzzle', '#f4e2c8')))
            head.dot(15.5, 17.8, (40, 25, 35), w=1, h=1)
        elif snout == 'wide':
            head.rect(12.5, 16.5, 19.5, 17.5, dark(skin, 0.25), shade=False)
        if s.get('beard'):
            head.ellipse(16, 17.5, 4.8, 3.6, s['beard'])
        if s.get('glasses'):
            head.dot(12, 10.8, '#e0e8f0', w=2, h=2)
            head.dot(18.5, 10.8, '#e0e8f0', w=2, h=2)
            d.eyes(head, [(12.5, 11.3), (19, 11.3)], color=ecol, h=1, shine=False)
        else:
            d.eyes(head, [(12.5, 11.3), (19, 11.3)], color=ecol)
        if d.sep and not snout and not s.get('beard'):
            head.dot(15.5, 15.8, dark(skin, 0.35), w=2, h=1)
        if d.sep and s.get('blush', True) and not s.get('beard') and snout != 'beak':
            head.dot(10.5, 14.4, BLUSH)
            head.dot(21, 14.4, BLUSH)
    hat = s.get('hat')
    hc = s.get('hat_color', '#5a3fa0')
    if hat in ('wizard', 'witch'):
        head.poly([(7, 7.5), (25, 7.5), (16, -3)], hc)
        head.ellipse(16, 7.4, 12, 2.0, hc)
        if hat == 'witch':
            head.rect(8, 5, 24, 6.5, '#9aff7a', shade=False)
        else:
            head.dot(15, 2.5, '#ffe066', w=2, h=2)
    elif hat == 'cap':
        head.ellipse(16, 6.5, 8.8, 3.8, hc)
        if front:
            head.ellipse(16, 9, 5.5, 1.3, hc)
    elif hat == 'hood':
        head.ellipse(16, 10, 10, 8, hc)
        if front:
            head.ellipse(16, 13, 6, 5, skin)
            d.eyes(head, [(13.5, 12.3), (18.5, 12.3)], color=ecol)
    elif hat == 'hardhat':
        head.ellipse(16, 6.5, 8.8, 4.0, hc)
        head.rect(6.5, 7.5, 25.5, 9, hc)
    elif hat == 'beret':
        head.ellipse(15, 5.5, 8.5, 3.0, hc)
    elif hat == 'chef':
        head.ellipse(16, 3.5, 6.5, 4.0, '#ffffff')
        head.rect(10, 5, 22, 8, '#ffffff')
    elif hat == 'helmet':
        head.ellipse(16, 8.0, 9.2, 5.5, hc)
    elif hat == 'straw':
        head.ellipse(16, 6.5, 12.5, 2.2, '#e8c86a')
        head.ellipse(16, 4.5, 6.5, 3.2, '#e8c86a')
        head.rect(9.5, 5.5, 22.5, 6.5, '#d04040', shade=False)
    elif hat == 'band':
        head.rect(7.5, 7.5, 24.5, 9.5, hc, shade=False)
    elif hat == 'crown':
        head.poly([(10, 6), (10, 1.5), (13, 4), (16, 0.5), (19, 4), (22, 1.5), (22, 6)], '#ffd24a')
    elif hat == 'flower':
        fr = s.get('flower_r', 2.2)
        head.ellipse(11, 5, fr, fr, s.get('flower', '#ff8fb8'))
        head.dot(10.5, 4.5, '#ffe066', w=2 if fr > 2.5 else 1, h=2 if fr > 2.5 else 1)
    d.put(head)

    # --- held item (viewer's right hand in front view; hidden-ish behind in back view)
    if item:
        it = d.part(0, bob)
        hx, hy = 16 + 7.2, 23 + p.step * 1.0
        if item == 'shield':
            sx = 16 - 7.5 if front else 16 + 7.5
            it.ellipse(sx, 21.5, 3.8, 4.8, s.get('item_color') or '#c8d2e0')
            it.ellipse(sx, 21.5, 2.2, 3.0, '#e0b040')
        else:
            draw_item(it, item, hx, hy, 'rest', s.get('item_color'))
        d.put(it)
    _shell_bits(d, s, 0, 0)
    finish(c, d)


# ─── Quadruped beasts (bear, hare, mouse, stag) ──────────────────────────────


def beast(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    fur = hexc(s['fur'])
    belly = hexc(s.get('belly', mix(fur, (255, 250, 235), 0.55)))
    lean, bob = d.lean, d.bob
    kind = s.get('kind', 'bear')
    back = d.part(lean, bob)
    if kind == 'mouse':
        back.line(8, 23, 3, 18, fur, w=1.0)
        if s.get('bolt'):
            back.poly([(3, 18), (6, 14), (4.5, 14), (7, 10), (3, 14), (4.5, 14)], '#ffe23a')
    elif kind == 'hare':
        back.ellipse(7.5, 21, 2.4, 2.4, WHITE)
    elif kind == 'bear':
        back.ellipse(7, 20, 1.8, 1.8, fur)
    elif kind == 'stag':
        back.ellipse(6, 17, 2.0, 1.6, belly)
    d.put(back)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10.5, 13.5, 19, 22)):
        off = p.step * (1.4 if i % 2 else -1.4)
        col = fur if i % 2 else dark(fur, 0.1)
        top = 23 if kind != 'stag' else 21
        legs.rect(lx - 1.3 + off, top, lx + 1.3 + off, 30, col)
        legs.rect(lx - 1.4 + off, 29, lx + 1.6 + off, 30.5, dark(fur, 0.35))
    d.put(legs)
    body = d.part(lean, bob)
    by = 20 if kind != 'stag' else 18
    body.ellipse(16, by + 2, 9, 5.5, fur)
    body.ellipse(17, by + 4, 6, 2.6, belly)
    if s.get('moss'):
        body.ellipse(13, by - 1.5, 6, 2.6, '#5caf4a')
        body.dot(10, by - 3, '#8fd46a', w=2, h=1)
        body.dot(15, by - 3.5, '#ff8fb8')
    if s.get('thorns'):
        for x in (9, 12, 15, 18):
            body.poly([(x, by - 2), (x + 1, by - 6), (x + 2, by - 2)], '#6a8a3a')
    if s.get('rings'):
        # Tree rings in its bark (the Ringkeeper, #75 item 14f): a cut log on its flank.
        rc = hexc(s['rings'])
        for k, r in enumerate((4.2, 3.0, 1.8, 0.8)):
            body.ellipse(14, by + 1.5, r * 1.2, r * 0.8, rc if k % 2 == 0 else dark(rc, 0.2), shade=False)
    d.put(body)
    head = d.part(lean, bob)
    hx, hy = (23, by - 2) if kind != 'stag' else (24, by - 5)
    if kind == 'hare':
        head.ellipse(hx - 2, hy - 8, 1.6, 5, fur, rot=-0.2)
        head.ellipse(hx + 1, hy - 8.5, 1.6, 5, fur, rot=0.2)
        head.dot(hx + 1, hy - 9, BLUSH)
    elif kind == 'mouse':
        head.ellipse(hx - 3, hy - 5, 3.2, 3.2, fur)
        head.dot(hx - 3, hy - 5, BLUSH, w=2, h=2)
    elif kind == 'bear':
        head.ellipse(hx - 4, hy - 5, 2.2, 2.2, fur)
        head.ellipse(hx + 2, hy - 5.5, 2.2, 2.2, fur)
    elif kind == 'stag':
        ac = s.get('antler', '#c8a070')
        head.line(hx - 2, hy - 4, hx - 5, hy - 12, ac, w=1.3)
        head.line(hx - 4, hy - 9, hx - 8, hy - 11, ac, w=1.1)
        head.line(hx + 1, hy - 4, hx + 3, hy - 13, ac, w=1.3)
        head.line(hx + 2.5, hy - 10, hx + 6, hy - 12, ac, w=1.1)
        if s.get('leaves'):
            lc = s.get('leaf', '#6fcf5a')
            head.ellipse(hx - 8, hy - 11, 1.8, 1.4, lc)
            head.ellipse(hx + 6, hy - 12, 1.8, 1.4, lc)
            if s.get('leaf'):
                head.ellipse(hx - 4.5, hy - 12.5, 1.4, 1.1, lc)
                head.ellipse(hx + 3.6, hy - 14, 1.4, 1.1, lc)
        if s.get('key'):
            # A silver key hanging from its antler (the Memoria Key, #75 item 14f).
            head.line(hx + 4.5, hy - 11, hx + 4.5, hy - 8.5, '#c8ccd8', w=0.4)
            head.ellipse(hx + 4.5, hy - 7.6, 1.1, 1.1, '#e8ecf4')
            head.rect(hx + 4.1, hy - 6.6, hx + 4.9, hy - 3.6, '#e8ecf4')
            head.rect(hx + 4.9, hy - 4.6, hx + 5.9, hy - 3.8, '#e8ecf4')
    head.ellipse(hx, hy, 5.2, 4.8, fur)
    head.ellipse(hx + 4, hy + 1.5, 2.6, 2.0, belly)
    head.dot(hx + 6, hy + 0.5, (40, 25, 35), w=2, h=1)
    d.eyes(head, [(hx + 1.5, hy - 2)])
    if kind == 'mouse':
        head.line(hx + 5, hy + 2, hx + 8, hy + 1.5, (80, 70, 90), w=0.4)
    d.put(head)
    finish(c, d)


# ─── Blobs (slimes, spore puff, tide sprite, meteor mite) ────────────────────


def blob(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    sq = p.squash * d.u
    lean = d.lean
    L = d.part(lean, 0)
    rx, ry = 9 + sq * 0.8, 7.5 - sq * 0.8
    cy = 30 - ry
    kind = s.get('kind', 'slime')
    if kind == 'mite':
        for i, lx in enumerate((11, 15, 19, 23)):
            L.line(lx, 26, lx + (1 if (i + p.frame) % 2 else -1), 30, '#4a3a3a', w=1.0)
        L.poly([(5, cy - 2), (0.5, cy - 5), (3, cy), (0, cy + 3), (6, cy + 3)], '#ff8a2a')
        L.poly([(5, cy - 1), (2, cy - 2.5), (5, cy + 2)], '#ffe066')
    L.ellipse(16, cy, rx, ry, col)
    if kind == 'slime':
        L.ellipse(12.5, cy - 3, 2.2, 1.6, light(col, 0.3), shade=False)
    if kind == 'mite':
        for (x, y) in ((11, cy - 2), (18, cy + 2), (20, cy - 3)):
            L.dot(x, y, dark(col, 0.2), w=2, h=2)
    if s.get('cap'):
        cc = hexc(s['cap'])
        L.ellipse(16, cy - ry + 1.5, rx + 2.5, 5.2, cc)
        for (x, y) in ((11, cy - ry), (16, cy - ry - 2), (20.5, cy - ry + 0.5)):
            L.dot(x, y, WHITE, w=2, h=2)
    if s.get('foam'):
        for (x, y, r) in ((10.5, cy - ry + 1.5, 2.6), (14.5, cy - ry, 3.0), (19, cy - ry + 0.2, 2.8), (22.5, cy - ry + 2, 2.2)):
            L.ellipse(x, y, r, r * 0.85, WHITE)
    if s.get('crest'):
        L.poly([(9, cy - ry + 3), (15, cy - ry - 5), (17, cy - ry), (23, cy - ry - 2), (22, cy - ry + 3)], light(col, 0.15))
    if s.get('splat'):
        # Blot (#75 item 15e): an ink splat — drips and spatters round its edge, a shine on top.
        for (x, y, r) in ((5, cy + 3, 2.4), (27, cy + 2, 2.2), (9, cy - ry + 1, 1.8), (24, cy - ry + 2, 1.6), (16, cy - ry - 1.5, 1.5)):
            L.ellipse(x, y, r, r, col)
        for (x, y) in ((2.5, cy - 4), (29.5, cy - 3), (20, cy - ry - 4)):
            L.dot(x, y, col, w=1.6, h=1.6)
        L.ellipse(12, cy - 3.5, 2.6, 1.4, light(col, 0.45), shade=False)
        # Big white eyes, so it reads as a critter on dark ground (15e round 3).
        for x in face_x(p, [18, 21.5], [13.5, 18]):
            L.ellipse(x, cy - 2, 2.2, 2.4, '#ffffff', shade=False)
    if s.get('symbol') == 'plus':
        L.rect(12.5, cy + 1, 15.5, cy + 2, WHITE, shade=False)
        L.rect(13.5, cy, 14.5, cy + 3, WHITE, shade=False)
    ex = face_x(p, [18, 21.5], [13.5, 18])
    d.eyes(L, [(x, cy - 2) for x in ex])
    if d.sep and ex:
        if s.get('foam'):
            L.ellipse(ex[0] + 2, cy + 2, 1.1, 1.3, dark(col, 0.45), shade=False)  # an excited "o"
        else:
            L.dot(ex[0] + 1.5, cy + 1.5, dark(col, 0.4), w=2, h=1)
    d.put(L)
    if s.get('foam'):
        fz = d.part(lean, 0)
        rise = (p.frame % 3) * 2.2
        for (x, y0, r) in ((5, 22, 1.4), (27, 20, 1.1), (8, 13, 0.9), (25, 11, 1.3)):
            y = y0 - rise
            fz.ellipse(x, y, r, r, light(col, 0.25), shade=False)
            fz.erase_ellipse(x - r * 0.25, y - r * 0.25, r * 0.45, r * 0.45)
        d.put(fz, outline=False)
    finish(c, d)


def jelly(c: Canvas, p: Pose, s: dict):
    """Floating jellyfish/sprite with dangling tendrils."""
    d = D(c, p)
    col = hexc(s['color'])
    hover = (-1 if p.frame % 2 else 0) * d.u
    L = d.part(d.lean, d.bob + hover)
    for i, tx in enumerate((11, 14, 17, 20)):
        wig = 1 if (i + p.frame) % 2 else -1
        L.line(tx, 17, tx + wig, 25, light(col, 0.1), w=1.1)
        L.line(tx + wig, 25, tx, 27.5, light(col, 0.1), w=1.0)
    L.ellipse(15.5, 13, 8.5, 6.5, col)
    L.rect(7, 13, 24, 17.5, col)
    L.ellipse(12.5, 10, 2.5, 1.6, light(col, 0.3), shade=False)
    if s.get('zap'):
        L.poly([(24, 6), (27, 10), (25.5, 10), (28, 14), (23.5, 9.5), (25, 9.5)], '#ffe23a')
    if s.get('qmark'):
        # A Riddle Jelly (#75 item 15e): a glowing "?" floating over its bell.
        L.line(13.5, 3.6, 15.5, 2.4, '#fff0a0', w=0.9)
        L.line(15.5, 2.4, 17.6, 3.4, '#fff0a0', w=0.9)
        L.line(17.6, 3.4, 16, 5.4, '#fff0a0', w=0.9)
        L.line(16, 5.4, 16, 6.4, '#fff0a0', w=0.9)
        L.dot(16, 7.8, '#fff0a0', w=1, h=1)
    d.eyes(L, [(x, 13) for x in face_x(p, [17, 20.5], [13.5, 17.5])])
    d.put(L)
    finish(c, d, shadow=(16, 30, 6, 1.5))


# ─── Flyers (bat, bird, bee, moth, butterfly) ────────────────────────────────


def flyer(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    wc = hexc(s.get('wing', mix(col, (255, 255, 255), 0.3)))
    kind = s.get('kind', 'bird')
    hover = {0: -1, 1: 0, 2: 1}[p.wing] * d.u
    lean = d.lean
    L = d.part(lean, hover - 3)
    flap = {0: -6, 1: -1, 2: 4}[p.wing]
    # back wing
    if kind == 'bat':
        L.poly([(14, 15), (3, 11 + flap), (5, 15 + flap * 0.5), (8, 14 + flap * 0.5), (10, 18)], dark(wc, 0.1))
    elif kind in ('moth', 'butterfly'):
        span = {0: 1.0, 1: 0.65, 2: 0.3}[p.wing]
        for side in (-1, 1):
            L.ellipse(16 + side * 5.5 * span, 14, 5.5 * span + 0.6, 5.5, wc if side > 0 else dark(wc, 0.1))
            L.ellipse(16 + side * 4 * span, 21.5, 3.8 * span + 0.6, 3.6, dark(wc, 0.05) if side > 0 else dark(wc, 0.15))
            L.ellipse(16 + side * 6 * span, 13.5, 1.8 * span + 0.4, 1.8, s.get('spot', '#ffffff'), shade=False)
    else:
        L.ellipse(12, 14 + flap * 0.6, 3.5, 6.0, dark(wc, 0.08), rot=-0.5)
    # body
    if kind == 'bee':
        L.ellipse(9, 20, 5, 4.2, '#ffd23a')
        L.rect(7.5, 16, 9, 24, '#2a2230', shade=False)
        L.rect(10.5, 16.5, 12, 23.5, '#2a2230', shade=False)
        L.poly([(4.5, 20), (1.5, 21), (4.5, 22)], '#2a2230')
    if kind in ('moth', 'butterfly'):
        L.ellipse(16, 19, 2.2, 6.0, col)
    else:
        L.ellipse(16, 19, 6.5, 5.5, col)
    if kind == 'bird':
        L.ellipse(18, 21, 3.5, 3.0, mix(col, (255, 255, 255), 0.5))
        L.poly([(9, 19), (4, 16), (5, 21)], dark(col, 0.1))
        L.line(15, 24, 15, 27, '#e0a030', w=0.8)
        L.line(18, 24, 18, 27, '#e0a030', w=0.8)
    # head
    if kind == 'bat':
        L.poly([(13.5, 14), (14.5, 9.5), (17, 13)], col)
        L.poly([(18, 13), (21, 9.5), (21, 14)], col)
        d.eyes(L, [(17.5, 17), (20.5, 17)], color=(255, 80, 90), h=1)
        L.dot(18.5, 21, WHITE)
        if s.get('number'):
            L.dot(13, 20, '#ffe066', w=2, h=2)
    elif kind == 'bird':
        L.poly([(22, 17), (27, 18.5), (22, 20)], '#ffb030')
        d.eyes(L, [(20, 16.5)])
        L.poly([(15, 13), (14, 9), (17, 13)], dark(col, 0.1))
        if s.get('note'):
            L.ellipse(25, 11, 1.6, 1.3, '#2a2230')
            L.line(26.2, 11, 26.2, 6, '#2a2230', w=0.7)
    elif kind == 'bee':
        L.ellipse(21, 17, 4.2, 4.0, '#2a2230')
        L.line(21, 13.5, 23, 10, '#2a2230', w=0.6)
        d.eyes(L, [(22.5, 16.5)], color=(255, 255, 255), h=2, shine=False)
        L.dot(23.5, 18, '#ff5050')
    elif kind in ('moth', 'butterfly'):
        L.ellipse(16, 11.5, 2.6, 2.6, col)
        L.line(17, 9.5, 20, 5.5, dark(col, 0.2), w=0.6)
        L.line(15, 9.5, 12, 5.5, dark(col, 0.2), w=0.6)
        d.eyes(L, [(14.8, 11), (17.2, 11)], h=1, shine=False)
        if s.get('glow'):
            L.ellipse(16, 24, 2.2, 2.4, '#fff27a', shade=False)
    # front wing
    if kind == 'bat':
        L.poly([(17, 17), (28, 10 + flap), (27, 15 + flap * 0.5), (24, 14 + flap * 0.5), (21, 20)], wc)
    elif kind == 'bee':
        L.ellipse(14, 12 + flap * 0.5, 3.5, 5.0, (220, 240, 255), rot=-0.4)
    else:
        L.ellipse(14, 18 + flap * 0.5, 4.5, 3.4, wc, rot=0.3)
    if s.get('bell'):
        # A Chime Gull (#75 item 15f): a big gold bell hung under its beak (15f review: bigger).
        L.line(23.4, 19, 23.4, 21, '#6a4a1a', w=0.8)
        L.poly([(19.4, 28), (21, 21), (25.8, 21), (27.4, 28)], '#ffc828')
        L.rect(19, 27.2, 27.8, 28.6, '#c89a1a')
        L.dot(23.4, 29.4, '#6a4a1a', w=1.4, h=1.4)
        L.poly([(17, 13.4), (18.4, 9.6), (19.8, 13.2)], '#ffc828')  # a gold crest (15f round 3: tell it from the Gull Scout)
    if s.get('waves'):
        # An Echo Bat (15f review): sound waves rippling out from its ears.
        for r in (2.6, 4.4):
            L.line(11 - r, 9.4 - r * 0.4, 11 - r * 0.6, 7 - r, '#e8e0ff', w=0.6)
            L.line(24 + r * 0.6, 7 - r, 24 + r, 9.4 - r * 0.4, '#e8e0ff', w=0.6)
    if s.get('tune'):
        # Hum (15f round 3): a gold music note floating by its head — a friend who hums.
        L.ellipse(25.6, 9.4, 1.8, 1.4, '#ffc828', shade=False)
        L.line(27, 9.4, 27, 3.6, '#ffc828', w=0.9)
        L.line(27, 3.6, 29.4, 5, '#ffc828', w=0.9)
    if s.get('stripes') and kind == 'bee':
        # Hum (15f review): black stripes and a little stinger, so it reads as a bee.
        for x in (14, 17.5):
            L.rect(x, 14, x + 1.6, 24, '#2a2230', shade=False)
        L.poly([(9.6, 19), (6.4, 20), (9.6, 21)], '#2a2230')
    if s.get('scarf'):
        # A Muffle Moth (#75 item 15f): wrapped in a woolly scarf, so its wings make no sound.
        L.rect(11, 13, 21, 16, '#9a9aa4')  # a grey woolly scarf, wide enough to see on the map
        L.rect(17.4, 15.6, 19.6, 21, '#9a9aa4')
        for x in (12.4, 15, 17.6):
            L.line(x, 13.2, x, 15.8, '#7a7a84', w=0.4)  # its knit
    d.put(L)
    finish(c, d, shadow=(16, 30.5, 5.5, 1.3))


# ─── Crab ────────────────────────────────────────────────────────────────────


def leviathan(c: Canvas, p: Pose, s: dict):
    """The Riddle Leviathan (#75 item 15e review): not a whale — a sea serpent
    rising out of a puddle of ink, two coils of its back behind it, a long neck,
    a jaw full of pages and a big white "?" crest. The Second Chorus Key hangs
    from its first coil."""
    d = D(c, p)
    col = hexc(s.get('color', '#3a3a7a'))
    wave = p.frame % 2
    rear = -2 if p.arm in ('raise', 'strike') else 0
    L = d.part(d.lean, d.bob)
    for (x, y, rx, ry) in ((5, 25.5, 3.6, 4.2), (11, 24.5, 3.8, 5.2)):  # coils of its back
        L.ellipse(x, y, rx, ry, col)
        L.poly([(x - 1.4, y - ry + 0.8), (x, y - ry - 2.4), (x + 1.4, y - ry + 0.8)], light(col, 0.2))
    L.line(18, 27, 21, 13 + rear, col, w=5)  # the neck
    L.line(19.4, 26, 22, 14 + rear, light(col, 0.18), w=1.2)
    hy = 10 + rear
    L.ellipse(23, hy, 6.4, 4.4, col)  # the head
    L.poly([(25, hy + 1.6), (31, hy + 2.6 + wave), (25.6, hy + 4.8)], dark(col, 0.2))  # the lower jaw
    L.rect(26, hy + 1.8, 29.6, hy + 2.8 + wave * 0.5, '#f4ecd8', shade=False)  # pages in its mouth
    L.line(26.6, hy + 2.3, 29, hy + 2.3, '#8a7a6a', w=0.3)
    # A big white "?" crest on its head.
    L.line(19.4, hy - 6.4, 21.2, hy - 8.4, '#ffffff', w=1.3)
    L.line(21.2, hy - 8.4, 23.4, hy - 7.4, '#ffffff', w=1.3)
    L.line(23.4, hy - 7.4, 22.8, hy - 5.4, '#ffffff', w=1.3)
    L.line(22.8, hy - 5.4, 21.6, hy - 4.6, '#ffffff', w=1.3)
    L.dot(21.6, hy - 2.6, '#ffffff', w=1.4, h=1.4)
    d.eyes(L, [(24.6, hy - 0.8)], color=(255, 220, 90))
    # The key on its first coil.
    L.ellipse(5, 19.6, 1.4, 1.4, '#e8ecf4')
    L.line(5, 20.8, 5, 23.6, '#e8ecf4', w=0.8)
    L.line(5, 22.6, 6.2, 22.6, '#e8ecf4', w=0.6)
    d.put(L)
    ink = d.part(0, 0)
    ink.ellipse(13, 29.4, 13, 2.4, '#14142a', shade=False)  # the puddle of ink it rises from
    ink.ellipse(8, 29, 3, 0.8, '#3a3a5a', shade=False)
    d.put(ink, outline=False)
    finish(c, d)


def cuttlefish(c: Canvas, p: Pose, s: dict):
    """A Cuttle-Scribe (#75 item 15e review): a cuttlefish, not an octopus — a flat
    oval body with a frilly fin all round it, short arms in front, W-shaped eyes,
    and a white quill held out to write with."""
    d = D(c, p)
    col = hexc(s.get('color', '#d8709a'))
    ripple = 0.6 if p.frame % 2 else -0.6
    hover = -1 if p.frame % 2 else 0
    L = d.part(d.lean, d.bob + hover)
    L.ellipse(14, 17, 11.4, 6.4 + ripple * 0.3, light(col, 0.3))  # the fin skirt
    L.ellipse(14, 17, 9.6, 5, col)  # the body
    for (x, y) in ((8, 15.6), (12, 14.4), (16, 14.6)):
        L.dot(x, y, dark(col, 0.18), w=1.6, h=1.2)  # its stripes
    for i, ay in enumerate((15.4, 17.4, 19.4)):
        L.line(23, ay, 28, ay + (ripple if i % 2 else -ripple), dark(col, 0.06), w=1.3)  # short arms in front
    ex = 20.4
    L.ellipse(ex, 15.6, 1.9, 1.6, '#ffffff', shade=False)
    L.line(ex - 1.2, 15.2, ex - 0.4, 16.4, '#1a1a24', w=0.6)  # a W-shaped pupil
    L.line(ex - 0.4, 16.4, ex, 15.6, '#1a1a24', w=0.6)
    L.line(ex, 15.6, ex + 0.4, 16.4, '#1a1a24', w=0.6)
    L.line(ex + 0.4, 16.4, ex + 1.2, 15.2, '#1a1a24', w=0.6)
    d.put(L)
    q = d.part(d.lean, d.bob + hover)  # the quill, held out in one arm
    tip = (31, 6) if p.arm in ('raise', 'strike') else (30, 10)
    q.poly([(27.6, 18), (tip[0], tip[1]), (tip[0] + 1.2, tip[1] + 1.4), (28.6, 18.6)], '#f4f4f8')
    q.dot(28, 18.6, '#2a2440', w=1, h=1)
    d.put(q)
    finish(c, d, shadow=(14, 30, 8, 1.2))


def blank_sprite(c: Canvas, p: Pose, s: dict):
    """A Blank Sprite (#75 item 15f): a floating sheet of empty paper, its corner
    curled, a sleepy blank face — it wipes the words off things."""
    d = D(c, p)
    col = hexc(s.get('color', '#f4f4f0'))
    hover = -1.5 if p.frame % 2 else 0
    L = d.part(d.lean, d.bob + hover)
    L.poly([(8, 8), (22, 7), (24, 22), (10, 24)], col)
    L.poly([(22, 7), (24, 22), (20.6, 19.4), (19.6, 9)], dark(col, 0.08))
    L.poly([(8, 8), (11.4, 8.2), (8.4, 11.4)], dark(col, 0.18))  # a curled corner
    for y in (11.4, 20.4, 22.4):
        L.line(10.6, y, 21.4, y - 0.4, '#5a8ad8', w=0.6)  # clear blue ruled lines: a blank page
    L.poly([(8, 8), (13, 8.2), (8.6, 13.4)], '#d8d8e0')  # a big folded corner
    for x in (13.6, 18):
        L.dot(x, 14.6, '#3a3a4a', w=1.4, h=1.4)  # round dot eyes (15f review: not a skull)
    L.line(14.4, 17.4, 15.8, 18.2, '#c86a7a', w=0.5)  # a small smile
    L.line(15.8, 18.2, 17.4, 17.4, '#c86a7a', w=0.5)
    d.put(L)
    finish(c, d, shadow=(16, 30, 6, 1.1))


def shrimp(c: Canvas, p: Pose, s: dict):
    """A Margin Shrimp (#75 item 15e): a curled, segmented shrimp — a fan tail
    tucked under, little legs, long feelers sweeping forward, no claws."""
    d = D(c, p)
    col = hexc(s['color'])
    flick = 1.2 if p.frame % 2 else 0.0
    L = d.part(d.lean, d.bob)
    # The body: overlapping segments in a curve, head on the right, tail curling under on the left.
    segs = ((22, 17, 5.2, 4.6), (17.5, 15.6, 4.6, 4.4), (13, 16.2, 4.2, 4.0), (9.4, 18.6, 3.6, 3.4), (7.4, 22, 3.0, 2.8))
    for (x, y, rx, ry) in segs:
        L.ellipse(x, y, rx, ry, col)
    for (x, y, rx, ry) in segs:
        L.ellipse(x, y + ry * 0.45, rx * 0.8, ry * 0.4, light(col, 0.35), shade=False)  # a pale belly
    for (x, y, _rx, ry) in segs[1:]:
        L.line(x + 1.2, y - ry + 0.6, x + 1.8, y + ry - 0.8, dark(col, 0.22), w=0.5)
    L.poly([(7.4, 24), (3.4, 27 + flick), (7.6, 26.2), (11.4, 27.8 + flick)], light(col, 0.12))  # the fan tail
    for i, lx in enumerate((12, 15, 18, 21)):
        wig = 0.8 if (i + p.frame) % 2 else -0.8
        L.line(lx, 19.5, lx + wig, 23.5, dark(col, 0.15), w=0.7)
    L.poly([(25.5, 14.6), (29.6, 12.6), (26.6, 16.6)], dark(col, 0.08))  # a pointy rostrum
    d.eyes(L, [(23.4, 14.4)])
    d.put(L)
    F = d.part(d.lean, d.bob)
    sweep = -1.5 if p.arm in ('raise', 'strike') else 0.0
    # Long sweeping feelers at battle size; on the map short ones, or the shrimp reads as a feather (15e round 4).
    feelers = ((13.4, 31, 4 + sweep), (14.2, 31.5, 9 + sweep)) if d.sep else ((13.4, 28.5, 10.5), (14.2, 29, 13))
    for (y0, x1, y1) in feelers:
        F.line(24.5, y0, x1, y1, dark(col, 0.3), w=0.4 if d.sep else 0.7)
    d.put(F, outline=False)
    finish(c, d)


def crab(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    for i, lx in enumerate((8, 11, 21, 24)):
        wig = (1 if (i + p.frame) % 2 else -1) * 0.8
        L.line(lx, 24, lx + (-3 if i < 2 else 3), 29 + wig, dark(col, 0.1), w=1.1)
    L.ellipse(16, 22, 9.5, 5.5, col)
    if s.get('shell'):
        # A hermit crab's borrowed shell (#75 item 14i): a big spiral on its back.
        sh = hexc(s['shell'])
        L.poly([(2, 22), (4, 9), (10, 4), (16, 8), (17, 20)], sh)
        L.line(5, 18, 14, 9, dark(sh, 0.35), w=1.4)
        L.line(4, 13, 11, 6, dark(sh, 0.35), w=1.2)
        L.line(8, 21, 16, 13, dark(sh, 0.35), w=1.2)
    if s.get('drum'):
        # A Drum Crab (#75 item 15f): a little red drum on its back, two sticks.
        L.rect(9, 9, 22, 17, '#d03a3a')
        L.ellipse(15.5, 9, 6.6, 2, '#f4ecd8')
        for x in (11, 15, 19):
            L.line(x - 1.4, 10.6, x + 1.4, 16, '#ffd24a', w=0.5)
        L.line(17, 6, 22, 2, '#8a5a2a', w=0.7)
        L.line(14, 6, 10, 2.4, '#8a5a2a', w=0.7)
    if s.get('stars'):
        L.dot(12, 20, '#ffe066', w=2, h=2)
        L.dot(19, 19, '#ffffff')
        L.poly([(4, 13), (0.5, 9), (2, 14), (0, 17), (5, 16)], '#ffb03a')
    claw_up = -3 if p.arm in ('raise', 'strike') else 0
    for cx in (5.5, 26.5):
        L.line(cx + (3 if cx < 16 else -3), 20, cx, 15 + claw_up, col, w=1.6)
        L.ellipse(cx, 13 + claw_up, 3.0, 2.8, col)
        L.poly([(cx - 1, 12 + claw_up), (cx + 0.5, 8.5 + claw_up), (cx + 2, 12 + claw_up)], light(col, 0.1))
    L.line(14, 17, 13.5, 13, dark(col, 0.1), w=0.8)
    L.line(19, 17, 19.5, 13, dark(col, 0.1), w=0.8)
    L.ellipse(13.5, 12.5, 1.6, 1.6, WHITE)
    L.ellipse(19.5, 12.5, 1.6, 1.6, WHITE)
    d.eyes(L, [(13.5, 12), (20, 12)], h=1, shine=False)
    L.dot(16, 23.5, dark(col, 0.4), w=3, h=1)
    d.put(L)
    finish(c, d)


# ─── Dragons & serpents (Ember, Sir Sumsalot, Gear Wyrm) ─────────────────────


def dragon(c: Canvas, p: Pose, s: dict):
    if p.facing != 'side':
        return dragon_fb(c, p, s)
    d = D(c, p)
    col = hexc(s['color'])
    belly = hexc(s.get('belly', '#ffd98a'))
    stage = s.get('stage', 'dragon')
    lean, bob = d.lean, d.bob
    size = {'hatchling': 0.72, 'whelp': 0.86, 'dragon': 1.0, 'radiant': 1.0}[stage]

    def S(x, y):  # scale about the feet so smaller stages stay grounded
        return 16 + (x - 16) * size, 30 + (y - 30) * size

    back = d.part(lean, bob)
    # tail
    tx0, ty0 = S(9, 24)
    tx1, ty1 = S(3, 20)
    back.line(tx0, ty0, tx1, ty1, col, w=3.2 * size)
    tx2, ty2 = S(1.5, 16)
    back.poly([(tx1, ty1 - 1), (tx2, ty2), (tx1 + 2, ty1)], light(col, 0.05))
    if stage != 'hatchling':
        flap = {0: -3, 1: 0, 2: 3}[p.wing]
        wx, wy = S(12, 14)
        pts = [S(14, 17), S(4, 6 + flap), S(7, 12 + flap * 0.6), S(9, 11 + flap * 0.6), S(11, 16)]
        back.poly(pts, s.get('wing', '#ffb05a'))
        back.line(*S(14, 17), *S(4, 6 + flap), dark(col, 0.1), w=0.9)
    d.put(back)
    legs = d.part(lean * 0.4, bob if p.happy else 0)  # the cheer hop leaves the ground
    for i, lx in enumerate((12.5, 19)):
        off = p.step * (1.4 if i else -1.4)
        x0, y0 = S(lx - 2 + off, 25)
        x1, y1 = S(lx + 2 + off, 30.3)
        legs.rect(x0, y0, x1, y1, col if i else dark(col, 0.1))
    d.put(legs)
    body = d.part(lean, bob)
    bx, by = S(16, 22)
    body.ellipse(bx, by, 7.2 * size, 6.0 * size, col)
    body.ellipse(bx + 2 * size, by + 1.5 * size, 4.0 * size, 4.0 * size, belly)
    for k in range(3):
        sx, sy = S(10 + k * 3, 16.5 - k * 0.3)
        body.poly([(sx - 1, sy + 1), (sx, sy - 2 * size), (sx + 1.2, sy + 1)], light(col, 0.15))
    d.put(body)
    head = d.part(lean - p.rear * 0.5, bob - p.rear)
    hx, hy = S(21, 12.5)
    hr = 6.2 * size * (1.15 if stage == 'hatchling' else 1)
    head.poly([(hx - 3 * size, hy - 3 * size), (hx - 6 * size, hy - 9 * size), (hx - 0.5 * size, hy - 4 * size)], s.get('horn', '#fff0c8'))
    head.poly([(hx + 0.5 * size, hy - 4 * size), (hx + 0 * size, hy - 10 * size), (hx + 3 * size, hy - 4.5 * size)], s.get('horn', '#fff0c8'))
    head.ellipse(hx, hy, hr, hr * 0.9, col)
    if p.mouth in ('open', 'breath'):
        # upper snout tilts up, a lower jaw drops below it, dark mouth between
        head.ellipse(hx + 4.5 * size, hy + 1.2 * size, 3.6 * size, 2.0 * size, col)
        head.poly([(hx + 2.5 * size, hy + 2.6 * size), (hx + 8.2 * size, hy + 2.2 * size),
                   (hx + 7.4 * size, hy + 4.6 * size)], (120, 30, 40))
        head.ellipse(hx + 4 * size, hy + 4.4 * size, 3.2 * size, 1.3 * size, dark(col, 0.08))
    else:
        head.ellipse(hx + 4.5 * size, hy + 2 * size, 3.6 * size, 2.6 * size, col)
    if p.mouth == 'puff':  # cheeks full of fire
        head.ellipse(hx + 3 * size, hy + 2.6 * size, 3.0 * size, 2.4 * size, light(col, 0.12))
        head.dot(hx + 8 * size, hy + 2 * size, (255, 200, 80))
    head.dot(hx + 7 * size, hy + 0.8 * size, dark(col, 0.4))
    if p.happy:
        ex, ey = hx + 1.5 * size, hy - 1.5 * size
        for dx, dy in ((-1, 1), (0, 0), (1, 1)):
            head.dot(ex + dx, ey + dy, EYE)
    else:
        d.eyes(head, [(hx + 1.5 * size, hy - 1.5 * size)])
    if s.get('helmet'):
        head.ellipse(hx - 0.5, hy - 3, hr + 0.5, 4, '#c0c8d4')
        head.poly([(hx - 3, hy - 6), (hx - 1, hy - 12), (hx + 1, hy - 6)], '#e84040')
    if p.mouth == 'breath':  # a fire cone from the jaws to the frame edge
        fx, fy = hx + 7.5 * size, hy + 3.2 * size
        flick = 1.2 if p.frame % 2 else 0
        # Radiant Ember breathes starlight (15g review): gold and white, star specks in it.
        outer, mid, core = ('#ffd040', '#fff4b0', '#ffffff') if stage == 'radiant' else ('#ff6a2a', '#ffb040', '#fff2a0')
        head.poly([(fx, fy - 1.2), (32, fy - 4.5 - flick), (32, fy + 4.5 + flick), (fx, fy + 1.2)], outer)
        head.poly([(fx, fy - 0.8), (32, fy - 2.6), (32, fy + 2.6), (fx, fy + 0.8)], mid)
        head.poly([(fx, fy - 0.4), (31, fy - 1), (31, fy + 1), (fx, fy + 0.4)], core)
        if stage == 'radiant':
            for (sx, sy) in ((fx + 6, fy - 3), (fx + 11, fy + 2.6), (fx + 15, fy - 1.6)):
                head.dot(sx, sy + (1 if p.frame % 2 else 0), '#ffffff')
    elif p.arm in ('strike',) or s.get('always_fire'):
        fx, fy = hx + 8 * size, hy + 2 * size
        head.poly([(fx, fy - 1.5), (fx + 5, fy - 3), (fx + 7, fy), (fx + 5, fy + 3), (fx, fy + 1.5)], '#ff8a2a')
        head.poly([(fx, fy - 0.8), (fx + 4, fy), (fx, fy + 0.8)], '#ffe066')
    if stage == 'radiant':
        # Radiant Ember (#75 item 15g): a few starry sparkles round her, twinkling frame to frame.
        # A starry halo on every frame, half the stars swapping each frame so it twinkles (15g review: it read as plain orange).
        for k, (x, y) in enumerate(((6, 9), (27, 7), (3, 22), (28, 20), (14, 4), (2, 14), (30, 13), (22, 3))):
            big = (k + p.frame) % 2 == 0
            head.dot(x, y, '#ffffff' if big else '#fff2a0')
            if big:
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    head.dot(x + dx, y + dy, '#ffe060')
    d.put(head)
    if s.get('lance'):
        it = d.part(lean, bob)
        a = ARM_HAND[p.arm]
        draw_item(it, 'spear', a[0] - 1, a[1] + 1, p.arm)
        d.put(it)
    finish(c, d)


def dragon_fb(c: Canvas, p: Pose, s: dict):
    """Front / back views of a dragon (Ember stages, Sir Sumsalot)."""
    d = D(c, p)
    front = p.facing == 'down'
    col = hexc(s['color'])
    belly = hexc(s.get('belly', '#ffd98a'))
    stage = s.get('stage', 'dragon')
    size = {'hatchling': 0.72, 'whelp': 0.86, 'dragon': 1.0, 'radiant': 1.0}[stage]
    horn = s.get('horn', '#fff0c8')
    bob = d.bob

    def S(x, y):
        return 16 + (x - 16) * size, 30 + (y - 30) * size

    def wings(L):
        if stage == 'hatchling':
            return
        flap = {0: -3, 1: 0, 2: 3}[p.wing]
        for side in (-1, 1):
            L.poly([S(16 + side * 4, 18), S(16 + side * 14, 8 + flap), S(16 + side * 12, 16 + flap * 0.5),
                    S(16 + side * 7, 21)], s.get('wing', '#ffb05a'))

    back = d.part(0, bob)
    if front:
        wings(back)
        back.line(*S(19, 26), *S(25, 29), col, w=2.4 * size)  # tail peeking out
    d.put(back)
    legs = d.part(0, 0)
    for i, lx in enumerate((12.5, 19.5)):
        lift = 1 if (p.step == 1 and i == 0) or (p.step == -1 and i == 1) else 0
        x0, y0 = S(lx - 2, 25)
        x1, y1 = S(lx + 2, 30.3 - lift)
        legs.rect(x0, y0, x1, y1, col if i else dark(col, 0.1))
    d.put(legs)
    body = d.part(0, bob)
    bx, by = S(16, 22)
    body.ellipse(bx, by, 6.8 * size, 6.0 * size, col)
    if front:
        body.ellipse(bx, by + 1 * size, 3.8 * size, 4.4 * size, belly)
    else:
        for k in range(3):
            sx, sy = S(16, 17 + k * 3)
            body.poly([(sx - 1.2, sy + 1), (sx, sy - 2 * size), (sx + 1.2, sy + 1)], light(col, 0.15))
    d.put(body)
    if not front:
        over = d.part(0, bob)
        over.line(*S(16, 26), *S(16, 31), col, w=3.0 * size)
        wings(over)
        d.put(over)
    head = d.part(0, bob)
    hx, hy = S(16, 12.5)
    hr = 6.4 * size * (1.15 if stage == 'hatchling' else 1)
    for side in (-1, 1):
        head.poly([(hx + side * 2.5 * size, hy - 4 * size), (hx + side * 5 * size, hy - 10 * size),
                   (hx + side * 5.5 * size, hy - 3 * size)], horn)
    head.ellipse(hx, hy, hr, hr * 0.9, col)
    if front:
        head.ellipse(hx, hy + 3 * size, 3.4 * size, 2.4 * size, light(col, 0.08))
        head.dot(hx - 1.5 * size, hy + 2.6 * size, dark(col, 0.4))
        head.dot(hx + 1.2 * size, hy + 2.6 * size, dark(col, 0.4))
        d.eyes(head, [(hx - 3 * size, hy - 1.5 * size), (hx + 2.2 * size, hy - 1.5 * size)])
    if s.get('helmet'):
        head.ellipse(hx, hy - 3, hr + 0.5, 4, '#c0c8d4')
        head.poly([(hx - 1, hy - 6), (hx, hy - 12), (hx + 1, hy - 6)], '#e84040')
    if stage == 'radiant':
        # Radiant Ember's star halo in the front and back views too (15g review round 3).
        for k, (x, y) in enumerate(((5, 9), (27, 9), (3, 22), (29, 21), (16, 3), (9, 4), (23, 4))):
            big = (k + p.frame) % 2 == 0
            head.dot(x, y, '#ffffff' if big else '#fff2a0')
            if big:
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    head.dot(x + dx, y + dy, '#ffe060')
    d.put(head)
    finish(c, d)


def egg(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    rot = (0.12 if p.frame % 2 else -0.08) if not p.hurt else 0.25
    L = d.part(d.lean, 0)
    L.ellipse(16, 22, 6.5, 8.0, '#fff1d6', rot=rot)
    for (x, y, r) in ((13, 19, 1.6), (18.5, 23, 2.0), (14.5, 26, 1.3), (19, 17, 1.1)):
        L.ellipse(x, y, r, r, '#ff9a4a')
    L.dot(13, 17, WHITE, w=2, h=2)
    d.put(L)
    finish(c, d)


def fireball(c: Canvas, p: Pose, s: dict):
    """Battle FX: a flying fireball heading right, tail flickering per frame."""
    d = D(c, p)
    L = d.part(0, 0)
    ph = p.frame * 1.7
    # flickering tongues trailing behind (left)
    for i, (x, y, r) in enumerate(((7, 16, 3.2), (10, 13, 3.0), (10, 19.5, 3.0), (5, 12, 2.0), (5, 20.5, 2.0))):
        wob = math.sin(ph + i * 1.3) * 1.3
        L.ellipse(x + wob, y + math.cos(ph + i) * 0.8, r, r * 0.8, '#e8401e')
    L.ellipse(16, 16, 7.5, 6.5, '#ff6a2a')
    L.ellipse(18, 16, 5.5, 4.8, '#ffa53a')
    L.ellipse(19.5, 16, 3.2, 2.8, '#fff0a0')
    d.put(L)
    finish(c, d)


def starfire(c: Canvas, p: Pose, s: dict):
    """Battle FX (#75 item 15g review round 4): Radiant Ember's starfire — a white-gold
    four-point star heading right, a gold sparkle tail twinkling behind it."""
    d = D(c, p)
    L = d.part(0, 0)
    ph = p.frame * 1.7
    for i, (x, y) in enumerate(((5, 16), (8, 12.5), (8, 19.5), (2.5, 14), (2.5, 18))):
        wob = math.sin(ph + i * 1.3) * 1.1
        L.ellipse(x + wob, y, 1.6, 1.3, '#ffd040' if (i + p.frame) % 2 else '#fff4b0')
    L.poly([(18, 6), (20.4, 13.6), (28, 16), (20.4, 18.4), (18, 26), (15.6, 18.4), (8, 16), (15.6, 13.6)], '#ffd040')
    L.poly([(18, 9.5), (19.6, 14.4), (24.5, 16), (19.6, 17.6), (18, 22.5), (16.4, 17.6), (11.5, 16), (16.4, 14.4)], '#fff4b0', shade=False)
    L.ellipse(18, 16, 2, 2, '#ffffff', shade=False)
    d.put(L)
    finish(c, d)


def serpent(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    ph = p.frame * 0.9
    segs = []
    for i in range(7):
        x = 4 + i * 2.6
        y = 25 + math.sin(i * 0.9 + ph) * 2.2 - i * 0.6
        segs.append((x, y))
    for i, (x, y) in enumerate(segs):
        L.ellipse(x, y, 3.2 + i * 0.15, 3.0 + i * 0.1, col if i % 2 else dark(col, 0.06))
        if s.get('gears') and i % 2 == 0:
            L.poly([(x - 1, y - 2.5), (x, y - 5), (x + 1, y - 2.5)], '#c8a040')
    hx, hy = 23, 14
    L.ellipse(hx - 1, hy + 4, 3.5, 4.5, col)
    L.ellipse(hx, hy, 5.2, 4.6, col)
    L.ellipse(hx + 4, hy + 1.2, 2.8, 2.0, col)
    if s.get('eel'):
        # A Word Eel (#75 item 15e review): a fin along its back, pale letter-spots, no snake's tongue.
        for i, (x, y) in enumerate(segs[1:], 1):
            L.poly([(x - 1.6, y - 2.6), (x, y - 5 + (i % 2) * 0.6), (x + 1.6, y - 2.6)], light(col, 0.25))
        for (x, y) in segs[1::2]:
            L.rect(x - 0.8, y - 0.4, x + 0.8, y + 0.4, '#f4f0d8', shade=False)
            L.rect(x - 0.3, y - 1.2, x + 0.3, y + 1.2, '#f4f0d8', shade=False)
        L.poly([(hx - 1, hy - 4.2), (hx + 2, hy - 7.4), (hx + 3, hy - 4)], light(col, 0.25))
        d.eyes(L, [(hx + 1.2, hy - 1.5)])
        L.line(hx + 5, hy + 2.4, hx + 7, hy + 2, dark(col, 0.45), w=0.6)
    else:
        d.eyes(L, [(hx + 1.2, hy - 1.5)], color=(255, 220, 60))
        L.line(hx + 6, hy + 2.5, hx + 8.5, hy + 3.5, '#ff4f6b', w=0.6)
    if s.get('gears'):
        L.ellipse(hx - 2, hy - 4, 2.3, 2.3, '#c8a040')
        L.dot(hx - 2.5, hy - 4.5, '#6a5020', w=1, h=1)
    d.put(L)
    finish(c, d)


# ─── Constructs (golems, robots, gears, hourglass) ───────────────────────────


def golem(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    acc = hexc(s.get('accent', '#ffcf4a'))
    glow = hexc(s.get('glow', '#7ef9ff'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((12, 19.5)):
        off = p.step * (1.4 if i else -1.4)
        legs.rect(lx - 2.4 + off, 24, lx + 2.4 + off, 30.5, dark(col, 0.05) if i else dark(col, 0.14))
    d.put(legs)
    if s.get('key'):
        kb = d.part(lean, bob)
        kb.line(7, 18, 3, 18, '#c8a040', w=1.2)
        kb.ellipse(2.5, 16, 1.8, 2.4, '#e0b040')
        kb.ellipse(2.5, 20, 1.8, 2.4, '#e0b040')
        d.put(kb)
    ab = d.part(lean, bob)
    ab.rect(6.5, 15, 10, 24, dark(col, 0.16))
    d.put(ab)
    body = d.part(lean, bob)
    body.rect(8.5, 13.5, 24, 25.5, col)
    if s.get('compass'):
        # A compass rose on its chest (#75 item 15d review): a pale dial, a red needle north.
        body.ellipse(16.2, 19.5, 4.2, 4.2, '#f4ecd8', shade=False)
        body.poly([(16.2, 15.6), (17.2, 19.5), (16.2, 23.4), (15.2, 19.5)], '#3a3a44', shade=False)
        body.poly([(16.2, 15.6), (17.2, 19.5), (15.2, 19.5)], acc, shade=False)
        body.poly([(12.4, 19.5), (16.2, 18.6), (20, 19.5), (16.2, 20.4)], '#8a8a7a', shade=False)
        body.dot(16.2, 19.5, '#ffd24a')
    else:
        body.rect(13, 17, 19.5, 22, acc)
        body.dot(15.5, 18.5, light(acc, 0.25), w=2, h=2)
    if s.get('rust'):
        for (x, y) in ((10, 15), (21, 23), (11, 23.5), (22, 16)):
            body.dot(x, y, '#a0502a', w=2, h=1)
    if s.get('runes'):
        body.dot(10.5, 16, glow, w=1, h=3)
        body.dot(21.5, 20, glow, w=1, h=3)
    if s.get('bolts'):
        for (x, y) in ((9.5, 14.5), (22.5, 14.5), (9.5, 24), (22.5, 24)):
            body.dot(x, y, '#dfe6f2')
    d.put(body)
    head = d.part(lean, bob)
    head.rect(11, 5.5, 23, 13.8, light(col, 0.05))
    if s.get('horns'):
        head.poly([(11, 7), (8, 1), (13, 5.5)], acc)
        head.poly([(21, 5.5), (24, 0), (23, 7)], acc)
    if s.get('antenna'):
        head.line(17, 5.5, 17, 2, '#8c96a4', w=0.8)
        head.ellipse(17, 1.8, 1.3, 1.3, '#ff5050')
    if s.get('crown'):
        head.poly([(11, 6), (11, 2), (14, 4.5), (17, 1), (20, 4.5), (23, 2), (23, 6)], '#ffd24a')
    vx = {'side': 15.5, 'down': 12.5, 'up': None}[p.facing]
    if vx is None:
        head.rect(12, 8.5, 22, 9.5, dark(col, 0.1), shade=False)  # back plate seam
    elif p.hurt:
        d.eyes(head, [(vx + 1.5, 9), (vx + 5, 9)], color=glow)
    else:
        head.rect(vx, 8.5, vx + 7, 10.5, glow, shade=False)
        if d.sep:
            head.dot(vx + 5.5, 8.5, WHITE)
    d.put(head)
    front = d.part(lean, bob)
    ax = {'raise': (18, 6), 'strike': (28, 15), 'follow': (25, 21)}.get(p.arm, (23.5, 23))
    front.line(21, 15.5, ax[0], ax[1], col, w=3.4)
    front.ellipse(ax[0], ax[1], 2.6, 2.6, light(col, 0.08))
    if s.get('shield'):
        front.ellipse(ax[0] + 2, ax[1] - 1, 3.5, 5, '#8c7a5a')
        front.dot(ax[0] + 1.5, ax[1] - 2, glow, w=2, h=2)
    d.put(front)
    finish(c, d)


def gear_creature(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob - 1 * d.u * (p.frame % 2))
    rot = p.frame * 0.35
    for t in range(8):
        a = rot + t * math.pi / 4
        L.ellipse(16 + math.cos(a) * 8.5, 20 + math.sin(a) * 8.5, 2.2, 2.2, col, shade=False)
    L.ellipse(16, 20, 8.0, 8.0, col)
    L.ellipse(16, 20, 5.2, 5.2, light(col, 0.12))
    if p.facing != 'up':
        d.eyes(L, [(14.5, 18.5), (18, 18.5)])
        if d.sep:
            L.dot(15.5, 22, dark(col, 0.4), w=3, h=1)
    d.put(L)
    finish(c, d, shadow=(16, 30.5, 6, 1.2))


def hourglass(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    L = d.part(d.lean, d.bob)
    wood = '#8a5a30'
    sand = '#ffd57a'
    glass = (200, 230, 255)
    L.line(10.5, 22, 7, 17 if p.arm != 'strike' else 13, wood, w=1.0)
    L.line(21.5, 22, 25, 17 if p.arm != 'strike' else 14, wood, w=1.0)
    L.rect(9, 7, 23, 9.5, wood)
    L.rect(9, 27.5, 23, 30, wood)
    L.poly([(10, 9.5), (22, 9.5), (17, 18.5), (15, 18.5)], glass)
    L.poly([(15, 18.5), (17, 18.5), (22, 27.5), (10, 27.5)], glass)
    L.poly([(12, 11), (20, 11), (16.8, 16.5), (15.2, 16.5)], sand)
    L.poly([(13, 27.5), (19, 27.5), (16, 23)], sand)
    if p.frame % 2:
        L.dot(15.7, 19, sand, w=1, h=3)
    if p.facing != 'up':
        d.eyes(L, [(14, 12.5), (18, 12.5)])
    d.put(L)
    finish(c, d)


# ─── Spirits & fiends (ghost, cloud, orb, demon, moon spirit) ────────────────


def ghost(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    hover = (-1 if p.frame % 2 else 0) * d.u
    L = d.part(d.lean, d.bob + hover - 1)
    L.ellipse(16, 14, 8.0, 8.0, col)
    L.rect(8, 14, 24, 23, col)
    for i, x in enumerate((9.5, 13.5, 17.5, 21.5)):
        dy = 1.5 if (i + p.frame) % 2 else 0
        L.ellipse(x, 23 + dy, 2.2, 2.4, col)
    if s.get('scribble'):
        L.line(10, 18, 13, 16, '#ff4f8b', w=0.7)
        L.line(13, 16, 12, 20, '#4fc3f7', w=0.7)
        L.line(12, 20, 15, 19, '#ffd24a', w=0.7)
    arm_x = {'strike': 27, 'follow': 25}.get(p.arm, 23)
    L.ellipse(arm_x, 17, 2.6, 2.0, col)
    ex = face_x(p, [17, 20.5], [13.5, 18])
    d.eyes(L, [(x, 12) for x in ex], color=hexc(s.get('eye', '#1e1628')))
    if s.get('hush') and ex:
        # A Hushling (#75 item 15f): a finger held to its closed lips — shhh! (15f review: a
        # warm finger that shows on its pale body, and a little "shh" squiggle).
        mx = ex[0] + 1.6
        L.line(mx - 2.2, 17, mx + 2.2, 17, dark(col, 0.6), w=1.0)
        L.line(mx, 18.6, mx, 14.6, '#e8b088', w=1.8)  # a short finger at its lips (round 4: not a long stripe)
        L.ellipse(mx, 19.6, 2.2, 1.8, '#e8b088')  # and a little hand
        if d.sep:
            for i in range(3):
                L.line(25 + i * 1.2, 9 + (i % 2), 26 + i * 1.2, 8 - (i % 2), dark(col, 0.4), w=0.5)
    elif d.sep and ex:
        L.ellipse(ex[0] + 2, 17, 1.4, 1.1, dark(col, 0.45), shade=False)
    d.put(L)
    if s.get('moon'):
        m = d.part(d.lean, d.bob + hover - 1)
        m.ellipse(9, 7, 5.5, 5.5, '#fff4b0')
        m.erase_ellipse(12, 5.5, 4.4, 4.4)
        d.put(m)
    finish(c, d, shadow=(16, 30.5, 6, 1.3))


def cloud_fiend(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    wob = 1 if p.frame % 2 else 0
    for (x, y, r) in ((9, 20, 6), (16, 14 - wob, 8), (23, 19, 6.5), (13, 24, 6), (20, 25, 6), (6, 26, 3.5), (27, 26, 3.5)):
        L.ellipse(x, y, r, r * 0.9, col)
    for (x, y) in ((5, 12 + wob), (27, 10 - wob), (22, 5)):
        L.ellipse(x, y, 2, 1.8, light(col, 0.1))
    ec = hexc(s.get('eye', '#ffea3a'))
    L.poly([(13, 14), (17, 16), (13, 17)], ec)
    L.poly([(19, 16), (23, 14), (23, 17)], ec)
    L.poly([(13, 21), (23, 21), (21, 23), (15, 23)], dark(col, 0.5))
    for x in (15.5, 18, 20.5):
        L.dot(x, 21, WHITE)
    d.put(L)
    finish(c, d)


def orb_fiend(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    hover = (-1 if p.frame % 2 else 0) * d.u
    L = d.part(d.lean, d.bob + hover)
    for i in range(6):
        a = math.radians(200 + i * 28 + p.frame * 8)
        L.line(16 + math.cos(a) * 6, 17 + math.sin(a) * 6 + 6, 16 + math.cos(a) * 12, 26 + math.sin(a) * 3, dark(col, 0.1), w=1.4)
    L.ellipse(16, 16, 10, 10, col)
    L.ellipse(12, 11, 3, 2.2, light(col, 0.2), shade=False)
    ec = hexc(s.get('eye', '#c8b8ff'))
    L.poly([(10, 15), (14.5, 13.5), (14, 17)], ec)
    L.poly([(18, 13.5), (22.5, 15), (18.5, 17)], ec)
    L.poly([(11, 20), (21, 20), (16, 23.5)], dark(col, 0.45))
    d.put(L)
    finish(c, d, shadow=(16, 30.5, 7, 1.5))


def demon(c: Canvas, p: Pose, s: dict):
    """Horned imp/fiend (Null Fiend etc.) — humanoid-ish with wings."""
    d = D(c, p)
    col = hexc(s['color'])
    lean, bob = d.lean, d.bob
    flap = {0: -3, 1: 0, 2: 3}[p.wing]
    back = d.part(lean, bob)
    back.poly([(13, 15), (1, 6 + flap), (3, 13 + flap * 0.5), (5, 12 + flap * 0.5), (7, 18)], dark(col, 0.25))
    back.line(12, 25, 5, 27, col, w=1.4)
    back.poly([(5, 25.5), (2, 27), (5, 28.5)], col)
    d.put(back)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((13, 19)):
        off = p.step * (1.4 if i else -1.4)
        legs.rect(lx - 2 + off, 23, lx + 2 + off, 30.3, dark(col, 0.08) if i else dark(col, 0.18))
    d.put(legs)
    body = d.part(lean, bob)
    body.ellipse(16, 20, 7.5, 6.5, col)
    if s.get('zero'):
        body.ellipse(17, 20.5, 3.4, 4.0, '#ffe066', shade=False)
        body.ellipse(17, 20.5, 1.8, 2.4, col, shade=False)
    d.put(body)
    head = d.part(lean, bob)
    head.poly([(12, 6), (9, -0.5), (15, 4)], '#f4ecd8')
    head.poly([(19, 4), (24, -0.5), (22, 6.5)], '#f4ecd8')
    head.ellipse(17, 9.5, 7.0, 6.0, col)
    L = head
    ec = hexc(s.get('eye', '#ffea3a'))
    L.poly([(17, 8), (21, 9), (17, 10.5)], ec)
    L.poly([(21.5, 9), (24.5, 8), (24, 10.5)], ec)
    L.poly([(18, 13), (24, 13), (22.5, 14.5), (19, 14.5)], dark(col, 0.5))
    L.dot(19.5, 13, WHITE)
    L.dot(22.5, 13, WHITE)
    d.put(head)
    front = d.part(lean, bob)
    hx, hy = ARM_HAND[p.arm]
    front.line(19, 17, hx, hy, col, w=2.6)
    front.poly([(hx, hy - 1.5), (hx + 3, hy - 3), (hx + 1.5, hy + 1.5)], '#f4ecd8')
    d.put(front)
    finish(c, d)


# ─── Sea creatures (whale boss, octopus, seal) ───────────────────────────────


def whale(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    wave = p.frame % 2
    L.ellipse(15, 21, 13, 8.5, col)
    L.ellipse(17, 25, 10, 4, '#dff2ff')
    L.poly([(3, 19), (-1, 12 + wave * 2), (2, 18), (-1.5, 22), (4, 22)], dark(col, 0.1))
    L.ellipse(15, 27, 4, 2, dark(col, 0.15), rot=0.3)
    for i in range(4):
        L.line(20 + i * 1.8, 23.5, 20 + i * 1.8, 27, dark(col, 0.12), w=0.5)
    d.eyes(L, [(22, 18)])
    L.line(24, 22.5, 28, 22, dark(col, 0.45), w=0.6)
    if s.get('crown'):
        L.poly([(9, 13.5), (9, 9), (12, 11.5), (14.5, 7.5), (17, 11.5), (20, 8.5), (20, 13.5)], '#ff8fa3')
    jet = 4 if p.arm in ('raise', 'strike') else 2 + wave
    L.line(13.5, 12, 13.5, 12 - jet, '#9ae0ff', w=1.2)
    L.ellipse(11.5, 12 - jet, 2, 1.4, '#c8f0ff')
    L.ellipse(15.5, 12 - jet, 2, 1.4, '#c8f0ff')
    d.put(L)
    finish(c, d)


def octopus(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    for i, tx in enumerate((8, 11.5, 15, 18.5, 22)):
        curl = 1.5 if (i + p.frame) % 2 else -1.5
        L.line(tx, 20, tx + curl, 28, dark(col, 0.05) if i % 2 else col, w=2.2)
        L.ellipse(tx + curl + (1 if curl > 0 else -1), 29, 1.5, 1.2, col)
    L.ellipse(15, 13.5, 9, 8.5, col)
    for (x, y) in ((10, 11), (13, 7.5), (9, 16)):
        L.dot(x, y, light(col, 0.2), w=2, h=2)
    if s.get('hat'):
        L.ellipse(14, 5.5, 7.5, 2.0, s['hat'])
        L.rect(10, 1, 18, 5.5, s['hat'])
        L.rect(10, 4, 18, 5, '#ffe066', shade=False)
    if s.get('minus'):
        L.rect(9.5, 8.5, 14.5, 10, WHITE, shade=False)
        L.rect(8, 16, 11, 17, light(col, 0.35), shade=False)
    ex = [17.5, 21]
    d.eyes(L, [(x, 13) for x in ex])
    if s.get('brow') and ex and not p.hurt:
        L.line(ex[0] - 1.2, 10.8, ex[0] + 1.2, 11.8, dark(col, 0.5), w=0.8)
        L.line(ex[1] + 1.2, 10.8, ex[1] - 1.2, 11.8, dark(col, 0.5), w=0.8)
    if s.get('friendly') and d.sep:
        # Smudge (#75 item 15e): round pink cheeks and a big smile — a friend, not an Inkling.
        L.ellipse(16, 16.4, 1.4, 1.4, '#ff9ab8', shade=False)
        L.ellipse(23.4, 16.4, 1.4, 1.4, '#ff9ab8', shade=False)
        L.line(18, 17.6, 21.6, 17.6, dark(col, 0.5), w=0.7)
        L.dot(17.6, 17, dark(col, 0.5))
        L.dot(22, 17, dark(col, 0.5))
    elif d.sep:
        L.dot(20, 17, dark(col, 0.4), w=2, h=1)
    d.put(L)
    if s.get('ink') and p.arm in ('strike', 'follow'):
        # A squirt of ink ahead of it as it strikes (#75 item 14d: the Inkling).
        ink = d.part(d.lean, d.bob)
        spread = 1.0 if p.arm == 'follow' else 0.0
        for (x, y, r) in ((25, 17, 2.2), (28, 15, 2.6 + spread), (29.5, 19, 2.0 + spread)):
            ink.ellipse(x, y, r, r * 0.85, '#2a2440', shade=False)
        d.put(ink, outline=False)
    if s.get('loot'):
        grab = d.part(d.lean, d.bob)
        tip = {'raise': (25, 4), 'strike': (30, 14), 'follow': (28, 17)}.get(p.arm, (27, 8))
        mid = (24.5, 15)
        grab.line(20, 18, mid[0], mid[1], dark(col, 0.05), w=2.0)
        grab.line(mid[0], mid[1], tip[0], tip[1] + 2, dark(col, 0.05), w=1.6)
        grab.ellipse(tip[0], tip[1], 2.4, 2.4, '#ffcf3a')
        grab.dot(tip[0] - 0.5, tip[1] - 1, '#fff4b0')
        d.put(grab)
    finish(c, d)


def seal(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    L.ellipse(6.5, 27.5, 4, 2, dark(col, 0.1), rot=-0.4)
    L.ellipse(14, 23, 9.5, 6.5, col)
    L.ellipse(16, 25, 6, 3.5, light(col, 0.18))
    L.ellipse(21, 14, 6.0, 5.8, col)
    L.ellipse(24.5, 16, 3.0, 2.2, light(col, 0.18))
    L.dot(27, 14.8, (40, 25, 35), w=2, h=1)
    L.ellipse(19, 26.5, 3.5, 1.8, dark(col, 0.12), rot=0.5)
    d.eyes(L, [(21.5, 12.5)])
    if s.get('hat'):
        L.ellipse(20, 9, 8, 1.8, '#e8c86a')
        L.ellipse(20, 7.5, 4.5, 2.5, '#e8c86a')
    d.put(L)
    finish(c, d)


# ─── Sea critters (#75 item 14d) — they swim the Silver Shallows ─────────────


def puffer(c: Canvas, p: Pose, s: dict):
    """A round puffer fish with little spikes, a fan tail and a pursed "o" — it
    puffs up bigger to attack, and a couple of bubbles rise beside it."""
    d = D(c, p)
    col = hexc(s['color'])
    belly = hexc(s.get('belly', '#fff2c8'))
    L = d.part(d.lean, d.bob)
    puff = 1 if p.arm in ('raise', 'strike') else 0
    r = 8.5 + puff * 1.5 - p.squash * 0.3
    cx, cy = 15, 17
    wag = 1.5 if p.frame % 2 else -1.5
    L.poly([(cx - r + 1, cy), (cx - r - 6, cy - 5 + wag), (cx - r - 4.5, cy), (cx - r - 6, cy + 5 + wag)], dark(col, 0.12))
    if s.get('fish'):
        # Bloop (#75 item 15e review): a plain round fish — a big tail fin and a fin on top, no spikes.
        L.poly([(cx - r + 1, cy), (cx - r - 7, cy - 7 + wag), (cx - r - 4, cy), (cx - r - 7, cy + 7 + wag)], dark(col, 0.08))
        L.poly([(cx - 4, cy - r + 1.5), (cx + 1, cy - r - 4), (cx + 4, cy - r + 1.5)], dark(col, 0.08))
        for x in (cx - 2, cx + 2):
            L.line(x, cy - r + 2, x, cy + r - 2, light(col, 0.3), w=1.2)
    else:
        for i in range(12):
            a = i * math.tau / 12 + 0.13
            L.line(cx + math.cos(a) * (r - 1), cy + math.sin(a) * (r - 1),
                   cx + math.cos(a) * (r + 2.2 + puff), cy + math.sin(a) * (r + 2.2 + puff), dark(col, 0.25), w=1.0)
    L.ellipse(cx, cy, r, r * 0.92, col)
    if s.get('fish'):
        for x in (cx - 2.5, cx + 2):
            L.line(x, cy - r + 2.2, x, cy + r - 2.2, '#ffffff', w=1.1)
    L.ellipse(cx + 1, cy + r * 0.45, r * 0.75, r * 0.4, belly)
    for (x, y) in ((cx - 4, cy - 4), (cx - 1, cy - 6), (cx - 5.5, cy), (cx + 2, cy - 3)):
        L.dot(x, y, dark(col, 0.2), w=2, h=2)
    L.poly([(cx - 1, cy + 1), (cx - 5, cy + 4 - wag * 0.5), (cx - 1.5, cy + 4)], light(col, 0.15))
    ex = face_x(p, [cx + 4.5], [cx - 3, cx + 3])
    d.eyes(L, [(x, cy - 2.5) for x in ex])
    if d.sep and p.facing == 'side':
        L.ellipse(cx + r - 1, cy + 1.5, 1.1, 1.2, dark(col, 0.45), shade=False)
    d.put(L)
    if d.sep:  # bubbles only at battle size — on the map the outline pass turns them into a smudge
        b = d.part(d.lean, 0)
        rise = (p.frame % 3) * 2
        for (x, y0, rr) in ((27, 12, 1.2), (29, 7, 0.9)):
            y = y0 - rise
            b.ellipse(x, y, rr, rr, '#d8f2ff', shade=False)
            b.erase_ellipse(x - rr * 0.3, y - rr * 0.3, rr * 0.4, rr * 0.4)
        d.put(b, outline=False)
    finish(c, d)


def starfish(c: Canvas, p: Pose, s: dict):
    """A five-armed sea star that turns a little as it moves. One arm is a
    short stub with a bandage: it's regrowing — sea stars really do."""
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    cx, cy = 16, 18
    spin = (p.frame % 2) * 0.12 + {'strike': 0.25, 'raise': -0.2}.get(p.arm, 0)

    def arm_angle(i):
        return -math.pi / 2 + i * math.pi / 5 + spin

    pts = []
    for i in range(10):
        if i % 2:
            rr = 5.6  # chunky arms, so it reads at map size (#75 item 14d review)
        else:
            rr = (9 if i == 4 else 12.5) - p.squash * 0.4  # arm 4 is the one regrowing
        pts.append((cx + math.cos(arm_angle(i)) * rr, cy + math.sin(arm_angle(i)) * rr))
    L.poly(pts, col)
    for i in range(0, 10, 2):
        for k in ((4.5,) if i == 4 else (4.5, 7.5)):
            L.dot(cx + math.cos(arm_angle(i)) * k, cy + math.sin(arm_angle(i)) * k, light(col, 0.3))
    bx, by = cx + math.cos(arm_angle(4)) * 5.5, cy + math.sin(arm_angle(4)) * 5.5
    L.rect(bx - 1.6, by - 1, bx + 1.6, by + 1, '#fff4e8', shade=False)
    if p.facing != 'up':
        d.eyes(L, [(cx - 2, cy - 2), (cx + 2, cy - 2)])
        if d.sep:
            L.line(cx - 1.5, cy + 1.5, cx + 1.5, cy + 1.5, dark(col, 0.5), w=0.6)
    d.put(L)
    finish(c, d)


UMBRA_ARMOR = hexc('#1a1226')
UMBRA_PURPLE = hexc('#7a3ad0')
UMBRA_CAPE = hexc('#2a1048')
UMBRA_HELM = hexc('#eceaf2')
UMBRA_BLADE = '#c890ff'


def umbra(c: Canvas, p: Pose, s: dict):
    """Umbra, the Forgotten One: an armoured shadow-lord in a white war-helm."""
    d = D(c, p)
    back = p.facing == 'up'
    step = p.step
    # cape (behind everything)
    C = d.part(d.lean * 0.3, d.bob)
    sway = (p.frame % 2) * 0.8
    C.poly([(8, 11), (24, 11), (27 + sway, 30), (5 - sway, 30)], UMBRA_CAPE)
    d.put(C)
    # legs
    Lg = d.part(d.lean * 0.5, d.bob)
    Lg.rect(11.5, 23, 15, 30 - max(step, 0), UMBRA_ARMOR)
    Lg.rect(17, 23, 20.5, 30 - max(-step, 0), UMBRA_ARMOR)
    Lg.rect(11, 28.5 - max(step, 0), 15.5, 30.5 - max(step, 0), dark(UMBRA_PURPLE, 0.3))
    Lg.rect(16.5, 28.5 - max(-step, 0), 21, 30.5 - max(-step, 0), dark(UMBRA_PURPLE, 0.3))
    d.put(Lg)
    # torso
    B = d.part(d.lean * 0.6, d.bob)
    B.rect(10, 12, 22, 24, UMBRA_ARMOR)
    B.ellipse(9.5, 13, 3.4, 2.6, UMBRA_PURPLE)       # shoulder plates
    B.ellipse(22.5, 13, 3.4, 2.6, UMBRA_PURPLE)
    B.rect(10, 21, 22, 23, dark(UMBRA_PURPLE, 0.2))  # belt
    B.rect(14.5, 20.6, 17.5, 23.4, '#c8c4d4')  # buckle
    if not back:
        B.rect(13, 14.5, 19, 18.5, '#2e2440', shade=False)   # chest panel
        for i, col in enumerate(('#ff4a6a', '#6ad0ff', '#c890ff', '#7aff8a')):
            B.dot(13.8 + i * 1.4, 15.6, col)
        B.rect(13.6, 17, 18.4, 17.8, UMBRA_PURPLE, shade=False)
    else:
        B.rect(15, 13, 17, 21, dark(UMBRA_CAPE, 0.1), shade=False)
    d.put(B)
    # arms + energy blade
    A = d.part(d.lean * 0.7, d.bob)
    up = {'raise': 5, 'strike': -2, 'follow': 1}.get(p.arm, 0)
    A.line(8.5, 14, 7.5, 21, UMBRA_ARMOR, w=2.6)               # left arm
    A.ellipse(7.5, 21.5, 1.4, 1.3, dark(UMBRA_PURPLE, 0.2))
    hx, hy = 24, 20 - up
    A.line(23.5, 14, hx, hy, UMBRA_ARMOR, w=2.6)               # sword arm
    d.put(A)
    S = d.part(d.lean, d.bob)  # violet energy blade
    tip = {'raise': (24.5, 1), 'strike': (31, 18), 'follow': (30, 12)}.get(p.arm, (27.5, 6))
    S.line(hx, hy, *tip, UMBRA_BLADE, w=1.9)  # glow
    S.line(hx, hy, *tip, '#f4e8ff', w=0.7)  # core
    S.rect(hx - 1, hy - 0.2, hx + 1, hy + 2.2, '#9a96a8')  # hilt
    d.put(S, outline=False)
    # helmet
    H = d.part(d.lean * 0.6, d.bob)
    H.ellipse(16, 7.5, 5.6, 5.4, UMBRA_HELM)                    # dome
    H.rect(10.6, 7.5, 21.4, 11.6, UMBRA_HELM)                   # flared cheek guards
    H.poly([(10, 11.6), (22, 11.6), (21, 12.8), (11, 12.8)], dark(UMBRA_HELM, 0.12))
    H.rect(15.4, 2.2, 16.6, 6.8, UMBRA_PURPLE, shade=False)     # crest stripe
    if not back:
        ec = (255, 255, 255) if p.hurt else (14, 8, 24)
        H.poly([(11.6, 7.2), (15.2, 7.6), (14.8, 9.6), (12, 9.2)], ec, shade=False)   # angled lenses
        H.poly([(20.4, 7.2), (16.8, 7.6), (17.2, 9.6), (20, 9.2)], ec, shade=False)
        if not p.hurt and not p.blink:
            H.dot(13, 8.2, '#c890ff'); H.dot(18.6, 8.2, '#c890ff')            # lens glint
        H.poly([(13, 10.2), (19, 10.2), (18, 12.6), (14, 12.6)], (30, 20, 44), shade=False)  # breather grille
        for x in (14.6, 15.6, 16.6):
            H.rect(x, 10.6, x + 0.5, 12.2, UMBRA_PURPLE, shade=False)
        H.poly([(11.2, 9.8), (12.6, 10.4), (12.2, 12.4), (11, 12)], dark(UMBRA_HELM, 0.25), shade=False)   # cheek vents
        H.poly([(20.8, 9.8), (19.4, 10.4), (19.8, 12.4), (21, 12)], dark(UMBRA_HELM, 0.25), shade=False)
    else:
        H.rect(13, 9, 19, 11, dark(UMBRA_HELM, 0.15), shade=False)
    d.put(H)
    finish(c, d, shadow=(16, 30.5, 9, 1.5))


# ─── Batch-1 critters (Raven Prince, Knight-Mare) ─────────────────


def duck(c: Canvas, p: Pose, s: dict):
    """Waddling bird (duck, or raven with kind='raven') carrying a pie cut into equal slices."""
    d = D(c, p)
    col = hexc(s['color'])
    bill = hexc(s.get('bill', '#ff9a2a'))
    raven = s.get('kind') == 'raven'
    lean, bob = d.lean, d.bob
    feet = d.part(lean * 0.4, 0)
    for i, fx in enumerate((12.5, 17.5)):
        off = p.step * (1.5 if i else -1.5)
        if raven:  # thin dark legs and claws
            leg = hexc(s.get('legs', '#3a3848'))
            feet.line(fx + off, 25, fx + off, 29.5, leg, w=0.9)
            feet.line(fx + off, 29.5, fx + 2.5 + off, 30, leg, w=0.7)
            feet.line(fx + off, 29.5, fx - 1.5 + off, 30, leg, w=0.7)
        else:
            feet.line(fx + off, 25, fx + off, 28.5, bill, w=1.0)
            feet.poly([(fx - 1 + off, 28.2), (fx + 3.5 + off, 28.2), (fx + 3 + off, 30.2), (fx - 1 + off, 30.2)], dark(bill, 0.08))
    d.put(feet)
    waddle = (0.6 if p.frame % 2 else -0.6) * (1 if p.step else 0)
    body = d.part(lean, bob)
    if raven:
        body.poly([(8, 18.5), (0.5, 22), (1.5, 24.5), (8.5, 22.5)], dark(col, 0.06))  # long wedge tail
        body.ellipse(14, 20.5, 8.5, 5.4, col, rot=-0.15 + waddle * 0.08)
        body.ellipse(15.5, 22.5, 5.5, 2.4, light(col, 0.08))
    else:
        body.poly([(7.5, 19), (3, 14), (5, 20.5)], light(col, 0.05))  # perky tail
        body.ellipse(14, 21.5, 8.5, 5.6, col, rot=waddle * 0.08)
        body.ellipse(15.5, 23.5, 5.5, 2.6, light(col, 0.18))
    d.put(body)
    head = d.part(lean, bob)
    if raven:
        head.poly([(18, 16), (20.5, 19.5), (22, 15.5), (23.5, 18.5), (24, 14)], col)  # shaggy throat
        head.ellipse(21, 11.5, 4.4, 4.2, col)
        # heavy, slightly hooked beak
        head.poly([(23.5, 10), (29.5, 12.2), (30.5, 13.6), (24, 14.2)], bill)
        head.line(24.5, 12.6, 29.5, 13.2, dark(bill, 0.3), w=0.4)
        head.poly([(19, 7.8), (20.5, 5.5), (22, 7.6)], dark(col, 0.04))  # ruffled crown
        d.eyes(head, [(22.5, 10.5)], color=hexc(s.get('eye', '#ffd24a')), shine=False)
        if d.sep and not p.hurt:
            head.line(20.8, 8.6, 24, 9.4, light(col, 0.35), w=0.6)  # a grumpy brow
        if d.sep:
            head.dot(19.5, 10, light(col, 0.3))  # glossy sheen
    else:
        head.ellipse(21, 12.5, 4.6, 4.4, col)
        head.ellipse(26, 14, 3.2, 1.3, bill)
        head.ellipse(25.5, 15.3, 2.6, 0.9, dark(bill, 0.12))
        if s.get('tuft'):
            head.poly([(19, 8.5), (20, 5.5), (21, 8.5)], dark(col, 0.08))
        d.eyes(head, [(22.5, 11)])
        if d.sep and not p.hurt:
            head.line(21, 9, 24, 9.8, dark(col, 0.55), w=0.6)  # a grumpy brow
    d.put(head)
    wing = d.part(lean, bob)
    wing.ellipse(12, 20.5 if not raven else 19.5, 4.6 if raven else 4.2, 2.6, light(col, 0.1 if raven else 0.04), rot=0.25)
    d.put(wing)
    if s.get('crown'):
        # a crown far too big for his head, slumped down around his neck
        cr = d.part(lean, bob)
        gold = hexc(s['crown'])
        oy = 0.8  # how far it has slipped down
        cr.poly([(15.5, 15 + oy), (26, 16.8 + oy), (25.4, 19.8 + oy), (15, 18 + oy)], gold)  # wide band, tilted
        for (x, y) in ((16.4, 15.1 + oy), (20.8, 15.9 + oy), (25, 16.7 + oy)):  # points
            cr.poly([(x - 1.4, y + 0.3), (x, y - 3), (x + 1.4, y + 0.5)], gold)
            cr.dot(x - 0.3, y - 3.4, light(gold, 0.3))  # ball tips
        cr.dot(20.3, 17.3 + oy, '#e0304a', w=1.6, h=1.4)  # ruby
        if d.sep:
            cr.dot(17.3, 16.9 + oy, '#4ad0ff')
            cr.dot(23.8, 18.1 + oy, '#4ad0ff')
        d.put(cr)
    # the pie, seen from above: golden crust cut into slices, one already gone
    pie = d.part(lean, bob)
    py = {'raise': 13.5, 'strike': 21, 'follow': 23}.get(p.arm, 24)
    px = {'strike': 26, 'raise': 25}.get(p.arm, 23.5)
    pie.ellipse(px, py, 4.0, 3.4, '#c8783a')
    pie.ellipse(px - 0.3, py - 0.3, 2.6, 2.1, '#f0c070', shade=False)
    cut = '#6a3010'
    pie.line(px - 3.8, py, px + 3.8, py, cut, w=0.5)
    pie.line(px, py - 3.3, px, py + 3.3, cut, w=0.5)
    pie.erase_ellipse(px + 2.8, py - 2.6, 2.4, 2.1)  # one slice already eaten
    pie.dot(px + 0.5, py - 1.2, '#e04a5a')
    pie.dot(px + 1.2, py - 0.6, '#e04a5a')
    d.put(pie)
    finish(c, d, shadow=(15, 30.5, 8, 1.3))


def parrot(c: Canvas, p: Pose, s: dict):
    """An upright pirate parrot; costume and colours come from params."""
    d = D(c, p)
    col = hexc(s['color'])
    wing = hexc(s.get('wing', dark(col, 0.1)))
    band = hexc(s.get('band', '#ffd23a'))
    tail = hexc(s.get('tail', wing))
    lean, bob = d.lean, d.bob
    hop = -0.8 if p.step and p.frame % 2 else 0.0
    feet = d.part(lean * 0.4, 0)
    leg = hexc(s.get('legs', '#8a8a9a'))
    feet.line(15, 25, 14.5 + p.step * 0.6, 29.6, leg, w=0.9)
    feet.line(13 + p.step * 0.6, 30, 16.5 + p.step * 0.6, 30, leg, w=0.8)
    if s.get('peg'):
        feet.line(18.5, 25, 18.5 - p.step * 0.6, 30, '#9a6a3a', w=1.3)  # wooden peg leg
    else:
        feet.line(18.5, 25, 18.5 - p.step * 0.6, 29.6, leg, w=0.9)
        feet.line(17 - p.step * 0.6, 30, 20.5 - p.step * 0.6, 30, leg, w=0.8)
    d.put(feet)
    T = d.part(lean, bob + hop)
    T.poly([(12.5, 21), (6.5, 30.5), (9, 31), (15, 23)], tail)  # long tail feathers
    T.poly([(13.5, 22), (9.5, 31), (11.5, 31), (15.5, 23.5)], dark(tail, 0.12))
    d.put(T)
    B = d.part(lean, bob + hop)
    B.ellipse(16, 18.5, 5.6, 7.4, col, rot=0.25)
    if s.get('chest'):
        B.ellipse(18, 19.5, 3, 5.2, s['chest'], rot=0.25)
    d.put(B)
    W = d.part(lean, bob + hop)
    flare = {'raise': -0.9, 'strike': 0.5, 'follow': 0.3}.get(p.arm, 0.0)
    W.ellipse(13.8, 18.5, 3.6, 6.4, wing, rot=0.35 + flare)
    W.ellipse(13.2 + flare * 2, 16.2, 2.6, 2.2, band, rot=0.35 + flare)  # shoulder band
    W.ellipse(12.2 - flare, 23.5, 2.0, 2.8, dark(wing, 0.18), rot=0.35 + flare)  # flight-feather tips
    d.put(W)
    H = d.part(lean, bob + hop)
    H.ellipse(19, 10, 5, 4.7, col)
    if s.get('face'):
        H.ellipse(21.3, 11, 2.3, 2.1, s['face'], shade=False)
    gape = 1.4 if p.arm in ('strike', 'raise') or p.hurt else 0.0
    bk = hexc(s.get('beak', '#f0e8d0'))
    H.poly([(22.5, 12.5 + gape * 0.3), (25.3, 13 + gape), (23.5, 14.8 + gape)], dark(bk, 0.35))  # lower beak
    H.poly([(22, 8.2), (25.5, 8.6), (27.6, 11.6), (26.4, 14.6), (25, 12.6), (22, 12.6)], bk)  # hooked upper beak
    d.eyes(H, [(21.4, 9.4)], shine=True)
    if s.get('earring'):
        H.ellipse(17.6, 13.6, 1.3, 1.3, '#ffcf3a', shade=False)
        H.erase_ellipse(17.6, 13.6, 0.55, 0.55)
    hat = s.get('hat')
    hc = hexc(s.get('hat_color', '#2a2230'))
    H.dy -= 1.6  # hats perch above the eye
    if hat == 'bicorne':
        H.poly([(12, 8), (14, 3.5), (19, 1.8), (24, 3.5), (25.5, 7.2), (19, 6.2)], hc)
        H.line(13, 7.6, 25, 6.9, '#e0b040', w=0.6)
        H.line(17.6, 3.4, 17.6, 5.6, WHITE, w=0.5)  # a little pi on the hat
        H.line(19.4, 3.4, 19.4, 5.6, WHITE, w=0.5)
        H.line(16.8, 3.4, 20.2, 3.4, WHITE, w=0.5)
    elif hat == 'bandana':
        H.poly([(14.2, 9), (15.5, 5.2), (20, 4.6), (23.6, 6.6), (23.8, 8.2), (18, 7.6)], hc)
        H.poly([(14.5, 8), (10.5, 7.5 + (p.frame % 2)), (11, 10.5), (14.5, 9.5)], dark(hc, 0.1))  # knot tails
        if d.sep:
            for (x, y) in ((17, 6.2), (20, 5.6), (22.4, 6.8)):
                H.dot(x, y, WHITE)
    elif hat == 'tricorn':
        H.poly([(13.5, 7.5), (15, 3.2), (19.5, 1.8), (24, 4.2), (24.5, 7.6), (19, 6.4)], hc)
        H.line(14, 7.2, 24.2, 7.3, '#ffd24a', w=0.6)
        H.poly([(18.5, 1.9), (19.8, -0.6), (21, 2.2)], '#ffffff')  # feather
    H.dy += 1.6
    if s.get('patch') and not p.hurt:
        H.line(15.5, 7.4, 23.2, 11.4, '#2a2230', w=0.6)  # strap to the patch on the far eye
    d.put(H)
    if s.get('coin'):
        K = d.part(lean, bob + hop)
        cy = {'raise': 15, 'strike': 18}.get(p.arm, 21)
        cx = {'strike': 22.5}.get(p.arm, 20.5)
        K.ellipse(cx, cy, 2.6, 2.6, '#ffcf3a')
        K.line(cx - 1, cy - 0.9, cx - 1, cy + 1.2, '#a07010', w=0.45)  # pi stamp
        K.line(cx + 0.9, cy - 0.9, cx + 0.9, cy + 1.2, '#a07010', w=0.45)
        K.line(cx - 1.6, cy - 0.9, cx + 1.6, cy - 0.9, '#a07010', w=0.45)
        d.put(K)
    finish(c, d, shadow=(15, 30.8, 7, 1.2))


def mummy(c: Canvas, p: Pose, s: dict):
    """A little pharaoh mummy: wrapped up, arms out, one bandage coming loose."""
    d = D(c, p)
    wrap = hexc(s.get('color', '#e8dcc0'))
    seam = dark(wrap, 0.22)
    glow = hexc(s.get('glow', '#8affb0'))
    stripe_a = hexc(s.get('nemes', '#2a5ab0'))
    stripe_b = hexc(s.get('nemes2', '#ffcf3a'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((13.5, 18)):
        off = p.step * (1.4 if i else -1.4)
        legs.rect(lx - 1.7 + off, 23.5, lx + 1.7 + off, 30.3, wrap if i else dark(wrap, 0.08))
        legs.line(lx - 1.7 + off, 26.5, lx + 1.7 + off, 27.3, seam, w=0.4)
    d.put(legs)
    back = d.part(lean, bob)
    flap = 1.2 if p.frame % 2 else -0.6
    back.line(12, 10, 8, 12.5 + flap, dark(wrap, 0.05), w=1.1)  # a bandage coming loose
    back.line(8, 12.5 + flap, 4.5, 12 + flap * 1.6, dark(wrap, 0.05), w=1.0)
    d.put(back)
    body = d.part(lean, bob)
    body.rect(11, 13.5, 21.5, 24.5, wrap)
    for i, y in enumerate((15.5, 18, 20.5, 23)):
        body.line(11, y + (0.6 if i % 2 else 0), 21.5, y + (0 if i % 2 else 0.6), seam, w=0.45)
    body.poly([(12, 13.5), (20.5, 13.5), (19, 16.5), (13.5, 16.5)], stripe_b)  # gold collar
    body.line(13, 15, 19.5, 15, stripe_a, w=0.6)
    d.put(body)
    head = d.part(lean, bob)
    # striped nemes headdress, then the wrapped face peeking out
    head.poly([(10, 14.5), (11.5, 5), (16.5, 2.8), (21.5, 5), (23, 14.5), (19.5, 12), (13.5, 12)], stripe_a)
    for y in (6.5, 9, 11.5):
        head.line(10.8, y + 1.2, 22.2, y + 1.2, stripe_b, w=0.6)
    head.ellipse(17.5, 8.8, 4.4, 4.2, wrap)
    head.line(13.3, 7.2, 21.8, 6.6, seam, w=0.45)
    head.line(13.3, 11.2, 21.8, 11.6, seam, w=0.45)
    if p.facing != 'up':
        head.rect(14.6, 8, 21.6, 10, (24, 16, 28), shade=False)  # the gap in the wraps
        if p.hurt:
            head.dot(17, 8.5, WHITE, w=2, h=1)
            head.dot(19.8, 8.5, WHITE, w=2, h=1)
        elif not p.blink:
            head.dot(17, 8.4, glow, w=1, h=1.4)
            head.dot(19.8, 8.4, glow, w=1, h=1.4)
    head.poly([(15, 2.8), (16.5, 0.5), (18, 2.8)], stripe_b)  # cobra crest
    d.put(head)
    reach = {'raise': (24, 9), 'strike': (29, 15.5), 'follow': (27, 18)}.get(p.arm, (26.5, 16 + (0.5 if p.frame % 2 else 0)))
    for dy, dx in ((0, 0), (3.2, -1)):  # both arms stretched out in front, classic mummy shuffle
        a = d.part(lean, bob)
        a.line(17.5 + dx, 16 + dy, reach[0] + dx, reach[1] + dy, dark(wrap, 0.07) if dy == 0 else wrap, w=1.8)
        a.line(reach[0] + dx - 2.5, reach[1] + dy - 0.8, reach[0] + dx - 2, reach[1] + dy + 0.8, seam, w=0.4)
        d.put(a)
    finish(c, d, shadow=(16, 30.8, 7, 1.3))


def _tentacle(L: Canvas, pts, w0: float, w1: float, col, sucker=None):
    """Tapering tentacle through `pts`; optional sucker dots along it."""
    n = len(pts) - 1
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        w = w0 + (w1 - w0) * i / max(n - 1, 1)
        L.line(a[0], a[1], b[0], b[1], col, w=w)
    if sucker is not None:
        for (x, y) in pts[1:-1:2]:
            L.dot(x, y + 0.6, sucker)


def kraken(c: Canvas, p: Pose, s: dict):
    """A sea kraken with sabre-tooth fangs."""
    d = D(c, p)
    col = hexc(s['color'])
    deep = dark(col, 0.14)
    suck = light(col, 0.35)
    fang = hexc(s.get('fang', '#f6eedc'))
    lean, bob = d.lean, d.bob
    sw = 1 if p.frame % 2 else -1  # tentacle sway
    back = d.part(lean, bob)
    # two big tentacles rearing up behind the mantle
    _tentacle(back, [(9, 18), (5, 14), (3, 9 + sw), (4.5, 5 + sw), (7, 4.5 + sw), (7.5, 6.5 + sw)], 2.6, 1.0, deep)
    _tentacle(back, [(21, 18), (26, 15), (29, 10 - sw), (28, 6.5 - sw), (26, 6.5 - sw)], 2.4, 1.0, deep)
    d.put(back)
    legs = d.part(lean * 0.6, bob * 0.5)
    for i, bx in enumerate((8.5, 12.5, 16.5, 20.5, 24)):
        dirn = -1 if bx < 16 else 1
        curl = sw if i % 2 else -sw
        pts = [(bx, 19), (bx + dirn * 1.0, 24), (bx + dirn * 2.2 + curl * 0.5, 28), (bx + dirn * 4.2, 29.5),
               (bx + dirn * 5.2, 28 + curl * 0.4)]
        _tentacle(legs, pts, 2.6, 1.0, col if i % 2 else dark(col, 0.06), sucker=suck if d.sep else None)
    d.put(legs)
    body = d.part(lean, bob)
    # tall mantle swept back, with a pair of fins at the top
    body.poly([(9.5, 7), (6, 2.5), (11.5, 4.5)], deep)
    body.ellipse(14.5, 10.5, 7.2, 8.6, col, rot=-0.3)
    body.ellipse(17, 16.5, 7.5, 4.5, col)
    for (x, y) in ((11, 6), (13.5, 3.5), (10, 11)):
        body.dot(x, y, light(col, 0.2), w=2, h=2)
    if s.get('minus'):
        body.rect(11, 8.5, 15.5, 10, WHITE, shade=False)
    d.put(body)
    face = d.part(lean, bob)
    ex = [17.8, 22]
    if p.facing != 'up':
        for x in ex:  # glaring eye-whites
            face.ellipse(x + 0.3, 11.8, 1.7, 1.6, WHITE, shade=False)
        d.eyes(face, [(x + 0.3, 11.3) for x in ex], h=2, shine=False)
        if not p.hurt:
            face.line(16, 9.2, 19.3, 10.4, dark(col, 0.5), w=0.9)
            face.line(24, 9.2, 20.7, 10.4, dark(col, 0.5), w=0.9)
    if p.facing != 'up':
        face.line(17, 16.2, 23, 16.2, dark(col, 0.55), w=0.7)  # a grim mouth line
    d.put(face, outline=False)
    teeth = d.part(lean, bob)
    # sabre-tooth fangs; longer when it lunges
    fl = {'strike': 6.5, 'follow': 6.0, 'raise': 5.5}.get(p.arm, 5.0)
    for fx in (18.6, 21.4):
        teeth.poly([(fx - 0.9, 16.4), (fx + 0.9, 16.4), (fx + 0.1, 16.4 + fl)], fang)
    d.put(teeth)
    if s.get('loot'):
        grab = d.part(lean, bob)
        tip = {'raise': (27, 3), 'strike': (25, 11.5), 'follow': (27, 15.5)}.get(p.arm, (28.5, 7))
        _tentacle(grab, [(24, 18), (27, 16), (tip[0], tip[1] + 2.5)], 2.0, 1.4, dark(col, 0.04))
        grab.ellipse(tip[0], tip[1], 2.4, 2.4, '#ffcf3a')
        grab.dot(tip[0] - 0.5, tip[1] - 1, '#fff4b0')
        d.put(grab)
    finish(c, d, shadow=(16, 30.6, 11, 1.3))


def _rot(pts, ang, cx=16.0, cy=29.5):
    cs, sn = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs) for x, y in pts]


def knight_mare(c: Canvas, p: Pose, s: dict):
    """An empty suit of armour riding a dapple-grey rocking horse."""
    d = D(c, p)
    steel = hexc(s.get('steel', '#a8b4c4'))
    wood = hexc(s.get('wood', '#8a5230'))
    coat = hexc(s.get('coat', '#ece6da'))
    mane = hexc(s.get('mane', '#c8343a'))
    glow = hexc(s.get('glow', '#7ef9ff'))
    # the whole toy rocks about the middle of its rocker
    ang = {2: -0.10, 3: 0.12, 4: 0.06, 5: -0.06}.get(p.frame, 0.0) if p.facing == 'side' else 0.0
    if p.frame < 6 and p.step:  # world walk: rock back and forth
        ang = 0.08 * p.step
    if p.hurt:
        ang = -0.12

    def R(*pts):
        return _rot(list(pts), ang)

    def pt(x, y):
        return R((x, y))[0]

    L = d.part(d.lean, d.bob)
    # rocker: a shallow arc
    xs = [4 + i * 2 for i in range(13)]
    arc = [(x, 29.5 - 3.2 * ((x - 16) / 12) ** 2) for x in xs]
    arc = R(*arc)
    for a, b in zip(arc, arc[1:]):
        L.line(a[0], a[1], b[0], b[1], dark(wood, 0.1), w=1.6)
    for lx, ly in ((9, 19), (11.5, 19), (20, 19), (22.5, 19)):
        x0, y0 = pt(lx, ly)
        x1, y1 = pt(lx + (-1 if lx < 16 else 1), 28.3)
        L.line(x0, y0, x1, y1, wood, w=1.4)
    tx, ty = pt(6.5, 17)
    L.poly(R((7, 16), (3, 18), (3.5, 23), (6, 19.5)), mane)  # yarn tail
    bx, by = pt(15, 17.5)
    L.ellipse(bx, by, 8.5, 4.2, coat, rot=ang)
    if d.sep:
        for (x, y) in ((11, 17), (13.5, 19), (17, 16.5), (19, 19)):
            gx, gy = pt(x, y)
            L.dot(gx, gy, dark(coat, 0.18))
    L.poly(R((19, 16.5), (22.5, 8), (25.5, 9), (23.5, 18)), coat)  # neck
    hx, hy = pt(26, 9.5)
    L.ellipse(hx, hy, 4.0, 2.4, coat, rot=0.45 + ang)
    L.poly(R((20, 15), (21.5, 8), (23.5, 7), (21.5, 13)), mane)  # mane
    L.poly(R((22.5, 7.5), (23.5, 4.5), (24.5, 7.5)), coat)  # ear
    ex, ey = pt(25.5, 8.5)
    L.dot(ex, ey, EYE)
    nx, ny = pt(29, 11)
    L.dot(nx, ny, dark(coat, 0.4))
    L.poly(R((11.5, 13.5), (18.5, 13.5), (19, 17), (11, 17)), mane)  # saddle blanket
    d.put(L)
    K = d.part(d.lean, d.bob)
    kx, ky = pt(14.5, 14)
    K.line(kx + 0.5, ky, kx + 2.5, ky + 6, dark(steel, 0.12), w=2.0)  # greave
    K.rect(kx - 3, ky - 8, kx + 3, ky + 0.5, steel)  # breastplate
    K.rect(kx - 3, ky - 3.5, kx + 3, ky - 2.5, dark(steel, 0.2), shade=False)  # belt
    K.ellipse(kx, ky - 11, 3.4, 3.4, light(steel, 0.05))  # helm
    if p.facing != 'up':
        K.rect(kx - 0.5, ky - 11.5, kx + 3.4, ky - 10.2, (10, 8, 20), shade=False)  # visor slit
        if not p.hurt:
            K.dot(kx + 0.8, ky - 11.2, glow)
            K.dot(kx + 2.4, ky - 11.2, glow)
        else:
            K.dot(kx + 1.5, ky - 11.2, WHITE, w=2, h=1)
    K.poly([(kx - 1, ky - 14), (kx - 5, ky - 18), (kx - 6.5, ky - 15), (kx - 2.5, ky - 13)], s.get('plume', '#7a4ad0'))
    d.put(K)
    A = d.part(d.lean, d.bob)
    lance = {'raise': (kx + 9, ky - 16), 'strike': (kx + 16, ky - 6), 'follow': (kx + 14, ky - 3)}.get(p.arm, (kx + 12, ky - 12))
    A.line(kx + 1, ky - 4, lance[0], lance[1], '#d8b878', w=1.0)
    A.poly([(lance[0] - 0.8, lance[1] - 0.8), (lance[0] + 2.2, lance[1] - 1.2 if lance[1] < ky - 7 else lance[1]), (lance[0] + 0.8, lance[1] + 0.8)], '#e8eef8')
    A.ellipse(kx + 2, ky - 5, 1.8, 1.8, dark(steel, 0.05))  # gauntlet
    d.put(A)
    finish(c, d, shadow=(16, 30.8, 10, 1.2))


# ─── Batch-2 critters (Magnetick, Germinator, Pulley Spider, Piston Boar) ────


def magnet_tick(c: Canvas, p: Pose, s: dict):
    """A horseshoe magnet on tick legs; its two poles spark at each other."""
    d = D(c, p)
    body = hexc(s.get('color', '#e0303a'))
    north = hexc(s.get('north', '#e0303a'))
    south = hexc(s.get('south', '#2a6ae0'))
    steel = hexc(s.get('steel', '#d8dee8'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10, 13.5, 18.5, 22)):
        off = (1 if (i + p.frame) % 2 else -1) * 0.7 * (1 if p.step else 0.4)
        dirn = -1 if lx < 16 else 1
        legs.line(lx, 25, lx + dirn * 2 + off, 28, dark(body, 0.35), w=0.9)
        legs.line(lx + dirn * 2 + off, 28, lx + dirn * 2.6 + off, 30.2, dark(body, 0.35), w=0.8)
    d.put(legs)
    m = d.part(lean, bob)
    pinch = {'raise': 1.2, 'strike': -1.0, 'follow': -0.5}.get(p.arm, 0.0)  # prongs flex on attack
    # the U: a fat bend at the bottom, two prongs standing up
    m.ellipse(16, 21.5, 8.5, 5, body)
    m.rect(7.5 - pinch, 9.5, 12.5 - pinch, 21.5, body)
    m.rect(19.5 + pinch, 9.5, 24.5 + pinch, 21.5, dark(body, 0.06))
    m.ellipse(16, 17.5, 3.5, 3.5, (0, 0, 0), shade=False)
    m.erase_ellipse(16, 16.5, 3.5, 4.5)  # hollow of the horseshoe
    d.put(m)
    poles = d.part(lean, bob)
    poles.rect(7.5 - pinch, 5.5, 12.5 - pinch, 9.5, north)
    poles.rect(19.5 + pinch, 5.5, 24.5 + pinch, 9.5, south)
    poles.rect(7.5 - pinch, 9.2, 12.5 - pinch, 10.4, steel, shade=False)
    poles.rect(19.5 + pinch, 9.2, 24.5 + pinch, 10.4, steel, shade=False)
    # tiny cross faces on each pole: they are arguing
    if d.sep and p.facing != 'up':
        for px, flip in ((10 - pinch, 1), (22 + pinch, -1)):
            poles.dot(px - 1.2 * flip, 7, EYE)
            poles.dot(px + 0.6 * flip, 6.7, EYE)
            poles.line(px - 1.6, 8.6, px + 1.6, 8.6 - 0.6 * flip, EYE, w=0.4)
    d.put(poles)
    # the big shared face on the bend
    face = d.part(lean, bob)
    d.eyes(face, [(x, 21.5) for x in face_x(p, [17.5, 21], [13.5, 18.5])])
    if d.sep and p.facing != 'up':
        face.dot(18.5, 24, dark(body, 0.45), w=2, h=1)
    d.put(face, outline=False)
    zap = d.part(lean, bob)
    if p.frame % 2 or p.arm in ('strike', 'raise'):  # field spark between the poles
        y = 4 if p.arm != 'strike' else 6
        zap.line(12.5, y + 2, 15, y, '#ffe23a', w=0.6)
        zap.line(15, y, 17, y + 2, '#ffe23a', w=0.6)
        zap.line(17, y + 2, 19.5, y, '#ffe23a', w=0.6)
    d.put(zap, outline=False)
    finish(c, d, shadow=(16, 30.8, 9, 1.2))


def microbe(c: Canvas, p: Pose, s: dict):
    """A wobbly germ with cilia, a nucleus, sunglasses and a bud splitting off."""
    d = D(c, p)
    col = hexc(s['color'])
    lean, bob = d.lean, d.bob
    wob = 0.5 if p.frame % 2 else -0.5
    hover = -1 if p.frame % 2 else 0
    cx, cy = 16, 17 + hover * 0.3
    bud = d.part(lean * 0.6, bob)
    bs = 3.2 + (0.6 if p.frame % 2 else 0)  # the bud pulses as it splits off
    bud.line(10, cy + 1, 5.5, cy + 3, dark(col, 0.08), w=2.4)
    bud.ellipse(5, cy + 3.5, bs, bs, light(col, 0.05))
    bud.dot(4, cy + 2.5, dark(col, 0.3), w=2, h=2)
    d.put(bud)
    cil = d.part(lean, bob)
    for i in range(14):  # cilia waving round the edge
        a = i / 14 * 2 * math.pi + (0.12 if (i + p.frame) % 2 else -0.12)
        x0, y0 = cx + math.cos(a) * 8.2, cy + math.sin(a) * 7.2
        x1, y1 = cx + math.cos(a) * 10.4, cy + math.sin(a) * 9.4
        cil.line(x0, y0, x1, y1, dark(col, 0.2), w=0.6)
    d.put(cil, outline=False)
    B = d.part(lean, bob)
    B.ellipse(cx, cy, 8.6 + wob * 0.4, 7.8 - wob * 0.4, col)
    B.ellipse(cx - 3.5, cy + 2.5, 2.8, 2.4, dark(col, 0.18))  # nucleus
    B.dot(cx - 4, cy + 2, light(col, 0.15), w=1, h=1)
    for (x, y) in ((cx + 2, cy + 4.5), (cx - 1, cy - 4.5), (cx + 5.5, cy + 2)):
        B.dot(x, y, light(col, 0.25), w=1, h=1)
    d.put(B)
    F = d.part(lean, bob)
    if p.facing != 'up':
        if p.hurt:  # glasses knocked crooked
            F.line(16, cy - 3.5, 23.5, cy - 1.5, '#1a1a24', w=1.6)
            d.eyes(F, [(18, cy - 2), (21.5, cy - 1)])
        else:
            F.rect(15.5, cy - 4, 24.2, cy - 2, '#1a1a24', shade=False)  # cool sunglasses
            F.rect(15.8, cy - 2.2, 19.4, cy - 1, '#1a1a24', shade=False)
            F.rect(20.4, cy - 2.2, 24, cy - 1, '#1a1a24', shade=False)
            F.dot(16.6, cy - 3.6, (150, 220, 255))
            F.dot(21.4, cy - 3.6, (150, 220, 255))
        grin = 1.2 if p.arm in ('strike', 'follow') else 0.6
        F.line(18, cy + 2, 21, cy + 2 + grin, dark(col, 0.5), w=0.6)
        F.line(21, cy + 2 + grin, 23.2, cy + 1.2, dark(col, 0.5), w=0.6)
    d.put(F, outline=False)
    finish(c, d, shadow=(16, 30.6, 7, 1.3))


def pulley_spider(c: Canvas, p: Pose, s: dict):
    """A hard-hatted spider dangling from a pulley, hoisting a little house on the far rope."""
    d = D(c, p)
    col = hexc(s.get('color', '#8a6ab0'))
    rope = hexc(s.get('rope', '#c8a870'))
    lean, bob = d.lean, d.bob
    drop = {'raise': -2.5, 'strike': 3.0, 'follow': 1.5}.get(p.arm, 0.0) + (0.8 if p.frame % 2 else 0.0)
    sy = 18 + drop  # spider's height on its rope
    rig = d.part(lean * 0.3, 0)
    rig.line(12, 1, 25.5, 1, '#6a5a4a', w=1.0)  # the beam it hangs from
    rig.ellipse(18.75, 3.6, 6.2, 2.6, '#8a96a8')  # wide pulley wheel
    rig.ellipse(18.75, 3.6, 1.2, 1.2, '#4a4a5a', shade=False)
    rig.line(13, 3.6, 13, sy - 4, rope, w=0.6)  # rope down to the spider
    rig.line(24.5, 3.6, 24.5, 14 - drop, rope, w=0.6)  # rope down to the house
    hy = 14 - drop  # a little house hangs from its roof peak
    rig.rect(21.3, hy + 2.6, 27.7, hy + 7.6, '#f0dcb0')  # walls
    rig.poly([(20.4, hy + 3), (24.5, hy - 0.4), (28.6, hy + 3)], '#d0443a')  # roof
    rig.rect(22.2, hy + 4.2, 24, hy + 5.8, '#7ac8f0', shade=False)  # window
    rig.rect(25, hy + 4.6, 26.6, hy + 7.6, '#8a5a30', shade=False)  # door
    rig.rect(26.4, hy - 0.2, 27.4, hy + 1.8, '#8a6a5a')  # chimney
    d.put(rig)
    legs = d.part(lean, bob)
    for i in range(3):
        sw = (0.8 if (i + p.frame) % 2 else -0.8)
        y0 = sy + i * 1.6
        for dirn, lc in ((-1, dark(col, 0.12)), (1, col)):
            kx, ky = 13 + dirn * (5 + i * 0.4), y0 - 2 + i * 1.8 + sw * dirn
            legs.line(13, y0, kx, ky, lc, w=0.8)
            legs.line(kx, ky, kx + dirn * 1, ky + 4 + i * 0.6, lc, w=0.7)
    d.put(legs)
    b = d.part(lean, bob)
    b.ellipse(13, sy + 3.5, 4.2, 4.6, col)  # abdomen
    b.dot(12, sy + 3, light(col, 0.2), w=2, h=1)
    b.ellipse(13, sy - 1.2, 3.2, 2.8, light(col, 0.05))  # head
    b.ellipse(13, sy - 3.8, 3.4, 1.8, '#ffc83a')  # hard hat
    b.rect(9.2, sy - 3.4, 16.8, sy - 2.6, '#e0a020', shade=False)  # hat brim
    if p.facing != 'up':
        d.eyes(b, [(13.2, sy - 1.5), (15, sy - 1.5)], h=1, shine=False)
        if d.sep:
            b.dot(14, sy, '#ff6060')  # little fangs mouth
    d.put(b)
    finish(c, d, shadow=(15, 30.8, 6, 1.2))


def piston_boar(c: Canvas, p: Pose, s: dict):
    """A boar on pumping piston legs, steam puffing from its exhaust."""
    d = D(c, p)
    fur = hexc(s.get('color', '#8a5a3a'))
    steel = hexc(s.get('steel', '#b0b8c8'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10, 13, 19.5, 22.5)):
        pump = (1.2 if (i + p.frame) % 2 else 0.0)  # pistons pump up and down
        col = steel if i % 2 else dark(steel, 0.12)
        legs.rect(lx - 1.4, 21.5, lx + 1.4, 25 + pump, col)  # cylinder
        legs.line(lx, 25 + pump, lx, 29.4, dark(steel, 0.3), w=0.8)  # rod
        legs.rect(lx - 1.5, 29.2, lx + 1.6, 30.6, '#4a4a58')  # foot
    d.put(legs)
    st = d.part(lean, bob)
    st.rect(18.5, 9.5, 20.5, 14.5, '#6a6a78')  # exhaust stack on the shoulders
    st.rect(18, 8.8, 21, 10, '#4a4a58', shade=False)
    puff = 1 if p.frame % 2 else 0
    st.ellipse(19 - puff, 6.5 - puff, 2.2 + puff * 0.4, 1.8, '#e8ecf4', shade=False)
    st.ellipse(16.5 - puff * 1.5, 3.8 - puff, 1.6, 1.3, '#d0d8e4', shade=False)
    d.put(st)
    body = d.part(lean, bob)
    body.ellipse(16, 18.5, 10, 5.8, fur)
    body.ellipse(17, 21.3, 7, 2.5, light(fur, 0.12))
    for x in (14.5, 16.5):  # a tuft of bristles left between the pistons
        body.poly([(x - 1, 13.6), (x + 0.3, 11), (x + 1.4, 13.6)], dark(fur, 0.3))
    body.rect(12, 16, 20, 17.2, steel, shade=False)  # riveted strap
    if d.sep:
        for x in (13, 16, 19):
            body.dot(x, 16.2, '#e8eef8')
    body.line(6.5, 17, 4, 15.5 + (p.frame % 2), dark(fur, 0.2), w=0.7)  # curly tail
    d.put(body)
    pist = d.part(lean, bob)
    # pistons bursting out of its back and rump, each pumping in turn
    brass = hexc(s.get('brass', '#d0a040'))
    for i, (bx, by, ang) in enumerate(((10, 13.8, -1.95), (13, 13.2, -1.6), (6.8, 16.5, -2.6), (7.2, 20.5, 3.0))):
        ext = 2.4 if (i + p.frame) % 2 else 0.6
        if p.arm == 'strike':
            ext = 3.0
        dx, dy = math.cos(ang), math.sin(ang)
        cx0, cy0 = bx + dx * 3.2, by + dy * 3.2  # end of the cylinder
        pist.line(bx, by, cx0, cy0, brass, w=2.4)  # brass cylinder
        pist.line(cx0 - dx * 0.3, cy0 - dy * 0.3, cx0, cy0, dark(brass, 0.3), w=2.6)  # cylinder lip
        pist.line(cx0, cy0, cx0 + dx * ext, cy0 + dy * ext, light(steel, 0.1), w=0.9)  # steel rod
        pist.ellipse(cx0 + dx * (ext + 0.6), cy0 + dy * (ext + 0.6), 1.1, 1.1, '#5a5a68')  # rod cap
    d.put(pist)
    head = d.part(lean, bob)
    head.ellipse(24, 17.5, 4.8, 4.4, fur)
    head.poly([(21, 13.5), (22, 10.5), (23.5, 13.5)], dark(fur, 0.15))  # ear
    head.ellipse(28, 19, 2.4, 2.2, '#e88a8a')  # snout
    head.dot(28.6, 18.5, '#7a3a3a')
    head.dot(29.4, 19.6, '#7a3a3a')
    tusk = '#f4ecd8'
    head.poly([(25.5, 20.5), (27.5, 15.5), (26.5, 20.8)], tusk)  # tusk
    if p.facing != 'up':
        d.eyes(head, [(24.5, 16)], color=(200, 40, 40) if not p.hurt else EYE)
        if not p.hurt:
            head.line(23, 14.2, 26, 15, dark(fur, 0.5), w=0.6)  # cross brow
    d.put(head)
    finish(c, d, shadow=(16, 30.9, 10, 1.2))


# ─── Batch-3 critters (Chromaria + Whispering Woods) ─────────────────────────


def flame_goblin(c: Canvas, p: Pose, s: dict):
    """A small goblin cupping a tiny flame it refuses to share."""
    d = D(c, p)
    skin = hexc(s.get('skin', '#6ab04a'))
    rag = hexc(s.get('tunic', '#6a4a3a'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((14, 17.5)):
        off = p.step * (1.1 if i else -1.1)
        legs.rect(lx - 1 + off, 26, lx + 1 + off, 29.6, dark(skin, 0.1 if i else 0.2))
        legs.ellipse(lx + 0.7 + off, 29.9, 1.7, 0.8, dark(skin, 0.25))
    d.put(legs)
    body = d.part(lean, bob)
    body.poly([(12.5, 19.5), (19.5, 19.5), (20.5, 27), (18.8, 26.2), (17, 27.4), (15.2, 26.2), (13.4, 27.4), (11.6, 26.4)], rag)  # ragged tunic
    body.line(12.4, 22.5, 20, 22.5, '#2a1a12', w=0.6)
    d.put(body)
    head = d.part(lean, bob)
    head.poly([(13.5, 14), (7.5, 11), (13.5, 16.5)], skin)  # pointy ears
    head.poly([(19.5, 14.2), (24.5, 10.5), (20, 16.5)], dark(skin, 0.06))
    head.ellipse(16.5, 15, 4.2, 4, skin)
    head.ellipse(20.2, 16.2, 1.2, 1.1, dark(skin, 0.1))  # warty nose
    head.poly([(12.5, 12.8), (14.5, 9.6), (18.5, 9.4), (20.5, 12.5), (16.5, 11.6)], dark(rag, 0.15))  # ragged hood
    if p.facing != 'up':
        ex = face_x(p, [16.8, 19.4], [14.6, 18])
        d.eyes(head, [(x, 14.4) for x in ex], color=(255, 190, 40) if not p.hurt else EYE, h=1, shine=False)  # lit by the flame
        if not p.hurt:
            head.line(ex[0] - 1.1, 12.8, ex[0] + 0.9, 13.6, '#2a3a1a', w=0.6)
            head.line(ex[1] + 1.1, 12.8, ex[1] - 0.9, 13.6, '#2a3a1a', w=0.6)
        head.line(15.5, 17.4, 20.2, 17.0, '#2a1a1a', w=0.6)  # sly grin
        if d.sep:
            head.poly([(17.2, 17.2), (18, 17.2), (17.6, 18.2)], WHITE, shade=False)
            head.poly([(18.8, 17.1), (19.6, 17.1), (19.2, 18.1)], WHITE, shade=False)
    d.put(head)
    hand = {'raise': (20, 14), 'strike': (25, 19), 'follow': (23.5, 21)}.get(p.arm, (21.5, 21.5))
    arm = d.part(lean, bob)
    arm.line(18.5, 20.5, hand[0], hand[1], skin, w=1.3)
    arm.ellipse(hand[0], hand[1] + 0.6, 1.6, 1, dark(skin, 0.05))  # cupped palm
    d.put(arm)
    big = {'raise': 1.5, 'strike': 2.0, 'follow': 1.6}.get(p.arm, 1.25)
    flick = 0.5 if p.frame % 2 else -0.4
    fx, fy = hand[0], hand[1] - 0.6
    f2 = d.part(lean, bob)
    for (sx, sy) in ((fx + 2.2, fy - 4.5 * big), (fx - 1.8, fy - 3.5 * big)) if p.frame % 2 else ((fx + 1.5, fy - 5 * big),):
        f2.dot(sx, sy, '#ffd23a')  # sparks
    f2.poly([(fx - 1.2 * big, fy), (fx + flick, fy - 4 * big), (fx + 1.2 * big, fy)], '#ff6a1a', shade=False)  # tiny flame
    f2.poly([(fx - 0.6 * big, fy), (fx + flick * 0.6, fy - 2.4 * big), (fx + 0.6 * big, fy)], '#ffe066', shade=False)
    d.put(f2, outline=False)
    finish(c, d, shadow=(16, 30.8, 5.5, 1.1))


def dog_knight(c: Canvas, p: Pose, s: dict):
    """A dog in a knight's helm and cape, carrying a sword in its mouth like a bone."""
    d = D(c, p)
    fur = hexc(s.get('fur', '#c8945a'))
    steel = hexc(s.get('steel', '#b8c2d0'))
    cape = hexc(s.get('cape', '#b0283a'))
    lean, bob = d.lean, d.bob
    C = d.part(lean * 0.6, bob)
    sway = 0.8 if p.frame % 2 else -0.4
    C.poly([(10, 15.5), (17, 15.5), (12.5, 24 + sway), (5, 23 + sway * 1.4)], cape)  # flowing cape
    d.put(C)
    tail = d.part(lean, bob)
    wag = 1.2 if p.frame % 2 else -0.6
    tail.line(8, 18, 4.5, 13 + wag, fur, w=1.6)
    d.put(tail)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10.5, 13, 18.5, 21)):
        off = p.step * (1.3 if i % 2 else -1.3)
        legs.rect(lx - 1.1 + off, 22, lx + 1.1 + off, 29.6, fur if i % 2 else dark(fur, 0.14))
        legs.rect(lx - 1.3 + off, 28.6, lx + 1.5 + off, 30.6, steel)  # armoured boots
    d.put(legs)
    B = d.part(lean, bob)
    B.ellipse(15.5, 19.5, 8, 4.8, fur)
    B.ellipse(17, 21.8, 5.5, 2.2, light(fur, 0.2))
    B.rect(12, 15.2, 19, 19.2, steel)  # breastplate saddle
    B.dot(15.5, 16.2, light(steel, 0.25), w=2, h=1)
    d.put(B)
    H = d.part(lean, bob)
    hx, hy = 22.5, 13.5
    H.ellipse(hx, hy, 4.4, 4, fur)
    H.ellipse(hx + 3.8, hy + 1.6, 2.8, 2, light(fur, 0.15))  # snout
    H.dot(hx + 6.2, hy + 0.8, '#2a1a1a', w=1, h=1)  # nose
    H.ellipse(hx - 3, hy + 1, 1.6, 3, dark(fur, 0.2), rot=0.3)  # floppy ear
    # knight's helm: a steel cap with a nose guard and a plume
    H.ellipse(hx - 0.4, hy - 3.2, 4.2, 2.4, steel)
    H.rect(hx - 4.4, hy - 3.2, hx + 3.6, hy - 2.2, dark(steel, 0.15), shade=False)
    H.poly([(hx - 1, hy - 5.2), (hx - 4, hy - 9.6 - (p.frame % 2) * 0.6), (hx - 2.2, hy - 5)], cape)  # plume
    if p.facing != 'up':
        d.eyes(H, [(hx + 1.6, hy - 0.6)], color=(230, 40, 50) if not p.hurt else EYE, h=1, shine=False)
        if not p.hurt:
            H.line(hx + 0.2, hy - 1.8, hx + 2.8, hy - 1.0, '#1a1420', w=0.6)  # stern brow under the helm
    # spiked collar
    H.rect(hx - 3.5, hy + 3, hx + 1, hy + 4.2, '#3a2a2a', shade=False)
    if d.sep:
        for x in (hx - 2.5, hx - 0.8):
            H.poly([(x - 0.4, hy + 4.2), (x + 0.4, hy + 4.2), (x, hy + 5.2)], steel, shade=False)
    d.put(H)
    # the sword, clamped crosswise in its jaws like a bone
    S = d.part(lean, bob)
    my = hy + 3.4
    reach = {'strike': 3.0, 'follow': 1.5, 'raise': -1.0}.get(p.arm, 0.0)
    gx = hx + 1.5 + reach
    tilt = -1.6 if p.arm == 'raise' else (0.6 if p.arm == 'strike' else 0.0)
    S.line(gx - 3, my + 0.4, gx, my, '#6a3a2a', w=1.0)  # grip
    S.ellipse(gx - 3.4, my + 0.45, 0.8, 0.8, '#e0b040')  # pommel
    S.line(gx, my - 2, gx + 0.2, my + 2, '#e0b040', w=0.9)  # crossguard
    S.line(gx + 0.4, my, gx + 9 + reach * 0.3, my + tilt, steel, w=1.1)  # blade
    S.line(gx + 0.4, my - 0.3, gx + 8.6 + reach * 0.3, my - 0.3 + tilt, light(steel, 0.3), w=0.35)
    d.put(S)
    finish(c, d, shadow=(15.5, 30.9, 9, 1.2))


def gargoyle(c: Canvas, p: Pose, s: dict):
    """A crouching stone gargoyle with bat wings, tagging walls with a spray can."""
    d = D(c, p)
    stone = hexc(s.get('color', '#8a8a96'))
    glow = hexc(s.get('glow', '#ff8a2a'))
    can = hexc(s.get('can', '#3ab0e0'))
    lean, bob = d.lean, d.bob
    flap = {0: -2.0, 1: 0.0, 2: 1.5}[p.wing]
    W = d.part(lean * 0.6, bob)
    W.poly([(12, 13), (2, 4 + flap), (3, 10 + flap), (1.5, 13 + flap), (4.5, 15), (3.5, 18), (10, 18)], dark(stone, 0.22))  # bat wing
    W.line(12, 13, 2, 4 + flap, dark(stone, 0.35), w=0.6)
    W.line(10, 15, 3, 10 + flap, dark(stone, 0.35), w=0.5)
    d.put(W)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((11.5, 18.5)):
        off = p.step * (1.0 if i else -1.0)
        legs.ellipse(lx + off, 26, 3, 3.4, dark(stone, 0.1 if i else 0.18))  # crouched haunches
        for k in range(3):  # talons
            legs.poly([(lx - 1.5 + k * 1.4 + off, 29), (lx - 1 + k * 1.4 + off, 30.6), (lx - 0.5 + k * 1.4 + off, 29)], '#4a4a54')
    d.put(legs)
    B = d.part(lean, bob)
    B.ellipse(15.5, 20.5, 6.5, 6, stone)
    for (x, y, col) in ((13, 18, '#ff4aa0'), (17.5, 23, '#3ae0a0'), (12, 23, '#ffd23a')):  # paint splats on the stone
        B.ellipse(x, y, 1.1, 0.9, col, shade=False)
    B.line(14, 16, 12.5, 19, dark(stone, 0.35), w=0.4)  # crack
    d.put(B)
    H = d.part(lean, bob)
    H.poly([(14.5, 8), (12.5, 2.5), (16.5, 6.5)], dark(stone, 0.2))  # horns
    H.poly([(19.5, 7), (21, 1.5), (21.5, 7.5)], dark(stone, 0.12))
    H.ellipse(18.5, 10.5, 5, 4.6, light(stone, 0.04))
    H.poly([(21.5, 10), (26, 11), (25.5, 13.5), (21.5, 13.5)], stone)  # snout
    if p.facing != 'up':
        d.eyes(H, [(19, 9.4), (21.6, 9.4)], color=glow if not p.hurt else WHITE, h=1, shine=False)
        if not p.hurt:
            H.line(17.6, 7.6, 20.2, 8.6, dark(stone, 0.55), w=0.7)  # heavy stone brow
            H.line(20.6, 8.6, 23, 7.6, dark(stone, 0.55), w=0.7)
        H.line(21.5, 13.2, 25.5, 13, '#1a1a22', w=0.6)  # mouth
        if d.sep:
            H.poly([(23, 13), (23.8, 13), (23.4, 14.6)], WHITE, shade=False)  # fangs
            H.poly([(24.6, 13), (25.4, 13), (25, 14.4)], WHITE, shade=False)
    d.put(H)
    A = d.part(lean, bob)
    hand = {'raise': (19, 11), 'strike': (25, 16), 'follow': (24, 19)}.get(p.arm, (22, 19))
    A.line(17, 18, hand[0], hand[1], stone, w=2)
    A.rect(hand[0] - 1, hand[1] - 3.6, hand[0] + 1.4, hand[1] + 0.6, can)  # spray can
    A.rect(hand[0] - 0.5, hand[1] - 4.6, hand[0] + 0.9, hand[1] - 3.5, '#d8dee8', shade=False)
    A.ellipse(hand[0], hand[1], 1.4, 1.4, light(stone, 0.05))
    d.put(A)
    if p.arm in ('strike', 'follow'):  # a cloud of spray paint
        sp = d.part(lean, bob)
        for (x, y, r) in ((hand[0] + 3, hand[1] - 4.5, 1.4), (hand[0] + 5, hand[1] - 5.5, 1.8), (hand[0] + 4.5, hand[1] - 2.5, 1.1)):
            sp.ellipse(x, y, r, r, light(can, 0.2), shade=False)
        d.put(sp, outline=False)
    finish(c, d, shadow=(15, 30.9, 9, 1.2))


def pond_frog(c: Canvas, p: Pose, s: dict):
    """A friendly pond frog: round, smiling, rosy-cheeked, with a lily-pad hat and a
    little pink flower — nothing like a murky toad you'd fight (#75 item 14g: Puddle)."""
    d = D(c, p)
    col = hexc(s.get('color', '#8ad84a'))
    belly = hexc(s.get('belly', '#f4f0b0'))
    L = d.part(d.lean, d.bob)
    L.ellipse(9, 26.5, 4, 2.6, dark(col, 0.1))  # folded legs
    L.ellipse(23, 26.5, 4, 2.6, dark(col, 0.1))
    L.ellipse(16, 22, 8.6, 6.8, col)  # round body
    if p.facing != 'up':
        L.ellipse(16, 24.5, 5.4, 3.6, belly)
    L.ellipse(11, 29.4, 2.6, 0.9, dark(col, 0.18))  # feet
    L.ellipse(21, 29.4, 2.6, 0.9, dark(col, 0.18))
    d.put(L)
    H = d.part(d.lean, d.bob)
    H.ellipse(11.5, 14.5, 3.2, 3.2, col)  # big eye bumps
    H.ellipse(20.5, 14.5, 3.2, 3.2, col)
    if p.facing != 'up':
        ex = [11.5, 20.5] if p.facing == 'down' else [13, 21]
        for x in ex:
            H.ellipse(x, 14.5, 2.2, 2.2, '#ffffff', shade=False)
            H.ellipse(x + 0.3, 14.8, 1.2, 1.3, hexc('#1a1a2a'), shade=False)
            H.dot(x - 0.4, 13.8, '#ffffff')
        if d.sep:
            for x in (9.6, 22.4):
                H.ellipse(x, 20, 1.6, 0.9, '#ffa0b0', shade=False)  # rosy cheeks
        if not p.hurt:
            H.line(13, 20.5, 16, 22, dark(col, 0.5), w=0.6)  # a big smile
            H.line(16, 22, 19, 20.5, dark(col, 0.5), w=0.6)
    d.put(H)
    T = d.part(d.lean, d.bob)
    T.ellipse(16, 10.4, 8.6, 2.2, hexc('#3a9a4a'))  # the lily-pad hat
    T.poly([(16, 10.4), (23.5, 9.2), (23.5, 11.6)], dark(hexc('#3a9a4a'), 0.25))  # its notch
    T.ellipse(14, 8.6, 1.8, 1.6, '#ff8ab8')  # a little pink flower
    T.dot(14, 8.6, '#fff2a0')
    d.put(T)
    finish(c, d, shadow=(16, 30.6, 7, 1.2))


def dart_frog(c: Canvas, p: Pose, s: dict):
    """A neon poison dart frog: bright colours mean DON'T TOUCH."""
    d = D(c, p)
    col = hexc(s.get('color', '#2a8aff'))
    spot = hexc(s.get('spot', '#141420'))
    lean, bob = d.lean, d.bob
    crouch = 1.2 if p.arm == 'raise' else 0.0
    L = d.part(lean, bob + crouch * 0.5)
    L.ellipse(9, 26.5, 4, 2.6, dark(col, 0.12))  # folded back leg
    L.ellipse(7.5, 29.6, 2.6, 0.9, dark(col, 0.2))
    d.put(L)
    B = d.part(lean, bob + crouch * 0.5)
    B.ellipse(15, 23, 8.5, 5.6, col)
    B.ellipse(16.5, 26, 6, 2.4, light(col, 0.1))
    if d.sep:
        for (x, y, r) in ((10, 21, 1.3), (13.5, 19.2, 1.1), (17, 20.6, 1.4), (11.5, 24.5, 1.0), (20, 23, 1.0)):
            B.ellipse(x, y, r, r * 0.8, spot, shade=False)
    else:
        B.dot(12, 21, spot, w=2, h=1)
    throat = 2.2 if p.frame % 2 else 1.2  # puffing its throat
    B.ellipse(22, 25.5, throat, throat * 0.8, '#ffd23a')
    d.put(B)
    F = d.part(lean * 0.5, 0)
    F.ellipse(20, 29.6, 2.4, 0.9, dark(col, 0.2))  # front feet
    F.ellipse(14, 29.8, 2, 0.8, dark(col, 0.2))
    d.put(F)
    H = d.part(lean, bob + crouch * 0.5)
    H.ellipse(21.5, 20, 5, 3.8, col)
    H.ellipse(19, 16.6, 2.2, 2.2, col)  # eye bumps on top
    H.ellipse(22.5, 16.8, 2.1, 2.1, dark(col, 0.05))
    if p.facing != 'up':
        for (x, y) in ((19.2, 16.6), (22.6, 16.8)):
            H.ellipse(x, y, 1.4, 1.4, '#ffd23a', shade=False)  # yellow eyes
            if not p.hurt:
                H.rect(x - 0.25, y - 1.1, x + 0.35, y + 1.1, '#141420', shade=False)  # slit pupils
            else:
                H.dot(x - 0.5, y - 0.5, '#141420')
        H.line(19.5, 21.6, 26, 20.6, dark(col, 0.5), w=0.5)  # wide mean mouth
    d.put(H)
    if p.arm in ('strike', 'follow'):  # sticky tongue lash
        T = d.part(lean, bob)
        reach = 31 if p.arm == 'strike' else 28.5
        T.line(25.5, 21, reach, 19.5, '#ff5a7a', w=0.9)
        T.ellipse(reach, 19.5, 1.2, 1.2, '#ff5a7a')
        d.put(T)
    D2 = d.part(lean, bob)  # a toxic drip
    dy = (p.frame % 3) * 1.2
    D2.ellipse(11, 27 + dy, 0.7, 0.9, '#8aff5a', shade=False)
    d.put(D2, outline=False)
    finish(c, d, shadow=(16, 30.8, 9, 1.2))


def snapjaw(c: Canvas, p: Pose, s: dict):
    """A walking Venus flytrap with jaws full of spiky teeth."""
    d = D(c, p)
    leaf = hexc(s.get('color', '#5ab03a'))
    mouth = hexc(s.get('mouth', '#d0304a'))
    lean, bob = d.lean, d.bob
    roots = d.part(lean * 0.4, 0)
    for i, (x0, x1) in enumerate(((13, 9.5), (15, 13.5), (17, 18.5), (19, 22))):  # root legs
        off = p.step * (1 if i % 2 else -1)
        roots.line(x0, 25, x1 + off, 29.6, '#7a5a3a', w=1.0)
        roots.line(x1 + off, 29.6, x1 + off + (1.2 if i > 1 else -1.2), 30.4, '#7a5a3a', w=0.7)
    d.put(roots)
    base = d.part(lean, bob)
    base.poly([(16, 25), (8, 22), (6, 24.5), (14, 26)], dark(leaf, 0.12))  # base leaves
    base.poly([(16, 25), (24, 21.5), (26, 24), (18, 26)], leaf)
    sway = 0.6 if p.frame % 2 else -0.4
    base.line(16, 25, 15.5 + sway, 16, dark(leaf, 0.2), w=1.6)  # stem
    d.put(base)
    gape = {'raise': 6.5, 'strike': 1.0, 'follow': 2.0}.get(p.arm, 4.0 if p.frame % 2 else 3.0)
    if p.hurt:
        gape = 5.0
    hx, hy = 16 + sway + (2 if p.arm == 'strike' else 0), 13
    J = d.part(lean, bob)
    R = 6.2
    half = math.radians(8 + gape * 6)  # mouth opening, as a wedge facing forward
    J.ellipse(hx, hy, R, R * 0.9, leaf)  # the trap head
    J.dot(hx - 3, hy - 3, light(leaf, 0.25), w=2, h=1)
    lip_up = (hx + math.cos(-half) * R * 1.05, hy + math.sin(-half) * R)
    lip_dn = (hx + math.cos(half) * R * 1.05, hy + math.sin(half) * R)
    J.poly([(hx - 1, hy), lip_up, (hx + R + 2, hy), lip_dn], mouth, shade=False)  # red inside
    J.poly([(hx + 0.5, hy - 0.3), (hx + R + 2, hy - 0.6), (hx + R + 2, hy + 0.6), (hx + 0.5, hy + 0.3)], dark(mouth, 0.4), shade=False)  # throat
    J.erase_ellipse(hx + R + 2.6, hy, 2.6, max(0.4, math.tan(half) * 3))  # bite out the front of the mouth
    d.put(J)
    T = d.part(lean, bob)
    for k in range(3):  # white teeth along both lips
        t = 0.3 + k * 0.25
        ux, uy = hx - 1 + (lip_up[0] - hx + 1) * t, hy + (lip_up[1] - hy) * t
        dx_, dy_ = hx - 1 + (lip_dn[0] - hx + 1) * t, hy + (lip_dn[1] - hy) * t
        T.poly([(ux - 0.6, uy), (ux + 0.6, uy), (ux + 0.2, uy + 1.6)], WHITE, shade=False)
        T.poly([(dx_ - 0.6, dy_), (dx_ + 0.6, dy_), (dx_ + 0.2, dy_ - 1.6)], WHITE, shade=False)
    for (lx, ly, sgn) in ((lip_up[0], lip_up[1], -1), (lip_dn[0], lip_dn[1], 1)):  # bristles on the lip tips
        for k in range(3):
            T.line(lx - k * 1.2, ly + sgn * k * 0.4, lx - k * 1.2 + 1.6, ly + sgn * (k * 0.4 + 1.6), light(leaf, 0.25), w=0.45)
    if p.facing != 'up':
        ex, ey = hx - 0.5, hy - 3.6
        T.ellipse(ex, ey, 1.5, 1.3, '#ffe23a' if not p.hurt else WHITE, shade=False)  # one angry eye
        if not p.hurt:
            T.rect(ex - 0.2, ey - 1, ex + 0.4, ey + 1, '#1a1420', shade=False)
            T.line(ex - 1.8, ey - 2.2, ex + 1.6, ey - 1.2, dark(leaf, 0.6), w=0.7)
    if gape > 2.5 and d.sep:  # drool
        T.line(lip_dn[0] - 1.5, lip_dn[1], lip_dn[0] - 1.5, lip_dn[1] + 1.8 + (p.frame % 2), '#bfe8ff', w=0.4)
    d.put(T, outline=False)
    finish(c, d, shadow=(16, 30.9, 8, 1.2))


# ─── Batch-4 critters (Starfall Coast, Gearfall, Whispering Woods) ───────────


def orbit_otter(c: Canvas, p: Pose, s: dict):
    """A space otter in a cracked fishbowl helmet, a jagged rock orbiting it."""
    d = D(c, p)
    fur = hexc(s.get('fur', '#7a5238'))
    belly = hexc(s.get('belly', '#d8b890'))
    glass = hexc(s.get('glass', '#bfe8ff'))
    lean, bob = d.lean, d.bob
    hover = (-1 if p.frame % 2 else 0) * d.u
    # where the rock is in its orbit (behind the otter on some frames)
    ang = {2: -2.2, 3: 0.0, 4: 0.6}.get(p.frame, p.frame * 1.05)
    if p.arm == 'strike':
        ang = 0.0
    rx_, ry_ = 16 + math.cos(ang) * 10.5, 16 + math.sin(ang) * 5
    behind = math.sin(ang) < -0.2

    def rock(L):
        k = 1.35
        L.poly([(rx_ - 2.2 * k, ry_), (rx_ - 0.8 * k, ry_ - 2.4 * k), (rx_ + 1.8 * k, ry_ - 1.6 * k), (rx_ + 2.4 * k, ry_ + 0.8 * k),
                (rx_ + 0.4 * k, ry_ + 2.4 * k), (rx_ - 1.6 * k, ry_ + 1.8 * k)], '#6a6470')
        L.line(rx_ - 1.4, ry_ - 0.8, rx_ + 1.4, ry_ + 1, '#ff8a2a', w=0.5)  # glowing cracks
        L.line(rx_ + 0.2, ry_ + 0.1, rx_ + 1.6, ry_ - 1.4, '#ff8a2a', w=0.45)

    if behind:
        R = d.part(d.lean, d.bob + hover)
        rock(R)
        d.put(R)
    T = d.part(lean, bob + hover)
    T.poly([(11, 22), (5, 26), (6, 28), (12, 25)], dark(fur, 0.12))  # flat tail
    d.put(T)
    B = d.part(lean, bob + hover)
    B.ellipse(15.5, 20.5, 5.5, 6.5, fur)
    B.ellipse(16.5, 22, 3.4, 4.6, belly)
    B.rect(10.5, 17.5, 13, 23, '#c8d0dc')  # oxygen tank
    B.ellipse(13.5, 27, 2, 1.4, dark(fur, 0.15))  # feet
    B.ellipse(18, 27.2, 2, 1.4, dark(fur, 0.1))
    d.put(B)
    H = d.part(lean, bob + hover)
    H.ellipse(17, 11.5, 4.6, 4.2, fur)
    H.ellipse(13.5, 8.5, 1.2, 1.2, dark(fur, 0.15))  # ear
    H.ellipse(20, 12.8, 2.4, 1.8, belly)  # muzzle
    H.dot(22, 12, '#2a1a1a', w=1, h=1)
    if p.facing != 'up':
        d.eyes(H, [(18.6, 10.6)], color=(255, 60, 60) if not p.hurt else EYE, h=1, shine=False)
        if not p.hurt:
            H.line(17.2, 9.2, 20, 10, '#2a1a1a', w=0.6)  # scowl
        if d.sep:
            H.rect(19.4, 14, 20.8, 15.4, WHITE, shade=False)  # big buck teeth, bared
            H.line(20.1, 14, 20.1, 15.4, (200, 200, 200), w=0.3)
    d.put(H)
    G = d.part(lean, bob + hover)  # the fishbowl helmet: just a rim and a glint, so the face shows through
    for k in range(20):
        a = k / 20 * 2 * math.pi
        G.dot(17 + math.cos(a) * 7, 11.5 + math.sin(a) * 6.6, glass)
    G.rect(11, 17, 23, 18.2, '#9aa4b4', shade=False)  # collar ring
    G.dot(13.5, 7, WHITE, w=1, h=2)  # glint
    G.line(20.5, 5.6, 22, 8.5, WHITE, w=0.4)  # the crack
    G.line(22, 8.5, 21, 10, WHITE, w=0.4)
    d.put(G, outline=False)
    if not behind:
        R = d.part(d.lean, d.bob + hover)
        rock(R)
        d.put(R)
    finish(c, d, shadow=(16, 30.8, 6, 1.1))


def gravity_beetle(c: Canvas, p: Pose, s: dict):
    """A wingless beetle that floats on its own gravity; its mouth is a tiny black hole."""
    d = D(c, p)
    col = hexc(s.get('color', '#4a2a7a'))
    lean, bob = d.lean, d.bob
    hover = (-1.2 if p.frame % 2 else 0.0)  # bobbing in mid-air
    lift = -4 + hover
    Rp = d.part(lean * 0.3, 0)  # a ripple of bent gravity under it
    for k in range(16):
        a = k / 16 * 2 * math.pi
        Rp.dot(16 + math.cos(a) * (6.5 + (p.frame % 2)), 29 + math.sin(a) * 1.4, '#a07aff')
    d.put(Rp, outline=False)
    Lg = d.part(lean, bob + lift)
    for i, x in enumerate((10.5, 15, 19.5)):  # six legs dangling, curled
        sw = 0.6 if (i + p.frame) % 2 else -0.6
        for dx in (-0.8, 0.8):
            Lg.line(x + dx, 20, x + dx - 1 + sw, 24, light(col, 0.12), w=0.7)
            Lg.line(x + dx - 1 + sw, 24, x + dx + 0.4 + sw, 26, light(col, 0.12), w=0.6)
    d.put(Lg)
    B = d.part(lean, bob + lift)
    B.ellipse(15, 15.5, 9, 6.4, col)  # closed, domed shell: no wings
    B.line(8, 14.6, 22.5, 12.8, light(col, 0.2), w=0.35)  # shell seam
    if s.get('land'):
        # A globe (#75 item 15d review): green lands on its blue shell.
        for (x, y, rx, ry) in ((11, 14, 2.6, 1.8), (17.5, 12, 2.2, 1.6), (19, 17, 1.8, 1.4), (13.5, 18, 1.6, 1.1)):
            B.ellipse(x, y, rx, ry, '#5ab04a', shade=False)
    B.ellipse(12, 12.4, 3.2, 1.4, light(col, 0.3), shade=False)  # glossy shine
    if d.sep:
        for (x, y) in ((9.5, 16.5), (14, 18.5), (18.5, 16.5), (16.5, 11.5), (11.5, 19)):  # starry speckles
            B.dot(x, y, '#e8d8ff')
    B.ellipse(14.5, 20.6, 7.5, 1.6, dark(col, 0.08))  # underbelly
    d.put(B)
    H = d.part(lean, bob + lift)
    hx, hy = 24.2, 17.2
    H.ellipse(hx, hy, 3.8, 3.4, dark(col, 0.04))
    gape = {'raise': 1.4, 'strike': 1.8, 'follow': 1.5}.get(p.arm, 1.0)
    H.poly([(hx + 2, hy - 2.2), (hx + 6 + gape, hy - 1.6 - gape * 0.6), (hx + 3.5, hy - 0.4)], '#2a1a3a')  # mandibles
    H.poly([(hx + 2, hy + 2.2), (hx + 6 + gape, hy + 1.6 + gape * 0.6), (hx + 3.5, hy + 0.4)], '#2a1a3a')
    mx, my = hx + 3.4, hy
    H.ellipse(mx, my, 1.8 * gape, 1.6 * gape, '#c86aff', shade=False)  # glowing ring
    H.ellipse(mx, my, 1.1 * gape, 1.0 * gape, (8, 4, 16), shade=False)  # the black hole
    if p.facing != 'up':
        H.dot(hx - 0.4, hy - 2, (255, 60, 60) if not p.hurt else WHITE)  # red eyes
        H.dot(hx + 1.2, hy - 2.2, (255, 60, 60) if not p.hurt else WHITE)
        H.line(hx - 1.2, hy - 3.2, hx + 2, hy - 2.9, '#14081e', w=0.5)
        H.line(hx + 0.4, hy - 3.4, hx - 1, hy - 5.6, '#2a1a3a', w=0.45)  # antennae
        H.line(hx + 1.4, hy - 3.4, hx + 2.6, hy - 5.8, '#2a1a3a', w=0.45)
    d.put(H)
    C = d.part(lean, bob + lift)  # coins spiralling into the mouth
    for k in range(3):
        t = ((p.frame + k * 2) % 6) / 6
        a = t * 4 + k
        r = (1 - t) * 6 + 1.6
        C.ellipse(mx + math.cos(a) * r, my + math.sin(a) * r * 0.7, 0.9, 0.9, '#ffcf3a', shade=False)
    d.put(C, outline=False)
    finish(c, d, shadow=(16, 30.6, 6 + hover, 1.1))


def ironhorn(c: Canvas, p: Pose, s: dict):
    """A huge armoured rhino charging head-down behind a massive drill horn."""
    d = D(c, p)
    hide = hexc(s.get('color', '#6a6878'))
    steel = hexc(s.get('steel', '#b8c2d0'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((7.5, 11.5, 17.5, 21.5)):  # thick pillar legs
        off = p.step * (1.4 if i % 2 else -1.4)
        legs.rect(lx - 2.3 + off, 20, lx + 2.3 + off, 28.6, hide if i % 2 else dark(hide, 0.18))
        legs.rect(lx - 2.6 + off, 27.6, lx + 2.6 + off, 30.8, steel)  # big steel hoof caps
        for k in (-1.5, 0, 1.5):  # claws
            legs.poly([(lx + k - 0.5 + off, 30.6), (lx + k + 0.5 + off, 30.6), (lx + k + 0.9 + off, 31.6)], '#e8eef8')
    d.put(legs)
    B = d.part(lean, bob)
    B.ellipse(14.5, 17, 11, 7, hide)
    B.ellipse(15.5, 21.6, 8, 2.2, light(hide, 0.08))
    for (x0, x1) in ((5, 11.5), (12, 18.5)):  # bolted armour plates
        B.rect(x0, 10.8, x1, 17.5, steel)
        if d.sep:
            for (x, y) in ((x0 + 0.8, 11.6), (x1 - 1.2, 11.6), (x0 + 0.8, 16.6), (x1 - 1.2, 16.6)):
                B.dot(x, y, '#5a5a68')
    for x in (6.5, 10, 13.5, 17):  # spikes along its back
        B.poly([(x - 1.2, 11), (x + 0.4, 6.5), (x + 1.2, 11)], '#d8dee8')
    B.line(4, 14, 2, 11 + (p.frame % 2), dark(hide, 0.3), w=0.7)  # tail
    if d.sep:
        B.line(20, 14, 22, 18, '#d89aa0', w=0.4)  # battle scar
    d.put(B)
    H = d.part(lean, bob)
    hx, hy = 24, 19.5  # head lowered to charge
    H.ellipse(hx, hy, 5.4, 4.6, hide)
    H.poly([(hx - 3, hy - 3.4), (hx - 4.4, hy - 7.6), (hx - 1.4, hy - 4)], dark(hide, 0.1))  # ear
    H.rect(hx + 0.6, hy - 2.8, hx + 6.2, hy + 2.6, steel)  # steel nose plate
    if d.sep:
        H.dot(hx + 1.4, hy - 2, '#5a5a68')
        H.dot(hx + 1.4, hy + 1.8, '#5a5a68')
    # a second, smaller horn
    H.poly([(hx - 0.6, hy - 3.6), (hx + 0.8, hy - 7.8), (hx + 1.8, hy - 3.6)], '#c89a40')
    # the massive drill horn
    spin = p.frame % 2
    reach = {'strike': 1.2, 'follow': 0.6, 'raise': -0.6}.get(p.arm, 0.0)
    bx, by = hx + 3.6, hy - 2.6
    tipx, tipy = hx + 7.6 + reach, hy - 14.5 - reach
    H.poly([(bx - 3, by + 0.8), (tipx, tipy), (bx + 3, by + 0.4)], '#d8a840')
    for k in range(5):  # spiral flutes, shifting as it spins
        t = 0.1 + k * 0.17 + spin * 0.08
        x, y = bx + (tipx - bx) * t, by + (tipy - by) * t
        wdt = 2.8 * (1 - t)
        H.line(x - wdt, y + 0.6, x + wdt, y - 0.8, '#8a6a20', w=0.6)
    if p.facing != 'up':
        H.ellipse(hx - 1, hy - 1.4, 1.2, 1, (255, 40, 30) if not p.hurt else WHITE, shade=False)  # burning eye
        if not p.hurt:
            H.line(hx - 3, hy - 3.4, hx + 0.6, hy - 2.2, '#140c14', w=0.8)  # furious brow
        H.line(hx + 0.8, hy + 3, hx + 5.6, hy + 2.6, '#2a1a1a', w=0.6)  # snarl
        if d.sep:
            for tx in (hx + 2.2, hx + 4):
                H.poly([(tx - 0.5, hy + 2.9), (tx + 0.5, hy + 2.9), (tx, hy + 4.1)], WHITE, shade=False)
    d.put(H)
    Sm = d.part(lean, bob)  # angry steam snorting from its nostrils
    puff = p.frame % 2
    Sm.ellipse(hx + 7.4 + puff, hy + 3.6, 1.4 + puff * 0.4, 1, '#e8ecf4', shade=False)
    Sm.ellipse(hx + 6.4, hy + 5 + puff * 0.4, 1, 0.8, '#d0d8e4', shade=False)
    if p.arm in ('strike', 'follow') or p.step:  # dust kicked up as it charges
        for (x, y, r) in ((3, 29, 1.6), (1, 27.2, 1.1)):
            Sm.ellipse(x, y, r, r, '#c8b8a0', shade=False)
    d.put(Sm, outline=False)
    finish(c, d, shadow=(15.5, 30.9, 12, 1.2))


def eclipse_fox(c: Canvas, p: Pose, s: dict):
    """A shadow fox in a burning corona, a floating eclipse-disc shield before it."""
    d = D(c, p)
    fur = hexc(s.get('fur', '#2e2848'))
    glow = hexc(s.get('glow', '#ffb02a'))
    lean, bob = d.lean, d.bob
    hx, hy = 23, 13.5
    R = d.part(lean, bob)  # the corona: a burning ring behind its head
    R.ellipse(hx - 1, hy - 1.5, 7.6, 7.6, '#ff6a2a', shade=False)
    R.ellipse(hx - 1, hy - 1.5, 6.8, 6.8, glow, shade=False)
    R.erase_ellipse(hx - 1, hy - 1.5, 5.6, 5.6)
    for k in range(8):  # licks of flame round the rim
        a = k / 8 * 2 * math.pi + (0.2 if p.frame % 2 else 0)
        x, y = hx - 1 + math.cos(a) * 7.6, hy - 1.5 + math.sin(a) * 7.6
        R.poly([(x - 0.7, y), (x + math.cos(a) * 1.8, y + math.sin(a) * 1.8), (x + 0.7, y)], '#ff6a2a', shade=False)
    d.put(R, outline=False)
    T = d.part(lean, bob)
    wag = 1.4 if p.frame % 2 else -0.4
    T.poly([(9, 18), (2, 12 + wag), (1.5, 16 + wag), (4.5, 20.5), (9, 21)], fur)  # big bushy tail
    T.poly([(2, 12 + wag), (1.5, 16 + wag), (3.4, 14.4 + wag)], glow)  # burning tail tip
    d.put(T)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10, 12.5, 18.5, 21)):
        off = p.step * (1.2 if i % 2 else -1.2)
        legs.line(lx + off * 0.3, 21, lx + off, 29.8, fur if i % 2 else dark(fur, 0.15), w=1.5)
    d.put(legs)
    B = d.part(lean, bob)
    B.ellipse(15.5, 19, 8, 4.2, fur)
    B.ellipse(17, 21, 5, 1.8, light(fur, 0.12))
    d.put(B)
    H = d.part(lean, bob)
    H.poly([(hx - 3, hy - 2.5), (hx - 3.5, hy - 9), (hx - 0.6, hy - 3.4)], fur)  # tall ears
    H.poly([(hx - 0.2, hy - 3.4), (hx + 1.6, hy - 9.2), (hx + 2.6, hy - 2.6)], dark(fur, 0.05))
    H.ellipse(hx, hy, 4, 3.6, fur)
    H.poly([(hx + 2, hy - 1.4), (hx + 8, hy + 0.8), (hx + 2.4, hy + 2.6)], light(fur, 0.05))  # long snout
    H.dot(hx + 7.6, hy + 0.4, '#0a0812', w=1, h=1)
    if p.facing != 'up':
        H.poly([(hx + 0.2, hy - 1.4), (hx + 2.8, hy - 0.6), (hx + 0.6, hy)], (255, 240, 160) if not p.hurt else WHITE, shade=False)  # slanted glowing eye
        if d.sep:
            H.line(hx + 3, hy + 2, hx + 7, hy + 1.2, '#0a0812', w=0.5)  # snarl
            H.poly([(hx + 4, hy + 1.7), (hx + 4.7, hy + 1.6), (hx + 4.4, hy + 2.9)], WHITE, shade=False)  # fangs
            H.poly([(hx + 5.6, hy + 1.5), (hx + 6.3, hy + 1.4), (hx + 6, hy + 2.6)], WHITE, shade=False)
    d.put(H)
    Sd = d.part(lean, bob)  # the eclipse shield, floating in front of its chest
    sx = {'strike': 28.5, 'follow': 27.5, 'raise': 24.5}.get(p.arm, 26.5)
    sy = 21.5 + (0.6 if p.frame % 2 else 0)
    Sd.ellipse(sx, sy, 3.6, 3.6, glow, shade=False)  # burning rim
    Sd.ellipse(sx + 0.5, sy, 3.1, 3.2, '#120e20', shade=False)  # the dark moon
    Sd.dot(sx - 2.6, sy - 1.4, WHITE)
    d.put(Sd)
    finish(c, d, shadow=(15.5, 30.9, 10, 1.2))


def oak_owl(c: Canvas, p: Pose, s: dict):
    """A dark owl with bark for feathers, glowing eyes and a pointer stick."""
    d = D(c, p)
    bark = hexc(s.get('color', '#5a4030'))
    glow = hexc(s.get('glow', '#ffd23a'))
    lean, bob = d.lean, d.bob
    St = d.part(lean * 0.3, 0)  # the stump it perches on
    St.rect(10, 27, 22, 30.6, '#6a4a30')
    St.ellipse(16, 27, 6, 1.2, '#a07a50')
    St.dot(15, 27, '#7a5a3a', w=2, h=1)
    d.put(St)
    B = d.part(lean, bob)
    B.ellipse(16, 19, 6.5, 7.6, bark)
    B.ellipse(17, 21, 4, 5, light(bark, 0.15))  # chest
    if d.sep:
        for (x, y) in ((15.5, 18.5), (18, 20), (16, 22.5), (18.5, 23.6)):  # bark-crack streaks
            B.line(x, y, x + 0.2, y + 1.6, dark(bark, 0.35), w=0.4)
    for x in (13.5, 15.5, 18.5):  # talons gripping the stump
        B.poly([(x - 0.6, 26), (x + 0.6, 26), (x + 0.3, 27.8)], '#e0c060')
    d.put(B)
    W = d.part(lean, bob)
    flare = {'raise': -0.8, 'strike': 0.4}.get(p.arm, 0.0)
    W.ellipse(11.5, 19.5, 2.8, 6, dark(bark, 0.15), rot=0.25 + flare)  # wing
    d.put(W)
    H = d.part(lean, bob)
    H.ellipse(17, 10.5, 6, 5.2, bark)
    H.poly([(12, 8), (11, 2.5), (14.5, 6.5)], dark(bark, 0.1))  # horn-like ear tufts
    H.poly([(19.5, 6.5), (22.5, 2.5), (22, 8)], dark(bark, 0.05))
    H.ellipse(13, 5, 1.3, 0.8, '#5ab03a', rot=-0.4)  # a leaf sprouting from its head
    if p.facing != 'up':
        for x in (15, 19.5):
            H.ellipse(x, 10, 2.2, 2.2, (40, 26, 20), shade=False)  # dark eye discs
            H.ellipse(x, 10, 1.4, 1.4, glow if not p.hurt else WHITE, shade=False)
            if not p.hurt:
                H.dot(x, 9.6, '#1a1008', w=1, h=1)
        if not p.hurt:
            H.line(12.5, 7, 16.6, 8.6, '#1a1008', w=0.8)  # deep V scowl
            H.line(22, 7, 17.9, 8.6, '#1a1008', w=0.8)
        H.poly([(16.5, 11.6), (18.5, 11.6), (17.6, 14.2)], '#e0c060')  # hooked beak
    d.put(H)
    P = d.part(lean, bob)  # a teacher's pointer stick, for explaining things wrongly
    tip = {'raise': (24, 2), 'strike': (30, 14), 'follow': (28, 18)}.get(p.arm, (27, 8))
    P.line(20, 18.5, tip[0], tip[1], '#a07a50', w=0.7)
    P.dot(tip[0], tip[1], '#e03a3a')
    d.put(P)
    finish(c, d, shadow=(16, 30.9, 7, 1.1))


# ─── Eldergrove (#75 item 14f) ───────────────────────────────────────────────


def ring_beetle(c: Canvas, p: Pose, s: dict):
    """A ground beetle whose shell is cut like a log — you can count its rings."""
    d = D(c, p)
    col = hexc(s.get('color', '#7a4a2a'))
    ring = hexc(s.get('ring', '#d8b07a'))
    lean, bob = d.lean, d.bob
    Lg = d.part(lean * 0.4, 0)
    for i, x in enumerate((10.5, 15.5, 20.5)):  # six legs, scuttling
        off = p.step * (1.2 if i % 2 else -1.2)
        Lg.line(x + off, 22, x - 1.6 + off, 28.8, dark(col, 0.35), w=0.9)
        Lg.line(x + 1 - off, 22, x + 2.6 - off, 28.8, dark(col, 0.25), w=0.9)
    d.put(Lg)
    B = d.part(lean, bob)
    B.ellipse(15, 20, 9.5, 6.4, col)
    for k, r in enumerate((7.2, 5.4, 3.7, 2.0)):  # the rings, like a cut log
        B.ellipse(14.5, 19.2, r * 1.12, r * 0.72, ring if k % 2 == 0 else dark(ring, 0.18), shade=False)
    B.ellipse(14.5, 19.2, 0.8, 0.6, dark(col, 0.2), shade=False)  # the heart of the log
    B.ellipse(14.5, 25, 8, 1.6, dark(col, 0.15))  # underbelly
    d.put(B)
    H = d.part(lean, bob)
    hx, hy = 24.6, 21
    H.ellipse(hx, hy, 3.6, 3.2, dark(col, 0.25))
    pinch = {'raise': 1.0, 'strike': 1.8, 'follow': 1.4}.get(p.arm, 0.6)
    H.poly([(hx + 2.4, hy - 1.4), (hx + 5.6 + pinch, hy - 1.2), (hx + 3, hy - 0.2)], '#3a2010')  # pincers
    H.poly([(hx + 2.4, hy + 1.4), (hx + 5.6 + pinch, hy + 1.2), (hx + 3, hy + 0.2)], '#3a2010')
    if p.facing != 'up':
        d.eyes(H, [(hx + 0.6, hy - 1.4)], color=(255, 230, 140), h=1, shine=False)
        H.line(hx - 0.4, hy - 2.8, hx - 2.4, hy - 7, '#3a2010', w=0.5)  # antennae
        H.line(hx + 1.2, hy - 2.8, hx + 2.6, hy - 7.2, '#3a2010', w=0.5)
    d.put(H)
    finish(c, d, shadow=(16, 30.4, 8, 1.2))


def sap_sprite(c: Canvas, p: Pose, s: dict):
    """A drop of golden tree sap that floats, glows and glitters."""
    d = D(c, p)
    col = hexc(s.get('color', '#e8a030'))
    hover = (-1.2 if p.frame % 2 else 0.0)
    L = d.part(d.lean, d.bob + hover - 2)
    L.ellipse(16, 19, 7, 7, col)
    L.poly([(10.4, 16), (16, 6.4), (21.6, 16)], col)  # the point of the drop
    L.ellipse(13, 15.5, 1.8, 3, light(col, 0.4), shade=False)  # shine
    L.ellipse(16.5, 23.4, 4.4, 1.8, dark(col, 0.12), shade=False)
    L.ellipse(18.6, 6.6, 2.6, 1.2, '#6aaf4a', rot=-0.5)  # a leaf stuck to its tip
    ex = face_x(p, [17.5, 20.6], [13.6, 18.4])
    d.eyes(L, [(x, 18) for x in ex])
    if ex and d.sep and not p.hurt:
        L.dot(ex[0] + 1.4, 21, dark(col, 0.45), w=2, h=1)  # a little smile
    d.put(L)
    G = d.part(d.lean, d.bob + hover - 2)  # sparkles that come and go
    for k, (x, y) in enumerate(((6, 10), (26, 13), (8, 24), (25, 25))):
        if (k + p.frame) % 2:
            G.dot(x, y, '#fff4b0')
            if d.sep:  # a twinkle cross in battle; one bright dot on the map
                for (dx, dy) in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    G.dot(x + dx, y + dy, '#ffe066')
    d.put(G, outline=False)
    finish(c, d, shadow=(16, 30.2, 5 + hover * 0.5, 1.1))


def cat(c: Canvas, p: Pose, s: dict):
    """A Latitude Cat (#75 item 15d review): a round-headed cat with short
    pointed ears, a little muzzle, a curled tail — and stripes that run round
    it like lines of latitude."""
    d = D(c, p)
    fur = hexc(s.get('fur', '#e8963a'))
    stripe = hexc(s.get('stripe', '#3ac0e0'))
    lean, bob = d.lean, d.bob
    hx, hy = 21.5, 14
    T = d.part(lean, bob)
    wag = 1.2 if p.frame % 2 else 0
    T.line(8.5, 20, 5, 15 - wag, fur, w=2)
    T.line(5, 15 - wag, 6.6, 11.6 - wag, fur, w=2)  # the curl
    d.put(T)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10.5, 12.5, 17, 19)):
        off = p.step * (1 if i % 2 else -1)
        legs.rect(lx - 0.9 + off, 22, lx + 0.9 + off, 29.6, fur if i % 2 else dark(fur, 0.15))
    d.put(legs)
    B = d.part(lean, bob)
    B.ellipse(14.5, 20.5, 7, 4.4, fur)
    for y in (18.4, 20.6, 22.8):  # latitude lines
        B.line(9, y, 20, y, stripe, w=0.7)
    d.put(B)
    H = d.part(lean, bob)
    H.poly([(hx - 4, hy - 2), (hx - 3.4, hy - 7.4), (hx - 0.8, hy - 3.6)], fur)  # ears
    H.poly([(hx + 0.8, hy - 3.6), (hx + 3.4, hy - 7.4), (hx + 4, hy - 2)], fur)
    H.ellipse(hx, hy, 4.6, 4.2, fur)
    H.line(hx - 4, hy - 1, hx + 4, hy - 1, stripe, w=0.6)
    H.ellipse(hx + 1.8, hy + 2, 2, 1.4, light(fur, 0.35))  # little muzzle
    H.dot(hx + 2.4, hy + 1.2, '#d0607a')
    d.put(H)
    if p.facing != 'up':
        d.eyes(H, [(hx - 1.2, hy - 0.4), (hx + 2.2, hy - 0.4)])
    finish(c, d, shadow=(15, 30.4, 8, 1.1))


def page_ray(c: Canvas, p: Pose, s: dict):
    """A Page Ray (#75 item 15e review): a wide, flat ray made of paper — its wing
    tips curl up like turning pages, lines of writing across its back, a short
    ray's tail. Nothing like a kite."""
    d = D(c, p)
    col = hexc(s.get('color', '#f4ecd8'))
    ink = hexc(s.get('ink', '#5a6a9a'))
    flap = 1.4 if p.frame % 2 else -0.6
    lean = d.lean
    B = d.part(lean, d.bob - 2)
    B.poly([(17, 13), (29, 15 - flap), (25, 22), (17, 24), (9, 22), (5, 15 - flap)], col)
    B.poly([(5, 15 - flap), (2.5, 11 - flap * 1.5), (7.5, 13.4 - flap)], light(col, 0.05))  # a page-corner curl
    B.poly([(29, 15 - flap), (31, 11 - flap * 1.5), (26.5, 13.4 - flap)], light(col, 0.05))
    B.line(17, 13.6, 17, 23.4, dark(col, 0.18), w=0.4)  # the spine of the book
    for (x0, x1, y) in ((9, 15, 16.4), (19, 25, 16.4), (10, 15.4, 18.6), (18.6, 24, 18.6), (12, 15.6, 20.8), (18.4, 22, 20.8)):
        B.line(x0, y, x1, y, ink, w=0.5)
    B.line(17, 24, 15.6, 28.5, dark(col, 0.2), w=1.0)  # a short tail
    B.ellipse(15.4, 29, 1, 0.8, dark(col, 0.2))
    d.put(B)
    F = d.part(lean, d.bob - 2)
    if p.facing != 'up':
        for x in (14.6, 19.4):
            F.ellipse(x, 14.6, 1.4, 1.4, '#ffffff', shade=False)
            F.dot(x + 0.3, 14.8, '#1a1a24', w=1.4, h=1.4)
    d.put(F, outline=False)
    finish(c, d, shadow=(17, 31, 7, 1))


def kite_ray(c: Canvas, p: Pose, s: dict):
    """A Kite Ray (#75 item 15d review): a flat diamond-shaped ray that flies
    like a kite, a long string-tail with bows, a little face underneath."""
    d = D(c, p)
    col = hexc(s.get('color', '#e05050'))
    bow = hexc(s.get('bow', '#ffd23a'))
    flap = (-1.2 if p.frame % 2 else 0.6)
    B = d.part(d.lean, d.bob - 3)
    B.poly([(16, 4 + flap * 0.3), (27, 14 + flap), (16, 22), (5, 14 + flap)], col)
    B.poly([(16, 4 + flap * 0.3), (16, 22), (5, 14 + flap)], light(col, 0.12), shade=False)
    B.line(16, 4, 16, 22, dark(col, 0.25), w=0.5)  # the kite's cross-sticks
    B.line(5, 14 + flap, 27, 14 + flap, dark(col, 0.25), w=0.5)
    d.put(B)
    F = d.part(d.lean, d.bob - 3)  # a ray's face: big eyes and a smile
    if p.facing != 'up':
        for x in (12.8, 19.2):
            F.ellipse(x, 12.6, 1.9, 1.9, '#ffffff', shade=False)
            F.dot(x + 0.4, 12.8, '#1a1a24', w=2, h=2)
        F.line(14.4, 16.4, 17.6, 16.4, dark(col, 0.45), w=0.6)
    d.put(F, outline=False)
    Tl = d.part(d.lean, d.bob - 3)
    sway = 1.5 if p.frame % 2 else -1.5
    Tl.line(16, 22, 16 + sway, 26.5, dark(col, 0.3), w=0.6)
    Tl.line(16 + sway, 26.5, 16 - sway, 31, dark(col, 0.3), w=0.6)
    for (x, y) in ((16 + sway * 0.5, 24.5), (16, 28.5)):
        Tl.poly([(x - 1.6, y - 1), (x, y), (x - 1.6, y + 1)], bow, shade=False)
        Tl.poly([(x + 1.6, y - 1), (x, y), (x + 1.6, y + 1)], bow, shade=False)
    d.put(Tl, outline=False)
    finish(c, d, shadow=(16, 31, 6, 1))


def cloud_pup(c: Canvas, p: Pose, s: dict):
    """A Zephyr Pup (#75 item 15d review): a puppy made of cloud — fluffy body,
    floppy ears, a little snout and paws, puffs of wind for a tail."""
    d = D(c, p)
    col = hexc(s.get('color', '#e8f2fa'))
    lean, bob = d.lean, d.bob
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10.5, 13, 18, 20.5)):
        off = p.step * (1 if i % 2 else -1)
        legs.ellipse(lx + off, 27.6, 1.5, 2.2, dark(col, 0.08) if i % 2 else dark(col, 0.14))
    d.put(legs)
    B = d.part(lean, bob)
    for (x, y, r) in ((11, 20, 4.4), (15.5, 19, 5), (19.5, 21, 4.2), (14, 23, 4)):
        B.ellipse(x, y, r, r * 0.9, col)
    B.line(7, 18.5, 3.4, 13.6, '#9aaabc', w=1.4)  # a wagging tail
    B.ellipse(3.2, 13, 1.6, 1.4, light(col, 0.1))  # a wind-puff at its tip
    d.put(B)
    H = d.part(lean, bob)
    hx, hy = 22.5, 13.5
    H.ellipse(hx, hy, 4.6, 4.2, col)
    H.ellipse(hx - 3.2, hy - 0.4, 1.9, 3.4, '#9aaabc')  # floppy ears, grey-blue
    H.ellipse(hx + 0.6, hy - 3.6, 1.6, 2.4, '#9aaabc')
    H.ellipse(hx + 3.6, hy + 2.2, 2.6, 1.9, light(col, 0.15))  # snout
    H.dot(hx + 5.4, hy + 1.4, '#1a1a24', w=2, h=2)  # a dark nose
    d.put(H)
    if p.facing != 'up':
        d.eyes(H, [(hx - 0.6, hy - 0.8), (hx + 2.4, hy - 0.8)])
    finish(c, d, shadow=(15, 30.4, 8, 1.1))


def snail(c: Canvas, p: Pose, s: dict):
    """A tide snail (#75 item 15d): a soft body that slides along, a big
    spiral shell on its back — the shell takes the first hit."""
    d = D(c, p)
    col = hexc(s.get('color', '#c8b8a0'))
    shell = hexc(s.get('shell', '#4a8ab0'))
    lean, bob = d.lean, d.bob
    slide = p.step * 1.2
    B = d.part(lean, bob)
    B.ellipse(16 + slide * 0.3, 26.5, 10, 3.4, col)  # the foot
    B.ellipse(9 + slide * 0.3, 21.5, 3.6, 4.6, col)  # the head, up front
    B.line(7.6, 17.6, 6.4, 13.4, col, w=1)  # eye stalks
    B.line(10.4, 17.6, 11.4, 13.4, col, w=1)
    d.put(B)
    S = d.part(lean * 0.6, bob)
    S.ellipse(19, 18.5, 7.4, 7.2, shell)
    S.ellipse(19.6, 18.8, 4.6, 4.4, light(shell, 0.25), shade=False)
    S.ellipse(20, 19, 2.2, 2.1, dark(shell, 0.25), shade=False)  # the spiral's middle
    S.ellipse(16.4, 14.6, 1.6, 1.2, light(shell, 0.5), shade=False)  # shine
    d.put(S)
    E = d.part(lean, bob)
    if p.facing != 'up':
        E.dot(6.4, 13, '#1a1a24', w=2, h=2)
        E.dot(11.4, 13, '#1a1a24', w=2, h=2)
    d.put(E, outline=False)
    finish(c, d, shadow=(16, 30.2, 9, 1.1))


def marker_post(c: Canvas, p: Pose, s: dict):
    """A Marker Post (#75 item 15d): a wooden waymark post that hops about,
    a red flag on top and a grumpy face carved in the wood."""
    d = D(c, p)
    col = hexc(s.get('color', '#a8743e'))
    flag = hexc(s.get('flag', '#e04040'))
    hop = (-1.6 if p.frame % 2 else 0.0)
    B = d.part(d.lean, d.bob + hop)
    B.rect(12, 9, 20, 28.6, col)
    B.rect(12, 9, 14, 28.6, light(col, 0.2), shade=False)
    B.rect(11, 27.4, 21, 29.6, dark(col, 0.3))
    B.rect(19.4, 3, 20.6, 10, '#6a4424')  # the flagpole
    B.poly([(20.6, 3), (28, 5.2), (20.6, 7.6)], flag)
    if p.facing != 'up':
        B.rect(13.6, 14, 15.6, 15, dark(col, 0.5), shade=False)  # cross brows
        B.rect(16.6, 14, 18.6, 15, dark(col, 0.5), shade=False)
    d.put(B)
    if p.facing != 'up':
        d.eyes(B, [(14.6, 17), (17.6, 17)])
    finish(c, d, shadow=(16, 30.2, 5, 1.1))


def hollow_acorn(c: Canvas, p: Pose, s: dict):
    """An acorn with nobody home: two eyes glint in its hollow, and its cap is
    a helmet that takes the first hit."""
    d = D(c, p)
    col = hexc(s.get('color', '#b8783a'))
    cap = hexc(s.get('cap', '#6a4a2a'))
    lean, bob = d.lean, d.bob
    Lg = d.part(lean * 0.4, 0)
    for i, lx in enumerate((13, 19)):  # two stubby legs
        off = p.step * (1.6 if i % 2 else -1.6)
        Lg.rect(lx - 1 + off, 25, lx + 1 + off, 29.6, dark(col, 0.3))
        Lg.rect(lx - 1.4 + off, 28.8, lx + 1.8 + off, 30.4, dark(col, 0.45))
    d.put(Lg)
    B = d.part(lean, bob)
    B.ellipse(16, 19.5, 7.6, 7.4, col)
    B.poly([(11, 23), (16, 28.6), (21, 23)], col)  # the acorn's point
    B.ellipse(13, 18.5, 1.6, 3, light(col, 0.25), shade=False)
    hx = 17.6 if p.facing == 'side' else 16
    if p.facing != 'up':
        B.ellipse(hx, 20.5, 3.4, 3.8, (34, 18, 10), shade=False)  # the hollow
        glint = (255, 214, 90) if not p.hurt else WHITE
        for x in (hx - 1.2, hx + 1.2):
            B.dot(x, 19.6, glint)
    d.put(B)
    C = d.part(lean, bob)  # the cap: its shield
    lift = {'raise': -1.2, 'strike': 0.4}.get(p.arm, 0.0)
    C.ellipse(16, 12.6 + lift, 9.2, 4.6, cap)
    if d.sep:
        for (x, y) in ((10, 12), (13, 10.5), (16, 12), (19, 10.5), (22, 12), (13, 13.6), (19, 13.6)):
            C.dot(x, y + lift, dark(cap, 0.3))  # scales
    C.rect(15.2, 6.4 + lift, 16.8, 9 + lift, dark(cap, 0.2))  # the stem
    if s.get('shield'):
        C.ellipse(16, 15.6 + lift, 8.6, 1.2, light(cap, 0.3), shade=False)  # a bright rim: it's armour
    d.put(C)
    finish(c, d, shadow=(16, 30.6, 6.5, 1.2))


def tree_folk(c: Canvas, p: Pose, s: dict):
    """A talking tree (Old Ringwood): a broad trunk with a kind old face, a
    crown of leaves and roots for feet. It sways; it never walks."""
    d = D(c, p)
    bark = hexc(s.get('bark', '#7a5232'))
    leaf = hexc(s.get('leaf', '#5a8a3a'))
    sway = (0.5 if p.frame % 2 else -0.5) * d.u
    R = d.part(0, 0)
    R.poly([(8, 30.6), (11, 25), (21, 25), (24, 30.6), (19, 28.6), (16, 30.6), (13, 28.6)], dark(bark, 0.15))
    d.put(R)
    T = d.part(sway * 0.4, 0)
    T.rect(10, 13, 22, 28, bark)
    if d.sep:
        for x in (11.5, 14.5, 18.5, 20.8):
            T.line(x, 14, x + 0.4, 27, dark(bark, 0.3), w=0.5)  # grooves
    if p.facing == 'side':
        T.ellipse(12.5, 24, 2, 1.6, '#c8a070', shade=False)  # a ring-knot
        T.ellipse(12.5, 24, 1, 0.8, dark(bark, 0.2), shade=False)
    d.put(T)
    F = d.part(sway, 0)
    if s.get('stump'):
        # A root of the Dream Root (#75 item 16a): no leaves — a gnarled top
        # of twisting root-ends, a few violet buds glowing on them.
        F.ellipse(16, 13.5, 7, 2.6, dark(bark, 0.1))
        for (x0, y0, x1, y1) in ((11, 13, 7, 7), (15, 12.5, 13, 5), (18, 12.5, 21, 5.5), (21, 13, 25.5, 8)):
            F.line(x0, y0, x1, y1, bark, w=2.2)
        for (x, y) in ((7, 7), (13, 5), (21, 5.5), (25.5, 8)):
            F.dot(x, y, leaf, w=2 if d.sep else 1, h=2 if d.sep else 1)
    else:
        F.ellipse(16, 9, 11.5, 7.6, leaf)
        F.ellipse(10, 7, 4.4, 3.2, light(leaf, 0.18))
        F.ellipse(22, 6.4, 3.6, 2.6, light(leaf, 0.12))
        for (x, y) in ((7, 11), (24, 12), (15, 3.4), (20, 10)):
            F.dot(x, y, '#e0a03a', w=2 if d.sep else 1, h=1)  # golden leaves
    d.put(F)
    if p.facing != 'up':
        E = d.part(sway * 0.4, 0)
        ex = [18.5, 21] if p.facing == 'side' else [13.4, 18.6]
        for x in ex:
            E.line(x - 1.6, 16.4, x + 1.4, 16.8, '#5aaf4a', w=0.9)  # mossy brows
        d.eyes(E, [(x, 18.4) for x in ex], h=2 if not p.blink else 1)
        mx = (ex[0] + ex[1]) / 2
        E.line(mx - 2, 22.6, mx + 2, 22.6, dark(bark, 0.45), w=0.7)  # a slow smile
        E.dot(mx - 2.4, 22, dark(bark, 0.45))
        E.dot(mx + 2.4, 22, dark(bark, 0.45))
        d.put(E, outline=False)
    finish(c, d, shadow=(16, 30.9, 9, 1.4))


def turtle(c: Canvas, p: Pose, s: dict):
    """A very slow tortoise (Dawdle): a domed shell, stubby legs, sleepy eyes.
    Facing you, the shell sits higher and his head pokes out in front of it,
    so his face reads at map size (#75 item 14f review)."""
    d = D(c, p)
    shell = hexc(s.get('shell', '#6a8a3a'))
    skin = hexc(s.get('skin', '#a8c070'))
    lean, bob = d.lean, d.bob
    front = p.facing == 'down'
    Lg = d.part(lean * 0.3, 0)
    for i, lx in enumerate((9.5, 13, 18.5, 22)):
        off = p.step * (0.8 if i % 2 else -0.8)
        Lg.rect(lx - 1.5 + off, 24, lx + 1.5 + off, 29.4, skin if i % 2 else dark(skin, 0.1))
        Lg.rect(lx - 1.6 + off, 28.6, lx + 1.8 + off, 30.2, dark(skin, 0.35))
    d.put(Lg)
    Hd = None
    if p.facing != 'up':
        Hd = d.part(lean, bob)
        if front:
            hx, hy = 16, 24.4
            Hd.ellipse(hx, hy, 5, 4.2, skin)
            d.eyes(Hd, [(hx - 2, hy - 1.4), (hx + 2, hy - 1.4)], h=2, shine=False)
            if d.sep and not p.hurt:
                Hd.line(hx - 1.4, hy + 1.6, hx + 1.4, hy + 1.6, dark(skin, 0.45), w=0.6)  # a sleepy smile
        else:
            hx, hy = 25.5, 21.5
            Hd.ellipse(hx, hy, 3.8, 3.2, skin)
            Hd.rect(21, hy - 1.6, 24, hy + 1.8, skin)  # the neck
            d.eyes(Hd, [(hx + 1.2, hy - 1.2)], h=1, shine=False)  # half asleep
            if d.sep:
                Hd.dot(hx + 2.4, hy + 1.4, dark(skin, 0.4), w=2, h=1)
        if not front:
            d.put(Hd)  # behind the shell's edge; facing us, in front of it
    B = d.part(lean, bob)
    sy = 17.5 if front else 20.5
    B.ellipse(16 if front else 15, sy, 9.6, 6.8 if front else 7.2, shell)
    if d.sep:
        for (x, y) in ((11, sy - 2.5), (15, sy - 4.9), (19, sy - 2.5), (13, sy + 1.1), (17.4, sy + 1.1)):  # shell plates
            px = x + (1 if front else 0)
            B.ellipse(px, y, 1.9, 1.5, dark(shell, 0.2), shade=False)
            B.ellipse(px, y, 1.1, 0.8, light(shell, 0.12), shade=False)
    B.ellipse(16 if front else 15, sy + 5.5, 9.4, 1.6, '#d8c890')  # the rim
    d.put(B)
    if Hd is not None and front:
        d.put(Hd)
    finish(c, d, shadow=(16, 30.6, 9, 1.3))


# ─── Foglight Marsh (#75 item 14g) ────────────────────────────────────────────

def newt(c: Canvas, p: Pose, s: dict):
    """A little mist newt: a long low body, a curling tail, wide damp eyes."""
    d = D(c, p)
    col = hexc(s.get('color', '#8ab0b8'))
    belly = hexc(s.get('belly', '#e8a050'))
    lean, bob = d.lean, d.bob
    Lg = d.part(lean * 0.4, 0)
    for i, x in enumerate((10, 20)):  # two pairs of splayed legs
        off = p.step * (1.0 if i % 2 else -1.0)
        Lg.line(x + off, 24, x - 2 + off, 28.6, dark(col, 0.3), w=1)
        Lg.line(x + 1 - off, 24, x + 3 - off, 28.6, dark(col, 0.2), w=1)
    d.put(Lg)
    B = d.part(lean, bob)
    B.poly([(4, 24), (2.5, 21), (5, 19.5), (8, 23)], col)  # the tail
    B.ellipse(14.5, 23, 9, 3.6, col)
    B.ellipse(14.5, 25.4, 7.4, 1.4, belly, shade=False)
    if d.sep:
        for x in (9, 13, 17):  # misty spots
            B.ellipse(x, 21.6, 1.2, 0.8, light(col, 0.25), shade=False)
    d.put(B)
    H = d.part(lean, bob)
    hx, hy = 24, 21.6
    H.ellipse(hx, hy, 4.6, 3.4, col)
    if p.facing != 'up':
        d.eyes(H, [(hx + 0.6, hy - 1.6), (hx + 3, hy - 1.4)] if p.facing == 'down' else [(hx + 1.6, hy - 1.4)], h=2)
        if d.sep and not p.hurt:
            H.line(hx + 1, hy + 1.4, hx + 3.6, hy + 1.2, dark(col, 0.45), w=0.5)  # a little smile
    d.put(H)
    finish(c, d, shadow=(15, 30.4, 9, 1.1))


def bog_lantern(c: Canvas, p: Pose, s: dict):
    """A will-o'-the-wisp: a teal flame-spirit with a wispy tail and a sly grin — no
    cage, no post, so it never reads as one of Brume's lanterns (#75 item 14g)."""
    d = D(c, p)
    glow = hexc(s.get('glow', '#5ee8c0'))
    hover = (-1.4 if p.frame % 2 else 0.0)
    flick = 1 if p.frame % 2 else 0
    L = d.part(d.lean, d.bob + hover - 2)
    # The flame body: round below, licking up to a point, a tail curling under.
    L.ellipse(16, 18, 7.2, 6.6, glow)
    L.poly([(9.6, 16), (16, 3.5 + flick), (22.4, 16)], glow)
    L.poly([(18, 9), (22.5, 4 - flick), (21, 13)], light(glow, 0.1))
    L.poly([(11, 22), (16, 23), (8.5, 29.5)], dark(glow, 0.08))  # the tail
    L.ellipse(16, 19, 4.4, 4.2, light(glow, 0.35), shade=False)  # the hot heart
    ex = face_x(p, [16.6, 19.8], [13.6, 18.4])
    d.eyes(L, [(x, 16.8) for x in ex], color=hexc('#10302a'), h=2.4, shine=True)
    if ex and d.sep and not p.hurt:
        L.line(ex[0] - 0.6, 20.2, ex[-1] + 0.6, 20.2, hexc('#10302a'), w=0.6)  # a sly grin
        L.dot(ex[-1] + 0.6, 19.6, hexc('#10302a'))
    for (hx, hy) in ((8.6, 19.5), (23.4, 19.5)):  # little flame hands
        L.ellipse(hx, hy, 1.6, 1.3, dark(glow, 0.05))
    d.put(L)
    G = d.part(d.lean, d.bob + hover - 2)
    for k, (x, y) in enumerate(((5, 11), (27, 13), (6, 24), (26, 25))):
        if (k + p.frame) % 2:
            G.dot(x, y, light(glow, 0.45))
    d.put(G, outline=False)
    finish(c, d, shadow=(16, 30.4, 5, 1.1))


def storm_cloud(c: Canvas, p: Pose, s: dict):
    """The Last Fogbank: a dark, scowling thundercloud with glowing eyes fixed on you
    and sparks crackling round it — the last of the fog, and angry about it (#75 item 14g)."""
    d = D(c, p)
    col = hexc(s.get('color', '#6e7488'))
    L = d.part(d.lean, d.bob)
    wob = 1 if p.frame % 2 else 0
    for (x, y, r) in ((8, 19, 6.4), (16, 13 - wob, 9), (24, 18, 7), (12, 24, 6.4), (21, 24.5, 6.4), (5, 25, 3.8), (28, 25, 3.8)):
        L.ellipse(x, y, r, r * 0.9, col)
    for (x, y) in ((11, 9), (20, 7 - wob)):
        L.ellipse(x, y, 2.4, 1.4, light(col, 0.12), shade=False)
    if p.facing != 'up':
        # Glowing eyes under heavy, angry brows — staring straight at you.
        for (x, lean_y) in ((12.5, 1), (19.5, -1)):
            L.ellipse(x, 18, 2.3, 1.7, '#fff2a0', shade=False)
            L.ellipse(x, 18.2, 0.9, 1.2, hexc('#1a1a2a'), shade=False)
            L.line(x - 2.8, 15.4 - lean_y, x + 2.8, 15.4 + lean_y, dark(col, 0.55), w=1.0)  # the brow
        if not p.hurt:
            # A jagged scowl.
            pts = [(12.5, 23.6), (14, 22.6), (15.5, 23.6), (17, 22.6), (18.5, 23.6), (20, 22.6)]
            for (a, b) in zip(pts, pts[1:]):
                L.line(a[0], a[1], b[0], b[1], dark(col, 0.6), w=0.7)
    d.put(L)
    Z = d.part(d.lean, d.bob)
    if p.frame % 2 == 0:  # sparks crackling round it
        for (x0, y0) in ((3, 12), (27, 9)):
            Z.line(x0, y0, x0 + 1.4, y0 + 2.2, '#ffe25a', w=0.6)
            Z.line(x0 + 1.4, y0 + 2.2, x0 + 0.4, y0 + 2.6, '#ffe25a', w=0.6)
            Z.line(x0 + 0.4, y0 + 2.6, x0 + 1.8, y0 + 4.8, '#ffe25a', w=0.6)
    d.put(Z, outline=False)
    finish(c, d)


def lantern_post(c: Canvas, p: Pose, s: dict):
    """One of Brume's marsh lanterns on a post (#75 item 14g): dark, or glowing gold once lit."""
    d = D(c, p)
    lit = s.get('lit', False)
    wood = hexc('#6a4a30')
    L = d.part(0, 0)
    L.rect(15, 10, 17, 29.6, wood)
    L.rect(12, 28.6, 20, 30.2, dark(wood, 0.2))
    L.rect(16, 4.2, 22, 5.6, wood)  # the arm
    # A big lamp head — pale glass even when dark, so it reads as a lantern on a phone,
    # not a stick in the reeds (#75 item 14g UX review).
    L.rect(16.6, 5.6, 23.4, 7.2, '#2a2a30')  # the cap
    L.rect(16.2, 7.2, 23.8, 19, '#2a2a30')
    glass = hexc('#ffd860') if lit else hexc('#c4d2e2')
    L.rect(17.2, 8.2, 22.8, 18, glass)
    L.rect(19.6, 8.2, 20.4, 18, '#2a2a30' if not lit else '#e8b840')  # the middle bar
    if lit:
        L.ellipse(20, 13.1, 1.6, 2.4, '#fff4c0', shade=False)
    else:
        L.rect(17.8, 8.8, 18.6, 12, '#f2f6fb')  # a glint
    d.put(L)
    if lit:
        G = d.part(0, 0)
        # A ring of light round the lamp, so a lit lantern reads at a glance on a phone (#75 item 14g review).
        for k in range(16):
            a = k * math.tau / 16
            G.dot(20 + math.cos(a) * 7.4, 13.1 + math.sin(a) * 7.4, '#ffe680' if k % 2 else '#fff4c0')
        for (x, y) in ((20, 2.6), (11.2, 13.1), (28.8, 13.1), (20, 23.6)):
            G.dot(x, y, '#ffd84a')
        d.put(G, outline=False)
    finish(c, d, shadow=(16, 30.6, 5, 1.0))


def nameless_stone(c: Canvas, p: Pose, s: dict):
    """The Nameless Stone (#75 item 14g): a smooth grey standing stone, a tiny flower carved at the top."""
    d = D(c, p)
    col = hexc(s.get('color', '#9aa0a8'))
    L = d.part(0, 0)
    L.rect(9, 12, 23, 29.5, col)
    L.ellipse(16, 12, 7, 5, col)
    L.rect(9, 27, 23, 29.5, dark(col, 0.15))
    if d.sep:
        L.ellipse(13, 18, 1.6, 4, light(col, 0.12), shade=False)
    if s.get('notes'):
        # A songstone (#75 item 15f): music notes carved down its face — gold once it's rung.
        ink = s.get('glow') or '#f4f8ff'  # white notes on the dim stone (15f round 4: it read as a gravestone)
        for (x, y) in ((13, 17), (18, 24)):  # two big ♪ (15f review: they read as a lightning bolt)
            L.ellipse(x, y, 2.2, 1.7, ink, shade=False)
            L.line(x + 1.9, y, x + 1.9, y - 6, ink, w=0.9)
            L.line(x + 1.9, y - 6, x + 4.2, y - 4.4, ink, w=0.9)
    elif s.get('face'):
        # Echo-of-Echo (#75 item 15f): a stone face with a big round mouth, always mid-echo.
        for x in (13, 19):
            L.ellipse(x, 15, 1.4, 1.2, '#2a2a34', shade=False)
        L.ellipse(16, 21.5, 2.4, 2.8, '#2a2a34', shade=False)
        L.line(11.4, 12.4, 14.4, 12.8, dark(col, 0.4), w=0.6)
        L.line(17.6, 12.8, 20.6, 12.4, dark(col, 0.4), w=0.6)
    elif s.get('plaque'):
        # A plaque in the Nameless Hall (#75 item 16c): a smooth slab with nothing
        # carved on it at all — or, the last one, a single daisy.
        L.rect(11, 15, 21, 26, light(col, 0.08), shade=False)
        L.rect(11, 15, 21, 15.6, dark(col, 0.2), shade=False)
        if s.get('daisy'):
            for k in range(6):
                a = k * math.pi / 3
                L.ellipse(16 + math.cos(a) * 2.4, 20 + math.sin(a) * 2.4, 1.4, 1.0, '#ffffff', rot=a, shade=False)
            L.ellipse(16, 20, 1.2, 1.2, '#f0c030', shade=False)
            L.line(16, 22.6, 16, 25.4, '#5aa04a', w=0.6)
    elif s.get('tale'):
        # A tale-stone (#75 item 15e): lines of words carved down its face — gold once it glows.
        ink = s.get('glow') or dark(col, 0.35)
        for y in (13, 16, 19, 22, 25):
            L.line(11.5, y, 20.5 if y % 2 else 18.5, y, ink, w=0.8)
    else:
        for (dx, dy) in ((0, -1.6), (1.6, 0), (0, 1.6), (-1.6, 0)):  # the carved flower
            L.ellipse(16 + dx, 12 + dy, 1.1, 1.1, dark(col, 0.3), shade=False)
        L.dot(16, 12, light(col, 0.3))
    if s.get('glow'):
        for (x, y) in ((7, 9), (25, 12), (6, 22), (26, 24), (16, 4.5)):
            L.dot(x, y, s['glow'], w=1.2, h=1.2)
    d.put(L)
    finish(c, d, shadow=(16, 30.6, 8, 1.1))


# ─── Roster ──────────────────────────────────────────────────────────────────

def flying_tome(c: Canvas, p: Pose, s: dict):
    """The Dust Tome (#75 item 14h): an old book flapping its covers like wings,
    a sulky face on the spine and dust puffing off it."""
    d = D(c, p)
    cover = hexc(s.get('color', '#8a5a3a'))
    flap = 3.0 if p.frame % 2 else 0.0
    L = d.part(d.lean, d.bob - 2 - (1 if p.frame % 2 else 0))
    # The covers, open like wings (they flap), the pages in the middle.
    L.poly([(16, 12), (4, 8 + flap), (5, 22 - flap * 0.4), (16, 24)], cover)
    L.poly([(16, 12), (28, 8 + flap), (27, 22 - flap * 0.4), (16, 24)], dark(cover, 0.08))
    L.poly([(16, 13), (7, 10.5 + flap), (8, 21 - flap * 0.4), (16, 23)], '#f4ecd8')
    L.poly([(16, 13), (25, 10.5 + flap), (24, 21 - flap * 0.4), (16, 23)], '#e8dcc0')
    for k in range(3):  # lines of writing
        L.line(9, 13.5 + k * 2.4 + flap * 0.4, 14, 14.5 + k * 2.4, '#9a8a7a', w=0.5)
        L.line(18, 14.5 + k * 2.4, 23, 13.5 + k * 2.4 + flap * 0.4, '#9a8a7a', w=0.5)
    L.rect(14.6, 11, 17.4, 25, dark(cover, 0.2))  # the spine
    L.rect(14.6, 14, 17.4, 15, '#d0a848', shade=False)
    ex = face_x(p, [16.8], [15.2, 16.8])
    if ex:
        d.eyes(L, [(x, 18) for x in ex], color=hexc('#1e1410'), h=1.6, shine=False)
    d.put(L)
    if p.frame % 2 == 0:  # dust puffing off it
        Z = d.part(d.lean, d.bob)
        for (x, y) in ((5, 26), (27, 25), (9, 28)):
            Z.ellipse(x, y, 1.6, 1.2, '#c8bca8', shade=False)
        d.put(Z, outline=False)
    finish(c, d, shadow=(16, 30.4, 6, 1.1))


def ink_wisp(c: Canvas, p: Pose, s: dict):
    """The Ink Wisp (#75 item 14h): a drip of living ink with a pen-nib hat,
    trailing blots, big white eyes."""
    d = D(c, p)
    ink = hexc(s.get('color', '#2a2a5a'))
    hover = -1.2 if p.frame % 2 else 0.0
    L = d.part(d.lean, d.bob + hover - 1)
    L.ellipse(16, 18, 7.4, 7.2, ink)
    L.poly([(9, 18), (16, 6), (23, 18)], ink)
    for i, x in enumerate((10.5, 15, 19.5)):  # drips
        dy = 1.6 if (i + p.frame) % 2 else 0
        L.ellipse(x, 24.5 + dy, 1.8, 2.4, ink)
    L.poly([(13.6, 7.5), (16, 1.5), (18.4, 7.5)], '#c8a040')  # the nib
    L.line(16, 3.4, 16, 7, '#5a4a20', w=0.5)
    L.ellipse(12.5, 15, 1.8, 1.2, light(ink, 0.3), shade=False)  # a shine
    ex = face_x(p, [17, 20.4], [13.4, 18.6])
    d.eyes(L, [(x, 17) for x in ex], color=hexc('#ffffff'), h=2.6, shine=False)
    for x in ex:
        L.dot(x + (0.4 if p.facing == 'right' else 0), 17.6, hexc('#10102a'))
    d.put(L)
    Z = d.part(d.lean, d.bob)
    for k, (x, y) in enumerate(((6, 27), (25, 28), (21, 30))):  # blots on the floor
        if (k + p.frame) % 2:
            Z.ellipse(x, y, 1.4, 0.8, ink, shade=False)
    d.put(Z, outline=False)
    finish(c, d, shadow=(16, 30.6, 5, 1.0))


def quill_imp(c: Canvas, p: Pose, s: dict):
    """The Quill Imp (#75 item 14h): a quick little imp riding a big feather quill,
    horns, a pointy tail, a cheeky grin — swift: it strikes first."""
    d = D(c, p)
    skin = hexc(s.get('color', '#c84a5a'))
    feather = hexc(s.get('feather', '#f4f0e0'))
    zoom = -1.6 if p.frame % 2 else 0.0
    Q = d.part(d.lean, d.bob + zoom)
    # The quill it rides, sweeping up behind it, barbs along its vane.
    Q.poly([(3, 26), (22, 10), (29, 4), (26, 13), (8, 27)], feather)
    for k in range(5):
        x = 9 + k * 4
        Q.line(x, 24 - k * 3.4, x + 2.6, 21.4 - k * 3.4, dark(feather, 0.15), w=0.5)
    Q.line(2, 27.5, 27, 6, '#8a7a5a', w=0.6)  # the shaft
    Q.poly([(1, 27), (3.6, 26), (2, 29.5)], '#2a2a3a')  # the inky nib
    d.put(Q)
    L = d.part(d.lean, d.bob + zoom - 2)
    L.ellipse(16, 17, 5.6, 5.0, skin)  # body
    L.ellipse(16, 11, 5.2, 4.6, skin)  # head
    L.poly([(12, 8.4), (11, 3.6), (14, 7.2)], dark(skin, 0.3))  # horns
    L.poly([(20, 8.4), (21, 3.6), (18, 7.2)], dark(skin, 0.3))
    L.line(20.5, 19.5, 25.5, 22, dark(skin, 0.1), w=0.8)  # tail
    L.poly([(25, 21), (27.5, 21.5), (25.8, 23.6)], dark(skin, 0.1))
    ex = face_x(p, [17, 19.6], [14.2, 17.8])
    d.eyes(L, [(x, 11) for x in ex], color=hexc('#1a1010'), h=1.8)
    if ex and not p.hurt:
        L.line(ex[0] - 0.4, 13.6, ex[-1] + 0.6, 13.2, hexc('#3a1010'), w=0.5)  # grin
    arm_x = {'strike': 23, 'follow': 22}.get(p.arm, 21)
    L.ellipse(arm_x, 16, 1.6, 1.3, skin)
    d.put(L)
    if p.frame % 2 == 0:  # speed lines — it's quick
        Z = d.part(d.lean, d.bob + zoom)
        for y in (12, 17, 22):
            Z.line(0.5, y, 4.5, y, '#ffffff', w=0.5)
        d.put(Z, outline=False)
    finish(c, d, shadow=(15, 30.4, 6, 1.1))


def voice_crystal(c: Canvas, p: Pose, s: dict):
    """The Crystal of Voices (#75 item 15g review round 3): a tall rose-gold gem on a
    little stone, music notes rising off it, twinkling frame to frame."""
    d = D(c, p)
    L = d.part(0, d.bob)
    L.rect(10, 26, 22, 30, '#8a8a96')  # the stone it stands on
    L.poly([(16, 4), (22, 14), (19, 26), (13, 26), (10, 14)], '#ff8ab8')
    L.poly([(16, 4), (16, 26), (13, 26), (10, 14)], '#ffc0dc', shade=False)
    L.line(16, 4, 16, 26, '#ffffff', w=0.5)
    up = 1 if p.frame % 2 else 0
    for (x, y) in ((24, 8 - up), (6, 12 + up)):
        L.ellipse(x, y, 1.2, 0.9, '#ffe070', shade=False)
        L.line(x + 1, y, x + 1, y - 3, '#ffe070', w=0.6)
    d.put(L)
    finish(c, d, shadow=(16, 30.8, 6, 1))


def hush_fiend(c: Canvas, p: Pose, s: dict):
    """The Hush Fiend (#75 item 15g): a big grey pillow of a Fiend with stitched
    seams and tassels, cross sleepy-angry eyes, one huge finger to its lips —
    SHHH — and a crossed-out speaker stitched on its tummy."""
    d = D(c, p)
    col = hexc(s.get('color', '#9a96b0'))
    sway = 1 if p.frame % 2 else 0
    L = d.part(d.lean * 0.4, d.bob)  # a small lunge, so it stays in its frame (review round 4)
    # The cushion body, puffed at the corners, a tassel on each.
    L.ellipse(16, 18, 12.6, 11.0, col)
    for (x, y) in ((5, 8.5), (27, 8.5), (5, 28), (27, 28)):
        L.ellipse(x, y, 2.6, 2.6, col)
        L.dot(x + (1.6 if x > 16 else -1.6), y + (1.6 if y > 16 else -1.6), '#e8c860')
    L.line(4.6, 18, 27.4, 18, dark(col, 0.18), w=0.5)  # the seam round its middle
    for x in range(6, 27, 3):
        L.dot(x, 18.6, dark(col, 0.25))  # stitches
    if p.facing != 'up':
        # Narrow, glaring eyes under heavy, slanting brows (15g review: it looked sleepy).
        for (x, tilt) in ((11.4, 1), (20.6, -1)):
            L.ellipse(x, 12.8, 2.4, 1.0, '#ffffff', shade=False)
            L.ellipse(x, 12.9, 0.9, 0.8, '#2a1a4a', shade=False)
            L.line(x - 3, 10.6 - tilt * 1.4, x + 3, 10.6 + tilt * 1.4, '#2a1a4a', w=1.0)
        # A short, pursed mouth…
        L.ellipse(16, 18.4, 1.8, 0.8, '#3a2050', shade=False)
        if not p.hurt:
            # …and a lilac mitten from the side, one finger up across the lips: SHHH
            # (review round 4: the long skin-coloured finger read as a nose).
            mit = dark(col, 0.12)
            L.ellipse(19.4, 21.4, 2.8, 2.2, mit)  # the mitten fist
            for k in range(3):
                L.dot(21.6, 20.2 + k * 1.2, dark(col, 0.3))  # its knuckles
            L.rect(16.8, 16 - sway * 0.5, 18.4, 20.6, mit)  # one finger, up over the lips
            L.ellipse(17.6, 16 - sway * 0.5, 0.9, 0.7, mit)
            # A little puff of "shh" breath.
            L.ellipse(12.2, 17.2, 1.1, 0.8, '#e8e4f4', shade=False)
            L.ellipse(10.4, 16.2, 0.7, 0.5, '#e8e4f4', shade=False)
    # Little stubby arms reaching to shush.
    arm = {'strike': 4, 'follow': 2}.get(p.arm, 0)
    for (x0, side) in ((4, -1), (28, 1)):
        x = x0 + side * (arm + sway)
        L.ellipse(x, 21, 2.2, 1.8, col)
    d.put(L)
    finish(c, d, shadow=(16, 30.8, 9, 1.3))


def hollow_fiend(c: Canvas, p: Pose, s: dict):
    """The Hollow Fiend (#75 item 14h): a Fiend-shaped hole in the world — a black
    void in a ragged cloak of torn pages, cold violet eyes and grasping claws."""
    d = D(c, p)
    void = hexc(s.get('color', '#141020'))
    rim = hexc(s.get('rim', '#7a5ac8'))
    sway = 1 if p.frame % 2 else 0
    L = d.part(d.lean, d.bob)
    # The tattered cloak of old pages, a hood over the hole.
    L.poly([(16, 2), (27, 12), (29, 30), (24, 27.5), (20, 30.5), (16, 27.5), (12, 30.5), (8, 27.5), (3, 30), (5, 12)], '#d8ccb0')
    for k in range(5):  # writing on the pages, faded
        L.line(8 + k * 3.6, 16 + k % 2, 10 + k * 3.6, 26, '#a89a80', w=0.5)
    # The absence: a void where a body should be, ringed with violet light.
    L.ellipse(16, 15, 9.2, 10.6, rim)
    L.ellipse(16, 15.2, 8.0, 9.6, void, shade=False)
    for (x, y) in ((11, 20), (21, 11), (14, 9), (20, 21)):
        L.dot(x, y, '#3a2a5a')  # specks of forgotten things falling in
    if p.facing != 'up':
        for (x, tilt) in ((12.6, 1), (19.4, -1)):
            L.ellipse(x, 13.4, 2.0, 1.3, '#c8a8ff', shade=False)
            L.ellipse(x, 13.5, 0.7, 1.1, '#ffffff', shade=False)
            L.line(x - 2.6, 11.2 - tilt, x + 2.6, 11.2 + tilt, '#c8a8ff', w=0.7)  # an angry brow
        if not p.hurt:
            L.poly([(12, 19), (20, 19), (18.5, 21.6), (16, 20.4), (13.5, 21.6)], '#c8a8ff')  # a jagged maw
            L.poly([(13.2, 19.4), (18.8, 19.4), (17.6, 20.8), (16, 20), (14.4, 20.8)], void)
    # Claws reaching out of the cloak.
    arm = {'strike': 4, 'follow': 2}.get(p.arm, 0)
    for (x0, side) in ((5, -1), (27, 1)):
        x = x0 + side * (arm + sway)
        for k in (-1.4, 0, 1.4):
            L.line(x, 18, x + side * 2.2, 18 + k * 1.6, '#2a2038', w=0.8)
    d.put(L)
    finish(c, d, shadow=(16, 30.8, 8, 1.3))



# ── Act IV: Lumina-That-Was (#75 item 16b) ──

def dog(c: Canvas, p: Pose, s: dict):
    """The Unnamed Dog (#75 item 16b): a friendly scruffy pup — floppy ears, a
    patch over one eye, a wagging tail, a red neckerchief."""
    d = D(c, p)
    fur = hexc(s.get('fur', '#c8a070'))
    patch = hexc(s.get('patch', '#7a5030'))
    lean, bob = d.lean, d.bob
    hx, hy = 21.5, 14.5
    T = d.part(lean, bob)
    wag = 1.6 if p.frame % 2 else -0.6
    T.line(8.5, 19.5, 4.6, 14 - wag, fur, w=2.2)  # the wagging tail
    d.put(T)
    legs = d.part(lean * 0.4, 0)
    for i, lx in enumerate((10.5, 12.5, 17, 19)):
        off = p.step * (1 if i % 2 else -1)
        legs.rect(lx - 1 + off, 22, lx + 1 + off, 29.6, fur if i % 2 else dark(fur, 0.15))
    d.put(legs)
    B = d.part(lean, bob)
    B.ellipse(14.5, 20.5, 7.2, 4.6, fur)
    B.ellipse(12, 19.5, 2.6, 2, patch)
    d.put(B)
    H = d.part(lean, bob)
    H.ellipse(hx, hy, 4.8, 4.4, fur)
    H.ellipse(hx - 3.6, hy + 0.6, 1.8, 3.4, patch, rot=0.3)  # floppy ears
    H.ellipse(hx + 3.8, hy + 0.6, 1.6, 3.2, patch, rot=-0.3)
    H.ellipse(hx + 2, hy + 2.4, 2.4, 1.6, light(fur, 0.35))  # muzzle
    H.dot(hx + 3.2, hy + 1.6, '#2a1a1a', w=2, h=1)  # nose
    H.ellipse(hx - 1.2, hy - 0.4, 1.6, 1.4, patch, shade=False)  # the eye patch
    H.poly([(hx - 4, hy + 4), (hx + 4, hy + 4), (hx, hy + 6.6)], s.get('scarf', '#d04040'))
    d.put(H)
    if p.facing != 'up':
        d.eyes(H, [(hx - 1.2, hy - 0.4), (hx + 2.2, hy - 0.4)])
    finish(c, d, shadow=(15, 30.4, 8, 1.1))


def sock(c: Canvas, p: Pose, s: dict):
    """A Lost Sock Golem (#75 item 16b review): a big striped sock standing on its
    heel and toe, a hole worn in the toe, two button eyes near the cuff."""
    d = D(c, p)
    col = hexc(s.get('color', '#f0ece4'))
    stripe = hexc(s.get('stripe', '#e04848'))
    hop = (-1.2 if p.frame % 2 else 0.0)
    B = d.part(d.lean, d.bob + hop)
    B.rect(11, 4, 20, 22, col)  # the leg of the sock
    B.ellipse(17, 24, 8.4, 5, col)  # the foot
    for y in (6.5, 10.5, 14.5):
        B.rect(11, y, 20, y + 1.8, stripe, shade=False)
    B.rect(10.4, 3, 20.6, 5.2, light(col, 0.12))  # the cuff
    B.ellipse(23.6, 25.6, 1.4, 1.2, dark(col, 0.45), shade=False)  # a hole in the toe
    d.put(B)
    if p.facing != 'up':
        d.eyes(B, [(13.6, 9), (17.6, 9)])
    finish(c, d, shadow=(17, 30.2, 8, 1.1))


def key_critter(c: Canvas, p: Pose, s: dict):
    """A Misplaced Key (#75 item 16b): a big brass key hopping on its teeth, a
    googly-eyed round bow, a little ribbon tag still tied on."""
    d = D(c, p)
    col = hexc(s.get('color', '#e0b040'))
    hop = (-1.6 if p.frame % 2 else 0.0)
    B = d.part(d.lean, d.bob + hop)
    B.ellipse(16, 10, 6, 6, col)
    B.ellipse(16, 10, 2.6, 2.6, dark(col, 0.45), shade=False)  # the bow's hole
    B.rect(14.6, 15, 17.4, 28, col)
    B.rect(17.4, 22, 21, 24, col)  # the teeth
    B.rect(17.4, 26, 20, 28, col)
    B.poly([(10.5, 12), (6, 15), (8.5, 17.5)], s.get('tag', '#e86a8a'))  # a ribbon tag
    d.put(B)
    if p.facing != 'up':
        d.eyes(B, [(13.6, 7.6), (18.4, 7.6)])
    finish(c, d, shadow=(16, 30.2, 5, 1.1))


def slate(c: Canvas, p: Pose, s: dict):
    """A class slate (#75 item 16b): a dark green chalkboard on an easel, a
    question chalked on it in white."""
    d = D(c, p)
    board = hexc(s.get('board', '#2e5a3e'))
    wood = hexc(s.get('wood', '#9a6a3a'))
    chalk = s.get('chalk', '#f4f4ec')  # gold once answered (16b review round 2)
    B = d.part(0, 0)
    B.line(11, 30, 13, 18, wood, w=1.4)  # easel legs
    B.line(21, 30, 19, 18, wood, w=1.4)
    B.rect(7, 6, 25, 20, wood)
    B.rect(8.4, 7.4, 23.6, 18.6, board, shade=False)
    for (x0, y0, x1) in ((10, 10, 18), (10, 13, 21), (10, 16, 15)):
        B.line(x0, y0, x1, y0, chalk, w=0.6)  # chalked lines
    B.dot(21, 15.6, chalk, w=2, h=2)  # a question mark's dot
    d.put(B)
    finish(c, d, shadow=(16, 30.4, 6, 1.0))


def bell(c: Canvas, p: Pose, s: dict):
    """The Lesson Bell (#75 item 16b): a brass school bell on a wooden stand,
    swinging a little on its own, with a sheepish face."""
    d = D(c, p)
    brass = hexc(s.get('color', '#e0b040'))
    wood = hexc(s.get('wood', '#8a5a32'))
    swing = 0.8 if p.frame % 2 else -0.8
    S = d.part(0, 0)
    S.rect(14.6, 18, 17.4, 29, wood)
    S.rect(10, 28, 22, 30, dark(wood, 0.2))
    d.put(S)
    B = d.part(swing, 0)
    B.poly([(10, 19), (12.6, 8), (19.4, 8), (22, 19)], brass)
    B.ellipse(16, 7.6, 3.6, 2, brass)
    B.ellipse(16, 19.4, 6, 1.4, dark(brass, 0.25))
    B.ellipse(16, 21, 1.4, 1.4, dark(brass, 0.4))  # the clapper
    d.put(B)
    if p.facing != 'up':
        d.eyes(B, [(14, 13), (18, 13)])
        B.line(14.6, 16, 17.4, 16, dark(brass, 0.5), w=0.5)
    finish(c, d, shadow=(16, 30.6, 6, 1.0))


def popcorn_cart(c: Canvas, p: Pose, s: dict):
    """The Popcorn Cart (#75 item 16b): a red-and-white striped cart with a glass
    box full of popcorn and two big wheels."""
    d = D(c, p)
    red = hexc(s.get('color', '#d04040'))
    B = d.part(0, 0)
    B.rect(7, 17, 25, 26, red)
    for x in (9, 13, 17, 21):
        B.rect(x, 17, x + 2, 26, '#f4f0e8', shade=False)  # stripes
    B.rect(8, 6, 24, 17, '#d8eef4')  # the glass box
    for (x, y) in ((10, 14), (13, 13), (16, 14.5), (19, 13), (22, 14), (12, 11), (15, 11.5), (18, 10.5), (21, 11)):
        B.ellipse(x, y, 1.4, 1.2, '#fff4c0')  # popcorn
    B.poly([(6, 6), (16, 1.5), (26, 6)], red)  # a little roof
    d.put(B)
    W = d.part(0, 0)
    for wx in (10, 22):
        W.ellipse(wx, 27, 3, 3, '#4a3a3a')
        W.ellipse(wx, 27, 1, 1, '#c8c0b0', shade=False)
    d.put(W)
    finish(c, d, shadow=(16, 30.6, 10, 1.0))


def thorn_ball(c: Canvas, p: Pose, s: dict):
    """A Thorn of Doubt (#75 item 16c): a round green bramble-ball bristling
    with thorns, a worried frown — it's never sure of anything."""
    d = D(c, p)
    col = hexc(s.get('color', '#5a8a3a'))
    hop = (-1.2 if p.frame % 2 else 0.0)
    B = d.part(d.lean, d.bob + hop)
    for k in range(10):
        a = k * math.pi / 5 + (0.3 if p.frame % 2 else 0.0)
        x0, y0 = 16 + math.cos(a) * 6.4, 19 + math.sin(a) * 6.4
        B.poly([(x0 - math.sin(a) * 1.6, y0 + math.cos(a) * 1.6), (16 + math.cos(a) * 10.4, 19 + math.sin(a) * 10.4),
                (x0 + math.sin(a) * 1.6, y0 - math.cos(a) * 1.6)], dark(col, 0.25))
    B.ellipse(16, 19, 7, 7, col)
    B.ellipse(13.4, 16.4, 2, 1.4, light(col, 0.3), shade=False)
    d.put(B)
    if p.facing != 'up':
        ex = face_x(p, [17, 20.4], [13.6, 18.4])
        d.eyes(B, [(x, 18.6) for x in ex])
        if ex and d.sep and not p.hurt:
            for x in ex:
                B.line(x - 1.4, 16, x + 1.2, 16.8 if x < 16 else 15.2, dark(col, 0.55), w=0.5)  # worried brows
            mx = sum(ex) / len(ex)
            B.line(mx - 1.6, 22.6, mx + 1.6, 22.2, dark(col, 0.55), w=0.6)
    finish(c, d, shadow=(16, 30.2, 7, 1.1))


def wilt_flower(c: Canvas, p: Pose, s: dict):
    """A Wilt Sprite (#75 item 16c): a thirsty weed-flower, its head hanging on
    a bent stem, petals gone dry and brown at the tips, a sulky frown — it
    perks up a little on every hop (16c review: it looked too healthy)."""
    d = D(c, p)
    petal = hexc(s.get('color', '#b07a6a'))
    tip = hexc(s.get('tip', '#7a4a2a'))
    stem = hexc(s.get('stem', '#8a8a3a'))
    perk = 1.0 if p.frame % 2 else 0.0
    S = d.part(d.lean * 0.4, 0)
    S.line(16, 29.6, 15.6, 18, stem, w=1.6)
    S.line(15.6, 18, 19.6 - perk, 14 + perk, stem, w=1.6)  # the droop
    S.ellipse(12.2, 24.4, 3.2, 1.2, dark(stem, 0.15), rot=0.9)  # limp leaves
    S.ellipse(19.8, 25.4, 3.2, 1.2, dark(stem, 0.15), rot=-0.9)
    d.put(S)
    hx, hy = 20 - perk, 18 - perk
    F = d.part(d.lean, d.bob)
    for k in range(5):
        a = 0.35 + k * (math.pi - 0.7) / 4  # petals hang down round the bottom of the head
        px, py = hx + math.cos(a) * 4.0, hy + math.sin(a) * 4.4
        F.ellipse(px, py, 1.6, 2.8, petal, rot=a - math.pi / 2)
        F.dot(px + math.cos(a) * 2.2, py + math.sin(a) * 2.4, tip)
    F.ellipse(hx, hy, 3.0, 2.6, '#a8803a')
    d.put(F)
    if p.facing != 'up':
        ex = face_x(p, [hx + 0.2, hx + 2.2], [hx - 1.2, hx + 1.2])
        d.eyes(F, [(x, hy + 0.2) for x in ex], h=1)
        if ex and d.sep:
            for x in ex:
                F.line(x - 1, hy - 1.6 + (0.6 if x > hx else 0), x + 1, hy - 1.6 + (0 if x > hx else 0.6), '#4a2a1a', w=0.5)  # a sulky brow
    finish(c, d, shadow=(16, 30.4, 5, 1.0))


def bramble(c: Canvas, p: Pose, s: dict):
    """A Bramblewhy (#75 item 16c): a tangle of thorny vines that curls up into
    a big question mark, a wide-eyed face at the hook — it asks "why?" of everything."""
    d = D(c, p)
    col = hexc(s.get('color', '#6a7a3a'))
    berry = s.get('berry', '#8a3ac8')
    sway = 0.6 if p.frame % 2 else -0.6
    R = d.part(0, 0)
    R.ellipse(16, 27.6, 8, 2.6, dark(col, 0.2))
    for (x0, x1) in ((9, 12), (23, 20)):
        R.line(x0, 29, x1, 25, col, w=1.4)
    d.put(R)
    Q = d.part(d.lean + sway, d.bob)
    # the question mark: a hook on top, a stalk, and a dot of a berry below the knot
    pts = [(13, 11), (13.4, 7.4), (16, 5.4), (19.4, 6.2), (21, 9.4), (20, 12.6), (17, 15), (16, 18), (16, 22)]
    for (a, b) in zip(pts, pts[1:]):
        Q.line(a[0], a[1], b[0], b[1], col, w=3.2)
    for (x, y) in ((14, 8.6), (19.6, 7), (20.6, 11.6), (15.4, 17.6), (16.8, 21)):
        Q.dot(x + 1.2, y - 0.6, light(col, 0.35))  # thorns
    Q.ellipse(16, 25.2, 2.2, 2.0, berry)
    d.put(Q)
    if p.facing != 'up':
        d.eyes(Q, [(17.4, 8.8), (19.6, 9.6)] if p.facing == 'side' else [(15.4, 8.4), (18.6, 8.4)])
    finish(c, d, shadow=(16, 30.4, 7, 1.0))


def sprout(c: Canvas, p: Pose, s: dict):
    """A Garden Sprout (#75 item 16c): a tiny seedling in a clay pot, two round
    leaves held up like hands, always asking "why?"."""
    d = D(c, p)
    leaf = hexc(s.get('color', '#7ac85a'))
    hop = (-1.0 if p.frame % 2 else 0.0)
    P = d.part(d.lean * 0.4, d.bob + hop)
    P.poly([(11, 21), (21, 21), (19.6, 29.6), (12.4, 29.6)], '#c8703a')
    P.rect(10.4, 20, 21.6, 22.4, '#d8844a')
    d.put(P)
    L = d.part(d.lean, d.bob + hop)
    L.line(16, 20.4, 16, 13.4, dark(leaf, 0.2), w=1.4)
    lift = 1.2 if p.frame % 2 else 0.0
    L.ellipse(11.4, 11.4 - lift, 4.2, 2.6, leaf, rot=-0.5)
    L.ellipse(20.6, 11.4 - lift, 4.2, 2.6, leaf, rot=0.5)
    L.ellipse(16, 15.8, 3.6, 3.0, light(leaf, 0.15))  # a little round face on the stem
    d.put(L)
    if p.facing != 'up':
        ex = face_x(p, [16.4, 18.4], [14.6, 17.4])
        d.eyes(L, [(x, 15.6) for x in ex], h=1 if not d.sep else 2)
    finish(c, d, shadow=(16, 30.4, 5, 1.0))


def hall_root(c: Canvas, p: Pose, s: dict):
    """The deepest root in the Nameless Hall (#75 item 16c): a thick old root
    arching up out of the flagstones and plunging back down into a dark hole,
    a faint violet glow far below — a way down that isn't open yet."""
    d = D(c, p)
    bark = hexc(s.get('bark', '#6a4630'))
    glow = s.get('glow', '#b89aff')
    pulse = 0.4 if p.frame % 2 else 0.0
    H = d.part(0, 0)
    H.ellipse(17, 24, 10, 5.4, '#4a4458')
    H.ellipse(17, 24.4, 8.4, 4.2, '#140e1e', shade=False)
    H.ellipse(17, 25.4, 4.6 + pulse, 2 + pulse * 0.5, glow, shade=False)
    d.put(H, outline=False)
    R = d.part(0, 0)
    # The trunk: up out of the floor on the left, arching over, down into the hole.
    pts = [(4, 29), (5, 22), (7, 14), (11, 8.6), (16, 7.4), (20.4, 9.6), (22, 15), (20.6, 21), (18.6, 25)]
    for (a1, b1) in zip(pts, pts[1:]):
        R.line(a1[0], a1[1], b1[0], b1[1], bark, w=3.6)
    for (a1, b1) in zip(pts[1:5], pts[2:6]):
        R.line(a1[0] + 0.8, a1[1], b1[0] + 0.6, b1[1] + 0.6, light(bark, 0.2), w=0.8)  # a lit edge
    for (x0, y0, x1, y1) in ((5, 22, 1.4, 25), (6.4, 16, 2.6, 15), (21.6, 13, 26, 11.4), (21, 19, 26.6, 20.4)):
        R.line(x0, y0, x1, y1, dark(bark, 0.1), w=1.2)  # little side roots
    d.put(R)
    finish(c, d, shadow=(9, 30.2, 5, 1.0))



DRAWERS = {
    'thorn_ball': thorn_ball,
    'wilt_flower': wilt_flower,
    'bramble': bramble,
    'sprout': sprout,
    'hall_root': hall_root,
    'dog': dog,
    'key_critter': key_critter,
    'sock': sock,
    'slate': slate,
    'bell': bell,
    'popcorn_cart': popcorn_cart,
    'fireball': fireball,
    'humanoid': humanoid,
    'beast': beast,
    'blob': blob,
    'jelly': jelly,
    'flyer': flyer,
    'crab': crab,
    'shrimp': shrimp,
    'blank_sprite': blank_sprite,
    'leviathan': leviathan,
    'cuttlefish': cuttlefish,
    'dragon': dragon,
    'egg': egg,
    'serpent': serpent,
    'golem': golem,
    'gear': gear_creature,
    'hourglass': hourglass,
    'ghost': ghost,
    'cloud': cloud_fiend,
    'orb': orb_fiend,
    'demon': demon,
    'whale': whale,
    'octopus': octopus,
    'seal': seal,
    'umbra': umbra,
    'duck': duck,
    'knight_mare': knight_mare,
    'kraken': kraken,
    'parrot': parrot,
    'mummy': mummy,
    'magnet_tick': magnet_tick,
    'microbe': microbe,
    'pulley_spider': pulley_spider,
    'piston_boar': piston_boar,
    'flame_goblin': flame_goblin,
    'gargoyle': gargoyle,
    'dog_knight': dog_knight,
    'dart_frog': dart_frog,
    'pond_frog': pond_frog,
    'snapjaw': snapjaw,
    'orbit_otter': orbit_otter,
    'gravity_beetle': gravity_beetle,
    'eclipse_fox': eclipse_fox,
    'ironhorn': ironhorn,
    'oak_owl': oak_owl,
    'puffer': puffer,
    'starfish': starfish,
    'ring_beetle': ring_beetle,
    'sap_sprite': sap_sprite,
    'hollow_acorn': hollow_acorn,
    'snail': snail,
    'cat': cat,
    'kite_ray': kite_ray,
    'page_ray': page_ray,
    'cloud_pup': cloud_pup,
    'marker_post': marker_post,
    'tree_folk': tree_folk,
    'turtle': turtle,
    'newt': newt,
    'bog_lantern': bog_lantern,
    'storm_cloud': storm_cloud,
    'lantern_post': lantern_post,
    'nameless_stone': nameless_stone,
    'flying_tome': flying_tome,
    'ink_wisp': ink_wisp,
    'quill_imp': quill_imp,
    'hollow_fiend': hollow_fiend,
    'hush_fiend': hush_fiend,
    'voice_crystal': voice_crystal,
    'starfire': starfire,
}


@dataclass
class Char:
    id: str
    emoji: str
    drawer: str
    params: dict = field(default_factory=dict)
    boss: bool = False
    giant: bool = False  # the final boss: 2× a boss's world size, 2× its battle resolution
    battle: bool = True  # NPCs are world-only
    world: bool = True
    # Per-character battle sheet override (Ember's extra clips); None = shared.
    battle_poses: list | None = None
    battle_anims: dict | None = None


def H(**kw):
    return kw


ROSTER: list[Char] = [
    # ── Heroes ──
    # Valor the lion knight (crown, gold cape), Bastion the turtle guardian (silver
    # helm, amber shell), Talon the eagle ranger (green hood), Kira the fox duelist
    # (red ponytail) and Selene the moon-cat mystic (midnight hair, a glowing orb
    # held low so it never hides her face).
    Char('valor', '🦁', 'humanoid', H(skin='#eab04e', hair='mane', hair_color='#a83a1a', ears='round', snout='muzzle',
         outfit='#c8283a', trim='#ffd24a', hat='crown', item='sword', item_color='#ffb84a', tail='lion', cape='#e0a82a', blush=False)),
    Char('bastion', '🐢', 'humanoid', H(skin='#7ac08a', outfit='#8a5ad0', trim='#ffd24a', shell='#c07a3a', item='shield', item_color='#e0e6f0',
         hat='helmet', hat_color='#d0d8e4', snout='wide')),
    Char('talon', '🦅', 'humanoid', H(skin='#f4efe2', snout='beak', outfit='#3e7a3a', trim='#e8d8a0', wings='feather', wing_color='#7a4a2a',
         hat='hood', hat_color='#2e5a2e', item='spear', scarf='#d84a3a')),
    Char('kira', '🦊', 'humanoid', H(skin='#f6f4f8', ears='pointed', snout='pointy', muzzle='#ffffff', tail='fox',
         hair='ponytail', hair_color='#e03a3a', outfit='#2a2f5a', trim='#ff6a6a', scarf='#e03a3a', item='sword', item_color='#f0f4ff')),
    Char('selene', '🐈', 'humanoid', H(skin='#f2ede2', ears='pointed', snout='muzzle', muzzle='#ffffff', tail='long', eye='#3aa8ff',
         hair='long', hair_color='#26328a', outfit='#1f5f8a', trim='#e8eef8', robe=True, cape='#1a2050', item='orb', item_color='#ffe08a', blush=True)),
    # ── Ember ──
    Char('ember-egg', '🥚', 'egg'),
    Char('ember-hatchling', '🐣', 'dragon', H(color='#ff7a2f', stage='hatchling'),
         battle_poses=EMBER_BATTLE_POSES, battle_anims=EMBER_BATTLE_ANIMS),
    Char('ember-whelp', '🦎', 'dragon', H(color='#ff6a2a', stage='whelp'),
         battle_poses=EMBER_BATTLE_POSES, battle_anims=EMBER_BATTLE_ANIMS),
    Char('ember-dragon', '🐉', 'dragon', H(color='#f0502a', stage='dragon', wing='#ffb05a'),
         battle_poses=EMBER_BATTLE_POSES, battle_anims=EMBER_BATTLE_ANIMS),
    # Radiant Ember (#75 item 15g): the sixth crystal — sunrise-gold scales, starlit wings, sparkles.
    Char('ember-radiant', '🐉', 'dragon', H(color='#e8a820', stage='radiant', wing='#fff0b0', belly='#fff4d0', horn='#ffffff'),
         battle_poses=EMBER_BATTLE_POSES, battle_anims=EMBER_BATTLE_ANIMS),
    # ── Battle FX (not characters — reuse the battle-sheet pipeline) ──
    Char('fx-starfire', '🌟', 'starfire', world=False,
         battle_poses=[Pose(frame=i) for i in range(4)],
         battle_anims={'idle': {'from': 0, 'to': 3, 'fps': 12}}),
    Char('fx-fireball', '🔥', 'fireball', world=False,
         battle_poses=[Pose(frame=i) for i in range(4)],
         battle_anims={'idle': {'from': 0, 'to': 3, 'fps': 12}}),
    # ── Enemies: Numbria (math) ──
    Char('sum-slime', '🟦', 'blob', H(color='#3f8cff', symbol='plus')),
    Char('count-bat', '🦇', 'flyer', H(kind='bat', color='#5a3f8a', wing='#7a5ab0', number=True)),
    Char('sir-sumsalot', '🐉', 'dragon', H(color='#3aa870', stage='dragon', wing='#8ad8a0', helmet=True, lance=True)),
    Char('null-fiend', '👹', 'demon', H(color='#6a3ab0', zero=True), boss=True),
    # ── Verdara (science) ──
    Char('spore-puff', '🍄', 'blob', H(color='#f0dcc0', cap='#e04848')),
    Char('static-jelly', '🪼', 'jelly', H(color='#b07cff', zap=True)),
    Char('comet-crab', '🦀', 'crab', H(color='#ff6a3a', stars=True)),
    Char('smog-fiend', '🌫️', 'cloud', H(color='#8a9a7a', eye='#ffea3a'), boss=True),
    # ── Gearfall (engineering) ──
    Char('bolt-mouse', '🐭', 'beast', H(kind='mouse', fur='#b0a8c0', bolt=True)),
    Char('scrap-golem', '🗿', 'golem', H(color='#8c96a4', accent='#ff9a3a', bolts=True, antenna=True)),
    Char('gear-wyrm', '🐍', 'serpent', H(color='#c89a40', gears=True)),
    Char('rust-fiend', '🤖', 'golem', H(color='#b0603a', accent='#ffcf4a', glow='#ff4040', rust=True, horns=True), boss=True),
    # ── Chromaria (creativity) ──
    Char('doodle-imp', '👻', 'ghost', H(color='#f4f0ff', scribble=True)),
    Char('off-key-bird', '🐦', 'flyer', H(kind='bird', color='#ff8fb8', note=True)),
    Char('pixel-witch', '🦹', 'humanoid', H(skin='#b8e0a0', hair='long', hair_color='#2a2a4a', hat='witch', hat_color='#4a2a7a',
                                          outfit='#6a3aa0', trim='#9aff7a', robe=True, item='wand', item_color='#ff4fd8')),
    Char('gray-fiend', '🌑', 'orb', H(color='#4a4a5a', eye='#c8b8ff'), boss=True),
    # ── Whispering Woods (nature) ──
    Char('mossback-cub', '🐻', 'beast', H(kind='bear', fur='#8a5a3a', moss=True)),
    Char('thornhare', '🐰', 'beast', H(kind='hare', fur='#c8b89a', thorns=True)),
    Char('grumblebee', '🐝', 'flyer', H(kind='bee', color='#ffd23a')),
    Char('thicket-warden', '🦌', 'beast', H(kind='stag', fur='#7a5a3a', antler='#d8c090', leaves=True, moss=True), boss=True),
    # ── Starfall Coast (space) ──
    Char('tide-sprite', '🌊', 'blob', H(color='#3ab0e0', crest=True)),
    Char('meteor-mite', '☄️', 'blob', H(color='#7a6a6a', kind='mite')),
    Char('moon-moth', '🌙', 'flyer', H(kind='moth', color='#d8d0f0', wing='#bfc8ff', spot='#fff4b0')),
    Char('tide-colossus', '🐳', 'whale', H(color='#3a6ab0', crown=True), boss=True),
    # ── Clockwork Depths (history) ──
    Char('cog-sprite', '⚙️', 'gear', H(color='#c8a040')),
    Char('hourglass-imp', '⏳', 'hourglass'),
    Char('relic-golem', '🗿', 'golem', H(color='#9a8a70', accent='#6ad0c0', glow='#6affe0', runes=True, shield=True)),
    # ── The Crystal Spire ──
    Char('umbra', '🌑', 'umbra', boss=True, giant=True),
    # --- New critters, batch 2 (Verdara + Gearfall) ---
    Char('fizzlet', '🫧', 'blob', H(color='#7ad0e8', foam=True)),
    Char('magnetick', '🧲', 'magnet_tick', H(color='#c8303a', north='#e8303a', south='#2a6ae0')),
    Char('germinator', '🦠', 'microbe', H(color='#7ad04a')),
    Char('pulley-spider', '🕷️', 'pulley_spider', H(color='#8a6ab0')),
    Char('piston-boar', '🐗', 'piston_boar', H(color='#8a5a3a')),
    # --- New critters, batch 3 (Chromaria + Whispering Woods) ---
    Char('flicker-goblin', '🔥', 'flame_goblin', H(skin='#6ab04a')),
    Char('graffiti-gargoyle', '🎨', 'gargoyle', H(color='#8a8a96', glow='#ff8a2a', can='#3ab0e0')),
    Char('dog-knight', '🐕', 'dog_knight', H(fur='#c8945a', cape='#b0283a')),
    Char('dart-frog', '🐸', 'dart_frog', H(color='#2a8aff')),
    Char('snapjaw', '🪴', 'snapjaw', H(color='#5ab03a', mouth='#d0304a')),
    # --- New critters, batch 4 (Starfall Coast, Gearfall, Whispering Woods) ---
    Char('orbit-otter', '🦦', 'orbit_otter', H(fur='#7a5238')),
    Char('gravity-beetle', '🪲', 'gravity_beetle', H(color='#6a3aa8')),
    Char('eclipse-fox', '🦊', 'eclipse_fox', H(fur='#2e2848', glow='#ffb02a')),
    Char('ironhorn-rampager', '🦏', 'ironhorn', H(color='#6a6878')),
    Char('oak-owl', '🦉', 'oak_owl', H(color='#5a4030', glow='#ffd23a')),
    # ── Eldergrove (history, #75 item 14f) ──
    Char('ring-beetle', '🪲', 'ring_beetle', H(color='#7a4a2a', ring='#d8b07a')),
    Char('sap-sprite', '✨', 'sap_sprite', H(color='#e8a030')),
    Char('hollow-acorn', '🫥', 'hollow_acorn', H(color='#b8783a', cap='#6a4a2a', shield=True)),
    Char('ringkeeper', '🦌', 'beast', H(kind='stag', fur='#cdb894', belly='#efe4c8', antler='#8a6440', leaves=True, leaf='#e8a838',
                                     rings='#8a6440', key=True), boss=True),
    # ── Act II: Foglight Marsh (#75 item 14g) ──
    Char('mist-newt', '🦎', 'newt', H(color='#8ab0b8', belly='#e8a050')),
    Char('bog-lantern', '🎃', 'bog_lantern', H(glow='#7af0c0', frame='#3a3a4a')),
    Char('murk-toad', '🐸', 'dart_frog', H(color='#5a6a3a', spot='#2e3418')),
    Char('last-fogbank', '⛈️', 'storm_cloud', H(color='#6e7488'), boss=True),
    # ── Act II: the Sunken Archive (#75 item 14h) ──
    Char('dust-tome', '📖', 'flying_tome', H(color='#8a5a3a')),
    Char('ink-wisp', '🖋️', 'ink_wisp', H(color='#2a2a5a')),
    Char('quill-imp', '🪶', 'quill_imp', H(color='#c84a5a', feather='#f4f0e0')),
    # ── Act IV: Lumina-That-Was (#75 item 16b) ──
    Char('faded-echo', '👥', 'ghost', H(color='#c8c4d8')),
    Char('lost-sock-golem', '🧦', 'sock', H(color='#f0ece4', stripe='#e04848')),
    Char('misplaced-key', '🔑', 'key_critter', H(color='#e0b040', tag='#e86a8a')),
    Char('chalk-wisp', '🖍️', 'ink_wisp', H(color='#eceae0')),
    Char('eraser-imp', '🧽', 'quill_imp', H(color='#ff8fae', feather='#ffffff')),
    Char('sum-gremlin', '➗', 'demon', H(color='#5aa86a')),
    Char('hollow-fiend', '🕳️', 'hollow_fiend', H(color='#141020', rim='#7a5ac8'), boss=True),
    # ── Act III: Chorus Isle (#75 item 15g) ──
    Char('hush-fiend', '🔇', 'hush_fiend', H(color='#6a5aa8'), boss=True),
    # --- New critters, batch 1 (Numbria + Clockwork Depths) ---
    Char('raven-prince', '🐦‍⬛', 'duck', H(kind='raven', color='#38365c', bill='#4a4858', legs='#3a3848', eye='#ffd24a', crown='#ffcf3a')),
    Char('kia', '🦑', 'kraken', H(color='#6a5ad8', minus=True, loot=True)),
    Char('pirate-parrot', '🦜', 'parrot', H(color='#2a8ae0', wing='#2a7ad0', band='#2ab0a0', tail='#2a6ad0', chest='#ffd23a',
                                          face='#f4ece4', beak='#3a3440', hat='tricorn', hat_color='#8a2a3a', coin=True)),
    Char('tut-tut', '🧟', 'mummy', H()),
    Char('knight-mare', '🐴', 'knight_mare', H(steel='#a8b4c4', coat='#ece6da', mane='#c8343a', plume='#7a4ad0')),
    Char('clockwork-titan', '🦾', 'golem', H(color='#c89040', accent='#ff6a3a', glow='#ffe066', bolts=True, crown=True), boss=True),
    # ── The Silver Shallows' sea critters (nature — sea life; #75 item 14d) ──
    Char('bubble-puffer', '🐡', 'puffer', H(color='#f2b13a', belly='#fff2c8')),
    Char('inkling', '🐙', 'octopus', H(color='#b86ad8', brow=True, ink=True)),
    Char('starfix', '⭐', 'starfish', H(color='#ff7a5a')),
    # ── Act III: Taleshore I (geography, #75 item 15d) ──
    Char('compass-crab', '🦀', 'crab', H(color='#e8a03a')),
    Char('gull-scout', '🐦', 'flyer', H(kind='bird', color='#9aa4b0')),
    Char('tide-snail', '🐌', 'snail', H(color='#d8c8a8', shell='#3a8ab8')),
    Char('marker-post', '🪧', 'marker_post', H(color='#a8743e', flag='#e04040')),
    Char('latitude-cat', '🐈', 'cat', H(fur='#e8963a', stripe='#3a7ac8')),
    Char('globe-beetle', '🪲', 'gravity_beetle', H(color='#2a8ac8', land=True)),
    Char('zephyr-pup', '☁️', 'cloud_pup', H(color='#e8f2fa')),
    Char('kite-ray', '🎏', 'kite_ray', H(color='#e05050', bow='#ffd23a')),
    Char('squall-chick', '🐤', 'flyer', H(kind='bird', color='#ffd23a')),
    Char('compass-golem', '🗿', 'golem', H(color='#8a8a7a', accent='#d03a3a', glow='#ffd24a', runes=True, compass=True), boss=True),
    # ── Act III: Taleshore II (words, #75 item 15e) ──
    Char('word-eel', '🐍', 'serpent', H(color='#3aa088', eel=True)),
    Char('riddle-jelly', '🪼', 'jelly', H(color='#c08ae8', qmark=True)),
    Char('page-ray', '📄', 'page_ray', H(color='#f4ecd8', ink='#3a5ab0')),
    Char('blot', '⚫', 'blob', H(color='#22223e', splat=True)),
    Char('cuttle-scribe', '🦑', 'cuttlefish', H(color='#d8709a')),
    Char('margin-shrimp', '🦐', 'shrimp', H(color='#ff8a6a')),
    Char('riddle-leviathan', '🐋', 'leviathan', H(color='#3a3a7a'), boss=True),
    # ── Act III: Taleshore III (#75 item 15f) ──
    Char('echo-bat', '🔊', 'flyer', H(kind='bat', color='#2a8a9a', wing='#5ac0c8', waves=True)),
    Char('chime-gull', '🔔', 'flyer', H(kind='bird', color='#f4f4f8', wing='#c8d0dc', bell=True)),
    Char('drum-crab', '🥁', 'crab', H(color='#e8a05a', drum=True)),
    Char('hushling', '🤫', 'ghost', H(color='#a8c8f0', eye='#2a3a5a', hush=True)),
    Char('muffle-moth', '🦋', 'flyer', H(kind='moth', color='#6a5a4a', wing='#fbf4e4', spot='#d8c8a8', scarf=True)),
    Char('blank-sprite', '⬜', 'blank_sprite', H(color='#f4f4f0')),
    # ── Act IV: Aster's Garden (#75 item 16c) ──
    Char('thorn-of-doubt', '🌵', 'thorn_ball', H(color='#5a8a3a')),
    Char('wilt-sprite', '🥀', 'wilt_flower', H(color='#b07a6a')),
    Char('bramblewhy', '❓', 'bramble', H(color='#6a7a3a')),
    # The Gardener: Aster's old gardener, cross from so long alone — a straw hat,
    # a green smock and apron, a grey beard and a watering can.
    Char('the-gardener', '🧑‍🌾', 'humanoid', H(hair='short', hair_color='#b8b8b8', beard='#d8d8d8', hat='straw', hat_color='#e0c060',
         outfit='#4a7a3a', apron='#c8a878', trim='#f0d890', pants='#5a4a3a', item='can', item_color='#3a8a8a'), boss=True),
]

NPCS: list[Char] = [
    Char('elder-lumen', '👴', 'humanoid', H(hair='fringe', hair_color='#f0f0f0', beard='#f4f4f4', outfit='#e8e0c8', trim='#d0a030', robe=True, item='staff', item_color='#ffe066')),
    Char('hub-kid', '🧒', 'humanoid', H(hair='spiky', hair_color='#3a2a1a', outfit='#3ab070', trim='#ffffff', pants='#3a5a9a')),
    Char('hub-innkeeper', '👩‍🍳', 'humanoid', H(hair='bun', hair_color='#8a3a2a', hat='chef', outfit='#e87a5a', apron='#ffffff', item='ladle')),
    Char('hub-librarian', '🦉', 'humanoid', H(skin='#a07a5a', ears='tufts', snout='beak', beak='#e0a030', outfit='#5a4a8a', robe=True, glasses=True, item='book')),
    Char('hub-merchant', '🦝', 'humanoid', H(skin='#9a9aa4', ears='round', snout='muzzle', mask='#3a3a44', tail='ringed', outfit='#c07a30', pack='#8a5a30', blush=False)),
    Char('sage-abacus', '🧙', 'humanoid', H(hair='fringe', hair_color='#c8c8d8', beard='#e0e0f0', hat='wizard', hat_color='#3a5fc8', outfit='#3a5fc8', robe=True, item='abacus')),
    Char('numbria-villager', '👧', 'humanoid', H(hair='ponytail', hair_color='#e0a040', outfit='#6a8ae0', trim='#ffffff')),
    Char('numbria-merchant', '🦊', 'humanoid', H(skin='#e8783a', ears='pointed', snout='pointy', tail='fox', outfit='#3a8a9a', pack='#8a5a30', blush=False)),
    Char('sage-flora', '🧝', 'humanoid', H(hair='long', hair_color='#5ab04a', ears='elf', outfit='#3a9a5a', robe=True, hat='flower', item='staff', item_color='#8aff7a')),
    Char('verdara-villager', '👦', 'humanoid', H(hair='short', hair_color='#6a3a1a', outfit='#8ac04a', pants='#6a4a2a')),
    Char('verdara-merchant', '🐸', 'humanoid', H(skin='#6ac05a', snout='wide', outfit='#c0a040', pack='#8a5a30', hat='straw', blush=True)),
    Char('sage-cog', '🧑‍🔧', 'humanoid', H(hair='short', hair_color='#3a2a2a', hat='hardhat', hat_color='#ffb030', outfit='#4a6a8a', apron='#8a6a4a', item='wrench', glasses=True)),
    Char('gearfall-villager', '👷', 'humanoid', H(hair='short', hair_color='#2a1a1a', hat='hardhat', hat_color='#ffd23a', outfit='#e87a2a', item='hammer')),
    Char('gearfall-merchant', '🐹', 'humanoid', H(skin='#e8b87a', ears='round', snout='muzzle', outfit='#8a5ab0', pack='#8a5a30')),
    Char('sage-muse', '🧚', 'humanoid', H(hair='bob', hair_color='#ff8fd8', wings='fairy', wing_color='#d0f4ff', outfit='#b07cff', robe=True, item='wand', item_color='#ffe066')),
    Char('chromaria-villager', '🧑‍🎨', 'humanoid', H(hair='short', hair_color='#2a2a3a', hat='beret', hat_color='#d03a5a', outfit='#4ab0c0', apron='#f4ecd8', item='brush')),
    Char('chromaria-merchant', '🐙', 'octopus', H(color='#e0609a', hat='#3a2a5a')),
    Char('village-shopkeeper', '🧑‍💼', 'humanoid', H(hair='short', hair_color='#4a2a1a', hat='cap', hat_color='#3a8a5a', outfit='#e0c060', apron='#3a8a5a', trim='#8a5a30')),
    Char('village-elder', '👵', 'humanoid', H(hair='bun', hair_color='#e8e8f0', outfit='#9a5a8a', robe=True, glasses=True, item='staff', item_color='#ffb0d0')),
    Char('village-friend', '🧑', 'humanoid', H(hair='short', hair_color='#b05a2a', outfit='#5a8ad0', scarf='#ffd24a')),
    Char('village-keeper', '🧓', 'humanoid', H(hair='fringe', hair_color='#d0d0d0', beard='#e0e0e0', outfit='#6a5a3a', item='lantern')),
    Char('woods-hermit', '🧙‍♀️', 'humanoid', H(hair='long', hair_color='#8a4a2a', hat='wizard', hat_color='#3a7a4a', outfit='#5a8a3a', robe=True, item='orbstaff', item_color='#ffb0ff')),
    Char('woods-sprite', '🧚', 'humanoid', H(hair='bob', hair_color='#9affd0', wings='fairy', wing_color='#e0fff0', outfit='#6ad0a0', robe=True)),
    Char('woods-warden-sign', '🦡', 'humanoid', H(skin='#6a6a72', ears='round', snout='muzzle', muzzle='#f0f0f0', mask='#f0f0f0', outfit='#5a4a3a', item='staff', item_color='#c8a070')),
    Char('coast-fisher', '🎣', 'humanoid', H(hair='fringe', hair_color='#d0d0d0', beard='#e8e8e8', hat='straw', outfit='#3a6a9a', item='rod')),
    Char('coast-stargazer', '🔭', 'humanoid', H(hair='long', hair_color='#2a2a5a', outfit='#3a3a8a', trim='#ffe066', robe=True, item='telescope')),
    Char('coast-warden-sign', '🦭', 'seal', H(color='#8a9aa8', hat=True)),
    Char('depths-tinker', '🐭', 'humanoid', H(skin='#b0a8b8', ears='round', snout='muzzle', tail='long', outfit='#6a5a4a', apron='#8a6a4a', item='wrench', glasses=True)),
    Char('depths-echo', '🤖', 'golem', H(color='#9ab0c8', accent='#6ad0ff', antenna=True)),
    Char('depths-warden-sign', '🔧', 'golem', H(color='#c89a5a', accent='#ff6a3a', key=True, bolts=True)),
    Char('spire-keeper', '🔮', 'humanoid', H(hat='hood', hat_color='#5a3fa0', outfit='#5a3fa0', trim='#ffe066', robe=True, item='orb', item_color='#c89aff')),
    Char('grove-guardian', '🌙', 'ghost', H(color='#dfe8ff', moon=True, eye='#3a4a8a')),
    Char('grove-firefly', '🦋', 'flyer', H(kind='butterfly', color='#5a4a3a', wing='#9ae0ff', spot='#fff27a', glow=True)),
    Char('grove-otter', '🦦', 'humanoid', H(skin='#8a5a3a', ears='round', snout='muzzle', muzzle='#e8d0b0', tail='flat', outfit='#4a8ab0', blush=False)),
    # ── Village expansion townsfolk ──
    Char('village-mayor', '🎩', 'humanoid', H(hair='short', hair_color='#d8a040', hat='crown', hat_color='#e8c040', outfit='#8a2a4a', trim='#ffd24a', robe=True, glasses=True)),
    Char('village-clover-merchant', '🧺', 'humanoid', H(hair='ponytail', hair_color='#6a3a1a', hat='straw', outfit='#4ab060', apron='#f4ecd8', pack='#a07040')),
    Char('village-baker', '🥐', 'humanoid', H(hair='bun', hair_color='#3a2a1a', hat='chef', outfit='#f0d8a8', apron='#ffffff', item='ladle', blush=True)),
    Char('village-guard', '💂', 'humanoid', H(hair='short', hair_color='#2a1a1a', hat='helmet', hat_color='#b8c0cc', outfit='#3a5a9a', trim='#ffd24a', item='spear')),
    Char('village-kid', '👦', 'humanoid', H(hair='spiky', hair_color='#e0a040', outfit='#e05a3a', pants='#3a5a9a', scarf='#4ad0c0')),
    Char('numbria-tea-merchant', '🍵', 'humanoid', H(hair='bun', hair_color='#c8c8d0', outfit='#3a8a6a', apron='#f4ecd8', glasses=True, item='ladle')),
    Char('numbria-teacher', '👩‍🏫', 'humanoid', H(hair='long', hair_color='#5a2a1a', outfit='#5a4ac0', trim='#ffffff', glasses=True, item='book')),
    Char('numbria-kid', '🧒', 'humanoid', H(hair='bob', hair_color='#2a1a3a', outfit='#e0c040', pants='#3a3a6a')),
    Char('numbria-sundial', '🧔', 'humanoid', H(hair='fringe', hair_color='#8a6a4a', beard='#8a6a4a', hat='straw', outfit='#c08a3a', item='staff', item_color='#c8a070')),
    Char('verdara-seed-merchant', '🌻', 'humanoid', H(hair='long', hair_color='#f0c030', hat='flower', outfit='#e8a030', apron='#6ab04a', pack='#8a5a30')),
    Char('verdara-beekeeper', '🐝', 'humanoid', H(hair='bun', hair_color='#b07a3a', hat='band', hat_color='#f4ecd8', outfit='#f0d040', trim='#3a2a1a', item='lantern')),
    Char('verdara-kid', '🧒', 'humanoid', H(hair='short', hair_color='#7a4a2a', outfit='#5ab04a', pants='#8a5a3a', scarf='#ffd24a')),
    Char('verdara-botanist', '👩‍🔬', 'humanoid', H(hair='ponytail', hair_color='#3a7a4a', outfit='#f4f4f4', trim='#5ab04a', glasses=True, item='book')),
    Char('gearfall-coil-merchant', '🔩', 'humanoid', H(hair='short', hair_color='#3a2a1a', hat='cap', hat_color='#3ab0c0', outfit='#5a6a7a', apron='#8a6a4a', item='wrench')),
    Char('gearfall-inventor', '🥽', 'humanoid', H(hair='spiky', hair_color='#f0f0f0', outfit='#f4f4f4', trim='#c89040', glasses=True, item='hammer', beard='#f0f0f0')),
    Char('gearfall-clockkeeper', '🕰️', 'humanoid', H(hair='fringe', hair_color='#c8c8c8', beard='#d8d8d8', hat='band', hat_color='#6a4a2a', outfit='#6a4a8a', robe=True, item='lantern')),
    Char('gearfall-apprentice', '🧑‍🔧', 'humanoid', H(hair='short', hair_color='#c05a2a', hat='hardhat', hat_color='#3ab0e0', outfit='#e0a030', item='wrench')),
    Char('chromaria-mirror-merchant', '🪞', 'humanoid', H(hair='long', hair_color='#c8d8ff', outfit='#7a5ac0', trim='#e0e8ff', robe=True, item='orb', item_color='#d8f0ff')),
    Char('chromaria-curator', '🖼️', 'humanoid', H(hair='bob', hair_color='#d03a5a', hat='beret', hat_color='#2a2a3a', outfit='#2a2a3a', trim='#ffd24a', glasses=True)),
    Char('chromaria-musician', '🎻', 'humanoid', H(hair='long', hair_color='#ffb030', outfit='#3a8ad0', scarf='#ff6aa0', hat='flower')),
    Char('chromaria-kid', '🧑‍🎨', 'humanoid', H(hair='spiky', hair_color='#4a2a1a', outfit='#e07a3a', apron='#c8a070', item='brush')),
    # ── Dawnreach, the overworld (#75 Phase 1) ──
    Char('dawnreach-scout', '🧭', 'humanoid', H(hair='ponytail', hair_color='#7a4a2a', hat='cap', hat_color='#e07a2a', outfit='#4a8a5a', pants='#5a4a3a', scarf='#ffd24a', pack='#8a5a30', item='telescope')),
    Char('shrine-keeper', '🕯️', 'humanoid', H(hair='bun', hair_color='#ececf4', outfit='#ece4d4', trim='#e0b040', robe=True, item='lantern')),
    # ── Field-spell shrines + the Echo Mine (#75 item 9) ──
    Char('wayfarer-keeper', '🌠', 'humanoid', H(hair='long', hair_color='#d8d8e8', beard='#e8e8f4', hat='hood', hat_color='#2a3a7a', outfit='#3a4a9a', trim='#ffe066', robe=True, pack='#8a5a30', item='staff', item_color='#bfe0ff')),
    Char('quiet-keeper', '🦔', 'humanoid', H(skin='#b08a6a', ears='round', snout='pointy', hair='spiky', hair_color='#6a4a3a', outfit='#5a9a5a', robe=True, item='staff', item_color='#ff9ad0')),
    Char('mine-miner', '⛏️', 'humanoid', H(skin='#5a4848', ears='round', snout='muzzle', muzzle='#d8a0a0', hat='hardhat', hat_color='#ffd23a', outfit='#8a6a4a', apron='#6a4a2a', item='hammer', glasses=True)),
    # ── An inn in every town, and travelers with rumors (#75 item 11) ──
    Char('numbria-innkeeper', '🧶', 'humanoid', H(hair='bun', hair_color='#8a5a8a', outfit='#5a6ab0', apron='#f4ecd8', item='ladle', glasses=True)),
    Char('numbria-traveler', '🎒', 'humanoid', H(hair='short', hair_color='#3a2a1a', hat='cap', hat_color='#5a8a3a', outfit='#8a6a4a', pack='#8a5a30', item='staff', item_color='#c8a070')),
    Char('verdara-innkeeper', '🌿', 'humanoid', H(hair='long', hair_color='#5a8a3a', hat='flower', outfit='#6ab04a', apron='#f4ecd8')),
    Char('verdara-traveler', '🧳', 'humanoid', H(skin='#c87a3a', ears='pointed', snout='pointy', tail='fox', hat='straw', outfit='#7a4a8a', pack='#8a5a30', blush=False)),
    Char('gearfall-innkeeper', '🔩', 'humanoid', H(hair='short', hair_color='#5a3a2a', beard='#5a3a2a', outfit='#8a6a3a', apron='#6a4a2a', item='wrench')),
    Char('gearfall-traveler', '📨', 'humanoid', H(hair='spiky', hair_color='#e0a040', hat='cap', hat_color='#d03a3a', outfit='#3a5a9a', pack='#a07040', scarf='#ffd24a')),
    Char('chromaria-innkeeper', '🌈', 'humanoid', H(hair='bob', hair_color='#5a3ac0', outfit='#3a3a8a', apron='#ffb0d0', trim='#ffd24a')),
    # ── Act II: the Silver Shallows (#75 item 14) ──
    Char('gull-lamplighter', '🏮', 'humanoid', H(hair='bun', hair_color='#e8e8e8', hat='cap', hat_color='#d03a3a', outfit='#f4eee2', scarf='#3a6ab0', item='lantern', glasses=True)),
    Char('chromaria-traveler', '🗺️', 'humanoid', H(hair='long', hair_color='#e8c040', hat='beret', hat_color='#3ab0a0', outfit='#c05a8a', scarf='#4ad0c0', item='book')),
    # ── Item chains (#75 item 13) ──
    Char('dawnreach-hermit', '🏮', 'humanoid', H(hair='long', hair_color='#b8b8c8', beard='#d8d8e4', hat='hood', hat_color='#4a3a6a', outfit='#5a4a7a', trim='#c8b0ff', robe=True, item='lantern')),
    # ── Act II: Remembrance Hill (#75 item 14e) ──
    Char('hill-keeper', '🗿', 'humanoid', H(skin='#b4b0c0', hair='long', hair_color='#f0f0f4', beard='#f4f4f8', hat='hood', hat_color='#6a5aa0', outfit='#8a7ab8', trim='#e8e0ff', robe=True, item='book')),
    Char('hill-posy', '👧', 'humanoid', H(hair='ponytail', hair_color='#e0a040', hat='flower', outfit='#ff9ad0', trim='#7aa8ff')),
    Char('hill-merchant', '🧳', 'humanoid', H(hair='spiky', hair_color='#6a4a3a', hat='tricorn', hat_color='#5a3a2a', outfit='#8a5a3a', pack='#a07040', scarf='#e0a040', glasses=True)),
    Char('hill-innkeeper', '🫖', 'humanoid', H(hair='bun', hair_color='#c87a3a', outfit='#6a5ab0', apron='#f4ecd8', trim='#ffd24a')),
    Char('hill-traveler', '🎒', 'humanoid', H(hair='short', hair_color='#2a3a4a', hat='straw', outfit='#4a7ab0', pack='#8a5a30', item='staff', item_color='#c8a070')),
    Char('hill-carver', '🔨', 'humanoid', H(hair='short', hair_color='#3a2a1a', outfit='#a8a8b4', apron='#8a6a4a', item='hammer')),
    Char('hill-elder', '👴', 'humanoid', H(hair='fringe', hair_color='#e8e8e8', beard='#f0f0f0', outfit='#7a8a6a', glasses=True, item='rod', item_color='#8a6a4a')),
    Char('hill-jam', '🧺', 'humanoid', H(hair='bob', hair_color='#8a3a2a', outfit='#3a7ab0', apron='#ffd0e0', item='ladle')),
    # ── Act II: Eldergrove (#75 item 14f) ──
    Char('elder-fen', '🧺', 'humanoid', H(hair='ponytail', hair_color='#a0522d', hat='straw', outfit='#7a8a3a', trim='#c8a060', pack='#b08040', scarf='#e0a040', item='staff', item_color='#8a6a3a')),
    # Taller than the grove's scenery trees (boss-sized), so he reads as someone to talk to.
    Char('elder-ringwood', '🌳', 'tree_folk', H(bark='#7a5232', leaf='#5a8a3a'), boss=True),
    Char('elder-dawdle', '🐢', 'turtle', H(shell='#6a8a3a', skin='#a8c070')),
    # Sandpiper Cay's hermit — a hermit crab (#75 item 14i).
    Char('cay-hermit', '🐚', 'crab', H(color='#e8784a', shell='#e8d6b0')),
    # ── Act II: Foglight Marsh (#75 item 14g) ──
    Char('marsh-brume', '🏮', 'humanoid', H(hair='bun', hair_color='#6a6a7a', hat='hood', hat_color='#3a4a5a', outfit='#4a6a7a', trim='#ffd860', robe=True, item='lantern')),
    Char('marsh-puddle', '🐸', 'pond_frog', H(color='#8ad84a')),
    Char('marsh-slosh', '⛵', 'humanoid', H(hair='short', hair_color='#8a5a3a', beard='#8a5a3a', hat='straw', outfit='#3a6a5a', trim='#d8c890', item='staff', item_color='#8a6a3a')),
    Char('marsh-stone', '🪨', 'nameless_stone', H(color='#9aa0a8')),
    Char('marsh-lantern', '🏮', 'lantern_post', H(lit=False)),
    Char('marsh-lantern-lit', '🏮', 'lantern_post', H(lit=True)),
    # ── Act II: the Sunken Archive (#75 item 14h) ──
    Char('sage-chronicle', '🦉', 'humanoid', H(skin='#c8b89a', ears='tufts', snout='beak', beak='#e0a030', outfit='#2a7a7a', trim='#e8c860',
         robe=True, glasses=True, item='book', cape='#1e5a5a')),
    Char('archive-index', '🐭', 'humanoid', H(skin='#c8bcc8', ears='round', snout='muzzle', tail='long', hair='bob', hair_color='#8a6a5a',
         outfit='#a84a6a', apron='#f4ecd8', glasses=True, item='book')),
    Char('archive-binder', '📚', 'humanoid', H(hair='bun', hair_color='#5a3a2a', outfit='#6a4a8a', apron='#e8dcc0', trim='#d0a848', glasses=True, item='book')),
    Char('archive-hush', '🤫', 'ghost', H(color='#d8e4f4', eye='#3a4a6a')),
    Char('archive-quillon', '✒️', 'humanoid', H(hair='fringe', hair_color='#d8d8e0', beard='#e8e8f0', hat='hood', hat_color='#4a3a2a', outfit='#5a4a3a',
         trim='#c8a040', robe=True, item='staff', item_color='#f4f0e0')),
    Char('archive-margin', '🦋', 'flyer', H(kind='moth', color='#c8b89a', wing='#e8dcc0', spot='#8a6a4a')),
    Char('archive-leaf', '🧒', 'humanoid', H(hair='spiky', hair_color='#c87a3a', outfit='#3a8a6a', pants='#5a4a3a', scarf='#f4ecd8', item='book')),
    Char('archive-traveler', '🧭', 'humanoid', H(hair='short', hair_color='#2a2a2a', beard='#2a2a2a', hat='tricorn', hat_color='#2a3a5a', outfit='#3a5a8a', scarf='#d84a3a', pack='#8a5a30')),
    # ── Act III: Port Lantern (#75 item 15c) ──
    Char('port-harbormaster', '⚓', 'humanoid', H(hair='short', hair_color='#e8e8e8', beard='#f0f0f0', hat='cap', hat_color='#1e3a6a', outfit='#2a4a7a', trim='#ffd24a', item='staff', item_color='#8a6a3a')),
    Char('port-skipper', '🧭', 'humanoid', H(hair='ponytail', hair_color='#3a2a1a', hat='tricorn', hat_color='#8a2a2a', outfit='#f4eee2', scarf='#3a8aa8', pants='#2a3a5a')),
    Char('port-merchant', '🕯️', 'humanoid', H(hair='bun', hair_color='#a8a8b4', outfit='#8a3a5a', apron='#f4e8c8', trim='#ffd860', glasses=True, item='lantern')),
    Char('port-innkeeper', '🍲', 'humanoid', H(hair='short', hair_color='#8a4a2a', beard='#8a4a2a', outfit='#3a6a5a', apron='#f4ecd8', item='ladle')),
    Char('port-netmender', '🧶', 'humanoid', H(hair='long', hair_color='#d8d8e0', hat='hood', hat_color='#5a6a8a', outfit='#6a7a9a', trim='#e8c860', robe=True)),
    Char('port-lamplighter', '👦', 'humanoid', H(hair='spiky', hair_color='#e0a040', hat='cap', hat_color='#3a8aa8', outfit='#e8784a', pants='#3a3a5a', item='lantern')),
    Char('port-postmaster', '🐦', 'humanoid', H(skin='#c8c8d4', snout='beak', beak='#e0a030', hat='cap', hat_color='#3a5aa8', outfit='#5a7ab0', pack='#a07040')),
    Char('port-storyteller', '📖', 'humanoid', H(hair='long', hair_color='#5a3a6a', hat='hood', hat_color='#7a3a6a', outfit='#a84a7a', trim='#ffd860', robe=True, item='book')),
    Char('port-fisher', '🎣', 'humanoid', H(hair='short', hair_color='#d8d8d8', beard='#e8e8e8', hat='straw', hat_color='#d8b860', outfit='#5a7a4a', pants='#4a4a6a', item='rod', item_color='#8a6a3a')),
    Char('tale-rambler', '🥾', 'humanoid', H(hair='short', hair_color='#7a4a2a', hat='cap', hat_color='#3a7a4a', outfit='#a8784a', scarf='#3a6ab0', pants='#5a4a3a', pack='#6a8a4a', item='staff', item_color='#8a6a3a')),
    # Taleshore I (#75 item 15d)
    Char('drift-reel', '🎣', 'humanoid', H(hair='short', hair_color='#6a4a2a', hat='straw', hat_color='#e0c070', outfit='#3a8aa8', pants='#5a4a3a', item='rod', item_color='#8a6a3a')),
    Char('drift-sandy', '🪣', 'humanoid', H(hair='bob', hair_color='#2a2a3a', hat='bandana', hat_color='#3ab0a0', outfit='#ff8ab0', pants='#3a8ab0', item='broom')),
    Char('drift-salt', '🧂', 'humanoid', H(hair='ponytail', hair_color='#7a4a2a', outfit='#5ab0c0', trim='#ffffff', pants='#3a5a8a', pack='#c89a5a')),
    Char('way-lo', '🗺️', 'humanoid', H(hair='bun', hair_color='#2a2a3a', glasses=True, outfit='#8a6a3a', trim='#e8d8a0', item='telescope')),
    Char('way-pebble', '🐧', 'humanoid', H(skin='#2a2a3a', snout='beak', beak='#f0a030', outfit='#f4f4f8', blush=False)),
    Char('way-drift', '✏️', 'humanoid', H(hair='spiky', hair_color='#e8c040', outfit='#e05050', scarf='#3a6ab0', pants='#3a3a5a', item='book')),
    Char('gale-sough', '🌬️', 'humanoid', H(hair='long', hair_color='#d8e8f4', outfit='#6aa0c8', trim='#ffffff', robe=True, item='staff', item_color='#c8e0f0')),
    Char('gale-gully', '🕊️', 'flyer', H(kind='bird', color='#f07aa8')),
    Char('gale-tass', '🪁', 'humanoid', H(hair='short', hair_color='#a83a2a', hat='bandana', hat_color='#ffd23a', outfit='#e04a4a', apron='#f4e8c8', item='brush')),
    # Taleshore II (#75 item 15e)
    Char('reef-yarn', '🎏', 'humanoid', H(hair='bun', hair_color='#e8e0d0', hat='straw', hat_color='#e0c070', outfit='#3a8ab0', apron='#f4e8c8', item='rod', item_color='#8a6a3a')),
    Char('reef-verse', '🧜', 'humanoid', H(hair='long', hair_color='#3ab0a0', outfit='#e86a9a', trim='#ffd860', mermaid='#2ab0a0')),
    Char('reef-bloop', '🐠', 'puffer', H(color='#ff9a3a', belly='#fff2c8', fish=True)),
    Char('reef-stone', '🪨', 'nameless_stone', H(color='#a8b0b8', tale=True)),
    Char('reef-stone-lit', '🪨', 'nameless_stone', H(color='#c8d4dc', tale=True, glow='#ffd84a')),
    Char('ink-dot', '✒️', 'humanoid', H(hair='bob', hair_color='#2a2a3a', glasses=True, outfit='#3a3a6a', trim='#f4ecd8', item='book')),
    Char('ink-smudge', '🦑', 'octopus', H(color='#8ac8e8', friendly=True)),
    # Taleshore III (#75 item 15f)
    Char('cliff-reso', '🎶', 'humanoid', H(hair='bun', hair_color='#3a2a3a', outfit='#a03a6a', trim='#ffd860', robe=True, item='wand', item_color='#ffd860', tune=True)),
    Char('cliff-echo', '🗿', 'nameless_stone', H(color='#a8a49a', face=True)),
    Char('cliff-hum', '🐝', 'flyer', H(kind='bee', color='#fff0c0', stripes=True, scarf=True, tune=True)),
    Char('songstone', '🪨', 'nameless_stone', H(color='#9ab0c8', notes=True)),
    Char('songstone-rung', '🪨', 'nameless_stone', H(color='#c0d4e8', notes=True, glow='#ffd84a')),
    Char('quiet-shush', '🤫', 'humanoid', H(hair='bun', hair_color='#8a8a98', glasses=True, outfit='#4a5a7a', trim='#c8d0e0', robe=True, item='book')),
    Char('quiet-mime', '🎭', 'humanoid', H(skin='#f4f0f0', hair='short', hair_color='#1a1a1a', hat='cap', hat_color='#1a1a1a', outfit='#f4f4f4', trim='#1a1a1a', pants='#1a1a1a')),
    # ── Act III: Chorus Isle (#75 item 15g) ──
    Char('sage-aria', '🎼', 'humanoid', H(hair='long', hair_color='#f0c040', outfit='#c84a7a', trim='#ffe0f0', robe=True, cape='#7a2a5a',
         item='wand', item_color='#ffe0f0', tune=True)),
    Char('chorus-brio', '🎻', 'humanoid', H(hair='short', hair_color='#e8e8e8', hat='beret', hat_color='#c8304a', outfit='#2a2a3a', trim='#ffd860', item='violin')),
    Char('chorus-coda', '👧', 'humanoid', H(hair='bob', hair_color='#3a2a1a', outfit='#ffd040', trim='#ff6a8a', pants='#5a7ad0', tune=True)),
    Char('chorus-cadence', '👴', 'humanoid', H(hair='fringe', hair_color='#c8c8d0', beard='#e0e0e8', outfit='#3a4a8a', trim='#ffd860', robe=True, item='wand', item_color='#f4f4f4')),
    Char('chorus-crystal', '💎', 'voice_crystal'),
    Char('chorus-trill', '🐦', 'flyer', H(kind='bird', color='#ffd040', tune=True)),
    Char('chorus-do', '🧒', 'humanoid', H(hair='spiky', hair_color='#c84a2a', outfit='#4a8ad0', trim='#ffffff', pants='#2a3a6a')),
    Char('chorus-re', '👧', 'humanoid', H(hair='ponytail', hair_color='#c84a2a', outfit='#5ab04a', trim='#ffffff', pants='#2a3a6a')),
    Char('chorus-baritone', '🎣', 'humanoid', H(hair='short', hair_color='#5a4a3a', beard='#7a6a5a', hat='cap', hat_color='#2a4a6a', outfit='#3a6a8a', trim='#e8e0c8', item='rod')),
    # ── Act III: Chartmaker's Rest (#75 item 15h) ──
    Char('chart-chartmaker', '🧓', 'humanoid', H(hair='fringe', hair_color='#e8e8e8', beard='#f0f0f0', glasses=True, outfit='#2a4a8a', trim='#efe2bf',
         robe=True, item='book', item_color='#efe2bf')),
    Char('chart-pen', '🐦', 'flyer', H(kind='bird', color='#f4f4f4', wing_color='#8a8a9a')),
    Char('chart-inka', '👩‍🎨', 'humanoid', H(hair='bun', hair_color='#2a1a3a', hat='beret', hat_color='#d03a3a', outfit='#3a6ad0', trim='#f0e0c0',
         apron='#f4ead0', item='brush', item_color='#2a4a8a')),
    Char('quiet-sotto', '🗣️', 'humanoid', H(hair='short', hair_color='#5a3a2a', hat='hood', hat_color='#5a3a6a', outfit='#6a4a7a', scarf='#c8a040', pack='#8a6a4a')),
    Char('ink-bess', '🐚', 'humanoid', H(hair='bun', hair_color='#6a4a3a', hat='flower', outfit='#3a9ab0', apron='#f8e0d0', trim='#ff9ab0', item='lantern', shells=True)),
    # ── Act IV: the Dream Root Door (#75 item 16a) ──
    # Old Knot, a root of the Dream Root that talks: dark bark, pale violet buds.
    Char('root-knot', '🌳', 'tree_folk', H(bark='#6a4630', leaf='#d8b8ff', stump=True)),
    # Young Wick (16b's Memory Village; Say Her Name's fifth memory): a girl with
    # Grandmother Wick's bun — still brown — a flour-dusted apron and a rolling pin.
    Char('memory-young-wick', '👧', 'humanoid', H(hair='bun', hair_color='#8a5030', outfit='#9a5a8a', apron='#f8f0e0', trim='#ffb0d0', item='staff', item_color='#d8b080')),
    # Wisp's new face (Say Her Name): golden hair with a daisy, sunny wings, a white robe trimmed gold.
    # ── Act IV: Lumina-That-Was (#75 item 16b) ──
    Char('memory-young-lumen', '👦', 'humanoid', H(hair='spiky', hair_color='#5a3a2a', outfit='#3a6ad0', trim='#ffd060', pants='#4a3a2a', item='book')),
    Char('memory-fair', '🎪', 'humanoid', H(hair='bun', hair_color='#c84a2a', hat='straw', outfit='#e86a8a', apron='#fff4d8', trim='#ffd060')),
    Char('memory-popcorn', '🍿', 'popcorn_cart'),
    Char('memory-dog', '🐕', 'dog', H(fur='#c8a070', patch='#7a5030', scarf='#d04040')),
    Char('class-prim', '📏', 'humanoid', H(hair='bun', hair_color='#2a2a3a', glasses=True, outfit='#2e5a3e', trim='#f4f0e0', robe=True, item='wand', item_color='#e0c080')),
    Char('class-bell', '🔔', 'bell'),
    Char('class-slate', '📝', 'slate'),
    Char('class-slate-gold', '✨', 'slate', {'chalk': '#ffd23c'}),
    Char('wisp-named', '🌼', 'humanoid', H(hair='long', hair_color='#e0a030', hat='flower', flower='#ffffff', flower_r=3.4, wings='fairy', wing_color='#fff2b0', wing_scale=1.6, outfit='#fffaf0', trim='#f0c040', robe=True)),
    # ── Act IV: Aster's Garden and the Nameless Hall (#75 item 16c) ──
    Char('garden-sprout', '🌱', 'sprout', H(color='#7ac85a')),
    Char('hall-plaque', '🪧', 'nameless_stone', H(color='#c8c0b0', plaque=True)),
    Char('hall-plaque-daisy', '🌼', 'nameless_stone', H(color='#d8d0c0', plaque=True, daisy=True, glow='#fff2b0')),
    Char('hall-deep-root', '🕳️', 'hall_root', H(bark='#5a3a28', glow='#b89aff')),
]
# NPCs are world-only — except the ones who can join the party as battle
# companions (content/companion.ts), who need a battle sheet too.
BATTLE_COMPANIONS = {'hub-kid', 'woods-sprite', 'wisp-named'}
for n in NPCS:
    n.battle = n.id in BATTLE_COMPANIONS
