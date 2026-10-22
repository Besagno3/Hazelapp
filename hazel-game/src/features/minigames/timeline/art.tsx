import { SET_BY_ID, type SetId } from '../../../lib/minigames/timeline';

/**
 * Index's Timeline's pictures (docs/DESIGN-MINIGAMES.md §2.1): a set's card
 * drawn small (`SetCard`, for the ticket and the timeline book), the title
 * card's logo and its three "how to play" steps. Loaded with the stage; the
 * game itself loads when it's played (`IndexTimeline`).
 */

const INK = '#1b0f22';
const CARD = '#f4e8c8';
const WASH = '#cfe3e8';

/** A set's card: its emoji on a soggy catalog card. Decorative (`aria-hidden`). */
export function SetCard({ id, size = 56 }: { id: SetId; size?: number }) {
  return (
    <span aria-hidden="true" className="flex flex-none items-center justify-center rounded border-2 border-[#1b0f22] bg-[#f4e8c8] shadow-[2px_2px_0_#1b0f22]" style={{ width: size, height: size * 0.8, fontSize: size * 0.42 }}>
      {SET_BY_ID[id].emoji}
    </span>
  );
}

/** Three cards on a line, an arrow through time. */
export function TimelineLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect x="10" y="10" width="180" height="180" rx="20" fill="#1f4a5a" stroke={INK} strokeWidth="7" />
      <path d="M24 150 H170" stroke="#fcd34d" strokeWidth="8" strokeLinecap="round" />
      <path d="M160 138 L178 150 L160 162" fill="none" stroke="#fcd34d" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {[30, 80, 130].map((x, k) => (
        <g key={x} transform={`rotate(${(k - 1) * 4} ${x + 22} 90)`}>
          <rect x={x} y={54 + k * 6} width="44" height="58" rx="5" fill={CARD} stroke={INK} strokeWidth="5" />
          <path d={`M${x + 8} ${70 + k * 6} h28 M${x + 8} ${84 + k * 6} h20`} stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/** Step 1: a soggy card washing in. */
export function StepWash() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M10 150 q30 -20 60 0 t60 0 t60 0 V190 H10 z" fill={WASH} stroke={INK} strokeWidth="7" />
      <rect x="60" y="40" width="80" height="96" rx="8" fill={CARD} stroke={INK} strokeWidth="8" transform="rotate(-8 100 88)" />
      <path d="M78 76 h44 M78 98 h30" stroke={INK} strokeWidth="8" strokeLinecap="round" transform="rotate(-8 100 88)" />
    </svg>
  );
}

/** Step 2: a card going into its place on the line. */
export function StepPlace() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M20 150 H180" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <rect x="30" y="96" width="40" height="48" rx="5" fill={CARD} stroke={INK} strokeWidth="6" />
      <rect x="130" y="96" width="40" height="48" rx="5" fill={CARD} stroke={INK} strokeWidth="6" />
      <rect x="80" y="96" width="40" height="48" rx="5" fill="none" stroke={INK} strokeWidth="6" strokeDasharray="10 8" />
      <rect x="80" y="20" width="40" height="48" rx="5" fill="#fcd34d" stroke={INK} strokeWidth="6" />
      <path d="M100 72 v16 m-8 -8 l8 8 8 -8" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 3: a tick — the order's right. */
export function StepCheck() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="40" width="160" height="120" rx="12" fill={CARD} stroke={INK} strokeWidth="9" />
      <path d="M58 102 L88 130 L144 70" fill="none" stroke="#15803d" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
