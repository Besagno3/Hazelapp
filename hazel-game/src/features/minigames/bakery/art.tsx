/**
 * Dot's Bakery's pictures (docs/DESIGN-MINIGAMES.md §2.1): the pie every screen
 * draws (`PieArt`, cut into equal slices, some taken), the title card's logo
 * and its three "how to play" steps. Loaded with the stage; the game itself
 * loads when it's played (`DotsBakery`).
 */

const INK = '#1b0f22';
const CRUST = '#d99a4e';
const CRUST_DARK = '#a8692e';

/** One slice of a pie cut into `n`, as a path (slice 0 starts at the top and goes clockwise). */
function slicePath(cx: number, cy: number, r: number, i: number, n: number): string {
  if (n <= 1) return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  const a0 = ((-90 + (360 * i) / n) * Math.PI) / 180;
  const a1 = ((-90 + (360 * (i + 1)) / n) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${360 / n > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/**
 * A pie seen from above, cut into `cut` equal slices (1: not cut yet). Slices
 * in `taken` are lifted out — drawn as a gold outline with a tick where the
 * slice was — and `onSlice`, if given, is called when a slice is tapped. The
 * picture is decorative (`aria-hidden`): every screen also says it in words
 * and has buttons that do the same.
 */
export function PieArt({
  cut,
  taken = [],
  filling = '#d8304a',
  size = 160,
  onSlice,
}: {
  cut: number;
  taken?: readonly boolean[];
  filling?: string;
  size?: number;
  onSlice?: (i: number) => void;
}) {
  const r = 84;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className="block">
      <circle cx="100" cy="100" r="96" fill={CRUST_DARK} stroke={INK} strokeWidth="5" />
      <circle cx="100" cy="100" r="88" fill={CRUST} />
      {Array.from({ length: Math.max(1, cut) }, (_, i) => {
        const out = !!taken[i];
        const d = slicePath(100, 100, r, i, cut);
        return (
          <g key={i} onClick={onSlice ? () => onSlice(i) : undefined} style={onSlice ? { cursor: 'pointer' } : undefined}>
            <path d={d} fill={out ? '#fff6dc' : filling} stroke={out ? '#f59e0b' : INK} strokeWidth={out ? 5 : 3} strokeDasharray={out ? '8 6' : undefined} />
            {!out && cut > 1 && <path d={slicePath(100, 100, r - 18, i, cut)} fill="#ffffff" opacity="0.12" />}
            {out && cut > 1 && (
              <text {...sliceMid(i, cut)} textAnchor="middle" dominantBaseline="central" fontSize={cut >= 6 ? 20 : 28} fontWeight="bold" fill="#b45309">
                ✓
              </text>
            )}
          </g>
        );
      })}
      {cut <= 1 && (
        <g fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.55">
          <path d="M70 70 Q80 60 90 70" />
          <path d="M110 120 Q120 110 130 120" />
          <path d="M70 125 Q80 115 90 125" />
        </g>
      )}
    </svg>
  );
}

/** Where to put a mark in the middle of slice `i` of `n`. */
function sliceMid(i: number, n: number): { x: number; y: number } {
  const a = ((-90 + (360 * (i + 0.5)) / n) * Math.PI) / 180;
  return { x: 100 + 52 * Math.cos(a), y: 100 + 52 * Math.sin(a) };
}

/** A cherry pie with one slice lifted out, steam rising. */
export function BakeryLogo({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <g fill="none" stroke="#e7e2ff" strokeWidth="7" strokeLinecap="round" opacity="0.8">
        <path d="M70 34 C60 22 80 14 70 2" />
        <path d="M110 30 C100 18 120 10 110 -2" />
      </g>
      <circle cx="100" cy="112" r="80" fill={CRUST_DARK} stroke={INK} strokeWidth="6" />
      <circle cx="100" cy="112" r="72" fill={CRUST} />
      {[1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={slicePath(100, 112, 68, i, 6)} fill="#d8304a" stroke={INK} strokeWidth="3" />
      ))}
      <path d={slicePath(118, 84, 68, 0, 6)} fill="#d8304a" stroke={INK} strokeWidth="4" />
    </svg>
  );
}

/** Step 1: a pie cut into quarters, and a knife. */
export function StepCut() {
  return (
    <svg width="56" height="56" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="96" cy="104" r="86" fill={CRUST_DARK} stroke={INK} strokeWidth="8" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={slicePath(96, 104, 76, i, 4)} fill="#f2b233" stroke={INK} strokeWidth="5" />
      ))}
      <path d="M150 20 L190 4 L178 30 Z" fill="#cbd5e1" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 2: a pie box with three slices in it. */
export function StepFill() {
  return (
    <svg width="60" height="52" viewBox="0 0 240 200" aria-hidden="true">
      <path d="M20 70 H220 V180 H20 Z" fill="#f4e3c3" stroke={INK} strokeWidth="9" strokeLinejoin="round" />
      <path d="M20 70 L50 30 H190 L220 70" fill="#fff6dc" stroke={INK} strokeWidth="9" strokeLinejoin="round" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={slicePath(120, 128, 46, i, 4)} fill="#d8304a" stroke={INK} strokeWidth="5" />
      ))}
    </svg>
  );
}

/** Step 3: the box closed, with a ribbon and a gold tick. */
export function StepClose() {
  return (
    <svg width="60" height="52" viewBox="0 0 240 200" aria-hidden="true">
      <path d="M20 60 H220 V180 H20 Z" fill="#f4e3c3" stroke={INK} strokeWidth="9" strokeLinejoin="round" />
      <path d="M20 60 H220 V90 H20 Z" fill="#fff6dc" stroke={INK} strokeWidth="9" strokeLinejoin="round" />
      <path d="M110 60 V180 M130 60 V180" stroke="#e8483f" strokeWidth="10" />
      <circle cx="196" cy="40" r="32" fill="#fcd34d" stroke={INK} strokeWidth="8" />
      <path d="M180 40 L192 52 L212 28" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
