import { STAMP_BY_ID, type StampId } from '../../../lib/minigames/airmail';

/**
 * Ember Air Mail's pictures (docs/DESIGN-MINIGAMES.md §2.1): a stamp drawn
 * small (`StampCard`, for the ticket and the album), the title card's logo
 * and its three "how to play" steps. Loaded with the stage; the game itself
 * loads when it's played (`EmberAirMail`).
 */

const INK = '#1b0f22';
const PAPER = '#fff6dc';
const SEA = '#3d7fb8';
const LAND = '#7fb36a';
const GOLD = '#fcd34d';

/** A stamp: its picture on a perforated square. Decorative (`aria-hidden`). */
export function StampCard({ id, size = 56 }: { id: StampId; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-sm border-[3px] border-dotted border-[#1b0f22] bg-[#fff6dc] shadow-[2px_2px_0_#1b0f22]"
      style={{ width: size, height: size * 1.15, fontSize: size * 0.5 }}
    >
      {STAMP_BY_ID[id].emoji}
    </span>
  );
}

/** A dragon's wing over a map, an envelope in tow. */
export function AirMailLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect x="10" y="10" width="180" height="180" rx="20" fill={SEA} stroke={INK} strokeWidth="7" />
      <path d="M10 120 Q60 90 110 120 T190 110 V170 Q190 190 170 190 H30 Q10 190 10 170 Z" fill={LAND} stroke={INK} strokeWidth="6" />
      <path d="M40 150 L80 120 L120 140 L160 80" fill="none" stroke={GOLD} strokeWidth="7" strokeDasharray="12 9" strokeLinecap="round" />
      <rect x="120" y="38" width="56" height="40" rx="4" fill={PAPER} stroke={INK} strokeWidth="6" />
      <path d="M122 42 L148 62 L174 42" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <circle cx="160" cy="80" r="12" fill="#f87171" stroke={INK} strokeWidth="5" />
    </svg>
  );
}

/** Step 1: a parcel with its label. */
export function StepParcel() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="30" y="60" width="140" height="110" rx="8" fill="#d6a76c" stroke={INK} strokeWidth="8" />
      <path d="M100 60 V170 M30 100 H170" stroke={INK} strokeWidth="7" />
      <rect x="110" y="112" width="48" height="40" rx="4" fill={PAPER} stroke={INK} strokeWidth="6" />
      <path d="M118 126 h30 M118 140 h20" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** Step 2: the compass, north lit. */
export function StepSteer() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="82" fill={PAPER} stroke={INK} strokeWidth="8" />
      <path d="M100 26 L118 100 L100 90 L82 100 Z" fill="#ef4444" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d="M100 174 L118 100 L100 110 L82 100 Z" fill="#e5e7eb" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 3: a parcel dropped at a door, a stamp for the album. */
export function StepDeliver() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M30 100 L100 40 L170 100 V170 H30 Z" fill="#f4e8c8" stroke={INK} strokeWidth="8" strokeLinejoin="round" />
      <rect x="84" y="118" width="32" height="52" fill="#a16207" stroke={INK} strokeWidth="6" />
      <rect x="120" y="134" width="40" height="32" rx="3" fill="#d6a76c" stroke={INK} strokeWidth="6" />
      <path d="M58 150 L74 166 L104 128" fill="none" stroke="#15803d" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Expert's step 1: a grid of latitude and longitude, a city's dot in one square. */
export function StepGrid() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="40" width="160" height="120" fill="#3d7fb8" stroke={INK} strokeWidth="8" />
      <path d="M60 40 V160 M100 40 V160 M140 40 V160 M20 80 H180 M20 120 H180" stroke={PAPER} strokeWidth="4" />
      <path d="M100 40 V160 M20 120 H180" stroke="#fcd34d" strokeWidth="6" strokeDasharray="10 7" />
      <circle cx="122" cy="98" r="11" fill="#ef4444" stroke={INK} strokeWidth="5" />
    </svg>
  );
}

/** Expert's step 3: two clocks, an hour apart for each 15°. */
export function StepClock() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="60" cy="100" r="44" fill={PAPER} stroke={INK} strokeWidth="8" />
      <path d="M60 100 V68 M60 100 H84" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      <circle cx="146" cy="100" r="44" fill="#fcd34d" stroke={INK} strokeWidth="8" />
      <path d="M146 100 V68 M146 100 L126 118" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
