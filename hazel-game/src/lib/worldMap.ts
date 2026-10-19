import { TILE, fogLifted, type FogDef, type PlaceDef, type PlaceIcon, type ZoneDef, type ZoneId } from '../content/zones';
import { TOPIC_REGISTRY, crystalFlag } from '../content/topics';
import { placesInside } from './fog';

/**
 * The menu's world map (#75 Phase 1): the overworld drawn small, one coloured
 * square per tile, with its places marked and a "you are here" star. Pure —
 * the component just paints what these return.
 */

const CELL_COLOR: Record<string, string> = {
  '~': '#2a5a9a', // sea
  ':': '#e2d29c', // sand
  '.': '#64a462', // grass
  ',': '#76b06a', // flowers
  '#': '#2f6f3f', // trees
  '^': '#8a90a8', // mountains
  '=': '#c8b482', // road
  P: '#64a462', // a place sits on grass; its marker is drawn on top
  '|': '#a47640', // a dock (#75 item 14)
  W: '#b07a5a', // a building out on the map (Gull Rock's lighthouse)
  D: '#b07a5a',
  F: '#b07a5a',
};

/** Colour of one overworld tile on the map (unknown tiles read as grass). */
export function mapCellColor(ch: string): string {
  return CELL_COLOR[ch] ?? CELL_COLOR['.'];
}

/** Fog on the map: a pale square, explained by the legend under it. */
export const FOG_COLOR = '#e6e8f4';

/** Marks a bank that any one crystal clears. */
export const ANY_CRYSTAL_EMOJI = '💎';

/**
 * What the map shows on a fog bank (#75 item 7): the emoji of the one crystal
 * that clears it, or 💎 when any crystal will do — so the map shows which
 * crystal opens which part of the world. A bank the story lifts instead
 * (the road to Remembrance Hill, #75 item 14e) shows nothing: no crystal
 * will clear it. Nor does an `unmarked` one (the Dragon's Roost's clouds, #75
 * item 15b).
 */
export function fogMarker(f: FogDef): string | null {
  if (f.unmarked) return null;
  const crystal = (flag: string) => TOPIC_REGISTRY.find((t) => crystalFlag(t.id) === flag);
  if (!f.liftedBy.every((flag) => crystal(flag))) return null;
  return f.liftedBy.length === 1 ? crystal(f.liftedBy[0])!.emoji : ANY_CRYSTAL_EMOJI;
}

/**
 * Where on the map to draw a bank's marker (tile coordinates of its centre),
 * nudged to the bank's top edge when a place icon sits in the middle of it
 * (the Spire inside its ring of fog) so the two don't overlap.
 */
export function fogMarkerAt(f: FogDef, places: { x: number; y: number }[]): { x: number; y: number } {
  const cx = f.x + (f.w - 1) / 2;
  const cy = f.y + (f.h - 1) / 2;
  const crowded = places.some((p) => Math.abs(p.x - cx) <= 1 && Math.abs(p.y - cy) <= 1);
  return crowded ? { x: cx, y: f.y } : { x: cx, y: cy };
}

/**
 * One emoji per kind of place, drawn on the map at the place and beside its
 * name in the list, so a kid can match "Whispering Woods" to its spot.
 */
export const PLACE_EMOJI: Record<PlaceIcon, string> = {
  town: '🏘️',
  hamlet: '🌾',
  forest: '🌲',
  cave: '🕳️',
  shrine: '🕯️',
  coast: '🌊',
  grove: '🌙',
  tower: '🗼',
  // The four crystal regions (#75 item 8).
  city: '🏛️',
  canyon: '🕰️',
  garden: '🌻',
  pavilion: '🎪',
  // Act II (#75 item 14e): a little house, like its icon on the map.
  hill: '🏡',
  // Act II (#75 item 14f): the island of ring-trees.
  elder: '🌳',
  // Act II (#75 item 14g): a lotus on the bog (Gull Rock already has the 🏮).
  marsh: '🪷',
  archive: '📚',
  roost: '🪺',
  harbor: '🏮',
  beach: '🐚',
  compass: '🧭',
  atoll: '🏝️',
  // Taleshore II (#75 item 15e).
  reef: '🪸',
  inkwell: '🖋️',
  // Taleshore III (#75 item 15f).
  cliffs: '⛰️',
  quarter: '🏚️',
  chorus: '🎼',
  // Act III's last place (#75 item 15h).
  chart: '🌐',
};

