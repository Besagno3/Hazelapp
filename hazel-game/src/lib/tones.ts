import { useSettingsStore } from '../store/settingsStore';

/**
 * A chime's note, made in the browser (Web Audio) rather than from a file: a
 * soft bell at any pitch, for Echo's Call (docs/DESIGN-MINIGAMES.md §5.5).
 * It follows the sound-effects setting like `sfx` (off by default: a no-op),
 * at its volume. No audio (an old browser, a test) is a silent no-op too — the
 * game shows every note as well.
 */

type Ctx = AudioContext;
let ctx: Ctx | null = null;

/** A note's loudest, at full volume (with its overtone): under 0.3, so a few overlapping can't clip. */
const PEAK = 0.25;

function context(): Ctx | null {
  if (ctx) return ctx;
  const Make = (globalThis as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx }).AudioContext ?? (globalThis as { webkitAudioContext?: new () => Ctx }).webkitAudioContext;
  if (!Make) return null;
  try {
    ctx = new Make();
  } catch {
    return null;
  }
  return ctx;
}

/** On, and its context awake ("suspended" till a tap; iOS's "interrupted" after a call) — or null to stay quiet. */
function ready(): Ctx | null {
  const s = useSettingsStore.getState();
  if (!s.sfx || s.sfxVolume <= 0) return null;
  const c = context();
  if (c && c.state !== 'running') void c.resume().catch(() => {});
  return c;
}

/**
 * Wake the audio in a tap, for notes that ring a moment later (Lyra's, from a
 * timer): a browser (iOS Safari above all) only lets sound start from a tap.
 */
export function wakeTones(): void {
  try {
    ready();
  } catch {
    // No sound now — the notes still show.
  }
}

/** Ring a note of `hz` for about `ms`: a quick strike, then a fade, with a quiet overtone for the bell. */
export function playTone(hz: number, ms = 700): void {
  try {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const end = t + ms / 1000;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime((PEAK / 1.18) * useSettingsStore.getState().sfxVolume, t + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(c.destination);
    for (const [mul, level] of [
      [1, 1],
      [2.76, 0.18],
    ] as const) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz * mul, t);
      g.gain.setValueAtTime(level, t);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(end + 0.05);
    }
  } catch {
    // A browser that won't play now — the note still shows.
  }
}
