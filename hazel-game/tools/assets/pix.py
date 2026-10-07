"""
Tiny pixel-art toolkit used by the asset generator.

Everything is drawn in *design units* on a square design grid (32 for normal
characters, 48 for bosses) and rasterised to a canvas of N pixels, so one
drawing function can produce both the chunky 16px world sprite and the more
detailed 32px battle sprite. Primitives auto-shade themselves with a 3-tone
ramp (highlight / base / shadow, with the hue shifts SNES-era artists used),
and layers can be outlined with a darkened "selout" edge.
"""
from __future__ import annotations

import colorsys
import math

import numpy as np
from PIL import Image

# ─── Colour helpers ──────────────────────────────────────────────────────────


def hexc(h) -> tuple[int, int, int]:
    if not isinstance(h, str):
        return tuple(h)
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _shift(rgb, dl: float, ds: float, dh: float):
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + dh) % 1.0
    l = min(1.0, max(0.0, l + dl))
    s = min(1.0, max(0.0, s + ds))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (round(r * 255), round(g * 255), round(b * 255))


def light(rgb, amt: float = 0.14):
    """Highlight: lighter and nudged toward yellow (warm light)."""
    h = colorsys.rgb_to_hls(*(c / 255 for c in rgb))[0]
    # rotate hue a little toward 1/6 (yellow)
    dh = ((1 / 6 - h + 0.5) % 1.0 - 0.5) * 0.12
    return _shift(rgb, amt, 0.05, dh)


def dark(rgb, amt: float = 0.16):
    """Shadow: darker and nudged toward blue/purple (cool ambient)."""
    h = colorsys.rgb_to_hls(*(c / 255 for c in rgb))[0]
    dh = ((0.7 - h + 0.5) % 1.0 - 0.5) * 0.12
    return _shift(rgb, -amt, 0.02, dh)


def mix(a, b, t: float):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def ramp(base):
    """(highlight, base, shadow) for a colour — accepts hex or rgb."""
    if isinstance(base, str):
        base = hexc(base)
    return (light(base), tuple(base), dark(base))


OUTLINE_DARK = (26, 16, 38)

# ─── Canvas ──────────────────────────────────────────────────────────────────


