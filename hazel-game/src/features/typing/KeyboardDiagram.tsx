import { KEYBOARD_ROWS, KEY_BY_CODE, charKey, type Finger, type Hand } from '../../content/typing';
import { cn } from '../../lib/utils';
import { keyHint } from './hints';

/**
 * The on-screen keyboard and the two hands under it (#159): the key to press
 * glows gold, the key the other hand must hold glows blue, keys held down are
 * pressed in, and the finger for each is lit on the hands. Drawn from the
 * physical key map, so it matches any keyboard's layout of keys; the letters
 * on it are QWERTY's.
 */
const UNIT = 20;
const GAP = 2;
const ROW_H = UNIT + GAP;
const rowWidth = (row: readonly { width: number }[]) => row.reduce((w, key) => w + key.width * UNIT + GAP, 0);
const WIDTH = Math.max(...KEYBOARD_ROWS.map(rowWidth));
const KEYS_H = KEYBOARD_ROWS.length * ROW_H;

export function KeyboardDiagram({
  target,
  anchors = [],
  held,
  wrong = null,
  compact = false,
  targetChar = null,
}: {
  /** The code of the key to press next. */
  target: string | null;
  /** The character wanted: a mark up on its key ("!") is drawn on the lit key, and the Shifts light for it (review round 4). */
  targetChar?: string | null;
  /** The codes the other hand should be holding. */
  anchors?: readonly string[];
  held: ReadonlySet<string>;
  /** A key just pressed by mistake (flashes red). */
  wrong?: string | null;
  /** Hands off, for a small panel. */
  compact?: boolean;
}) {
  const targetKey = target ? KEY_BY_CODE[target] : undefined;
  const shifted = targetChar !== null && !/[a-z]/i.test(targetChar) && charKey(targetChar)?.shift === true;
  const anchorKeys = anchors.map((a) => KEY_BY_CODE[a]).filter(Boolean);
  const anchorHeld = anchors.length === 0 || anchors.some((a) => held.has(a));
  const handsH = compact ? 0 : 58;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${KEYS_H + handsH}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label={targetKey ? keyHint(targetKey.code, anchors, targetChar) : 'The keyboard'}
    >
      {KEYBOARD_ROWS.map((row, r) => {
        // Rows are centred under one another, so the space bar sits under the thumbs (review round 1).
        let x = (WIDTH - rowWidth(row)) / 2;
        return row.map((key) => {
          const w = key.width * UNIT;
          const at = x;
          x += w + GAP;
          const isTarget = key.code === target;
          const isAnchor = anchors.includes(key.code);
          const isHeld = held.has(key.code);
          const isWrong = key.code === wrong;
          // A Shift to press with the mark (not the one the other hand already holds as an anchor).
          const isShiftFor = shifted && !isAnchor && (key.code === 'ShiftLeft' || key.code === 'ShiftRight');
          return (
            <g key={key.code} transform={`translate(${at} ${r * ROW_H})`}>
              <rect
                width={w}
                height={UNIT}
                rx={3}
                className={cn(
                  'transition-colors duration-100',
                  isWrong
                    ? 'fill-red-400'
                    : isTarget
                      ? 'fill-amber-300 motion-safe:animate-pulse'
                      : isAnchor
                        ? anchorHeld
                          // Held: pressed in, with a rim — not told from "not yet" by motion alone (review round 1).
                          ? 'fill-sky-200 stroke-white stroke-[1.5]'
                          : 'fill-sky-400 motion-safe:animate-pulse'
                        : isShiftFor
                          ? 'fill-amber-200/70'
                          : isHeld
                            ? 'fill-white/60'
                            : 'fill-white/15',
                )}
              />
              {(key.code === 'KeyF' || key.code === 'KeyJ') && (
                // The bumps the pointer fingers feel for.
                <rect x={w / 2 - 3} y={UNIT - 4} width={6} height={1.5} rx={0.75} className="fill-indigo-950/70" />
              )}
              <text
                x={w / 2}
                y={UNIT / 2 + 3.5}
                textAnchor="middle"
                className={cn(
                  'font-bold',
                  isTarget || isAnchor || isWrong || isHeld || isShiftFor ? 'fill-indigo-950' : 'fill-white/80',
                  key.label.length > 1 ? 'text-[6px]' : 'text-[9px]',
                )}
              >
                {isTarget && shifted ? key.chars[1] : key.label}
              </text>
            </g>
          );
        });
      })}
      {!compact && (
        <g transform={`translate(0 ${KEYS_H + 6})`}>
          <HandShape
            hand="left"
            x={WIDTH / 2 - 90}
            lit={targetKey?.hand === 'left' ? targetKey.finger : null}
            holding={anchorKeys.find((a) => a.hand === 'left')?.finger ?? null}
            thumb={targetKey?.finger === 'thumb'}
          />
          <HandShape
            hand="right"
            x={WIDTH / 2 + 10}
            lit={targetKey?.hand === 'right' && targetKey.finger !== 'thumb' ? targetKey.finger : null}
            holding={anchorKeys.find((a) => a.hand === 'right')?.finger ?? null}
            thumb={targetKey?.finger === 'thumb'}
          />
        </g>
      )}
    </svg>
  );
}

const FINGERS: readonly Finger[] = ['pinky', 'ring', 'middle', 'index'];
/** Finger heights, pinky to pointer. */
const HEIGHTS: Record<Exclude<Finger, 'thumb'>, number> = { pinky: 22, ring: 30, middle: 34, index: 30 };

/**
 * A simple hand seen from above: four fingers over a palm, the thumb out to
 * the side. The finger that presses the key is gold, the one holding the
 * other hand's key is blue.
 */
function HandShape({ hand, x, lit, holding, thumb }: { hand: Hand; x: number; lit: Finger | null; holding: Finger | null; thumb: boolean }) {
  const order = hand === 'left' ? FINGERS : [...FINGERS].reverse();
  const fingerW = 12;
  const step = 16;
  const palmW = step * 4 + 2;
  const top = 36;
  return (
    <g>
      {order.map((finger, i) => {
        const h = HEIGHTS[finger];
        const fx = x + i * step;
        return (
          <rect
            key={finger}
            x={fx}
            y={top - h}
            width={fingerW}
            height={h + 8}
            rx={5}
            className={cn(
              'transition-colors',
              lit === finger ? 'fill-amber-300' : holding === finger ? 'fill-sky-300' : 'fill-orange-200/70',
            )}
          />
        );
      })}
      <rect x={x - 2} y={top} width={palmW} height={22} rx={7} className="fill-orange-200/70" />
      {/* The thumb, out to the inside of the hand. */}
      <rect
        x={hand === 'left' ? x + palmW - 4 : x - 14}
        y={top + 2}
        width={16}
        height={10}
        rx={5}
        transform={`rotate(${hand === 'left' ? 30 : -30} ${hand === 'left' ? x + palmW + 4 : x - 6} ${top + 7})`}
        className={cn('transition-colors', thumb ? 'fill-amber-300' : 'fill-orange-200/70')}
      />
      <text x={x + palmW / 2 - 2} y={top + 15} textAnchor="middle" className="fill-indigo-950/70 text-[7px] font-bold">
        {hand === 'left' ? 'LEFT' : 'RIGHT'}
      </text>
    </g>
  );
}
