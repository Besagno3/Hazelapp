"""
Regenerate every 16-bit asset the game ships:

    pip install pillow numpy lameenc
    python3 tools/assets/build.py            # from hazel-game/
    python3 tools/assets/build.py overworld  # only the #75 Phase 1 additions
    python3 tools/assets/build.py blend      # only the edge-blend sheets (#71b)
    python3 tools/assets/build.py signpost   # only the signpost prop (#75 item 6)
    python3 tools/assets/build.py fog        # only the fog-puff sheet (#75 item 7)
    python3 tools/assets/build.py spells     # only the field-spell places + keepers (#75 item 9)
    python3 tools/assets/build.py dungeon    # only the Depths' lower floors + the stairs (#75 item 10)
    python3 tools/assets/build.py inns       # only the innkeepers + travelers (#75 item 11)
    python3 tools/assets/build.py sea        # only the Silver Shallows, the boat and the dock (#75 item 14)
    python3 tools/assets/build.py quests     # only Hermit Moss (#75 item 13)
    python3 tools/assets/build.py seamusic   # only the sea music: sailing, the Shallows, the fogbank (#75 item 14)
    python3 tools/assets/build.py lighthouse # only Gull Rock's lighthouse tower (#75 item 14)
    python3 tools/assets/build.py seacritters # only the sea critters + the battle-at-sea backdrop (#75 item 14d)
    python3 tools/assets/build.py hill       # only Remembrance Hill (#75 item 14e)
    python3 tools/assets/build.py elder      # only Eldergrove: its tiles, critters and people (#75 item 14f)
    python3 tools/assets/build.py marsh      # only Foglight Marsh: its tiles, critters, people and lanterns (#75 item 14g)
    python3 tools/assets/build.py archive    # only the Sunken Archive: its tiles, critters, Fiend and people (#75 item 14h)
    python3 tools/assets/build.py roost      # only the Dragon's Roost: its tiles and the roost icon (#75 item 15b)
    python3 tools/assets/build.py taleshore  # only Taleshore + Port Lantern: tiles, harbor sheet, icon, people (#75 item 15c)
    python3 tools/assets/build.py isles      # only Taleshore I: three places' tiles, the kite sheet, icons, critters, people (#75 item 15d)
    python3 tools/assets/build.py chart      # only Chartmaker's Rest: tiles, the chart sheet, its icon, its people (#75 item 15h)
    python3 tools/assets/build.py lumina     # only Lumina-That-Was: three zones' tiles, the school sheet, critters, people (#75 item 16b)
    python3 tools/assets/build.py dreamroot  # only the Dream Root Door: its tiles, the root sheet, Old Knot, Young Wick and Wisp's new face (#75 item 16a)
    python3 tools/assets/build.py chorus     # only Chorus Isle: tiles, the chorus sheet, its icon, the Hush Fiend, its people, Radiant Ember (#75 item 15g)
    python3 tools/assets/build.py cliffs     # only Taleshore III: Songstone Cliffs + the Quiet Quarter — tiles, the hush sheet, icons, critters, people, songstones (#75 item 15f)
    python3 tools/assets/build.py reef       # only Taleshore II: the Story Reef + Inkwell Cove — tiles, the shell sheet, icons, critters, warden, people (#75 item 15e)
    python3 tools/assets/build.py heroes     # only the five heroes: Valor, Bastion, Talon, Kira, Selene
    python3 tools/assets/build.py intro      # only the sign-in screen's intro music

Writes public/sprites/**, public/tiles/**, public/backgrounds/**,
public/audio/16bit/** and the sprite manifest src/content/sprites.generated.ts.
Output is deterministic — re-running produces the same files.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import audio  # noqa: E402
import build_sprites  # noqa: E402
import tiles  # noqa: E402

ROOT = HERE.parent.parent  # hazel-game/
# The sea critters (#75 item 14d) — `build.py seacritters` writes only these sheets.
SEA_CRITTERS = ('bubble-puffer', 'inkling', 'starfix')
PUBLIC = ROOT / 'public'
MANIFEST = ROOT / 'src' / 'content' / 'sprites.generated.ts'

# Eldergrove's critters and people (#75 item 14f), for `build.py elder`.
# Foglight Marsh's critters, people and props (#75 item 14g), for `build.py marsh`.
MARSH_SPRITES = ('mist-newt', 'bog-lantern', 'murk-toad', 'last-fogbank', 'marsh-brume', 'marsh-puddle', 'marsh-slosh',
                 'marsh-stone', 'marsh-lantern', 'marsh-lantern-lit')

# Port Lantern's people and quest board (#75 item 15c), for `build.py taleshore`.
TALESHORE_SPRITES = ('port-harbormaster', 'port-skipper', 'port-merchant', 'port-innkeeper', 'port-netmender',
                     'port-lamplighter', 'port-postmaster', 'port-storyteller', 'port-board', 'port-fisher', 'tale-rambler', 'port-office-note')

# Taleshore I's critters, warden and people (#75 item 15d), for `build.py isles`.
ISLES_SPRITES = ('compass-crab', 'gull-scout', 'tide-snail', 'marker-post', 'latitude-cat', 'globe-beetle', 'zephyr-pup',
                 'kite-ray', 'squall-chick', 'compass-golem', 'drift-reel', 'drift-sandy', 'drift-salt', 'way-lo',
                 'way-pebble', 'way-drift', 'gale-sough', 'gale-gully', 'gale-tass', 'drift-puffin')

# Taleshore II's critters, warden, people and tale-stones (#75 item 15e), for `build.py reef`.
REEF_SPRITES = ('word-eel', 'riddle-jelly', 'page-ray', 'blot', 'cuttle-scribe', 'margin-shrimp', 'riddle-leviathan',
                'reef-yarn', 'reef-verse', 'reef-bloop', 'reef-stone', 'reef-stone-lit', 'ink-dot', 'ink-smudge', 'ink-bess')

# Taleshore III's critters, people and songstones (#75 item 15f), for `build.py cliffs`.
CLIFFS_SPRITES = ('echo-bat', 'chime-gull', 'drum-crab', 'hushling', 'muffle-moth', 'blank-sprite', 'cliff-reso', 'cliff-echo',
                  'cliff-hum', 'songstone', 'songstone-rung', 'quiet-shush', 'quiet-mime', 'quiet-sotto')

# Chorus Isle's Fiend, people and Radiant Ember (#75 item 15g), for `build.py chorus`.
CHORUS_SPRITES = ('hush-fiend', 'sage-aria', 'chorus-brio', 'chorus-coda', 'chorus-cadence', 'chorus-trill', 'chorus-do', 'chorus-re', 'chorus-baritone', 'chorus-crystal', 'ember-radiant', 'fx-starfire')

# Chartmaker's Rest's people (#75 item 15h), for `build.py chart`.
CHART_SPRITES = ('chart-chartmaker', 'chart-pen', 'chart-inka')

# The Dream Root Door's talking root and Wisp's new face (#75 item 16a), for `build.py dreamroot`.
DREAMROOT_SPRITES = ('root-knot', 'wisp-named', 'memory-young-wick')

# Lumina-That-Was's critters and people (#75 item 16b), for `build.py lumina`.
LUMINA_SPRITES = ('faded-echo', 'lost-sock-golem', 'misplaced-key', 'chalk-wisp', 'eraser-imp', 'sum-gremlin',
                  'memory-young-lumen', 'memory-fair', 'memory-popcorn', 'memory-dog', 'class-prim', 'class-bell', 'class-slate', 'class-slate-gold')

# The Sunken Archive's critters, Fiend and people (#75 item 14h), for `build.py archive`.
ARCHIVE_SPRITES = ('dust-tome', 'ink-wisp', 'quill-imp', 'hollow-fiend', 'sage-chronicle', 'archive-index', 'archive-binder',
                   'archive-hush', 'archive-quillon', 'archive-margin', 'archive-leaf', 'archive-traveler')

ELDER_SPRITES = ('ring-beetle', 'sap-sprite', 'hollow-acorn', 'ringkeeper', 'elder-fen', 'elder-ringwood', 'elder-dawdle')


def write_manifest(data: dict):
    body = json.dumps(data, indent=2, ensure_ascii=False)
    MANIFEST.write_text(
        '// AUTO-GENERATED by tools/assets/build.py — do not edit by hand.\n'
        '// Re-run `python3 tools/assets/build.py` after changing the art generator.\n'
        "import type { SpriteDef } from './sprites';\n\n"
        f'export const GENERATED_SPRITES: Record<string, SpriteDef> = {body};\n'
    )


def main():
    only = set(sys.argv[1:]) or {'sprites', 'tiles', 'audio'}
    if 'blend' in only:
        # Just the edge-blend sheets (#75 / #71b) — existing files untouched.
        tiles.build_blend(PUBLIC)
        print('blend ✓')
        return
    if 'fog' in only:
        # Just the fog puffs (#75 item 7) — existing files untouched.
        tiles.build_fog(PUBLIC)
        print('fog ✓')
        return
    if 'signpost' in only:
        # Just the wayfinding signpost (#75 item 6) — existing files untouched.
        write_manifest(build_sprites.build(PUBLIC, only={'signpost'}))
        print('signpost ✓')
        return
    if 'inns' in only:
        # Just the innkeepers and travelers (#75 item 11) — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only={f'{t}-{r}' for t in ('numbria', 'verdara', 'gearfall', 'chromaria') for r in ('innkeeper', 'traveler')}))
        print('inns ✓')
        return
    if 'sea' in only:
        # Just the boat's additions (#75 item 14): the Shallows, the boat, the
        # overworld sheet with the dock appended — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only={'gull-lamplighter'}))
        tiles.build_sea(PUBLIC)
        print('sea ✓')
        return
    if 'hill' in only:
        # Just Remembrance Hill (#75 item 14e): its people, its tiles, the marble
        # town sheet and the overworld sheet with the hill icon appended —
        # every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only={
            'hill-keeper', 'hill-posy', 'hill-merchant', 'hill-innkeeper',
            'hill-traveler', 'hill-carver', 'hill-elder', 'hill-jam'}))
        tiles.build_hill(PUBLIC)
        print('hill ✓')
    if 'heroes' in only:
        # Just the five heroes — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only={'valor', 'bastion', 'talon', 'kira', 'selene'}))
        print('heroes ✓')
        return
    if 'seacritters' in only:
        # Just the Silver Shallows' sea critters and the battle-at-sea backdrop
        # (#75 item 14d) — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only=set(SEA_CRITTERS)))
        tiles.build_sea_backdrops(PUBLIC)
        print('sea critters ✓')
        return
    if 'marsh' in only:
        # Just Foglight Marsh (#75 item 14g): its critters, people and lanterns, its
        # tiles, the stilt town sheet and the overworld sheet with the marsh icon
        # appended — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only=set(MARSH_SPRITES)))
        tiles.build_marsh(PUBLIC)
        print('marsh ✓')
        return
    if 'archive' in only:
        # Just the Sunken Archive (#75 item 14h): its critters, Fiend and people, its
        # tiles, the tome town sheet and the overworld sheet with the archive icon
        # appended — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only=set(ARCHIVE_SPRITES)))
        tiles.build_archive(PUBLIC)
        print('archive ✓')
        return
    if 'chart' in only:
        # Just Chartmaker's Rest (#75 item 15h): its tiles, the chart town sheet,
        # the overworld sheet with its icon appended, and its three people.
        write_manifest(build_sprites.build(PUBLIC, only=set(CHART_SPRITES)))
        tiles.build_chart(PUBLIC)
        print('chart ✓')
        return
    if 'lumina' in only:
        # Just Lumina-That-Was (#75 item 16b): three zones' tiles, the school sheet, its critters and people.
        write_manifest(build_sprites.build(PUBLIC, only=set(LUMINA_SPRITES)))
        tiles.build_lumina(PUBLIC)
        print('lumina ✓')
        return
    if 'dreamroot' in only:
        # Just the Dream Root Door (#75 item 16a): its tiles, Old Knot and Wisp's new face.
        write_manifest(build_sprites.build(PUBLIC, only=set(DREAMROOT_SPRITES)))
        tiles.build_dreamroot(PUBLIC)
        print('dreamroot ✓')
        return
    if 'chorus' in only:
        # Just Chorus Isle (#75 item 15g): its tiles, the chorus town sheet, the
        # overworld sheet with its icon appended, the Hush Fiend, its people and
        # Radiant Ember.
        write_manifest(build_sprites.build(PUBLIC, only=set(CHORUS_SPRITES)))
        tiles.build_chorus(PUBLIC)
        print('chorus ✓')
        return
    if 'cliffs' in only:
        # Just Taleshore III (#75 item 15f): Songstone Cliffs and the Quiet Quarter —
        # their tiles, the hush town sheet, the overworld sheet with two icons
        # appended, their critters, people and songstones.
        write_manifest(build_sprites.build(PUBLIC, only=set(CLIFFS_SPRITES)))
        tiles.build_cliffs(PUBLIC)
        print('cliffs ✓')
        return
    if 'reef' in only:
        # Just Taleshore II (#75 item 15e): the Story Reef and Inkwell Cove — their
        # tiles, the shell town sheet, the overworld sheet with two icons appended,
        # their critters, warden, people and tale-stones.
        write_manifest(build_sprites.build(PUBLIC, only=set(REEF_SPRITES)))
        tiles.build_reef(PUBLIC)
        print('reef ✓')
        return
    if 'isles' in only:
        # Just Taleshore I (#75 item 15d): Driftwood Shallows, the Wayfinder Isles
        # and Gale Atoll — their tiles, the kite town sheet, the overworld sheet
        # with three icons appended, their critters, warden and people.
        write_manifest(build_sprites.build(PUBLIC, only=set(ISLES_SPRITES)))
        tiles.build_isles(PUBLIC)
        print('isles ✓')
        return
    if 'taleshore' in only:
        # Just Taleshore and Port Lantern (#75 item 15c): their tiles, the harbor
        # town sheet, the overworld sheet with the harbor icon appended, and Port
        # Lantern's people and quest board — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only=set(TALESHORE_SPRITES)))
        tiles.build_taleshore(PUBLIC)
        print('taleshore ✓')
        return
    if 'roost' in only:
        # Just the Dragon's Roost (#75 item 15b): its tiles and the overworld sheet
        # with the roost icon appended — every other file untouched (its stone
        # borrows the Marsh's Nameless Stone sprite).
        tiles.build_roost(PUBLIC)
        print('roost ✓')
        return
    if 'elder' in only:
        # Just Eldergrove (#75 item 14f): its critters and people, its tiles, the
        # bark town sheet and the overworld sheet with the elder icon appended —
        # every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only=set(ELDER_SPRITES)))
        tiles.build_elder(PUBLIC)
        print('elder ✓')
        return
    if 'lighthouse' in only:
        # Just Gull Rock's lighthouse tower (#75 item 14) — every other file untouched.
        tiles.build_lighthouse(PUBLIC)
        print('lighthouse ✓')
        return
    if 'intro' in only:
        # Just the sign-in screen's intro music — every other file untouched.
        audio.build_intro_music(PUBLIC)
        print('intro music ✓')
        return
    if 'seamusic' in only:
        # Just the sea music (#75 item 14) — every other file untouched.
        audio.build_sea_music(PUBLIC)
        print('sea music ✓')
        return
    if 'cay' in only:
        # Just Shelby, Sandpiper Cay's hermit crab (#75 item 14i).
        write_manifest(build_sprites.build(PUBLIC, only={'cay-hermit'}))
        print('cay ✓')
        return
    if 'quests' in only:
        # Just Hermit Moss (#75 item 13) — every other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only={'dawnreach-hermit'}))
        print('quests ✓')
        return
    if 'dungeon' in only:
        # Just the Clockwork Depths' lower floors and the stairs (#75 item 10).
        tiles.build_dungeon(PUBLIC)
        print('dungeon ✓')
        return
    if 'spells' in only:
        # Just the field-spell places and their people (#75 item 9) — every
        # other file untouched.
        write_manifest(build_sprites.build(PUBLIC, only={'wayfarer-keeper', 'quiet-keeper', 'mine-miner'}))
        tiles.build_spell_places(PUBLIC)
        print('spells ✓')
        return
    if 'icons' in only:
        # Just the overworld sheet, now with the crystal regions' icons (#75
        # item 8) — existing frames unchanged, every other file untouched.
        tiles.build_overworld_sheet(PUBLIC)
        print('icons ✓')
        return
    if 'overworld' in only:
        # Just the Phase 1 overworld additions (#75) — existing files untouched.
        write_manifest(build_sprites.build(PUBLIC, only={'dawnreach-scout', 'shrine-keeper'}))
        tiles.build_overworld(PUBLIC)
        audio.build_music(PUBLIC, ['town', 'cave', 'shrine'])
        print('overworld ✓')
        return
    if 'sprites' in only:
        write_manifest(build_sprites.build(PUBLIC))
        print('sprites ✓')
    if 'tiles' in only:
        tiles.build(PUBLIC)
        print('tiles + backdrops ✓')
    if 'audio' in only:
        audio.build(PUBLIC)
        audio.build_sea_music(PUBLIC)
        audio.build_intro_music(PUBLIC)
        print('audio ✓')


if __name__ == '__main__':
    main()
