"""Pixel wordmark for Hazel Quest (python3 site/tools/logo.py [outDir]): hand-drawn 10x12 glyphs, gradient fill,
outline and a 3px extrusion, drawn at 1x (scale it with image-rendering: pixelated)."""
import sys
from pathlib import Path
from PIL import Image

G = {
'H': """
###....###
###....###
###....###
###....###
###....###
##########
##########
###....###
###....###
###....###
###....###
###....###""",
'A': """
..######..
.########.
###....###
###....###
###....###
##########
##########
###....###
###....###
###....###
###....###
###....###""",
'Z': """
##########
##########
.......###
......###.
.....###..
....###...
...###....
..###.....
.###......
###.......
##########
##########""",
'E': """
##########
##########
###.......
###.......
###.......
########..
########..
###.......
###.......
###.......
##########
##########""",
'L': """
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
##########
##########""",
'Q': """
..######..
.########.
###....###
###....###
###....###
###....###
###....###
###.##.###
###..#####
.########.
..########
.......###""",
'U': """
###....###
###....###
###....###
###....###
###....###
###....###
###....###
###....###
###....###
###....###
.########.
..######..""",
'S': """
..########
.#########
###.......
###.......
###.......
.########.
..########
.......###
.......###
.......###
#########.
########..""",
'T': """
##########
##########
...####...
...####...
...####...
...####...
...####...
...####...
...####...
...####...
...####...
...####...""",
}
GLYPH = {k: [r for r in v.strip('\n').split('\n')] for k, v in G.items()}

def hexc(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (255,)

def word_mask(word, bounce):
    """Letter pixels for one word: {(x,y)}; bounce lifts alternate letters 1px."""
    pts = set(); x = 0
    for i, ch in enumerate(word):
        g = GLYPH[ch]; dy = -1 if (bounce and i % 2) else 0
        for y, row in enumerate(g):
            for gx, c in enumerate(row):
                if c == '#': pts.add((x + gx, y + dy))
        x += len(g[0]) + 2
    return pts, x - 2

def render(lines, palettes, out, gap=6, bounce=True, depth=3):
    words = []
    for w in lines:
        m, wd = word_mask(w, bounce); words.append((m, wd))
    W = max(wd for _, wd in words)
    pad = 2 + depth
    H_line = 13
    img_w = W + pad * 2; img_h = len(words) * H_line + (len(words) - 1) * gap + pad * 2 + 1
    img = Image.new('RGBA', (img_w, img_h), (0, 0, 0, 0)); px = img.load()
    fills = {}; ys = []
    for li, (m, wd) in enumerate(words):
        ox = pad + (W - wd) // 2; oy = pad + 1 + li * (H_line + gap)
        for (x, y) in m: fills[(ox + x, oy + y)] = li
        ys.append(oy)
    allpts = set(fills)
    def dil(s):
        o = set(s)
        for (x, y) in s:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1): o.add((x + dx, y + dy))
        return o
    outline = dil(allpts)
    # extrusion: the outlined shape pushed down `depth` px, darkest at the back
    ext = set()
    for d in range(1, depth + 1):
        ext |= {(x, y + d) for (x, y) in outline}
    ext_outline = dil(ext) - ext
    for (x, y) in ext_outline: px[x, y] = hexc('#1b0f22')
    for (x, y) in ext: px[x, y] = hexc(palettes[0]['side'])
    for (x, y) in outline: px[x, y] = hexc('#1b0f22')
    for (x, y), li in fills.items():
        pal = palettes[li]['fill']; ry = y - ys[li]
        t = max(0, min(len(pal) - 1, int(ry * len(pal) / 12)))
        px[x, y] = hexc(pal[t])
    # a 1px highlight on the top edge of each stroke
    for (x, y), li in fills.items():
        if (x, y - 1) not in allpts: px[x, y] = hexc(palettes[li]['hi'])
    img.save(out)
    return img

GOLD = {'fill': ['#fff1a6', '#ffe066', '#ffcb3d', '#ffb62e', '#f8952a', '#ec7424'], 'hi': '#fffbe0', 'side': '#9a3b1c'}
SKY = {'fill': ['#e8fff4', '#b6f5d8', '#7ee8bd', '#4fd6a3', '#2fbf8c', '#1f9e73'], 'hi': '#f4fffa', 'side': '#9a3b1c'}
out = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent.parent / 'assets' / 'img')
Path(out).mkdir(parents=True, exist_ok=True)
render(['HAZEL', 'QUEST'], [GOLD, SKY], out + '/logo.png')
print('logo ->', out + '/logo.png')
