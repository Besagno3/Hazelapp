/**
 * The Potion Lab's small pictures for the title card (docs/DESIGN-MINIGAMES.md
 * §2.1): its logo and the three "how to play" steps. Loaded with the stage;
 * the game itself loads when it's played (`PotionLab`).
 */

const INK = '#1b0f22';

/** A cauldron of pink potion with bubbles. */
export function PotionLabLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.875} viewBox="0 0 320 280" aria-hidden="true">
      <path d="M86 210 L70 260 L98 260 L110 218 Z" fill="#2a2440" stroke={INK} strokeWidth="10" strokeLinejoin="round" />
      <path d="M234 210 L250 260 L222 260 L210 218 Z" fill="#2a2440" stroke={INK} strokeWidth="10" strokeLinejoin="round" />
      <path d="M28 98 C28 176 68 226 124 234 L196 234 C252 226 292 176 292 98 Z" fill="#3a3355" stroke={INK} strokeWidth="12" strokeLinejoin="round" />
      <path d="M58 126 C62 162 78 190 104 208" fill="none" stroke="#6a5f94" strokeWidth="16" strokeLinecap="round" />
      <ellipse cx="160" cy="98" rx="140" ry="32" fill="#4a4270" stroke={INK} strokeWidth="12" />
      <ellipse cx="160" cy="102" rx="118" ry="21" fill="#ff5fa8" />
      <circle cx="120" cy="60" r="16" fill="#ffb0d4" stroke={INK} strokeWidth="8" />
      <circle cx="196" cy="36" r="12" fill="#ffb0d4" stroke={INK} strokeWidth="8" />
      <circle cx="160" cy="12" r="8" fill="#ffb0d4" stroke={INK} strokeWidth="6" />
    </svg>
  );
}

/** Step 1: a jar of lemon juice. */
export function StepPour() {
  return (
    <svg width="44" height="56" viewBox="0 0 80 104" aria-hidden="true">
      <rect x="27" y="3" width="26" height="15" rx="3" fill="#a8743f" stroke={INK} strokeWidth="4" />
      <rect x="8" y="22" width="64" height="78" rx="15" fill="#e6f5ff" stroke={INK} strokeWidth="4" />
      <path d="M11 50 H69 V84 Q69 97 55 97 H25 Q11 97 11 84 Z" fill="#ffd84a" />
      <rect x="15" y="30" width="7" height="40" rx="3" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

/** Step 2: three colours and a question mark. */
export function StepGuess() {
  return (
    <svg width="60" height="56" viewBox="0 0 60 56" aria-hidden="true">
      <circle cx="16" cy="38" r="12" fill="#ff5fa8" stroke={INK} strokeWidth="3" />
      <circle cx="30" cy="42" r="12" fill="#8e44c9" stroke={INK} strokeWidth="3" />
      <circle cx="44" cy="38" r="12" fill="#22b39a" stroke={INK} strokeWidth="3" />
      <text x="30" y="22" textAnchor="middle" fontFamily="'Jersey 15', sans-serif" fontSize="26" fill="#fcd34d" stroke={INK} strokeWidth="1.5">
        ?
      </text>
    </svg>
  );
}

/** Step 3: a sparkling cauldron. */
export function StepStir() {
  return (
    <svg width="58" height="52" viewBox="0 0 320 280" aria-hidden="true">
      <path d="M28 98 C28 176 68 226 124 234 L196 234 C252 226 292 176 292 98 Z" fill="#3a3355" stroke={INK} strokeWidth="14" strokeLinejoin="round" />
      <ellipse cx="160" cy="98" rx="140" ry="32" fill="#4a4270" stroke={INK} strokeWidth="14" />
      <ellipse cx="160" cy="102" rx="118" ry="21" fill="#22b39a" />
      <path d="M70 20 L82 46 L108 58 L82 70 L70 96 L58 70 L32 58 L58 46 Z" fill="#fde68a" stroke={INK} strokeWidth="8" strokeLinejoin="round" />
      <path d="M250 10 L259 30 L279 39 L259 48 L250 68 L241 48 L221 39 L241 30 Z" fill="#fde68a" stroke={INK} strokeWidth="8" strokeLinejoin="round" />
    </svg>
  );
}
