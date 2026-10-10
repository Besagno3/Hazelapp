import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MusicTrack } from './audio';

// A stand-in for Howler's html5 Howl, with enough of its load queue to show
// #115. Like the real one: while it loads or a play() is on its way (the first
// one, or the restart at a loop point) a fade(), volume() or stop() is queued;
// the queue steps on only when an event matches its head, so after a play() on
// a loaded Howl the queued calls never run. Setting the volume mid-fade cancels
// the fade and still fires 'fade'; a fade from a volume to itself never ends.
// Its one sound has its own volume beside the Howl's: a fade cut short (as at a
// loop point) jumps the sound to the fade's target and leaves the Howl's be.
const { FakeHowl, howls } = vi.hoisted(() => {
  const howls: InstanceType<typeof FakeHowl>[] = [];
  let nextId = 1000; // Howler's sound ids start at 1000 — never a volume
  type Listener = { ev: string; fn: () => void; id?: number; once: boolean };
  class FakeHowl {
    src: string;
    state: 'unloaded' | 'loaded' = 'unloaded';
    /** A play() on its way — Howler's `_playLock`. */
    lock = false;
    unloaded = false;
    isPlaying = false;
    /** The sound's volume — what's heard. */
    vol = 0;
    /** The Howl's own volume(). */
    groupVol = 0;
    fadeFrom = 0;
    fadeTo: number | null = null;
    /** play() calls from outside (not the queue's own). */
    playCalls = 0;
    id = -1;
    queue: { event: string; action: () => void }[] = [];
    listeners: Listener[] = [];
    constructor(o: { src: string[] }) {
      this.src = o.src[0];
      howls.push(this);
    }
    /** Queue the call if Howler would; true when it was queued. */
    queued(event: string, action: () => void) {
      if (this.state === 'loaded' && !this.lock) return false;
      this.queue.push({ event, action });
      return true;
    }
    step(event?: string) {
      const head = this.queue[0];
      if (!head) return;
      if (event === undefined) head.action();
      else if (head.event === event) {
        this.queue.shift();
        this.step();
      }
    }
    emit(ev: string, id?: number) {
      this.step(ev); // Howler steps its queue first; listeners run on a timeout
      for (const l of [...this.listeners]) {
        if (l.ev !== ev || (l.id !== undefined && l.id !== id)) continue;
        if (l.once) this.listeners.splice(this.listeners.indexOf(l), 1);
        l.fn();
      }
    }
    /** Howler's _stopFade: the sound jumps to the fade's target. */
    stopFade() {
      if (this.fadeTo === null) return;
      this.vol = this.fadeTo;
      this.fadeTo = null;
      this.emit('fade', this.id);
    }
    on(ev: string, fn: () => void) {
      this.listeners.push({ ev, fn, once: false });
      return this;
    }
    once(ev: string, fn: () => void, id?: number) {
      this.listeners.push({ ev, fn, id, once: true });
      return this;
    }
    playing(id?: number) {
      return this.isPlaying && (id === undefined || id === this.id);
    }
    play(id?: number) {
      if (id === undefined) {
        this.playCalls++;
        this.id = nextId++;
      }
      const sid = this.id;
      if (this.queued('play', () => this.play(sid))) return sid;
      this.lock = true; // the element's play() promise
      this.isPlaying = true; // Howler marks it playing at once
      return sid;
    }
    stop() {
      if (this.queued('stop', () => this.stop())) return this;
      this.isPlaying = false;
      this.stopFade();
      return this;
    }
    volume(v?: number) {
      if (v === undefined) return this.groupVol;
      if (v === this.id) return this.vol; // volume(id): that sound's
      if (this.queued('volume', () => this.volume(v))) return this;
      this.stopFade();
      this.vol = v;
      this.groupVol = v;
      return this;
    }
    fade(from: number, to: number) {
      if (this.queued('fade', () => this.fade(from, to))) return this;
      this.volume(from);
      this.fadeFrom = from;
      this.fadeTo = to;
      return this;
    }
    unload() {
      this.unloaded = true;
      this.state = 'unloaded';
      this.isPlaying = false;
      this.fadeTo = null;
      this.lock = false;
      return null;
    }
    // --- What the browser does --------------------------------------------
    /** The file has loaded: Howler runs its queue (a queued play first). */
    finishLoading() {
      if (this.unloaded || this.state === 'loaded') return;
      this.state = 'loaded';
      this.step();
    }
    /** The pending play() starts: 'play'. */
    playStarts() {
      if (this.unloaded || !this.lock) return;
      this.lock = false;
      this.emit('play', this.id);
    }
    /** Autoplay refuses the pending play(): 'playerror'. */
    refused() {
      if (this.unloaded || !this.lock) return;
      this.lock = false;
      this.isPlaying = false;
      this.emit('playerror', this.id);
    }
    /** The fade runs its course (one from a volume to itself never does). */
    fadeEnds() {
      if (this.fadeTo === null || this.fadeTo === this.fadeFrom) return;
      this.vol = this.fadeTo;
      this.groupVol = this.fadeTo;
      this.fadeTo = null;
      this.emit('fade', this.id);
    }
    /** A loop point: html5 Howler restarts the track with stop() + play(). */
    loopPoint() {
      if (!this.isPlaying || this.lock) return;
      this.stopFade();
      this.lock = true;
    }
  }
  return { FakeHowl, howls };
});
vi.mock('howler', () => ({ Howl: FakeHowl }));

