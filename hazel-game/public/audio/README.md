 mp4# Audio assets

Drop royalty-free / CC0 audio files here and they play automatically — the
engine (`src/lib/audio.ts`) already references these exact paths. Until a file
exists its load fails harmlessly (silent), so the game runs fine with none,
some, or all of them present.

Audio is **off by default**; players turn on Music / Sound effects in the
in-game menu (📜 → 🔊 Audio).

## Expected files

Default format is `.mp3` (broad browser support). To use another format, change
the extensions in `SFX_SOURCES` / `MUSIC_SOURCES` in `src/lib/audio.ts`.

### `public/audio/sfx/` — short one-shots
| File | Plays when |
|------|------------|
| `correct.mp3` | a question is answered correctly |
| `wrong.mp3` | a question is answered wrong |
| `gate.mp3` | a gate opens (question or key) |
| `chest.mp3` | a treasure chest is opened |
| `levelup.mp3` | the level-up celebration fires |
| `attack.mp3` | (reserved) hero attacks in battle |
| `hit.mp3` | (reserved) a hit lands in battle |
| `victory.mp3` | (reserved) a battle is won |
| `select.mp3` | (reserved) menu / button select |

### `public/audio/music/` — looping tracks
| File | Plays on |
|------|----------|
| `title.mp3` | topic select / quiz / avatar screens |
| `overworld.mp3` | the tile world |
| `battle.mp3` | normal battles |
| `boss.mp3` | Fiend / warden / Umbra battles |
| `victory.mp3` | (reserved) victory fanfare |

## Sourcing (CC0 / royalty-free)
- SFX: [Kenney audio packs](https://kenney.nl/assets?q=audio) (CC0),
  [freesound.org](https://freesound.org) (check each license).
- Music: [OpenGameArt](https://opengameart.org) CC0 loops,
  [Incompetech](https://incompetech.com) (CC-BY — credit required).

Keep files small (SFX < ~50 KB, music a minute or two, looped).
