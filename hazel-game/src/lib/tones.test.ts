import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A stand-in Web Audio: records the oscillators made and the pitches set.
const made: { hz: number[]; started: number } = { hz: [], started: 0 };
const resume = vi.fn(async () => {});
class FakeCtx {
  state = 'suspended';
  currentTime = 1;
  destination = {};
  resume = resume;
  createGain() {
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    return { gain: param, connect: (x: unknown) => x };
  }
  createOscillator() {
    return {
      type: '',
      frequency: { setValueAtTime: (v: number) => made.hz.push(v) },
      connect: (x: unknown) => x,
      start: () => (made.started += 1),
      stop: () => {},
    };
  }
}

beforeEach(() => {
  made.hz = [];
  made.started = 0;
  resume.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playTone (Echo’s Call’s chimes)', () => {
  it('rings a note and its overtone when sound effects are on; wakes a sleeping context', async () => {
    vi.stubGlobal('AudioContext', FakeCtx);
    const { useSettingsStore } = await import('../store/settingsStore');
    useSettingsStore.setState({ sfx: true, sfxVolume: 0.8 });
    const { playTone } = await import('./tones');
    playTone(440);
    expect(made.hz).toEqual([440, 440 * 2.76]);
    expect(made.started).toBe(2);
    expect(resume).toHaveBeenCalled();
  });

  it('is silent with sound effects off, at no volume, or with no Web Audio', async () => {
    vi.stubGlobal('AudioContext', FakeCtx);
    const { useSettingsStore } = await import('../store/settingsStore');
    const { playTone } = await import('./tones');
    useSettingsStore.setState({ sfx: false, sfxVolume: 1 });
    playTone(440);
    useSettingsStore.setState({ sfx: true, sfxVolume: 0 });
    playTone(440);
    expect(made.started).toBe(0);
    vi.unstubAllGlobals();
    vi.resetModules();
    const fresh = await import('./tones');
    (await import('../store/settingsStore')).useSettingsStore.setState({ sfx: true, sfxVolume: 1 });
    expect(() => fresh.playTone(440)).not.toThrow();
  });
});