const { playMusic } = await import('./audio');
const { useSettingsStore } = await import('../store/settingsStore');
/** The newest Howl for a track — a track picked again after it was unloaded gets a fresh one. */
const howl = (track: string) => howls.filter((h) => h.src.endsWith(`/${track}.mp3`)).at(-1)!;
/** Pick a track and let it load, start and fade in. */
function hear(track: MusicTrack) {
  playMusic(track);
  const h = howl(track);
  h.finishLoading();
  h.playStarts();
  h.fadeEnds();
  return h;
}

describe('switching music (#75 item 14 review, #115)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({ music: true, musicVolume: 0.6 });
    playMusic(null);
    howls.forEach((h) => h.fadeEnds());
    vi.runOnlyPendingTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a track left behind fades out and stops', () => {
    const sailing = hear('sailing');
    expect(sailing.volume()).toBe(0.6);
    playMusic('shallows');
    expect(sailing.playing()).toBe(true); // still fading out
    sailing.fadeEnds();
    vi.advanceTimersByTime(1000);
    expect(sailing.playing()).toBe(false);
    const shallows = howl('shallows');
    shallows.finishLoading();
    shallows.playStarts();
    expect(shallows.playing()).toBe(true);
  });

  it('picked again before its fade-out ends, it plays on — no silence', () => {
    const sailing = hear('sailing');
    playMusic('fogbank'); // sail toward the fogbank…
    playMusic('sailing'); // …and straight back, within the fade
    sailing.fadeEnds();
    howl('fogbank').finishLoading();
    howl('fogbank').playStarts();
    vi.advanceTimersByTime(1000);
    expect(sailing.playing()).toBe(true);
    expect(sailing.volume()).toBe(0.6);
    expect(howl('fogbank').playing()).toBe(false);
  });

  it('a battle that starts as the overworld loops still stops the overworld', () => {
    const overworld = hear('overworld');
    overworld.loopPoint(); // its restart's play() is on its way…
    playMusic('battle'); // …as a critter is met: the fade-out is queued
    overworld.playStarts(); // the restart goes through; the queued fade never runs
    vi.advanceTimersByTime(1000);
    expect(overworld.playing()).toBe(false);
  });

  it('back from a battle, the overworld fades in again', () => {
    hear('overworld');
    playMusic('battle');
    howl('overworld').fadeEnds();
    vi.advanceTimersByTime(1000);
    const overworld = hear('overworld');
    expect(overworld.playing()).toBe(true);
    expect(overworld.volume()).toBe(0.6);
  });

  it('asked for again while it loads (a key press, a re-render), a track is played once', () => {
    playMusic('overworld');
    playMusic('overworld');
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(howl('overworld').playCalls).toBe(1);
  });

  it('a track left before it is heard never starts', () => {
    playMusic('overworld');
    playMusic('town'); // walked into town while the overworld was still loading
    const overworld = howl('overworld');
    overworld.finishLoading();
    overworld.playStarts();
    expect(overworld.playing()).toBe(false);
  });

  it('a key press at a loop point leaves nothing queued in Howler; a new volume still applies', () => {
    const overworld = hear('overworld');
    overworld.loopPoint();
    window.dispatchEvent(new KeyboardEvent('keydown')); // walking as it restarts
    window.dispatchEvent(new KeyboardEvent('keydown'));
    overworld.playStarts();
    expect(overworld.queue).toEqual([]);
    useSettingsStore.setState({ musicVolume: 0.3 }); // the menu's slider
    playMusic('overworld');
    expect(overworld.volume()).toBe(0.3);
  });

  it('back just as it loops mid-fade-out, a track is heard again on the next key press', () => {
    const town = hear('town');
    playMusic('battle'); // town starts fading out…
    town.loopPoint(); // …and loops: the sound drops to 0, the Howl still says 0.6
    playMusic('town'); // back during the restart: that volume() is queued, never run
    town.playStarts();
    window.dispatchEvent(new KeyboardEvent('keydown'));
    vi.advanceTimersByTime(1000);
    expect(town.playing()).toBe(true);
    expect(town.vol).toBe(0.6);
  });

  it('refused by autoplay, a track plays and fades in on the next gesture', () => {
    playMusic('title');
    const title = howl('title');
    title.finishLoading();
    title.refused();
    expect(title.playing()).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    title.playStarts();
    title.fadeEnds();
    expect(title.playing()).toBe(true);
    expect(title.volume()).toBe(0.6);
  });
});
