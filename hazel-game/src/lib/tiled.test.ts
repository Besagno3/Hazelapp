import { describe, expect, it } from 'vitest';
import { LEGEND_CHARS, ZONES } from '../content/zones';
import { TERRAIN_LAYER, legendChars, tiledRows, type TiledMap } from './tiled';
import legendTsj from '../content/maps/legend.tsj?raw';
import dawnreachTmj from '../content/maps/dawnreach.tmj?raw';

const legend = JSON.parse(legendTsj);
const idOf = new Map([...legendChars(legend)].map(([id, ch]) => [ch, id]));

/** A small map in Tiled's format, built from ASCII rows (gid = 1 + tile id). */
function tmj(rows: string[], tweak: (m: TiledMap & Record<string, unknown>) => void = () => {}) {
  const map = {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: rows[0].length,
    height: rows.length,
    tilesets: [{ firstgid: 1, source: 'legend.tsj' }],
    layers: [
      {
        type: 'tilelayer',
        name: TERRAIN_LAYER,
        width: rows[0].length,
        height: rows.length,
        data: rows.flatMap((r) => [...r].map((ch) => 1 + (idOf.get(ch) as number))),
      },
    ],
  } as TiledMap & Record<string, unknown>;
  tweak(map);
  return map;
}

describe('the map legend tileset (#75 item 5)', () => {
  it('has exactly one tile per map character the game knows (LEGEND_CHARS)', () => {
    expect(new Set(legendChars(legend).values())).toEqual(LEGEND_CHARS);
  });
  it('rejects a tile with no one-letter "char", or a character on two tiles', () => {
    expect(() => legendChars({ type: 'tileset', tiles: [{ id: 0 }] })).toThrow(/char/);
    const dup = { type: 'tileset', tiles: [0, 1].map((id) => ({ id, properties: [{ name: 'char', value: '.' }] })) };
    expect(() => legendChars(dup)).toThrow(/two tiles/);
  });
});

describe('tiledRows (#75 item 5)', () => {
  it('turns a Tiled map back into the same ASCII rows', () => {
    const rows = ['~~:..', ':.=P^', '.#,=E'];
    expect(tiledRows(tmj(rows), legend)).toEqual(rows);
  });

  it('Dawnreach is painted in Tiled and loads as an 80×60 map — the rows every zone test checks', () => {
    const rows = tiledRows(JSON.parse(dawnreachTmj), legend, 'dawnreach');
    expect(rows.length).toBe(60);
    expect(rows.every((r) => r.length === 80)).toBe(true);
    expect(ZONES.dawnreach.map).toEqual(rows);
  });

  it('fails loudly, saying where, on maps the game cannot read', () => {
    const rows = ['..', '..'];
    const bad: [string, (m: TiledMap & Record<string, unknown>) => void, RegExp][] = [
      ['an empty cell', (m) => ((m.layers[0].data as number[])[3] = 0), /empty cell at \(1, 1\)/],
      ['a flipped tile', (m) => ((m.layers[0].data as number[])[1] = (0x80000000 + 1) >>> 0), /flipped or rotated tile at \(1, 0\)/],
      ['a tile not in the legend', (m) => ((m.layers[0].data as number[])[2] = 999), /tile 999 at \(0, 1\)/],
      ['a compressed layer', (m) => (m.layers[0].encoding = 'base64'), /CSV/],
      ['no terrain layer', (m) => (m.layers[0].name = 'Tile Layer 1'), /"terrain"/],
      ['a second tileset', (m) => m.tilesets.push({ firstgid: 50 }), /one tileset/],
      ['an infinite map', (m) => (m.infinite = true), /Infinite/],
      ['a short layer', (m) => (m.layers[0].data as number[]).pop(), /4 cells/],
      ['isometric', (m) => (m.orientation = 'isometric'), /orthogonal/],
    ];
    for (const [what, tweak, msg] of bad) expect(() => tiledRows(tmj(rows, tweak), legend, 'test'), what).toThrow(msg);
    expect(() => tiledRows({ type: 'tileset' }, legend)).toThrow(/not a Tiled map/);
  });
});
