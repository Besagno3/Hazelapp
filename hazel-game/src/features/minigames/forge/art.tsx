import type { FamilyId } from '../../../lib/minigames/forge';

/**
 * Word Forge's pictures (docs/DESIGN-MINIGAMES.md §2.1): a family's mark
 * (`FamilyMark`, for the ticket and the word wall), the title card's logo
 * and its three "how to play" steps. Loaded with the stage; the game itself
 * loads when it's played (`WordForge`).
 */

const INK = '#1b0f22';
const IRON = '#4b5563';
const GLOW = '#fb923c';
const PAPER = '#fff6dc';

/** Each family's mark, on its page of the wall and on the ticket once its word's forged. */
const MARKS: Record<FamilyId, string> = { sun: '☀️', rain: '🌧️', more: '➕', help: '🤝', kind: '💛', view: '👀', tele: '🔭', micro: '🔬', graph: '✍️' };

/**
 * A family's mark: a round stamp — not a tile like the tray's parts (code and
 * UX review round 1: the family's first part on an orange tile, "un" on the
 * ticket for kinder, read as a part to pick). Decorative (`aria-hidden`).
 */
export function FamilyMark({ id, size = 48 }: { id: FamilyId | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full border-2 border-[#1b0f22] bg-[#fde68a] leading-none"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {id ? MARKS[id] : '🔨'}
    </span>
  );
}

/** An anvil, a hot word on it, sparks. */
export function ForgeLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect x="10" y="10" width="180" height="180" rx="20" fill="#2b1d3d" stroke={INK} strokeWidth="7" />
      <path d="M40 110 H160 Q150 130 128 134 V150 H150 V166 H50 V150 H72 V134 Q50 130 40 110 Z" fill={IRON} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <rect x="58" y="78" width="84" height="30" rx="6" fill={GLOW} stroke={INK} strokeWidth="6" />
      <path d="M72 93 h56" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      {[
        [48, 60],
        [100, 44],
        [152, 62],
      ].map(([x, y]) => (
        <path key={x} d={`M${x} ${y} l6 -12 M${x} ${y} l-6 -12 M${x} ${y} l0 -14`} stroke="#fde68a" strokeWidth="5" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Step 1: a scroll with a meaning on it. */
export function StepMeaning() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="40" y="40" width="120" height="120" rx="10" fill={PAPER} stroke={INK} strokeWidth="8" />
      <path d="M62 80 h76 M62 104 h60 M62 128 h70" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/** Step 2: two word-part tiles, side by side. */
export function StepPick() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="66" width="74" height="68" rx="8" fill="#fdba74" stroke={INK} strokeWidth="8" />
      <rect x="106" y="66" width="74" height="68" rx="8" fill="#fdba74" stroke={INK} strokeWidth="8" />
      <path d="M38 100 h38 M124 100 h38" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/** Step 3: a hammer coming down, sparks flying. */
export function StepHammer() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="40" y="130" width="120" height="34" rx="6" fill={IRON} stroke={INK} strokeWidth="8" />
      <rect x="86" y="30" width="70" height="40" rx="6" fill={IRON} stroke={INK} strokeWidth="8" transform="rotate(-20 120 50)" />
      <path d="M112 66 L82 122" stroke="#a16207" strokeWidth="14" strokeLinecap="round" />
      <path d="M60 120 l-14 -14 M100 116 l0 -20 M140 120 l14 -14" stroke="#fde68a" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