class Canvas:
    """RGBA pixel buffer addressed in design units (`design` wide)."""

    def __init__(self, n: int, design: int = 32):
        self.n = n
        self.design = design
        self.k = n / design
        self.a = np.zeros((n, n, 4), dtype=np.uint8)
        self.dx = 0.0  # design-unit offset applied to every primitive (pose bob/lunge)
        self.dy = 0.0

    # -- plumbing ------------------------------------------------------------

    def layer(self) -> 'Canvas':
        c = Canvas(self.n, self.design)
        c.dx, c.dy = self.dx, self.dy
        return c

    def _grid(self):
        """Pixel-centre coordinates in design units."""
        idx = (np.arange(self.n) + 0.5) / self.k
        return np.meshgrid(idx, idx)  # X, Y

    def _put(self, mask, rgb, alpha=255):
        self.a[mask, 0] = rgb[0]
        self.a[mask, 1] = rgb[1]
        self.a[mask, 2] = rgb[2]
        self.a[mask, 3] = alpha

    def paste(self, other: 'Canvas', outline: bool = False, outline_color=None):
        src = other.a
        if outline:
            src = outlined(src, outline_color)
        m = src[:, :, 3] > 0
        self.a[m] = src[m]

    # -- primitives ----------------------------------------------------------

    def ellipse(self, cx, cy, rx, ry, color, shade=True, rot=0.0):
        cx += self.dx
        cy += self.dy
        X, Y = self._grid()
        u = X - cx
        v = Y - cy
        if rot:
            cs, sn = math.cos(rot), math.sin(rot)
            u, v = u * cs + v * sn, -u * sn + v * cs
        nu, nv = u / max(rx, 0.01), v / max(ry, 0.01)
        d = nu * nu + nv * nv
        inside = d <= 1.0
        # always light at least the centre pixel so tiny shapes survive at 16px
        if not inside.any():
            px = int(min(self.n - 1, max(0, math.floor(cx * self.k))))
            py = int(min(self.n - 1, max(0, math.floor(cy * self.k))))
            inside[py, px] = True
        self._shade_fill(inside, color, shade, nu, nv)

    def rect(self, x0, y0, x1, y1, color, shade=True):
        """Axis-aligned box [x0,x1)×[y0,y1) in design units."""
        x0 += self.dx
        x1 += self.dx
        y0 += self.dy
        y1 += self.dy
        X, Y = self._grid()
        inside = (X >= x0) & (X < x1) & (Y >= y0) & (Y < y1)
        if not inside.any():
            px = int(min(self.n - 1, max(0, math.floor(x0 * self.k))))
            py = int(min(self.n - 1, max(0, math.floor(y0 * self.k))))
            inside[py, px] = True
        w = max(x1 - x0, 0.01)
        h = max(y1 - y0, 0.01)
        nu = (X - (x0 + x1) / 2) / (w / 2)
        nv = (Y - (y0 + y1) / 2) / (h / 2)
        self._shade_fill(inside, color, shade, nu * 0.6, nv)

    def poly(self, pts, color, shade=True):
        """Filled polygon (even-odd) in design units."""
        pts = [(x + self.dx, y + self.dy) for x, y in pts]
        X, Y = self._grid()
        inside = np.zeros(X.shape, dtype=bool)
        n = len(pts)
        j = n - 1
        for i in range(n):
            xi, yi = pts[i]
            xj, yj = pts[j]
            cond = ((yi > Y) != (yj > Y)) & (X < (xj - xi) * (Y - yi) / ((yj - yi) or 1e-9) + xi)
            inside ^= cond
            j = i
        if not inside.any():
            return
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        rx, ry = max((max(xs) - min(xs)) / 2, 0.01), max((max(ys) - min(ys)) / 2, 0.01)
        self._shade_fill(inside, color, shade, (X - cx) / rx, (Y - cy) / ry)

    def line(self, x0, y0, x1, y1, color, w=1.0):
        """Thick line as a capsule (w = thickness in design units)."""
        x0 += self.dx
        x1 += self.dx
        y0 += self.dy
        y1 += self.dy
        X, Y = self._grid()
        vx, vy = x1 - x0, y1 - y0
        L2 = vx * vx + vy * vy or 1e-9
        t = np.clip(((X - x0) * vx + (Y - y0) * vy) / L2, 0, 1)
        px, py = x0 + t * vx, y0 + t * vy
        d2 = (X - px) ** 2 + (Y - py) ** 2
        r = max(w / 2, 0.5 / self.k)
        inside = d2 <= r * r
        self._put(inside, _rgb(color))

    def dot(self, x, y, color, w=1, h=1, alpha=255):
        """Pixel-exact dot: always at least 1 output pixel (eyes, sparkles)."""
        x += self.dx
        y += self.dy
        px = math.floor(x * self.k)
        py = math.floor(y * self.k)
        pw = max(1, round(w * self.k))
        ph = max(1, round(h * self.k))
        x0, y0 = max(0, px), max(0, py)
        x1, y1 = min(self.n, px + pw), min(self.n, py + ph)
        if x1 <= x0 or y1 <= y0:
            return
        c = _rgb(color)
        self.a[y0:y1, x0:x1, 0] = c[0]
        self.a[y0:y1, x0:x1, 1] = c[1]
        self.a[y0:y1, x0:x1, 2] = c[2]
        self.a[y0:y1, x0:x1, 3] = alpha

    def erase_ellipse(self, cx, cy, rx, ry):
        """Punch a transparent ellipse (crescents, holes)."""
        cx += self.dx
        cy += self.dy
        X, Y = self._grid()
        m = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0
        self.a[m] = 0

    def shadow(self, cx, cy, rx, ry, alpha=70):
        """Soft ground shadow (drawn under the sprite, never outlined)."""
        X, Y = self._grid()
        d = ((X - cx - self.dx * 0) / rx) ** 2 + ((Y - cy) / ry) ** 2
        m = (d <= 1.0) & (self.a[:, :, 3] == 0)
        self.a[m] = (20, 12, 30, alpha)

    # -- shading -------------------------------------------------------------

    def _shade_fill(self, mask, color, shade, nu, nv):
        hi, base, lo = ramp(color) if shade else (_rgb(color),) * 3
        if not shade:
            self._put(mask, base)
            return
        lightv = -0.55 * nu - 0.8 * nv  # light from the upper-left
        hi_m = mask & (lightv > 0.55)
        lo_m = mask & (lightv < -0.45)
        self._put(mask, base)
        self._put(hi_m, hi)
        self._put(lo_m, lo)

    # -- post ----------------------------------------------------------------

    def tint(self, rgb, t: float):
        m = self.a[:, :, 3] > 200
        for i in range(3):
            ch = self.a[:, :, i].astype(float)
            ch[m] = ch[m] * (1 - t) + rgb[i] * t
            self.a[:, :, i] = ch.astype(np.uint8)

    def image(self) -> Image.Image:
        return Image.fromarray(self.a, 'RGBA')


def _rgb(c):
    return hexc(c) if isinstance(c, str) else tuple(c)


def outlined(a: np.ndarray, color=None) -> np.ndarray:
    """Add a 1px selective outline around the opaque silhouette."""
    alpha = a[:, :, 3] > 200
    out = a.copy()
    h, w = alpha.shape
    edge_col = np.zeros((h, w, 3), dtype=np.float64)
    cnt = np.zeros((h, w), dtype=np.float64)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        sh_a = np.zeros_like(alpha)
        sh_c = np.zeros((h, w, 3))
        ys = slice(max(0, dy), h + min(0, dy))
        yd = slice(max(0, -dy), h + min(0, -dy))
        xs = slice(max(0, dx), w + min(0, dx))
        xd = slice(max(0, -dx), w + min(0, -dx))
        sh_a[yd, xd] = alpha[ys, xs]
        sh_c[yd, xd] = a[ys, xs, :3]
        edge_col += sh_c * sh_a[:, :, None]
        cnt += sh_a
    ring = (~alpha) & (cnt > 0)
    if color is not None:
        c = np.array(_rgb(color), dtype=np.float64)
        out[ring, :3] = c
    else:
        avg = edge_col[ring] / cnt[ring][:, None]
        # darken the neighbour colour heavily + pull toward deep purple
        col = avg * 0.28 + np.array(OUTLINE_DARK) * 0.72
        out[ring, :3] = col.astype(np.uint8)
    out[ring, 3] = 255
    return out


def strip(frames: list[Image.Image]) -> Image.Image:
    """Lay frames left-to-right in one row (the renderer's sheet convention)."""
    w, h = frames[0].size
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


def upscale(img: Image.Image, s: int) -> Image.Image:
    return img.resize((img.width * s, img.height * s), Image.NEAREST)
