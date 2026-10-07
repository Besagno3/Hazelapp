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
    if s.get('foam'):
        for (x, y, r) in ((10.5, cy - ry + 1.5, 2.6), (14.5, cy - ry, 3.0), (19, cy - ry + 0.2, 2.8), (22.5, cy - ry + 2, 2.2)):
            L.ellipse(x, y, r, r * 0.85, WHITE)
    if s.get('crest'):
        L.poly([(9, cy - ry + 3), (15, cy - ry - 5), (17, cy - ry), (23, cy - ry - 2), (22, cy - ry + 3)], light(col, 0.15))
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
    if s.get('minus'):
        L.rect(9.5, 8.5, 14.5, 10, WHITE, shade=False)
        L.rect(8, 16, 11, 17, light(col, 0.35), shade=False)
    ex = [17.5, 21]
    d.eyes(L, [(x, 13) for x in ex])
    if s.get('brow') and ex and not p.hurt:
        L.line(ex[0] - 1.2, 10.8, ex[0] + 1.2, 11.8, dark(col, 0.5), w=0.8)
        L.line(ex[1] + 1.2, 10.8, ex[1] - 1.2, 11.8, dark(col, 0.5), w=0.8)
    if d.sep:
        L.dot(20, 17, dark(col, 0.4), w=2, h=1)
    d.put(L)
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
    'snapjaw': snapjaw,
    'orbit_otter': orbit_otter,
    'gravity_beetle': gravity_beetle,
    'eclipse_fox': eclipse_fox,
    'ironhorn': ironhorn,
    'oak_owl': oak_owl,
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
    # --- New critters, batch 1 (Numbria + Clockwork Depths) ---
    Char('raven-prince', '🐦‍⬛', 'duck', H(kind='raven', color='#38365c', bill='#4a4858', legs='#3a3848', eye='#ffd24a', crown='#ffcf3a')),
    Char('kia', '🦑', 'kraken', H(color='#6a5ad8', minus=True, loot=True)),
    Char('pirate-parrot', '🦜', 'parrot', H(color='#2a8ae0', wing='#2a7ad0', band='#2ab0a0', tail='#2a6ad0', chest='#ffd23a',
                                          face='#f4ece4', beak='#3a3440', hat='tricorn', hat_color='#8a2a3a', coin=True)),
    Char('tut-tut', '🧟', 'mummy', H()),
    Char('knight-mare', '🐴', 'knight_mare', H(steel='#a8b4c4', coat='#ece6da', mane='#c8343a', plume='#7a4ad0')),
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
]
for n in NPCS:
    n.battle = False
