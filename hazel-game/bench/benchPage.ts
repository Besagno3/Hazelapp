/**
 * Pure helpers for the bench page (`bench/world.tsx`), kept out of it so they
 * can be tested without mounting the page (`benchPage.test.ts`).
 */
import { TILE, VIEW_COLS, VIEW_ROWS, buildingInside, type ZoneDef } from '../src/content/zones';
import { AVATARS, avatarById } from '../src/content/avatars';
import { camAxis } from '../src/lib/camera';
import { canFlyOver } from '../src/lib/travel';
import type { Avatar } from '../src/types';

/** Where `shots` starts the hero for one screen: on foot, or flying on Ember (`fly=1`). */
export interface ScreenSpot {
  x: number;
  y: number;
  fly?: true;
}

/** How far (cells) from a screen's middle to look for open ground. */
const SEARCH = 12;

/**
 * One start cell per screen of the map, for `bench … shots` (#82f). The hero
 * stands on the open ground nearest the screen's middle that puts the camera
 * exactly where the middle would (off the middle, it only works where the map's
 * edge holds the camera still). With no such cell — a screen of mountains, sea
 * or forest — on a map Ember flies over the hero flies over the middle itself,
 * so every screen is shot whole; elsewhere they stand on the nearest open
 * ground, and the camera may show a strip of the next screen.
 */
export function screenCells(z: ZoneDef): ScreenSpot[] {
  const cols = z.map[0].length;
  const rows = z.map.length;
  const open = (x: number, y: number) => '.,='.includes(z.map[y]?.[x] ?? '#') && !buildingInside(z, x, y);
  const cam = (x: number, y: number) =>
    `${camAxis(x * TILE + TILE / 2, cols * TILE, VIEW_COLS * TILE)},${camAxis(y * TILE + TILE / 2, rows * TILE, VIEW_ROWS * TILE)}`;
  /** The nearest cell to (tx, ty) that passes `ok`, ring by ring. */
  const nearest = (tx: number, ty: number, ok: (x: number, y: number) => boolean) => {
    for (let r = 0; r < SEARCH; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  };
  const out: ScreenSpot[] = [];
  for (let by = 0; by < Math.ceil(rows / VIEW_ROWS); by++) {
    for (let bx = 0; bx < Math.ceil(cols / VIEW_COLS); bx++) {
      const tx = Math.min(cols - 1, bx * VIEW_COLS + Math.floor(VIEW_COLS / 2));
      const ty = Math.min(rows - 1, by * VIEW_ROWS + Math.floor(VIEW_ROWS / 2));
      const want = cam(tx, ty);
      const onScreen = nearest(tx, ty, (x, y) => open(x, y) && cam(x, y) === want);
      if (onScreen) out.push(onScreen);
      else if (canFlyOver(z)) out.push({ x: tx, y: ty, fly: true });
      else {
        const near = nearest(tx, ty, open);
        if (near) out.push(near);
      }
    }
  }
  return out;
}

/** `hero=<id>` (#115f): the hero the bench draws, Valor (`a1`) when none is given. */
export function benchHero(id: string | null): Avatar {
  const want = id ?? 'a1';
  const hero = avatarById(want);
  if (!hero) throw new Error(`hero=${want}: no such hero — use one of ${AVATARS.map((a) => a.id).join(', ')}`);
  return hero;
}
