---
paths:
  - hazel-game/src/content/**
  - hazel-game/tools/**
---
# The content layer — read `hazel-game/docs/architecture/content.md` before changing these files

Non-negotiables:

- `ZONE_IDS` is the zone-id source of truth (`zones.test.ts`); every zone has a `kind`; every zone but Dawnreach is a place on it or a floor below one. `TOPIC_REGISTRY` carries each crystal topic's act.
- A key item always goes in a **new** chest (`ZoneDef.keyChests`), never an existing one — a save that opened it would never get the item (#106b). Each quest item belongs to one quest; a person can give several quests in turn (`questFor`).
- Every town in `RETURN_TOWNS` has exactly one inn (`innOf`); still one Library; each item is sold in one shop.
- A boss's `role` (`fiend / warden / miniboss / echo / finale`) decides what beating it does. An enemy's `habitat` (land / sea) decides where it roams and who it fights; sea critters follow `seaCritters.test`'s placement rules.
- Every placed person needs an epilogue line (`content/epilogue/`, `epilogue.test`). `PlaceDef.knownFrom` keeps a place off signposts and the map until its act.
- Flags are the story's memory: `act2/3/4-seen`, `spell:<id>`, `visited:<zone>`, `lit:<zone>`, `blank-chart-held` (check the flag, not the item), `umbra-named`. The danger tier per zone is in `regions.ts` (tiers 5–7 violet → magenta → pink, kept apart for colour-blind kids).
- Art and audio are generated (`python3 tools/assets/build.py <set>`, sets listed in `docs/OPERATIONS.md`); `sprites.test.ts` checks every sprite exists. Tiled maps: `docs/MAP-AUTHORING.md`; the legend tileset is append-only.
- Tuning: economy in `items.ts`, danger in `regions.ts`; registry-derived unions stay beside their registry.
