# Map authoring

How the world's maps are made, and how to change them safely (#75, roadmap
item 5).

## Two kinds of map

| Map | Where | Edited with |
|---|---|---|
| **Big maps:** the Dawnreach overworld now, the continents next | `src/content/maps/<zone>.tmj` | **Tiled**, the free map editor |
| **Everything smaller:** towns, fields, caves, the shrine, Spire floors | ASCII rows in `src/content/zones.ts` (Spire floors: `spire.ts`) | any text editor |

Either way, the game runs on the same ASCII rows. When the game loads,
`tiledRows` (`src/lib/tiled.ts`) turns a Tiled map back into rows. So every
zone check in `zones.test.ts` runs on Tiled maps exactly as on typed ones:
legal characters, exits, every place reachable, fog covering walkable ground,
and so on.

**Only the terrain lives in Tiled.** Places (`places`), exits (`exits`), fog
(`fogs`), NPCs and enemies stay in the zone's entry in `zones.ts`, as typed
data. The tests catch any mismatch, for example a `P` tile without a place,
or an exit that lands on water.

## Editing Dawnreach in Tiled

1. Install Tiled (free): https://www.mapeditor.org
2. Open `hazel-game/src/content/maps/dawnreach.tmj`. The **map-legend**
   tileset appears in the Tilesets panel.
3. Paint on the **terrain** layer. Each legend tile is one map character, shown
   in its corner. Its `char` and `meaning` are in the Properties panel when you
   select it.

   | Tile | Means | | Tile | Means |
   |---|---|---|---|---|
   | `.` | grass / open ground | | `P` | place entrance (needs a `places` + `exits` entry) |
   | `,` | flowers (walkable) | | `E` | exit on a map edge (needs an `exits` entry) |
   | `#` | trees (solid) | | `S` `C` `G` | save crystal, chest, gate |
   | `~` | water (solid) | | `H` | hidden passage: looks like trees, the hero walks through (dashed in the editor) |
   | `:` | sand / beach | | `W D F K B T Z` | building wall, door, floor, counter, shelf, table, bed |
   | `^` | mountain (solid) | | `=` | road / path |

4. Save with Ctrl+S, then run `npm test` from `hazel-game/`. If anything is
   wrong, the zone tests say what and where.
5. If you moved or added a place, update the zone's `places` and `exits` in
   `zones.ts` (and the gate's spawn point in the place you can walk into). The
   tests point at anything left out of step.

The game reads maps strictly, and fails at load with where and why rather than
drawing a broken world. It rejects:
- an empty cell (every cell needs a tile);
- a flipped or rotated tile;
- a second tileset;
- a layer that isn't the one tile layer named `terrain`;
- an infinite map;
- a compressed layer. Keep Map → Map Properties → *Tile Layer Format* on
  **CSV**.

Object layers are allowed, for example for notes to yourself; the game
ignores them.

## Fog banks

A fog bank (`fogs` in the zone's entry) is a rectangle that blocks the way
until one of its `liftedBy` flags is set. Give it:
- `guards`: the cell it keeps you from (a place, or a chest). The tests check
  it's out of reach while the fog is there and in reach once it lifts, so the
  bank must really seal the way in.
- `chestTopic` when it guards a chest on a map with no topic (the overworld),
  so the chest's question has a subject.
- `hint` (bumping it) and `lifted` (shown as it clears on screen).

For a crystal's own pocket, use `crystalPocket(topic, bank, chest, where)`.
Paint the pocket in Tiled first: a small nook with one opening, then put the
bank over the opening.

## Signposts

A signpost is an NPC with `signpost: true` (see `dawnreach-sign-west` in
`npcs.ts`), placed in the zone's `npcs` like anyone else. What it says is
worked out from the map when you talk to it: every place by direction, then
the way to the next goal (`lib/wayfinding.ts`). So moving places around never
makes a sign lie. Put it beside a crossroads, off the road;
`wayfinding.test.ts` checks that.

## Tools

From `hazel-game/`:

```bash
python3 tools/tiled/tiled.py to-ascii src/content/maps/dawnreach.tmj   # print the map as ASCII rows (to read a diff)
python3 tools/tiled/tiled.py from-ascii rows.txt src/content/maps/new.tmj   # start a Tiled map from ASCII rows
python3 tools/tiled/tiled.py legend                                     # rebuild the legend tileset
```

A `.tmj` file stores the whole map on one line, so a map change shows in a
pull request as a single changed line. Run `to-ascii` on both versions to
compare them row by row.

## Adding a map character

1. Add it to `LEGEND_CHARS` in `zones.ts`, and teach the game what it means:
   walkable or not, its tile art, its blend class.
2. Add it at the **end** of `LEGEND` in `tools/tiled/tiled.py`, with its art,
   then run `python3 tools/tiled/tiled.py legend`.

The legend is append-only. Saved maps store tile *numbers*, so moving an
entry would repaint every map, and the tool refuses to. `tiled.test.ts` fails
if the legend and `LEGEND_CHARS` ever disagree.

## Moving another map into Tiled

1. Save its rows to a text file, one row per line.
2. Run `from-ascii` to write `src/content/maps/<zone>.tmj`.
3. In `zones.ts`, replace the zone's `map: [...]` with
   `tiledRows(JSON.parse(<import>), JSON.parse(legendTsj), '<zone>')`, the
   same way `DAWNREACH_MAP` does it.
4. Check that the rows come out identical, as `tiled.test.ts` does for
   Dawnreach.
