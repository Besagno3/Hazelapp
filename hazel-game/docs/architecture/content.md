# The content layer (`src/content/`)

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

Covers: topics and acts, zones (and Tiled maps — see also `docs/MAP-AUTHORING.md`), NPCs, enemies and boss roles, abilities, companions, spells, field spells, dungeons, regions and danger tiers, the boat, the Spire, keys, items, quests (step kinds, key-item chests), secrets and avatars.

- **Content layer** (`src/content/`): `topics.ts` (the topic registries —
  `TOPIC_REGISTRY` = the **crystal** topics with crystal/Fiend/zone, each in
  an act (`act`; `actCrystals` / `actRestored` / `actComplete` — the Spire,
  the ending and the 🚩 read Act I's, #75 item 14c): Act I's four and, since
  #75 item 14h, Act II's history (the Crystal of Memory) and, since 15g, Act
  III's words (the Crystal of Voices); `EXTRA_TOPICS` = the expansion themes
  nature/space and Act III's geography/music (#75 item 15a); `topicInfo` resolves all ten, #33/#55), `zones.ts` (17 tile maps: the **Dawnreach**
  overworld (80×60, `kind: 'overworld'`, with `places` icons and `fogs`,
  #75 — the four crystal regions sit at its corners, item 8) + three roadside
  shrines and the dark Echo Mine (item 9) + 4 crystal zones + Lumina Village (home and `HUB_ZONE`: safe,
  a scrolling 4×2-screen town with enterable buildings, incl. the Library
  and Maple's Trading Post from the retired Lumina Field) + 3 themed combat
  zones (the Clockwork Depths three floors deep, item 10) + the hidden
  Moonwell Grove + the Crystal Spire; every zone but Dawnreach is a place on
  it or a floor below one; every zone has a `kind` that picks its
  transition + music;
  `ZONE_IDS` is the zone-id source of truth, validated by `zones.test.ts`;
  Dawnreach's terrain is painted in **Tiled** — `content/maps/dawnreach.tmj`
  with the `legend.tsj` tileset, read by `tiledRows` (`lib/tiled.ts`); see
  `docs/MAP-AUTHORING.md`), `npcs.ts` (dialogue trees),
  `enemies.ts` (archetypes + fiends, age-scaled at spawn; a boss's `role` —
  `fiend / warden / miniboss / echo / finale` — decides what beating it does
  and what it says, `bossScript`, #75 item 14c), `abilities.ts`
  (Sage personas + charge tuning), `companion.ts` (battle companions — Ember /
  Pip / Wisp — their strikes, perks + Pair Attacks), `spells.ts` (the Spellbook — castable
  abilities derived from the save), `fieldSpells.ts` (#75 item 9: the field
  spells Return / Glow / Calm — learned at shrines as `spell:<id>` flags —
  plus visited towns and Return landings), `dungeons.ts` (#75 item 10: which
  zones are floors of one dungeon, which way is deeper, floor labels B1… /
  Floor 1…, the boss at the bottom — floors are ordinary zones joined by
  `>` / `<` stairs exits), `regions.ts` (#75 item 12: every zone's region and
  danger tier 0–7 — Act I 0–4, the Shallows 5 — the `DANGER` tuning per
  tier, map labels "Lv 4 !!" (marks stop at "!!!", tiers 5–7 go violet →
  magenta → pink, kept apart for colour-blind kids — #75 item 14f review),
  the danger banner / defeat tip / arrival warning copy),
  (Act II's **Remembrance Hill**, #75 item 14e, is a town on Dawnreach behind
  the Grove-road fog — `hill-fog`, lifted by `act2-seen` — and a place nobody
  names before then: `PlaceDef.knownFrom` / `placeKnown` keep it off the
  signposts and the menu map; Act II's **Eldergrove**, #75 item 14f, is
  an island of the Silver Shallows — a history field at tier 5 whose warden,
  the Ringkeeper, gives the Memoria Key, a `GateKey` whose gate isn't on any
  map until the Sunken Archive (14h): `unlocksZone: null`, `opens` instead;
  and **Foglight Marsh**, #75 item 14g, is the Shallows' north coast — a
  history field where Posy's escort walks (`escortStep`, `lib/escort.ts`: an
  escort follows the hero's footsteps and waits near critters; its walk is
  never saved, `escortWalkingFlag`) and a miniboss gives its own badge
  (`EnemyDef.badge`); and **the Sunken Archive**, #75 item 14h, Act II's
  crystal zone on an island in the Shallows' north-east — a Return town
  with an inn that is also its shelter, and a `mooring`: waking or Returning
  in a town on an island brings Marlow's boat round to its beach
  (`islandBoat`, `boatAfterDefeat`, `boatOnReturn`, #114o)),
  `boat.ts` (#75 item 14: Old Marlow's boat — where it's moored
  (`boatSpot`, home at his dock), leaving it mid-voyage (`moorBoat`), Marlow
  rowing it home (`boatFetch`)),
  `spire.ts` (the endgame climb floors +
  villain), `keys.ts` (warden bosses + the gate keys that unlock the Fiends' gates, #58 —
  one key each, but Chorus Isle's takes both Chorus Keys, `keysForZone`, #75 item 15g), `items.ts` (shop + economy tuning), `quests.ts` (quests as
  ordered steps — chest / defeat / talk / secret, and since #75 item 13 *have*
  (carry an item, any of its forms) and *bring* (hand it to an NPC, who may
  hand back something new) steps; `openChest` pays a key-item chest's
  `ZoneDef.keyChests` item and `zoneChestOpened` ignores those chests — a key
  item always goes in a **new** chest, never an existing one (a save that
  already opened it would never get the item, #106b); each
  quest item belongs to one quest; one person may give several quests in
  turn — `questFor(npcId, save)`, the one you've started first — and a step
  may go through a giver, #75 item 14c), `secrets.ts` (hidden secrets per
  zone — claim + progress; `ZoneDef.secrets`), `avatars.ts` (the five heroes —
  Valor, Bastion, Talon, Kira, Selene (ids a1–a5) — each a hero type
  (`FIGHT_STYLES`), with `STYLE_LABEL` / `STYLE_DESC` and every type's two
  signature abilities, `HERO_ABILITIES`).
