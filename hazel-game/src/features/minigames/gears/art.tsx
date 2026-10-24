/**
 * Clocktower Gears' pictures (docs/DESIGN-MINIGAMES.md §2.1): a gear of any
 * size (`GearShape`), the title card's logo and its three "how to play" steps
 * (tap a peg, join them up, turn the crank).
 * Loaded with the stage; the game itself loads when it's played
 * (`ClocktowerGears`).
 */

const INK = '#1b0f22';
const BRASS = '#e0a43a';
const BRASS_DARK = '#9a6516';
const STEEL = '#cbd5e1';

/**
 * A gear's outline: `teeth` teeth around a circle of radius `r` (to the
 * middle of the teeth), centred on 0,0. Every gear's teeth are the same size,
 * so a bigger gear has more of them.
 */
function gearPath(teeth: number, r: number, depth = 9): string {
  const outer = r + depth / 2;
  const inner = r - depth / 2;
  const step = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    // Root, flank up, tip, flank down: a tooth takes the first half of its step.
    for (const [rad, f] of [
      [inner, 0],
      [outer, 0.12],
      [outer, 0.38],
      [inner, 0.5],
    ] as const) {
      const t = a + f * step;
      pts.push(`${(rad * Math.cos(t)).toFixed(2)} ${(rad * Math.sin(t)).toFixed(2)}`);
    }
  }
  return `M ${pts.join(' L ')} Z`;
}

/** A gear, centred on 0,0: brass with a dark hub, or `fill`. */
export function GearShape({ teeth, r, fill = BRASS, stroke = INK, spokes = true }: { teeth: number; r: number; fill?: string; stroke?: string; spokes?: boolean }) {
  return (
    <g>
      <path d={gearPath(teeth, r, Math.max(7, r * 0.2))} fill={fill} stroke={stroke} strokeWidth={Math.max(3, r * 0.08)} strokeLinejoin="round" />
      <circle r={r * 0.72} fill="none" stroke={BRASS_DARK} strokeWidth={Math.max(2, r * 0.06)} />
      {spokes &&
        [0, 60, 120].map((deg) => (
          <rect key={deg} x={-r * 0.62} y={-r * 0.07} width={r * 1.24} height={r * 0.14} fill={BRASS_DARK} transform={`rotate(${deg})`} />
        ))}
      <circle r={Math.max(5, r * 0.2)} fill={STEEL} stroke={stroke} strokeWidth={Math.max(2, r * 0.06)} />
    </g>
  );
}

/** Two gears meshing in front of a clock face. */
export function GearsLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="92" fill="#fff6dc" stroke={INK} strokeWidth="6" />
      {Array.from({ length: 12 }, (_, k) => {
        const a = (k * Math.PI) / 6;
        return <circle key={k} cx={100 + 76 * Math.sin(a)} cy={100 - 76 * Math.cos(a)} r={k % 3 === 0 ? 6 : 3.5} fill={INK} />;
      })}
      <g transform="translate(76 112)">
        <GearShape teeth={12} r={40} />
      </g>
      <g transform="translate(136 76) rotate(15)">
        <GearShape teeth={8} r={26} fill="#f2c45a" />
      </g>
      <path d="M100 100 L100 42 M100 100 L140 120" stroke={INK} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

/** Step 1: a gear going onto a peg, beside one already there. */
export function StepPeg() {
  return (
    <svg width="60" height="52" viewBox="0 0 240 200" aria-hidden="true">
      <rect x="6" y="6" width="228" height="188" rx="18" fill="#5b3a26" stroke={INK} strokeWidth="9" />
      <g transform="translate(78 112)">
        <GearShape teeth={10} r={46} spokes={false} />
      </g>
      <circle cx="170" cy="112" r="12" fill={STEEL} stroke={INK} strokeWidth="6" />
      <path d="M170 34 V72 M154 58 L170 74 L186 58" fill="none" stroke="#fcd34d" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 2: three gears in a chain, each turning the other way from the one before. */
export function StepJoin() {
  return (
    <svg width="60" height="52" viewBox="0 0 240 200" aria-hidden="true">
      {[48, 120, 192].map((x, i) => (
        <g key={x}>
          <g transform={`translate(${x} 110)`}>
            <GearShape teeth={8} r={34} spokes={false} />
          </g>
          <path
            d={i % 2 ? `M${x + 22} 52 A 26 26 0 0 0 ${x - 22} 52` : `M${x - 22} 52 A 26 26 0 0 1 ${x + 22} 52`}
            fill="none"
            stroke="#fcd34d"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

/** Step 3: the crank, turning. */
export function StepCrank() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <g transform="translate(100 108)">
        <GearShape teeth={10} r={56} />
      </g>
      <path d="M100 108 L162 60" stroke={INK} strokeWidth="16" strokeLinecap="round" />
      <path d="M100 108 L162 60" stroke={STEEL} strokeWidth="8" strokeLinecap="round" />
      <circle cx="162" cy="60" r="16" fill="#e8483f" stroke={INK} strokeWidth="7" />
      <path d="M40 40 A 84 84 0 0 1 120 20" fill="none" stroke="#fcd34d" strokeWidth="11" strokeLinecap="round" />
      <path d="M108 6 L126 20 L106 34" fill="none" stroke="#fcd34d" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
