import { HEX, type Grid } from '../../../lib/minigames/mural';

/**
 * Mirror Mural's pictures (docs/DESIGN-MINIGAMES.md §2.1): a small picture of
 * a grid (`PixelPicture`, for the Gallery), the title card's logo and its three
 * "how to play" steps. Loaded with the stage; the game itself loads when it's
 * played (`MirrorMural`).
 */

const INK = '#1b0f22';

/**
 * A grid drawn small: its squares in their colours, bare wall a darker stone
 * (review round 2: cream on the canvas's pale wall all but vanished, and these
 * have no letters). Decorative (`aria-hidden`).
 */
export function PixelPicture({ grid, size = 48 }: { grid: Grid; size?: number }) {
  const n = grid.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} aria-hidden="true" className="block" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#cbbfa8" />
      {grid.map((row, r) => row.map((v, c) => (v ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill={HEX[v]} /> : null)))}
    </svg>
  );
}

/** A framed picture, half painted, with a mirror line down it and a hand mirror. */
export function MuralLogo({ size = 104 }: { size?: number }) {
  const cells = ['p.rr.p', 'pprrpp', '.prrp.', '.prrp.', 'pprrpp', 'p.rr.p'];
  const fill: Record<string, string> = { p: HEX.purple, r: HEX.red };
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect x="14" y="14" width="172" height="172" rx="10" fill="#c48a52" stroke={INK} strokeWidth="7" />
      <rect x="34" y="34" width="132" height="132" fill="#f4ecdc" stroke={INK} strokeWidth="4" />
      {cells.map((row, r) =>
        [...row].map((ch, c) =>
          ch !== '.' && (c < 3 || r % 2 === 0) ? <rect key={`${r}-${c}`} x={34 + c * 22} y={34 + r * 22} width="22" height="22" fill={fill[ch]} /> : null,
        ),
      )}
      <path d="M100 26 V174" stroke="#22d3ee" strokeWidth="6" strokeDasharray="10 7" />
      <g transform="translate(150 150) rotate(-30)">
        <ellipse rx="26" ry="32" fill="#cbd5e1" stroke={INK} strokeWidth="6" />
        <ellipse rx="16" ry="22" fill="#e0f2fe" />
        <rect x="-7" y="30" width="14" height="30" rx="5" fill="#a8692e" stroke={INK} strokeWidth="5" />
      </g>
    </svg>
  );
}

/** Step 1: two pots pouring into a bowl that's purple. */
export function StepMix() {
  return (
    <svg width="60" height="52" viewBox="0 0 240 200" aria-hidden="true">
      <path d="M20 40 h50 l-6 50 h-38 z" fill={HEX.red} stroke={INK} strokeWidth="8" strokeLinejoin="round" />
      <path d="M170 40 h50 l-6 50 h-38 z" fill={HEX.blue} stroke={INK} strokeWidth="8" strokeLinejoin="round" />
      <path d="M60 120 h120 a60 50 0 0 1 -120 0 z" fill={HEX.purple} stroke={INK} strokeWidth="8" strokeLinejoin="round" />
      <path d="M75 90 Q95 105 105 118 M165 90 Q145 105 135 118" fill="none" stroke="#fcd34d" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

/** Step 2: half a picture, a brush painting the other half. */
export function StepPaint() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="20" y="20" width="160" height="160" fill="#f4ecdc" stroke={INK} strokeWidth="8" />
      <rect x="20" y="20" width="80" height="80" fill={HEX.purple} />
      <rect x="100" y="20" width="80" height="80" fill={HEX.purple} opacity="0.45" />
      <path d="M100 14 V186" stroke="#22d3ee" strokeWidth="7" strokeDasharray="10 7" />
      <path d="M150 160 L190 120" stroke="#a8692e" strokeWidth="14" strokeLinecap="round" />
      <path d="M150 160 L136 174" stroke={HEX.purple} strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}

/** Step 3: a hand mirror with a tick. */
export function StepMirror() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <ellipse cx="96" cy="84" rx="62" ry="72" fill="#cbd5e1" stroke={INK} strokeWidth="9" />
      <ellipse cx="96" cy="84" rx="44" ry="54" fill="#e0f2fe" />
      <rect x="84" y="152" width="24" height="44" rx="8" fill="#a8692e" stroke={INK} strokeWidth="8" />
      <circle cx="160" cy="40" r="30" fill="#fcd34d" stroke={INK} strokeWidth="8" />
      <path d="M145 40 L156 52 L176 28" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
