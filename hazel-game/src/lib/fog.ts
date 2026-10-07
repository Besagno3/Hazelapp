import { TILE, type FogDef } from '../content/zones';
import { FOG_PUFF_FRAMES, FOG_PUFF_SIZE } from '../content/tiles';

/**
 * How a fog bank looks (#75 item 7): not square tiles but a cluster of soft
 * cloud puffs. They overlap well past the bank's edge, so its outline is round
 * and wispy, and each drifts in a small slow orbit around its spot — next-door
 * puffs turning opposite ways — so the bank seems to churn and float. As a
 * bank lifts, its puffs spread out, rise and fade. Pure, and seeded by the
 * bank's id so a bank always looks the same. (Collision is still the bank's
 * rectangle: `fogAt`.)
 */
export interface FogPuff {
  /** Resting centre, world pixels. */
  x: number;
  y: number;
  /** Which of the puff shapes (`FOG_PUFF_FRAMES`). */
  frame: number;
  scale: number;
  opacity: number;
  /** Orbit radii (px), angular speed (rad/s; the sign is the direction) and phase. */
  rx: number;
  ry: number;
  speed: number;
  phase: number;
}

/** Puff spacing (px): tight, so puffs always overlap into one bank. */
export const PUFF_SPACING = 22;
/** How far inside the bank's edge the outer puffs rest (px). */
const INSET = 6;
const MAX_SCALE = 1.3;
const MAX_ORBIT = 12;
/** How far a bank's fog can spill past its rectangle (px), drifting included. */
export const FOG_OVERHANG = Math.ceil((FOG_PUFF_SIZE / 2) * MAX_SCALE - INSET + MAX_ORBIT);

/** mulberry32: a tiny seeded random, so a bank's puffs are the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The puffs a bank is drawn with. */
export function fogPuffs(f: FogDef): FogPuff[] {
  const rand = seeded(hash(f.id));
  const x0 = f.x * TILE + INSET;
  const y0 = f.y * TILE + INSET;
  const x1 = (f.x + f.w) * TILE - INSET;
  const y1 = (f.y + f.h) * TILE - INSET;
  const cols = Math.max(1, Math.round((x1 - x0) / PUFF_SPACING)) + 1;
  const rows = Math.max(1, Math.round((y1 - y0) / PUFF_SPACING)) + 1;
  const puffs: FogPuff[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jx = (rand() - 0.5) * 8;
      const jy = (rand() - 0.5) * 8;
      puffs.push({
        x: Math.min(x1, Math.max(x0, x0 + ((x1 - x0) * c) / (cols - 1) + jx)),
        y: Math.min(y1, Math.max(y0, y0 + ((y1 - y0) * r) / (rows - 1) + jy)),
        frame: Math.floor(rand() * FOG_PUFF_FRAMES),
        scale: 0.95 + rand() * (MAX_SCALE - 0.95),
        opacity: 0.62 + rand() * 0.2,
        rx: 5 + rand() * 4,
        ry: 3 + rand() * 3,
        // Neighbours turn opposite ways, so the bank seems to churn.
        speed: (0.35 + rand() * 0.4) * ((r + c) % 2 === 0 ? 1 : -1),
        phase: rand() * Math.PI * 2,
      });
    }
  }
  return puffs;
}

/**
 * Where a puff is drawn at time `t` (seconds), and how: its orbit, a gentle
 * swell, and — as the bank lifts (`lift` 0 → 1) — drifting out from the
 * bank's centre and up while it fades. `still` (reduced motion) keeps puffs
 * in place: no orbit, and a lift is only a fade.
 */
export function puffAt(
  p: FogPuff,
  t: number,
  lift: number,
  centre: { x: number; y: number },
  still = false,
): { x: number; y: number; scale: number; opacity: number } {
  const a = still ? p.phase : t * p.speed + p.phase;
  // An orbit plus a slower sway, so the paths wander instead of tracing circles.
  const sway = t * 0.23 + p.phase * 1.7;
  let x = p.x + (still ? 0 : Math.cos(a) * p.rx + Math.sin(sway) * 3);
  let y = p.y + (still ? 0 : Math.sin(a) * p.ry + Math.cos(sway * 1.3) * 2);
  let scale = p.scale * (still ? 1 : 1 + 0.04 * Math.sin(a * 0.7));
  if (lift > 0 && !still) {
    const dx = p.x - centre.x;
    const dy = p.y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * 28 * lift;
    y += (dy / len) * 28 * lift - 26 * lift;
    scale *= 1 + 0.25 * lift;
  }
  return { x, y, scale, opacity: p.opacity * (1 - Math.min(1, Math.max(0, lift))) };
}
