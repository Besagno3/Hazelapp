import { CHIME, NOTES } from '../../../lib/minigames/echo';

/**
 * Echo's Call's pictures (docs/DESIGN-MINIGAMES.md §2.1): the title card's
 * logo and its three "how to play" steps. Loaded with the stage; the game
 * itself loads when it's played (`EchosCall`).
 */

const INK = '#1b0f22';

/** Five chimes on a frame, long to short, a mallet and two notes in the air. */
export function EchoLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect x="18" y="150" width="164" height="14" rx="6" fill="#a8692e" stroke={INK} strokeWidth="6" />
      {NOTES.map((n, k) => {
        const h = 104 - k * 14;
        return <rect key={n} x={26 + k * 31} y={150 - h} width="24" height={h} rx="6" fill={CHIME[n].colour} stroke={INK} strokeWidth="6" />;
      })}
      <path d="M150 34 L118 76" stroke="#a8692e" strokeWidth="9" strokeLinecap="round" />
      <circle cx="114" cy="82" r="11" fill="#f4ecdc" stroke={INK} strokeWidth="6" />
      <path d="M40 22 v26 M40 22 l14 -6 v26" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="35" cy="48" r="7" fill={INK} />
      <circle cx="49" cy="42" r="7" fill={INK} />
    </svg>
  );
}

/** Step 1: an ear, and notes coming to it. */
export function StepListen() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M120 40 a50 55 0 0 0 -80 45 c0 30 30 35 30 60 a22 22 0 0 0 40 8" fill="#f4c7a1" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M92 75 a18 18 0 0 1 30 14 c0 14 -16 16 -16 30" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      <path d="M160 46 v40" stroke={CHIME.E.colour} strokeWidth="10" strokeLinecap="round" />
      <circle cx="152" cy="90" r="12" fill={CHIME.E.colour} stroke={INK} strokeWidth="6" />
      <path d="M176 110 v30" stroke={CHIME.G.colour} strokeWidth="10" strokeLinecap="round" />
      <circle cx="168" cy="144" r="11" fill={CHIME.G.colour} stroke={INK} strokeWidth="6" />
    </svg>
  );
}

/** Step 2: three notes going up, and an arrow. */
export function StepShape() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="40" cy="150" r="18" fill={CHIME.C.colour} stroke={INK} strokeWidth="7" />
      <circle cx="100" cy="110" r="18" fill={CHIME.E.colour} stroke={INK} strokeWidth="7" />
      <circle cx="160" cy="70" r="18" fill={CHIME.G.colour} stroke={INK} strokeWidth="7" />
      <path d="M40 100 L150 24 M150 24 l-36 2 M150 24 l-8 34" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 3: a mallet on a chime. */
export function StepPlay() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="30" y="120" width="140" height="34" rx="10" fill={CHIME.F.colour} stroke={INK} strokeWidth="8" />
      <path d="M170 30 L112 96" stroke="#a8692e" strokeWidth="12" strokeLinecap="round" />
      <circle cx="104" cy="104" r="17" fill="#f4ecdc" stroke={INK} strokeWidth="8" />
      <path d="M60 96 l-10 -14 M80 90 l-2 -18" stroke="#fcd34d" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
