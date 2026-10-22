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

/** Ring a note of `hz` for about `ms`: a quick strike, then a fade, with a quiet overtone for the bell. */
export function playTone(hz: number, ms = 700): void {
  const s = useSettingsStore.getState();
  if (!s.sfx || s.sfxVolume <= 0) return;
  const c = context();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime;
    const end = t + ms / 1000;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.35 * s.sfxVolume, t + 0.012);
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
