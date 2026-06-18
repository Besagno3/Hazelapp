import { useEffect } from 'react';
import { Howl } from 'howler';
import { useSettingsStore } from '../store/settingsStore';

/**
 * The game's audio engine (Howler.js). Two responsibilities: fire one-shot
 * **sound effects** (`sfx`) and play looping **background music** that follows
 * the current screen (`useScreenMusic`). Both honour the device settings —
 * audio is off by default, so every call here is a silent no-op until the
 * player enables Music / Sound in the menu.
 *
 * Drop real audio files into `public/audio/` to make it audible (see the names
 * below + `public/audio/README.md`). Until then every load fails harmlessly:
 * the engine swallows load errors, so missing files never break gameplay.
 */

export type SfxName =
  | 'correct'
  | 'wrong'
  | 'attack'
  | 'hit'
  | 'gate'
  | 'chest'
  | 'levelup'
  | 'victory'
  | 'select';

export type MusicTrack =
  | 'title'
  | 'overworld'
  | 'spire'
  | 'finalBoss'
  | 'battle'
  | 'boss'
  | 'victory';

/**
 * Expected files. Entries with a real file in `public/audio/` play today;
 * the rest point at not-yet-added files and stay silent (load fails harmlessly).
 * Any Howler-supported format works — just change the path here.
 */
const SFX_SOURCES: Record<SfxName, string> = {
  hit: '/audio/Character_Grunt.mp3', // player takes damage in battle
  wrong: '/audio/Wrong_Answer.mp3', // a question answered incorrectly
  victory: '/audio/Victory-jingle.mp3', // a battle is won
  levelup: '/audio/Level_Up.mp3', // the level-up / choose-a-perk modal
  correct: '/audio/sfx/correct.mp3',
  attack: '/audio/sfx/attack.mp3',
  gate: '/audio/sfx/gate.mp3',
  chest: '/audio/sfx/chest.mp3',
  select: '/audio/sfx/select.mp3',
};

const MUSIC_SOURCES: Record<MusicTrack, string> = {
  overworld: '/audio/Overworld.mp3', // the tile map
  spire: '/audio/Spire_Music.mp3', // climbing the Crystal Spire floors
  finalBoss: '/audio/Boss_Battle%20-%20Final%20Battle.mp3', // the Umbra fight (Spire boss floor)
  battle: '/audio/Battle_Music.mp3', // regular battles
  boss: '/audio/Boss_Battle.mp3', // area bosses (Fiends, wardens)
  title: '/audio/title.mp3', // menu screens — no file yet (silent)
  victory: '/audio/victory.mp3', // looping victory theme — unused; the win uses the sfx jingle
};

const FADE_MS = 600;

// Lazily-built, cached Howls — one per registered source, reused across plays.
const sfxCache = new Map<SfxName, Howl>();
const musicCache = new Map<MusicTrack, Howl>();

function getSfx(name: SfxName): Howl | null {
  let howl = sfxCache.get(name);
  if (!howl) {
    try {
      howl = new Howl({ src: [SFX_SOURCES[name]], preload: false, volume: 1 });
      // A missing/undecodable file must never throw into gameplay.
      howl.on('loaderror', () => {});
      howl.on('playerror', () => {});
      sfxCache.set(name, howl);
    } catch {
      return null;
    }
  }
  return howl;
}

function getMusic(track: MusicTrack): Howl | null {
  let howl = musicCache.get(track);
  if (!howl) {
    try {
      howl = new Howl({
        src: [MUSIC_SOURCES[track]],
        preload: false,
        loop: true,
        html5: true, // stream longer music instead of fully decoding it
        volume: 0,
      });
      howl.on('loaderror', () => {});
      howl.on('playerror', () => {});
      musicCache.set(track, howl);
    } catch {
      return null;
    }
  }
  return howl;
}

/** Play a one-shot sound effect (no-op when SFX are off). */
export function sfx(name: SfxName): void {
  const s = useSettingsStore.getState();
  if (!s.sfx) return;
  const howl = getSfx(name);
  if (!howl) return;
  try {
    howl.volume(s.sfxVolume);
    howl.play();
  } catch {
    // Autoplay/decoding hiccup — ignore.
  }
}

let currentTrack: MusicTrack | null = null;

/** Switch background music to `track` (or stop, when null), respecting settings. */
export function playMusic(track: MusicTrack | null): void {
  const s = useSettingsStore.getState();
  const target = s.music ? track : null;
  if (target === currentTrack) {
    // Same track — just keep the live volume in sync with the settings.
    if (target) getMusic(target)?.volume(s.musicVolume);
    return;
  }

  // Fade out + stop whatever was playing.
  if (currentTrack) {
    const prev = getMusic(currentTrack);
    if (prev) {
      try {
        prev.fade(prev.volume(), 0, FADE_MS);
        prev.once('fade', () => prev.stop());
      } catch {
        try {
          prev.stop();
        } catch {
          /* ignore */
        }
      }
    }
  }

  currentTrack = target;
  if (!target) return;

  const next = getMusic(target);
  if (!next) return;
  try {
    next.play();
    next.fade(0, s.musicVolume, FADE_MS);
  } catch {
    // Browsers block audio until the first user gesture; enabling music in the
    // menu IS a gesture, so the next screen change starts it cleanly.
  }
}

export function stopMusic(): void {
  playMusic(null);
}

type Screen = 'topics' | 'quiz' | 'avatar' | 'world' | 'battle';

/** Which track suits the current screen. Pure — unit-tested. */
export function trackForScreen(screen: Screen, isBoss = false): MusicTrack | null {
  switch (screen) {
    case 'topics':
    case 'quiz':
    case 'avatar':
      return 'title';
    case 'world':
      return 'overworld';
    case 'battle':
      return isBoss ? 'boss' : 'battle';
    default:
      return null;
  }
}

/**
 * Drive background music from the current screen. Re-runs whenever the screen,
 * boss flag, or the music on/off + volume settings change.
 *
 * While inside the Spire, music is owned by `SpireOverlay` (it alone knows the
 * floor and so chooses spire vs final-boss music) — this hook steps aside so the
 * two never fight over the same track.
 */
export function useScreenMusic(screen: Screen, isBoss = false, inSpire = false): void {
  const music = useSettingsStore((s) => s.music);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  useEffect(() => {
    if (inSpire) return; // SpireOverlay drives music while the climb is open
    playMusic(trackForScreen(screen, isBoss));
  }, [screen, isBoss, inSpire, music, musicVolume]);
}
