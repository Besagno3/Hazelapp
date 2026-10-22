---
paths:
  - hazel-game/src/features/world/**
  - hazel-game/src/content/maps/**
  - hazel-game/bench/**
  - hazel-game/src/lib/reach*
  - hazel-game/src/lib/terrain*
  - hazel-game/src/lib/transition*
  - hazel-game/src/lib/travel*
  - hazel-game/src/lib/encounter*
  - hazel-game/src/lib/interact*
  - hazel-game/src/lib/escort*
  - hazel-game/src/lib/sleepMark*
  - hazel-game/src/lib/fog*
  - hazel-game/src/lib/wander*
  - hazel-game/src/lib/wayfinding*
  - hazel-game/src/lib/worldMap*
  - hazel-game/src/lib/camera*
  - hazel-game/src/lib/journey*
  - hazel-game/src/lib/facing*
  - hazel-game/src/lib/tiled*
  - hazel-game/src/lib/audio*
  - hazel-game/src/lib/spriteAnim*
  - hazel-game/src/content/zones*
  - hazel-game/src/content/regions*
  - hazel-game/src/content/dungeons*
  - hazel-game/src/content/fieldSpells*
  - hazel-game/src/content/boat*
  - hazel-game/src/content/secrets*
  - hazel-game/src/content/tiles*
  - hazel-game/src/content/spire*
  - hazel-game/src/content/seaCritters*
  - hazel-game/src/content/sprites*
---
# The world — read `hazel-game/docs/architecture/world.md` before changing these files

It is the full reference (the canvas, overlays, using things, the top bar, field spells, dungeons, inns, the sea, flying, Acts III–IV, after the Spire). Non-negotiables:

- Terrain is ONE object that draws only the cells in view (`lib/terrain.ts`); never one KaPlay object per tile. Roofs are one object per building; coasts, beaches and roads blend by `blendLayer`.
- Every "can the hero get there?" goes through `lib/reach.ts` (`reach`, `reachPath`, `touches`, `behindFog`, `safeSpawn`). Don't write another BFS over a zone's tiles.
- Nothing usable goes off on a bump (`lib/interact.ts`): chests, gates, the save crystal, stairs, counters, people, the Spire icon and Umbra wait for a fresh Space / Enter, a click or tap, or ✋. Still on a bump: secrets, fog / dark hints, boarding and landing, battles.
- One frame's meeting with an enemy is `meetFoe` (`lib/encounter.ts`); a bump cooldown spares only `spared` critters and never a boss (#114t). Sleeping critters let the hero pass; a boss never does.
- Every overlay goes in `components/ModalLayer` (`role="dialog"`, `aria-modal`, the rest `inert` through `useInertOutside`); nothing else sets `inert`; Escape does only the layer's own way out; KaPlay's canvas is never focusable (keys are read from `window`).
- On the world screen `App` draws no floating badges: the top bar is `WorldScreen`'s, at most 44 px tall, and every overlay (z-40) draws over it.
- People, the Spire icon and Umbra are solid (`personHit`); villagers scoot after `SCOOT_AFTER_S`; the doorway corner assist never points at a hidden passage.
- Moving between edge-joined screens slides; entering or leaving a place fades (`transitionFor`). Maps join at sea through `ZoneDef.seaLinks`, every link mirrored.
- A boat floats only on open sea of a sea-linked map outside standing fog (`afloatAt`); `normalizeSave` / `safeSpawn` repair a save that says otherwise.
- Zone ids from a save: `isZoneId`, never `in`. Every placed person needs an epilogue line (`content/epilogue/`, `epilogue.test`).
- Dawnreach's terrain is painted in Tiled (`docs/MAP-AUTHORING.md`); the legend tileset is append-only. Benches (`fps`, `shots`, `journey`, `hud`, `sea`, `battle`, `fly`): `docs/OPERATIONS.md` — run `hud` / `battle` on a quiet tree.
