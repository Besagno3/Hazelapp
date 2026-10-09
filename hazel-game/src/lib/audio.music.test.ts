import { describe, it, expect, vi, beforeEach } from 'vitest';

// A stand-in for Howler's Howl, enough to follow a fade: like the real one,
// setting the volume mid-fade cancels the fade and still fires 'fade'.
const { FakeHowl, howls } = vi.hoisted(() => {
  const howls: InstanceType<typeof FakeHowl>[] = [];
  class FakeHowl {
    src: string;
    vol = 0;
    target = 0;
    isPlaying = false;
    fading = false;
    handlers: Record<string, (() => void)[]> = {};
    constructor(o: { src: string[] }) {
      this.src = o.src[0];
      howls.push(this);
    }
    on() {
      return this;
    }
    once(ev: string, fn: () => void) {
      (this.handlers[ev] ??= []).push(fn);
      return this;
    }
    emit(ev: string) {
      const hs = this.handlers[ev] ?? [];
      this.handlers[ev] = [];
      hs.forEach((h) => h());
    }
    playing() {
      return this.isPlaying;
    }
    play() {
      this.isPlaying = true;
    }
    stop() {
      this.isPlaying = false;
    }
    volume(v?: number) {
      if (v === undefined) return this.vol;
      if (this.fading) {
        this.fading = false;
        this.emit('fade');
      }
      this.vol = v;
      return this;
    }
    fade(from: number, to: number) {
      if (this.fading) this.emit('fade');
      this.fading = true;
      this.vol = from;
      this.target = to;
    }
    /** The fade runs its course. */
    finish() {
      if (!this.fading) return;
      this.fading = false;
      this.vol = this.target;
      this.emit('fade');
    }
  }
  return { FakeHowl, howls };
});
vi.mock('howler', () => ({ Howl: FakeHowl }));

const { playMusic } = await import('./audio');
const { useSettingsStore } = await import('../store/settingsStore');
const howl = (track: string) => howls.find((h) => h.src.endsWith(`/${track}.mp3`))!;

describe('switching music (#75 item 14 review)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ music: true, musicVolume: 0.6 });
    playMusic(null);
    howls.forEach((h) => h.finish());
  });

  it('a track left behind fades out and stops', () => {
    playMusic('sailing');
    howl('sailing').finish();
    playMusic('shallows');
    expect(howl('sailing').playing()).toBe(true); // still fading out
    howl('sailing').finish();
    expect(howl('sailing').playing()).toBe(false);
    expect(howl('shallows').playing()).toBe(true);
  });

  it('picked again before its fade-out ends, it plays on — no silence', () => {
    playMusic('sailing');
    howl('sailing').finish();
    playMusic('fogbank'); // sail toward the fogbank…
    playMusic('sailing'); // …and straight back, within the fade
    howl('sailing').finish();
    howl('fogbank').finish();
    expect(howl('sailing').playing()).toBe(true);
    expect(howl('sailing').volume()).toBe(0.6);
    expect(howl('fogbank').playing()).toBe(false);
  });
});