/** Stands in for a place that's still hidden in fog. */
export const HIDDEN_PLACE_EMOJI = '☁️';

/**
 * A place's emoji on the map and in the list: its own, or ☁️ while it sits
 * inside a bank of fog that hasn't lifted (the Spire in its ring, #75 item 7)
 * — the map doesn't show what the world itself still hides.
 */
export function placeEmoji(world: ZoneDef, place: PlaceDef, flags: Record<string, boolean>): string {
  const hidden = (world.fogs ?? []).some((f) => !fogLifted(f, flags) && placesInside(f, [place]).length > 0);
  return hidden ? HIDDEN_PLACE_EMOJI : PLACE_EMOJI[place.icon];
}

export interface MapMarker {
  /** Tile on the overworld. */
  x: number;
  y: number;
  /** True when this is exactly where the hero stands (on the overworld itself). */
  exact: boolean;
  /** The place the marker stands for, when you're inside (or beyond) one. */
  place?: string;
}

/**
 * The overworld a zone sits on (#75 item 14f): itself for an overworld; for a
 * place, or a floor below one, the overworld its exits lead back out to —
 * Dawnreach for Act I's places, the Silver Shallows for Eldergrove. The menu
 * map draws that one.
 */
export function overworldOf(zones: Record<ZoneId, ZoneDef>, zoneId: ZoneId): ZoneDef {
  const seen = new Set<ZoneId>([zoneId]);
  const queue: ZoneId[] = [zoneId];
  while (queue.length) {
    const z = zones[queue.shift()!];
    if (z.kind === 'overworld') return z;
    for (const e of z.exits) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return zones.dawnreach;
}

/**
 * Where to put "you are here". On the overworld: the hero's own tile. Inside a
 * place: that place's icon. In a zone that isn't a place itself (none today,
 * since every zone has its own icon as of #75 item 8; later, e.g. a dungeon's
 * lower floors): follow the exits back to the nearest place that is.
 */
export function whereOnMap(
  zones: Record<ZoneId, ZoneDef>,
  overworld: ZoneDef,
  zoneId: ZoneId,
  pos: { x: number; y: number } | null,
): MapMarker | null {
  if (zoneId === overworld.id) {
    const cell = pos
      ? { x: Math.floor(pos.x / TILE), y: Math.floor(pos.y / TILE) }
      : { x: overworld.spawn.x, y: overworld.spawn.y };
    return { ...cell, exact: true };
  }
  // A place on the map is a 'P' exit from the overworld into that zone.
  const iconOf = (id: ZoneId) => {
    const exit = overworld.exits.find((e) => e.to === id && overworld.map[e.y]?.[e.x] === 'P');
    return exit && overworld.places?.find((p) => p.x === exit.x && p.y === exit.y);
  };
  const seen = new Set<ZoneId>([zoneId]);
  const queue: ZoneId[] = [zoneId];
  while (queue.length) {
    const id = queue.shift()!;
    const icon = iconOf(id);
    if (icon) return { x: icon.x, y: icon.y, exact: false, place: icon.name };
    for (const e of zones[id].exits) {
      if (e.to === overworld.id || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return null;
}

/**
 * The line under the map. "You're here: <name>" reads right whatever the name
 * looks like ("The Crystal Spire", "Shrine of First Light") — no articles to
 * get wrong.
 */
export function mapCaption(here: MapMarker | null, zoneName: string, worldName: string): string {
  if (here?.exact) return `You're out on ${worldName.startsWith('The ') ? `the ${worldName.slice(4)}` : worldName}`;
  // A dungeon floor's title already says which place it's in ("Clockwork Depths · B2 — …").
  if (!here?.place || zoneName === here.place || zoneName.startsWith(`${here.place} · `)) {
    return `You're here: ${zoneName}`;
  }
  return `You're here: ${zoneName} (past ${here.place})`;
}

/** A sea-edge label's words (#75 item 14): "◀ Dawnreach", "Silver Shallows ▶", "▲ …", "▼ …". */
export function seaEdgeLabel(side: 'north' | 'south' | 'east' | 'west', toName: string): string {
  const name = toName.startsWith('The ') ? toName.slice(4) : toName;
  return side === 'west' ? `◀ ${name}` : side === 'east' ? `${name} ▶` : side === 'north' ? `▲ ${name}` : `▼ ${name}`;
}

/**
 * Where down its edge a map's west / east sea-edge label sits — as a fraction
 * of the map's height (#75 item 14d review). The first of these spots where
 * the label keeps a gap from every marker; else the one covering least —
 * the ⭐ last of all — and only then coming nearest. Below the middle by
 * default; near the top and bottom too, since a busy coast (Dawnreach's east)
 * can fill the middle.
 */
export const EDGE_LABEL_SPOTS = [0.63, 0.8, 0.37, 0.5, 0.2, 0.9, 0.06, 0.95] as const;

/**
 * The narrowest the menu map is drawn (a 320 px phone, the narrowest the game
 * is played on). Labels and icons keep their pixel size while the map shrinks,
 * so a label clear of a marker here is clear at every size.
 */
export const MAP_MIN_PX = 208;
/** Half a label's height (10 px text, 2 px padding each side), and half an icon's box (13–16 px). */
const LABEL_HALF_PX = 7;
const ICON_HALF_PX = 8;
/** …but the ⭐ is drawn bigger: 20 px wide. */
export const STAR_HALF_W = 10;
/** And a little air between a label and a marker, so they don't touch. */
const GAP_PX = 3;
/** A label's width: ~6 px a character of 10 px semibold text, its padding, 2 px off the edge. */
const labelPx = (text: string) => 6 * [...text].length + 10;

/**
 * Does the label (`text`) at `spot` come within `gap` px of a marker on this
 * cell (`halfW` px either side of it), on the narrowest map? (`gap` 0: does it
 * cover it.)
 */
export function edgeLabelCovers(
  side: 'west' | 'east',
  cols: number,
  rows: number,
  spot: number,
  m: { x: number; y: number },
  text: string,
  halfW = ICON_HALF_PX,
  gap = GAP_PX,
): boolean {
  const W = MAP_MIN_PX;
  const H = (W * rows) / cols;
  const mx = ((m.x + 0.5) / cols) * W;
  const my = ((m.y + 0.5) / rows) * H;
  const lw = labelPx(text);
  const [x0, x1] = side === 'west' ? [2, 2 + lw] : [W - 2 - lw, W - 2];
  return Math.abs(my - spot * H) < LABEL_HALF_PX + ICON_HALF_PX + gap && mx + halfW + gap > x0 && mx - halfW - gap < x1;
}

export function edgeLabelSpot(
  side: 'west' | 'east',
  cols: number,
  rows: number,
  marks: readonly { x: number; y: number }[],
  here: { x: number; y: number } | null,
  text: string,
): number {
  // Covering the ⭐ is worst, then covering a marker; only coming within the
  // gap of one (the ⭐ above others) counts far less — never enough to land on
  // something instead.
  const hit = (m: { x: number; y: number }, f: number, covered: number, close: number, halfW?: number) =>
    edgeLabelCovers(side, cols, rows, f, m, text, halfW, 0) ? covered : edgeLabelCovers(side, cols, rows, f, m, text, halfW) ? close : 0;
  const cost = (f: number) =>
    (here ? hit(here, f, 1000, 10, STAR_HALF_W) : 0) + marks.reduce((n, m) => n + hit(m, f, 100, 1), 0);
  let best: number = EDGE_LABEL_SPOTS[0];
  for (const f of EDGE_LABEL_SPOTS) {
    if (cost(f) === 0) return f;
    if (cost(f) < cost(best)) best = f;
  }
  return best;
}

/**
 * How far above its place a pin sits on the menu map, in its own heights
 * (`WorldMapPanel`: `-translate-y-[145%]` for both): the ⭐ (16 px) and the
 * 🚩 (15 px) clear the place's 13 px emoji, so all three show (#117n — they
 * used to sit on its top, hiding Eldergrove's 🌳).
 */
export const STAR_PERCH = 1.45;
export const FLAG_PERCH = 1.45;
/** …or how far below it they hang (`translate-y-[45%]`), on a place in the map's top rows (`pinsBelow`). */
export const PIN_HANG = 0.45;

/**
 * Do pins on a place in row `y` hang below it? Near the map's top a pin above
 * would stick out over the map's title (Foglight Marsh, the Story Reef) — on
 * the narrowest map, so the same rows on every size.
 */
export function pinsBelow(cols: number, y: number): boolean {
  return (y + 0.5) * (MAP_MIN_PX / cols) < FLAG_PERCH * 16;
}

/** A marker on the narrowest menu map (`MAP_MIN_PX`): its centre and half its size, in px. */
export interface MapBox {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/** Do two markers come within `gap` px of each other? (`gap` 0: do they overlap.) */
export function boxesMeet(a: MapBox, b: MapBox, gap = 0): boolean {
  return Math.abs(a.x - b.x) < a.hw + b.hw + gap && Math.abs(a.y - b.y) < a.hh + b.hh + gap;
}

/** Ways to try a nudge, turning further and further from straight out. */
const NUDGE_TURNS = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((deg) => (deg * Math.PI) / 180);

/**
 * The smallest nudge (whole px) that keeps `mark` `gap` px clear of every box
 * in `taken`: none when it's clear already; else straight out from what it
 * would cover (up, when it sits right on top of it), turning further round
 * only if that's blocked. Never more than `maxPx` — past that it stays put.
 */
export function nudgeClear(mark: MapBox, taken: readonly MapBox[], gap = GAP_PX, maxPx = 40): { dx: number; dy: number } {
  const clear = (dx: number, dy: number) => !taken.some((t) => boxesMeet({ ...mark, x: mark.x + dx, y: mark.y + dy }, t, gap));
  if (clear(0, 0)) return { dx: 0, dy: 0 };
  const hit = taken.filter((t) => boxesMeet(mark, t, gap));
  const ox = mark.x - hit.reduce((n, t) => n + t.x, 0) / hit.length;
  const oy = mark.y - hit.reduce((n, t) => n + t.y, 0) / hit.length;
  const out = Math.hypot(ox, oy) > 0.5 ? Math.atan2(oy, ox) : -Math.PI / 2;
  for (let d = 1; d <= maxPx; d++) {
    for (const turn of NUDGE_TURNS) {
      const dx = Math.round(Math.cos(out + turn) * d);
      const dy = Math.round(Math.sin(out + turn) * d);
      if (clear(dx, dy)) return { dx, dy };
    }
  }
  return { dx: 0, dy: 0 };
}

/**
 * Where the menu map draws the ⛵ (#117n): a px nudge off its mooring so it
 * never sits on a place's icon, a landmark, a fog bank's crystal, the ⭐ or the
 * 🚩. Inside Eldergrove all of them piled onto one small island — the boat
 * moored at its beach, the ⭐ and 🚩 pinned to its 🌳. Worked out on the
 * narrowest map (a 320 px phone), where markers crowd most, and drawn the same
 * on every size: a few px further out at most, the way it already lay. The
 * boxes follow how `WorldMapPanel` draws each one (its CSS classes).
 */
export function boatNudge(
  cols: number,
  boat: { x: number; y: number },
  {
    icons = [],
    here = null,
    shared = false,
    flag = null,
  }: {
    /** Places, landmarks and fog crystals: drawn centred on their cell. */
    icons?: readonly { x: number; y: number }[];
    here?: MapMarker | null;
    /** The ⭐ steps aside for the 🚩 on the same place. */
    shared?: boolean;
    flag?: { x: number; y: number } | null;
  } = {},
): { dx: number; dy: number } {
  const s = MAP_MIN_PX / cols; // px per cell (the map's cells are square)
  const at = (c: { x: number; y: number }) => ({ x: (c.x + 0.5) * s, y: (c.y + 0.5) * s });
  const taken: MapBox[] = icons.map((c) => ({ ...at(c), hw: ICON_HALF_PX, hh: ICON_HALF_PX }));
  // A pin `h` px tall perched above its place, or hanging below it near the map's top.
  const pinY = (c: { x: number; y: number }, row: number, h: number, perch: number) =>
    (pinsBelow(cols, row) ? c.y + PIN_HANG * h : c.y - perch * h) + h / 2;
  if (here) {
    // 16 px text, 20 px wide; on its own cell when it's you on the map, else pinned to the place,
    // and stepped left (-100%) when the 🚩 shares the place.
    const c = at(here);
    taken.push({ x: shared ? c.x - STAR_HALF_W : c.x, y: here.exact ? c.y : pinY(c, here.y, 16, STAR_PERCH), hw: STAR_HALF_W, hh: 8 });
  }
  if (flag) {
    // 15 px text, ~17 px wide, pinned by the place's top-right corner (-15%).
    const c = at(flag);
    taken.push({ x: c.x + 0.35 * 17, y: pinY(c, flag.y, 15, FLAG_PERCH), hw: 8.5, hh: 7.5 });
  }
  return nudgeClear({ ...at(boat), hw: ICON_HALF_PX, hh: 7 }, taken);
}

