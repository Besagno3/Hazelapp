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
            back.ellipse(9, 13 + flap * 0.4, 4.2, 5.2, wc, rot=0.5)
            back.ellipse(10, 21, 3.0, 3.2, wc, rot=-0.3)
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
    if not robe:
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
        head.ellipse(12, 5, 2.2, 2.2, '#ff8fb8')
        head.dot(11.5, 4.5, '#ffe066')
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
    finish(c, d)


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
        if robe:
            legs.rect(lx - 1.8, 28 - lift, lx + 1.8, 30.5 - lift, boots)
        else:
            legs.rect(lx - 1.8, 24.5, lx + 1.8, 29 - lift, col)
            legs.rect(lx - 2.0, 28 - lift, lx + 2.0, 30.5 - lift, boots)
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
        head.ellipse(11, 5, 2.2, 2.2, '#ff8fb8')
        head.dot(10.5, 4.5, '#ffe066')
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
            head.ellipse(hx - 8, hy - 11, 1.8, 1.4, '#6fcf5a')
            head.ellipse(hx + 6, hy - 12, 1.8, 1.4, '#6fcf5a')
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
    if s.get('crest'):
        L.poly([(9, cy - ry + 3), (15, cy - ry - 5), (17, cy - ry), (23, cy - ry - 2), (22, cy - ry + 3)], light(col, 0.15))
    if s.get('symbol') == 'plus':
        L.rect(12.5, cy + 1, 15.5, cy + 2, WHITE, shade=False)
        L.rect(13.5, cy, 14.5, cy + 3, WHITE, shade=False)
    ex = face_x(p, [18, 21.5], [13.5, 18])
    d.eyes(L, [(x, cy - 2) for x in ex])
    if d.sep and ex:
        L.dot(ex[0] + 1.5, cy + 1.5, dark(col, 0.4), w=2, h=1)
    d.put(L)
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
    d.put(L)
    finish(c, d, shadow=(16, 30.5, 5.5, 1.3))


# ─── Crab ────────────────────────────────────────────────────────────────────


def crab(c: Canvas, p: Pose, s: dict):
    d = D(c, p)
    col = hexc(s['color'])
    L = d.part(d.lean, d.bob)
    for i, lx in enumerate((8, 11, 21, 24)):
        wig = (1 if (i + p.frame) % 2 else -1) * 0.8
        L.line(lx, 24, lx + (-3 if i < 2 else 3), 29 + wig, dark(col, 0.1), w=1.1)
    L.ellipse(16, 22, 9.5, 5.5, col)
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
    size = {'hatchling': 0.72, 'whelp': 0.86, 'dragon': 1.0}[stage]

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
    legs = d.part(lean * 0.4, 0)
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
    head = d.part(lean, bob)
    hx, hy = S(21, 12.5)
    hr = 6.2 * size * (1.15 if stage == 'hatchling' else 1)
    head.poly([(hx - 3 * size, hy - 3 * size), (hx - 6 * size, hy - 9 * size), (hx - 0.5 * size, hy - 4 * size)], s.get('horn', '#fff0c8'))
    head.poly([(hx + 0.5 * size, hy - 4 * size), (hx + 0 * size, hy - 10 * size), (hx + 3 * size, hy - 4.5 * size)], s.get('horn', '#fff0c8'))
    head.ellipse(hx, hy, hr, hr * 0.9, col)
    head.ellipse(hx + 4.5 * size, hy + 2 * size, 3.6 * size, 2.6 * size, col)
    head.dot(hx + 7 * size, hy + 0.8 * size, dark(col, 0.4))
    d.eyes(head, [(hx + 1.5 * size, hy - 1.5 * size)])
    if s.get('helmet'):
        head.ellipse(hx - 0.5, hy - 3, hr + 0.5, 4, '#c0c8d4')
        head.poly([(hx - 3, hy - 6), (hx - 1, hy - 12), (hx + 1, hy - 6)], '#e84040')
    if p.arm in ('strike',) or s.get('always_fire'):
        fx, fy = hx + 8 * size, hy + 2 * size
        head.poly([(fx, fy - 1.5), (fx + 5, fy - 3), (fx + 7, fy), (fx + 5, fy + 3), (fx, fy + 1.5)], '#ff8a2a')
        head.poly([(fx, fy - 0.8), (fx + 4, fy), (fx, fy + 0.8)], '#ffe066')
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
    size = {'hatchling': 0.72, 'whelp': 0.86, 'dragon': 1.0}[stage]
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
    if d.sep and ex:
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
    d.eyes(L, [(17.5, 13), (21, 13)])
    if d.sep:
        L.dot(20, 17, dark(col, 0.4), w=2, h=1)
    d.put(L)
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


# ─── Roster ──────────────────────────────────────────────────────────────────

DRAWERS = {
    'humanoid': humanoid,
    'beast': beast,
    'blob': blob,
    'jelly': jelly,
    'flyer': flyer,
    'crab': crab,
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
}


@dataclass
class Char:
    id: str
    emoji: str
    drawer: str
    params: dict = field(default_factory=dict)
    boss: bool = False
    battle: bool = True  # NPCs are world-only
    world: bool = True


def H(**kw):
    return kw


ROSTER: list[Char] = [
    # ── Heroes ──
    Char('blaze', '🦁', 'humanoid', H(skin='#e8a94c', hair='mane', hair_color='#c0501e', ears='round', snout='muzzle',
                                     outfit='#d8383a', trim='#ffd24a', item='sword', tail='lion', cape='#8a1e2a', blush=False)),
    Char('shield', '🐢', 'humanoid', H(skin='#86c86a', outfit='#2f7fb0', trim='#e0b040', shell='#5a8c3a', item='shield',
                                      hat='helmet', hat_color='#9aa6b4', snout='wide', item_color='#b8c4d4')),
    Char('nova', '🦅', 'humanoid', H(skin='#f4efe2', hair='crest', hair_color='#8a5a30', snout='beak', outfit='#3a5fc8',
                                    trim='#f0f0f0', wings='feather', wing_color='#9a6a3a', item='spear', scarf='#ffd24a')),
    # ── Ember ──
    Char('ember-egg', '🥚', 'egg'),
    Char('ember-hatchling', '🐣', 'dragon', H(color='#ff7a2f', stage='hatchling')),
    Char('ember-whelp', '🦎', 'dragon', H(color='#ff6a2a', stage='whelp')),
    Char('ember-dragon', '🐉', 'dragon', H(color='#f0502a', stage='dragon', wing='#ffb05a')),
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
    Char('clockwork-titan', '🦾', 'golem', H(color='#c89040', accent='#ff6a3a', glow='#ffe066', bolts=True, crown=True), boss=True),
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
    Char('village-innkeeper', '👩‍🦰', 'humanoid', H(hair='bun', hair_color='#c8502a', outfit='#5a8ad0', apron='#f4ecd8', trim='#ffffff')),
    Char('village-librarian', '🦔', 'humanoid', H(skin='#a07a5a', hair='spiky', hair_color='#5a3a2a', ears='round', snout='pointy', muzzle='#e8d0b0', outfit='#7a5ab0', robe=True, glasses=True, item='book', blush=False)),
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
]
for n in NPCS:
    n.battle = False
