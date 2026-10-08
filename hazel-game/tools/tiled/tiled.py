"""
Tiled map authoring for the overworld (#75 roadmap item 5).

Big maps (Dawnreach and the continents to come) are painted in Tiled, the
free map editor (https://www.mapeditor.org), instead of typed as ASCII rows.
The game still runs on ASCII rows: `src/lib/tiled.ts` turns a Tiled map back
into rows at load, so every zone invariant in zones.test.ts runs on it.

Each tile of the legend tileset stands for one map character (its `char`
property); its picture is the game's own art with the character in the
corner, so painting in Tiled looks like the game.

    python3 tools/tiled/tiled.py legend                       # (re)write the legend tileset
    python3 tools/tiled/tiled.py from-ascii rows.txt out.tmj  # ASCII rows → a Tiled map
    python3 tools/tiled/tiled.py to-ascii map.tmj             # a Tiled map → ASCII rows (to read a diff)

Run from hazel-game/. Writes into src/content/maps/.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # hazel-game/
MAPS = ROOT / 'src' / 'content' / 'maps'
sys.path.insert(0, str(HERE.parent / 'assets'))

import tiles  # noqa: E402
from pix import Canvas, upscale  # noqa: E402

TILE = 32
COLUMNS = 10
TILED_VERSION = '1.10.2'
FORMAT_VERSION = '1.10'
LEGEND_NAME = 'map-legend'

# Every map character (src/content/zones.ts LEGEND_CHARS) and what it means.
# The legend tileset holds one tile per entry, in this order (tile id = index);
# src/lib/tiled.test.ts fails if this drifts from LEGEND_CHARS. APPEND ONLY:
# saved maps store tile ids, so moving an entry would repaint every map —
# `legend` refuses to change what an existing id means.
LEGEND: list[tuple[str, str]] = [
    ('.', 'grass / open ground'),
    (',', 'flowers (walkable)'),
    ('#', 'trees / scenery (solid)'),
    ('~', 'water (solid)'),
    (':', 'sand / beach'),
    ('^', 'mountain (solid)'),
    ('=', 'road / path'),
    ('E', 'zone exit on a map edge (needs an exits entry)'),
    ('P', 'place entrance (needs an exits entry AND a places entry)'),
    ('S', 'save crystal'),
    ('C', 'treasure chest'),
    ('G', 'gate'),
    ('H', 'hidden passage: looks like trees, the hero walks through'),
    ('W', 'building wall'),
    ('D', 'building door'),
    ('F', 'building floor'),
    ('K', 'shop counter'),
    ('B', 'bookshelf'),
    ('T', 'table'),
    ('Z', 'bed'),
    ('>', 'dungeon stairs down (needs an exits entry to the floor below)'),
    ('<', 'dungeon stairs up (needs an exits entry to the floor above)'),
    ('|', 'dock: walkable planks over the water, where a boat moors'),
]


def _tile_art(ch: str) -> Image.Image:
    """The game's look for one map character, at 32px."""
    z = tiles.ZONES['dawnreach']
    g = tiles.ground(z['ground'], 1)
    timber = tiles.town_tiles('timber')
    props = tiles.props()

    def on_ground(*overlays: Canvas) -> Canvas:
        c = tiles.ground(z['ground'], 1)
        for o in overlays:
            c.paste(o)
        return c

    art = {
        '.': g,
        ',': on_ground(tiles.deco(z['deco'], z['deco_c'])),
        '#': on_ground(tiles.solid(z['solid'], z)),
        '~': tiles.water(z['water'], 0),
        ':': tiles.ow_sand(),
        '^': on_ground(tiles.ow_mountain()),
        '=': tiles.path_tile(z['path']),
        'E': (lambda c: (c.paste(tiles.exit_marker()), c)[1])(tiles.path_tile(z['path'])),
        'P': on_ground(tiles.ow_icon('town')),
        'S': on_ground(props[0]),
        'C': on_ground(props[2]),
        'G': on_ground(props[4]),
        'H': on_ground(tiles.solid(z['solid'], z)),
        'W': timber[1],
        'D': timber[3],
        'F': timber[4],
        'K': timber[5],
        'B': timber[6],
        'T': timber[7],
        'Z': timber[8],
        '>': on_ground(tiles.stairs_sheet()[0]),
        '<': on_ground(tiles.stairs_sheet()[1]),
        '|': (lambda c: (c.paste(tiles.ow_dock()), c)[1])(tiles.water(z['water'], 0)),
    }[ch]
    img = upscale(art.image(), 2).convert('RGBA')
    d = ImageDraw.Draw(img)
    if ch == 'H':
        # In the game it looks exactly like trees; in the editor it must not.
        for i in range(0, TILE, 4):
            for (x, y) in ((i, 0), (i, TILE - 1), (0, i), (TILE - 1, i)):
                d.rectangle([x, y, x + 1, y + 1], fill=(255, 220, 60, 255))
    # The character itself, top-left, on a dark tab.
    font = ImageFont.load_default()
    d.rectangle([0, 0, 9, 11], fill=(16, 12, 28, 220))
    d.text((2, 0), ch, fill=(255, 255, 255, 255), font=font)
    return img


