import { PICTURE_BY_ID, type PictureId } from '../../../lib/minigames/stars';

/**
 * Vela's Star Charts' pictures (docs/DESIGN-MINIGAMES.md §2.1): a star
 * picture drawn small (`PictureCard`, for the ticket and the chart), the title
 * card's logo and its three "how to play" steps. Loaded with the stage; the
 * game itself loads when it's played (`StarCharts`).
 */

const INK = '#1b0f22';
const NIGHT = '#141a46';
const GOLD = '#fcd34d';

/** A star picture, upright: its stars and lines in gold on a night square. Decorative (`aria-hidden`). */
export function PictureCard({ id, size = 64 }: { id: PictureId; size?: number }) {
  const p = PICTURE_BY_ID[id];
  const at = Object.fromEntries(p.stars.map((s) => [s.id, s]));
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="block flex-none rounded">
      <rect width="100" height="100" fill={NIGHT} />
      {p.lines.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={at[a].x} y1={at[a].y} x2={at[b].x} y2={at[b].y} stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
      ))}
      {p.stars.map((s) => (
        <circle key={s.id} cx={s.x} cy={s.y} r={s.mag === 1 ? 6 : s.mag === 2 ? 5 : 4} fill="#fff7d6" stroke={INK} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

/** A dome with its telescope, under stars joined into a W. */
export function StarsLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect x="10" y="10" width="180" height="180" rx="20" fill={NIGHT} stroke={INK} strokeWidth="7" />
      <path d="M30 70 L60 100 L95 62 L130 98 L170 60" fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {[
        [30, 70],
        [60, 100],
        [95, 62],
        [130, 98],
        [170, 60],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="9" fill="#fff7d6" stroke={INK} strokeWidth="4" />
      ))}
      <path d="M50 180 V150 a50 50 0 0 1 100 0 V180 z" fill="#cbd5e1" stroke={INK} strokeWidth="7" />
      <path d="M100 150 L128 118" stroke="#64748b" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

/** Step 1: a star picture card. */
export function StepFind() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="20" width="160" height="160" rx="14" fill={NIGHT} stroke={INK} strokeWidth="9" />
      <path d="M50 120 L100 70 L150 110" fill="none" stroke={GOLD} strokeWidth="8" strokeDasharray="14 10" strokeLinecap="round" />
      {[
        [50, 120],
        [100, 70],
        [150, 110],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="13" fill="#fff7d6" stroke={INK} strokeWidth="6" />
      ))}
    </svg>
  );
}

/** Step 2: a finger joining two stars. */
export function StepConnect() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="20" width="160" height="160" rx="14" fill={NIGHT} stroke={INK} strokeWidth="9" />
      <path d="M55 60 L140 120" stroke={GOLD} strokeWidth="10" strokeLinecap="round" />
      <circle cx="55" cy="60" r="14" fill="#fff7d6" stroke={INK} strokeWidth="6" />
      <circle cx="140" cy="120" r="14" fill="#fff7d6" stroke={INK} strokeWidth="6" />
      <path d="M140 132 v40 a14 14 0 0 0 28 0 v-26" fill="#f4c7a1" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 3: a fact card with a star. */
export function StepFact() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="30" y="30" width="140" height="150" rx="10" fill="#fff6dc" stroke={INK} strokeWidth="9" />
      <path d="M100 52 l10 22 24 3 -18 16 5 24 -21 -12 -21 12 5 -24 -18 -16 24 -3 z" fill={GOLD} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d="M58 140 h84 M58 160 h60" stroke={INK} strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}
