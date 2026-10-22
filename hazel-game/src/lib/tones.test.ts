import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A stand-in Web Audio: records the contexts made, the oscillators, the pitches and levels set, and what's connected.
const made = { contexts: 0, hz: [] as number[], started: 0, stopped: [] as number[], peaks: [] as number[], toSpeakers: 0 };
const resume = vi.fn(async () => {});
const SPEAKERS = { speakers: true };
class FakeCtx {
  static startState = 'suspended';
  state: string;
  currentTime = 1;
  destination = SPEAKERS;
  resume = resume;
  constructor() {
    made.contexts += 1;
    this.state = FakeCtx.startState;
  }
  createGain() {
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: (v: number) => made.peaks.push(v) };
    return {
      gain: param,
      connect: (x: unknown) => {
        if (x === SPEAKERS) made.toSpeakers += 1;
        return x;
      },
    };
  }
  createOscillator() {
    return {
      type: '',
      frequency: { setValueAtTime: (v: number) => made.hz.push(v) },
      connect: (x: unknown) => x,
      start: () => (made.started += 1),
      stop: (at: number) => made.stopped.push(at),
    };
  }
}

beforeEach(() => {
  Object.assign(made, { contexts: 0, hz: [], started: 0, stopped: [], peaks: [], toSpeakers: 0 });
  FakeCtx.startState = 'suspended';
  resume.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load(sfx: boolean, sfxVolume: number) {
  vi.stubGlobal('AudioContext', FakeCtx);
  const { useSettingsStore } = await import('../store/settingsStore');
  useSettingsStore.setState({ sfx, sfxVolume });
  return import('./tones');
}

describe('playTone (Echo’s Call’s chimes)', () => {
  it('rings a note and its overtone, to the speakers, stopping as it fades; wakes a sleeping context', async () => {
    const { playTone } = await load(true, 0.8);
    playTone(440, 500);
    expect(made.hz).toEqual([440, 440 * 2.76]);
    expect(made.started).toBe(2);
    // Both stop just after the fade (1 s now + 0.5 s + a moment).
    expect(made.stopped).toEqual([1.55, 1.55]);
    expect(made.toSpeakers).toBe(1);
    expect(resume).toHaveBeenCalled();
  });

  it('one context for every note; one already running isn’t woken; iOS’s “interrupted” is', async () => {
    FakeCtx.startState = 'running';
    const { playTone } = await load(true, 1);
    playTone(440);
    playTone(330);
    expect(made.contexts).toBe(1);
    expect(resume).not.toHaveBeenCalled();
    FakeCtx.startState = 'interrupted';
    vi.resetModules();
    const fresh = await load(true, 1);
    fresh.playTone(440);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('at the setting’s volume, never loud enough to clip', async () => {
    const { playTone } = await load(true, 1);
    playTone(440);
    const loud = Math.max(...made.peaks);
    expect(loud * 1.18).toBeLessThanOrEqual(0.25 + 1e-9);
    made.peaks = [];
    const { useSettingsStore } = await import('../store/settingsStore');
    useSettingsStore.setState({ sfxVolume: 0.5 });
    playTone(440);
    expect(Math.max(...made.peaks)).toBeCloseTo(loud / 2);
  });

  it('wakeTones, in a tap: makes and wakes the context with nothing rung — only with sound effects on', async () => {
    const off = await load(false, 1);
    off.wakeTones();
    expect(made.contexts).toBe(0);
    vi.resetModules();
    const on = await load(true, 1);
    on.wakeTones();
    expect(made.contexts).toBe(1);
    expect(resume).toHaveBeenCalled();
    expect(made.started).toBe(0);
  });

  it('is silent with sound effects off, at no volume, or with no Web Audio', async () => {
    const { playTone } = await load(false, 1);
    const { useSettingsStore } = await import('../store/settingsStore');
    playTone(440);
    useSettingsStore.setState({ sfx: true, sfxVolume: 0 });
    playTone(440);
    expect(made.started).toBe(0);
    vi.unstubAllGlobals();
    vi.resetModules();
    const fresh = await import('./tones');
    (await import('../store/settingsStore')).useSettingsStore.setState({ sfx: true, sfxVolume: 1 });
    expect(() => fresh.playTone(440)).not.toThrow();
    expect(() => fresh.wakeTones()).not.toThrow();
  });
});
