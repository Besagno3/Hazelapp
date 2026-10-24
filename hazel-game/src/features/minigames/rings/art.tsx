import type { TreeId } from '../../../lib/minigames/rings';
import { BARK, LATE, TREE_TINT, WOOD } from './wood';

/**
 * Ringwood's Rings' pictures (docs/DESIGN-MINIGAMES.md §2.1): a tree's slice
 * drawn small (`SliceCard`, for the ticket and the grove book), the title
 * card's logo and its three "how to play" steps. Loaded with the stage; the
 * game itself loads when it's played (`RingwoodsRings`).
 */

const INK = '#1b0f22';

/** A tree's slice: its bark, a few rings and the middle, in its own wood. Decorative (`aria-hidden`). */
export function SliceCard({ id, size = 56 }: { id: TreeId; size?: number }) {
  const t = TREE_TINT[id];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="block flex-none">
      <circle cx="50" cy="50" r="46" fill={t.bark} stroke={INK} strokeWidth="4" />
      {[38, 30, 25, 17, 10].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill={t.wood} stroke={LATE} strokeWidth="2" />
      ))}
      <circle cx="50" cy="50" r="3.5" fill={LATE} />
    </svg>
  );
}

/** A big slice with its rings, and a magnifying glass. */
export function RingsLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="92" cy="96" r="80" fill={BARK} stroke={INK} strokeWidth="7" />
      {[68, 58, 52, 40, 30, 18].map((r) => (
        <circle key={r} cx="92" cy="96" r={r} fill={WOOD} stroke={LATE} strokeWidth="3" />
      ))}
      <circle cx="92" cy="96" r="5" fill={LATE} />
      <circle cx="140" cy="140" r="30" fill="#bfe3ff" fillOpacity="0.55" stroke={INK} strokeWidth="8" />
      <path d="M162 162 L188 188" stroke={INK} strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

/** Step 1: a slice, its rings numbered from the middle out. */
export function StepCount() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="84" fill={BARK} stroke={INK} strokeWidth="9" />
      {[70, 50, 30].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill={WOOD} stroke={LATE} strokeWidth="6" />
      ))}
      <text x="100" y="74" textAnchor="middle" fontSize="30" fontWeight="900" fill={INK}>
        3
      </text>
      <text x="100" y="112" textAnchor="middle" fontSize="30" fontWeight="900" fill={INK}>
        1
      </text>
    </svg>
  );
}

/** Step 2: a wide ring and a thin one — a raindrop and a sun. */
export function StepRead() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="70" width="160" height="60" rx="8" fill={WOOD} stroke={INK} strokeWidth="8" />
      <rect x="40" y="74" width="56" height="52" fill="#f6dfb4" />
      <path d="M98 74 v52" stroke={LATE} strokeWidth="6" />
      <path d="M126 74 v52" stroke={LATE} strokeWidth="14" />
      <path d="M68 22 q14 18 0 26 q-14 -8 0 -26 z" fill="#5aa6e8" stroke={INK} strokeWidth="5" />
      <circle cx="128" cy="34" r="13" fill="#fcd34d" stroke={INK} strokeWidth="5" />
    </svg>
  );
}

/** Step 3: an old beam's rings slid under a living tree's. */
export function StepMatch() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="14" y="40" width="172" height="44" rx="6" fill={WOOD} stroke={INK} strokeWidth="8" />
      <rect x="64" y="116" width="96" height="44" rx="6" fill="#c9a06c" stroke={INK} strokeWidth="8" />
      {[60, 92, 128].map((x) => (
        <path key={x} d={`M${x} 44 v36 M${x + 22} 120 v36`} stroke={LATE} strokeWidth="9" />
      ))}
      <path d="M40 140 l-16 0 m6 -8 l-8 8 8 8" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