def _check_append_only(path: Path):
    """Existing tile ids must keep their character, or every saved map would change."""
    if not path.exists():
        return
    old = json.loads(path.read_text())
    for t in old['tiles']:
        was = next(p['value'] for p in t['properties'] if p['name'] == 'char')
        now = LEGEND[t['id']][0] if t['id'] < len(LEGEND) else None
        if now != was:
            sys.exit(f'legend is append-only: tile {t["id"]} was {was!r}, would become {now!r} '
                     '(add new characters at the end of LEGEND instead)')


def write_legend():
    """legend.png + legend.tsj: one tile per map character, its `char` as a property."""
    MAPS.mkdir(parents=True, exist_ok=True)
    _check_append_only(MAPS / 'legend.tsj')
    rows = -(-len(LEGEND) // COLUMNS)
    sheet = Image.new('RGBA', (COLUMNS * TILE, rows * TILE), (0, 0, 0, 0))
    for i, (ch, _) in enumerate(LEGEND):
        sheet.paste(_tile_art(ch), ((i % COLUMNS) * TILE, (i // COLUMNS) * TILE))
    sheet.save(MAPS / 'legend.png', optimize=True)
    tileset = {
        'columns': COLUMNS,
        'image': 'legend.png',
        'imageheight': sheet.height,
        'imagewidth': sheet.width,
        'margin': 0,
        'name': LEGEND_NAME,
        'spacing': 0,
        'tilecount': len(LEGEND),
        'tiledversion': TILED_VERSION,
        'tileheight': TILE,
        'tiles': [
            {
                'id': i,
                'properties': [
                    {'name': 'char', 'type': 'string', 'value': ch},
                    {'name': 'meaning', 'type': 'string', 'value': meaning},
                ],
            }
            for i, (ch, meaning) in enumerate(LEGEND)
        ],
        'tilewidth': TILE,
        'type': 'tileset',
        'version': FORMAT_VERSION,
    }
    (MAPS / 'legend.tsj').write_text(json.dumps(tileset, indent=1) + '\n')
    print(f'legend: {len(LEGEND)} tiles → {MAPS / "legend.tsj"}')


def from_ascii(rows_path: Path, out_path: Path):
    """ASCII rows (one per line) → a Tiled map using the legend tileset."""
    rows = [r for r in rows_path.read_text().splitlines() if r]
    w, h = len(rows[0]), len(rows)
    ids = {ch: i for i, (ch, _) in enumerate(LEGEND)}
    data = []
    for y, r in enumerate(rows):
        if len(r) != w:
            sys.exit(f'row {y} is {len(r)} wide, expected {w}')
        for x, ch in enumerate(r):
            if ch not in ids:
                sys.exit(f'unknown map character {ch!r} at ({x}, {y})')
            data.append(ids[ch] + 1)  # gid = firstgid (1) + tile id
    tmj = {
        'compressionlevel': -1,
        'height': h,
        'infinite': False,
        'layers': [
            {
                'data': data,
                'height': h,
                'id': 1,
                'name': 'terrain',
                'opacity': 1,
                'type': 'tilelayer',
                'visible': True,
                'width': w,
                'x': 0,
                'y': 0,
            }
        ],
        'nextlayerid': 2,
        'nextobjectid': 1,
        'orientation': 'orthogonal',
        'renderorder': 'right-down',
        'tiledversion': TILED_VERSION,
        'tileheight': TILE,
        'tilesets': [{'firstgid': 1, 'source': 'legend.tsj'}],
        'tilewidth': TILE,
        'type': 'map',
        'version': FORMAT_VERSION,
        'width': w,
    }
    out_path.write_text(json.dumps(tmj, separators=(',', ':')) + '\n')
    print(f'{w}×{h} map → {out_path}')


def to_ascii(map_path: Path):
    """A Tiled map → its ASCII rows on stdout (for reading a map diff)."""
    tmj = json.loads(map_path.read_text())
    ref = tmj['tilesets'][0]
    tsj = json.loads((map_path.parent / ref['source']).read_text())
    chars = {t['id']: next(p['value'] for p in t['properties'] if p['name'] == 'char') for t in tsj['tiles']}
    layer = next(l for l in tmj['layers'] if l['name'] == 'terrain')
    w = layer['width']
    data = layer['data']
    for y in range(layer['height']):
        print(''.join(chars[g - ref['firstgid']] for g in data[y * w:(y + 1) * w]))


def main():
    cmd, *args = sys.argv[1:] or ['help']
    if cmd == 'legend':
        write_legend()
    elif cmd == 'from-ascii' and len(args) == 2:
        from_ascii(Path(args[0]), Path(args[1]))
    elif cmd == 'to-ascii' and len(args) == 1:
        to_ascii(Path(args[0]))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
