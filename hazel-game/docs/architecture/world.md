# The world (`src/features/world/`)

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

Covers: `WorldScreen` / `WorldCanvas`, terrain and edge blending, transitions, overlays and `ModalLayer`, using things, people as solids, the top bar, field spells, dungeons, inns, reachability (`lib/reach.ts`), flying on Ember, Taleshore and Acts III–IV, the sea and sea critters (sleeping, encounters), lighthouses, and what happens after the Spire.

- **World** (`features/world/`): `WorldScreen` (HUD + overlays + cutscenes)
  wraps `WorldCanvas` (KaPlay; tile collision, press-to-use (#127), zone exits,
  the Spire icon, remounted per zone, paused under overlays via ref). Terrain
  is ONE object that draws only the cells in view each frame, from frames
  worked out once per zone by `lib/terrain.ts` — never add one KaPlay object
  per tile (big maps would crawl; #75). Roofs are one object per building.
  Coasts, beaches and roads are rounded by **edge blending** (`blendLayer`,
  `lib/terrain.ts`): a tile centred on every corner where terrain classes meet
  (water < sand < ground < path), from a per-zone `/tiles/<zone>-blend.png`;
  buildings and Spire floors never blend.
  Moving between edge-joined screens slides; entering or leaving a place on
  the overworld fades (`transitionFor`, `lib/transition.ts`). Overlays:
  dialogue, services (shop/inn/library/sage), path questions (gates/chests),
  key gates (`KeyGateOverlay` — warden-key Fiend gates, #58),
  menu, and the **Spire climb** (`SpireOverlay`, machine substate `world.spire`,
  opened by using the Spire icon — the all-crystals-gated endgame; its five
  floors are walkable themed maps drawn by `WorldCanvas`, state in
  `spireStore`, #74; its questions sit 0–3 levels above the kid's own, and
  after a failed climb the next has one more candle and asks a level lower,
  up to two falls — `spireFalls`, save flags `spire-falls-1/2`, B4 #150). `TouchPad`
  is the mobile d-pad, with the ✋ use button beside it (#127).
  **Using things** (#127, `lib/interact.ts`): nothing the hero can use goes
  off on a bump. Chests, gates (both kinds), the save crystal, Spire seals and
  stairs, shop counters, people, the Spire icon and Umbra wait for a fresh
  Space / Enter (a window keydown — not an auto-repeat, not while the world is
  paused or sliding, and not when a focused button, link or field or an open
  dialog owns the key, `ownsKeys`), a left click or tap on the world, or ✋
  (counted in `WorldScreen`'s `actionRef`). What gets used is the canvas's
  `targetNow`: the way the hero last moved first (`probeDirs`) — a person
  (`inFront`, within `TALK_REACH` of touching) before a tile (`probePoints`,
  `USE_REACH` px past the hero's box) — then beside, then behind; a click on one of those (its `hit` area) uses that one instead. Counters and desks (`COUNTER_CHARS`: `K`, `T`) talk to the nearest person on their far side (`acrossCounter`). A yellow
  pill over it says "Space: Open chest" ("Tap: …" on a coarse pointer,
  `promptText`), and `onPrompt` gives ✋ its label. A press in the two frames
  after an `arm` waits them out (`held`), like a battle. A click's point
  (`clickRef`, measured on the canvas) counts for its own press only. Still on a bump: secrets
  in the scenery, the fog / dark hints, boarding and landing, battles.
  **People are solid** (`personHit`: `approachBlocked` at `radius + HALF`, at most a tile, so
  a hero already overlapping can always step away), and so are the Spire icon
  and Umbra; wandering villagers steer round the hero (`avoidHero`) — critters
  still walk into them to fight. Walking into the same person for
  `SCOOT_AFTER_S` (1.5 s) makes them step 2–5 cells aside at `SCOOT_SPEED`
  (`scootPath`, on `reach`: never through a wall, out of their building, onto
  a door, exit, stairs, place icon, hidden passage or someone else; off the
  hero's line if they can; at a dead end they squeeze past the hero); a
  wanderer then roams round where it stopped (`rehomes`). **Doorway corner
  assist:** the hero's 22 px box only fits a one-tile opening within ±5 px of
  its middle, so walking straight (no sideways key) into a wall with an
  opening within `CORNER_ASSIST` (20 px) slides them over into line
  (`cornerTarget` / `assistCorner`; never towards a hidden passage, which
  would give it away). A movement key blurs a focused HUD button, so the next
  Space is the world's.
  **The world's top bar** (#75 item 14b, #102i): on the world screen `App`
  draws no floating badges — `WorldScreen` puts the level (`LevelBadge`
  `inline`), the streak (`StreakBadge inline`, "🔥 5" on a phone) and Switch
  (`SwitchPlayerButton inline`, #124 — was Sign out) in a full-width row above the HUD, at most 44 px
  tall (pt-3 + bar + mb-2 = the old pt-16), so they never cover the place
  name and every overlay (z-40) draws over them. Exploring a Spire floor,
  `SpireOverlay` portals its seals, candles and 🚪 Leave the Spire into the
  HUD row (`hudSlot`, in 📜 Menu's place). The battle screen has a top bar
  too (#75 item 14f review, `data-testid="battle-topbar"`): the level and
  streak in a row above the status boxes (no Switch player in battle, as before;
  40 px on a phone — `LevelBadge` / `StreakBadge` `dense`), hidden below
  360 px wide or 500 px tall, where there's no room for it without pushing
  the commands off the screen (`bench … battle`, a boss fight); 🏃 Flee sits
  beside "Your move!", so the other six commands fill the grid (#158b). The
  Training Grounds, quiz and hero pick use `ScreenTopBar` (the same row in
  the page, #110h; the quiz keeps it while a question is on its way, #163) — no screen
  floats badges any more; there "Switch player" is spelled out from 400 px.
  🏃 Flee comes last in the page (after the grid), so Tab reaches Attack first. Switch asks
  "Switch?" first (same size; the hint floats below it), and any other tap
  or key takes the question back.
  **Overlays are modal** (#75 item 14b review): every world overlay (dialogue,
  services, path questions, key gates, menu, the Spire's panels) and the
  level-up sit in `components/ModalLayer` — `role="dialog"` + `aria-modal`,
  the rest of the page `inert` (`hooks/useInertOutside`, which counts its
  holders, so a story over an overlay never un-inerts the page early), focus
  moved in (a button that `autoFocus`es, else the layer itself, so a stray
  Enter never buys or answers) and back out to where it was — unless it was
  closed by Escape, when the world gets the keys back (the next Space is the
  world's, not 📜 Menu's): focus goes to the world's stage (`data-keys-home`,
  the "The world" region, which owns no keys). A layer closing over another
  whose button went away (a level-up over the Library, a story over a talk)
  hands focus to the layer below (`refocusTopLayer`, #159 r2). `onEscape` gives a layer an Escape: heard on the
  page while it's the top layer, and focus is pulled back in when the focused
  button unmounts or disables, so Escape never goes dead (#110o, #159 r1).
  Escape does only what the layer's own way out does — never answers, takes
  a quest or skips a story beat. Nothing else
  sets `inert`: the top bar is live exactly when no layer is up, as on a
  Spire floor. KaPlay's canvas is never focusable (`WorldCanvas` strips its
  `tabindex`; keys are read from `window`). New overlays go in a
  `ModalLayer` too.
  **Field spells** (#75 item 9, `content/fieldSpells.ts`): a shrine keeper
  (`NpcRole` `keeper` → service `trial`, `ShrineTrial`) teaches one by 3 right
  answers; the menu's ✨ Field spells (`FieldSpellsPanel`) casts them through
  `WorldScreen.castFieldSpell`: **Return** sets `travelRef`, which the canvas
  loop takes once the world runs again (fade + `onExit`); **Glow** sets
  `lit:<zone>` in a dark place (`ZoneDef.dark`: a small circle of light and
  `pitch` rects that block like fog until lit; a 🔆 HUD button appears there);
  **Calm** fills `calmRef` (seconds, counted down by the canvas while the world
  runs) — critters fade and don't start battles, bosses still do; when it
  wears off, `CALM_GRACE` (1.5 s) of cooldown: a critter the hero is standing
  in lets them step away from it — walking on into it fights. Arriving
  anywhere sets `visited:<zone>`.
  **Dungeons** (#75 item 10, `content/dungeons.ts`): a floor is an ordinary
  `dungeon` zone (saves your place, critters, chests, NPCs, maybe bigger than
  a screen, maybe `dark` — `dark.dim` makes it dim rather than black); stairs
  `>` (down) / `<` (up) are exits inside the map, so moving floors fades like
  a place and needs nothing special from the canvas (it just draws the stairs
  sprite). The HUD reads "B2 — The Gear Halls" (like the Spire's "Floor 2 — …");
  routes say "take the stairs down to …", a run of them "down two floors to …".
  The Spire numbers its floors the same way (`spireFloorTitle`)
  but its trial floors stay `SpireOverlay`'s (ISSUES #103).
  **Inns** (#75 item 11): every town in `RETURN_TOWNS` has exactly one
  building with `sign: 'inn'` (`innOf`) and its innkeeper inside. Resting
  (`ServiceOverlay` → Inn) sets `lastRest` to that town; a defeat — battle or
  Spire — goes through `wakeAfterDefeat` (`lib/save.ts`): that inn's
  `innWakeCell` (the floor just inside its door), or home (`HUB_ZONE`, saved
  start) when `lastRest` is null. `wakeInnName` words it for the defeat screens.
  **Reachability** (#75 item 14b, `lib/reach.ts`): one search answers every
  "can the hero get there?" — `reach(z, opts)` walks 4-way over (cell, travel
  mode) from the spawn (or `from`): on foot over walkable tiles, afloat over
  open sea, climbing into the boat only at its mooring (`boat`) and going
  ashore on a beach or dock; fog and pitch dark block unless lifted / lit
  (`flags`, default `{}`; `null` ignores both); gates closed / open / by
  `gate:` flag / per gate; `exits: 'stop'` makes exits and linked sea edges
  end points; `passable` / `blocked` override tiles and cells. `reachPath`
  gives the shortest steps (with modes), `touches` asks "is a cell beside it
  reached?" (bump targets). `behindFog` and `safeSpawn` live there too —
  `safeSpawn` now also steps a save off an exit cell onto open floor beside
  it. Don't write another BFS over a zone's tiles: use these.
  **Flying on Ember** (#75 item 15b): once the Crystal of Memory is restored
  (`canFly`), an overworld map's HUD has 🐉 Fly / 🛬 Land (or `F`); the canvas
  flies at 2.5× over any tile and fog, passes people, critters, exits, places
  and secrets, lands on open ground (`LANDABLE_CHARS`) under the hero or a
  step away (`landingCell`), and crosses any linked edge (`edgeCrossing`);
  `safeSpawn(…, 'ember')` keeps a flying hero where they are on such a map.
  The **Dragon's Roost** (`PlaceDef.byAir`) is a place only Ember reaches.
  **Taleshore** (#75 item 15c), the far continent, is the next overworld east
  of the Silver Shallows (`seaLinks`): the Great Fogbank covers the Shallows'
  whole east edge, so no boat crosses — only Ember. Its harbor town, **Port
  Lantern** (a Return town, the `harbor` style, a quest board `port-board`),
  is where Act III opens (`ACT3_PANELS`, `ACT3_SEEN`); its map plays the
  `starfall` sea loop (`seaAreaAt` → `starfall-sea`). **Taleshore I** (#75
  item 15d): a road south to Driftwood Shallows; the Wayfinder Isles and Gale
  Atoll are islands only Ember reaches (`byAir`); the Compass Golem gives the
  First Chorus Key (`chorus-a`, `unlocksZone: null` + `opens` until Chorus
  Isle, 15g); Juno's walk reuses the escort step. **Taleshore II** (#75 item
  15e): the Story Reef up a road north, Inkwell Cove east off it; the Riddle
  Leviathan gives the Second Chorus Key (`chorus-b`); Yarn's tale-stones are
  a **riddle step** (`riddleStep`): talked to on its turn, a thing asks a
  question (`PathTarget.kind: 'riddle'`, opened from the dialogue), and the
  right answer finishes the step and says where the next one is. **Taleshore III** (#75 item 15f): Songstone Cliffs
  and the Quiet Quarter; Reso's songstones are **song steps** (`songStep`):
  talk steps in order, and one struck out of turn is a wrong note that un-does
  them all (no timers, roadmap decision 14). **Chorus Isle** (#75 item 15g):
  Act III's crystal zone, an island only Ember reaches; its Fiend's gate takes
  **both** Chorus Keys (`keysForZone`, `holdsKeysFor`; `keyForZone` is the
  first). Six crystals make Ember **radiant** (`emberGrown`: dragon or
  radiant), and Voices thins the Great Fogbank, so boats cross.
  **Chartmaker's Rest** (#75 item 15h): Act III's last place, an island off
  Taleshore with no critters. The Blank Chart quest waits for Voices; on
  completion `QuestDef.grants` keeps the Blank Chart in the bag and sets
  `blank-chart-held` — the flag Act IV checks (check the flag, not the item) —
  then `CHART_PANELS` play (`chart-seen`). The 🚩 visits him after Voices.
  **The Dream Root Door** (#75 item 16a): Act IV opens on the Spire's grounds
  with the Blank Chart (`ACT4_PANELS`, `act4-seen`), lifting a knot of old fog
  off stairs down to the Door — the first floor of the `dream-root` dungeon,
  which starts down a place's stairs (`DungeonDef.from`). Keeper Aurora keeps
  its inn, the Lamplight Rest (also its shelter; not a Return town —
  `INN_ONLY`). **Say Her Name** (Wisp): five memories, then `name-learned`
  (only Umbra's name question will check it) and Wisp's new face
  (`WorldNpcDef.face`, `npcSpriteId(def, flags)`).
  **Lumina-That-Was** (#75 item 16b): below the Door, the old Field, the old
  Village and the First Classroom — mixed-topic zones (`ZoneDef.topics`:
  chests and gates take `topicAt(z, x, y)`; a riddle its
  step's own `topic` first, `riddleTopic`), memories of real places
  (`echoOf` lets them build in that place's style), and a defeat there wakes
  you at the Door (`shelterIn`). A quest can end on a choice
  (`QuestDef.choice`, the Unnamed Dog's name) and give a badge
  (`grants.badge`, `QUEST_BADGES`).
  **Aster's Garden and the Nameless Hall** (#75 item 16c): below Old Lumina
  Field, her garden (mixed topics, sheltered at the Door) — the Gardener, a
  warden in the hedge's one gap, gives **Aster's Key**; the Hall's blank
  plaques (`NAMELESS_PANELS`) and its key gate (a key gate needs no topic) to
  the deepest root and the stairs beside it.
  **The Deep Root** (#75 item 16d): seven floors down (`deep-root`, `from:
  'nameless-hall'`), echoes of three wardens (`role: 'echo'`) on B2, B4 and
  B6, Umbra's taunt once a floor (`DESCENT_TAUNTS`), Glimmer's Nook on B1 and
  Glim's Nook on B4 (a defeat on B1–B3 / B4–B7 wakes you there), the Root's Heart at the bottom
  (`root-heart-reached`); the 🚩's `boss` goal kind.
  **The Name** (#75 item 16e): Umbra Remembered steps out of the Root's
  Heart (role `finale` → service `name`, `NameFinale`): the Spire's question
  gauntlet (`lib/gauntlet.ts`, `Candles`) of five topics, then "What was my
  name?" — "Aster" sets `umbra-named` (`namePanels`, `POST_CREDITS_PANELS`;
  its XP waits in `finaleStore` until they end); Sage Aster stands in the
  Hall of Names after (the 🚩's "Visit Sage Aster").
  **The epilogue** (#75 item 16f): every placed person has a line once
  `umbra-named` is set (`content/epilogue/`, said last, after their usual
  lines, and once any quest of theirs is done; `epilogue.test` guards it, so a
  new person needs one), and `fullJourney()` plays every act's journey back to
  back from a new save to "Explore".
  **The sea** (#75 item 14): travel modes are `foot` / `boat`
  (`lib/travel.ts`: `passable`, `canLand`, `BOAT_SPEED` 1.5×). The boat
  sails open sea ('~') only and goes ashore at a beach (':') or a dock ('|',
  new legend char: planks over water). Maps join at sea through
  `ZoneDef.seaLinks` (an edge, the map beyond, a row shift; every link has its
  mirror): sailing off a linked edge slides onto the next map one cell in
  (`seaCrossing`). `WorldCanvas` takes `boat` (its mooring) and `aboard`:
  bump the water by the moored boat to climb in (`onBoard`; from beside it,
  corners too — `canBoard`), sail into a beach or dock to go ashore with the
  boat moored edge to edge with that shore (`onLand`, `landingMooring` — never
  only corner to corner, where nobody could climb back in); collision is
  boat-aware (`heroHit` / `blockerAt(…, afloat)`), and the boat is two
  sprites — under the hero, and its hull's front over them. Return leaves the
  boat moored where it was (`moorBoat`), a battle lost at sea sends it home to
  his dock (`boatAfterDefeat`, #75 item 14d); Old Marlow offers
  to row it home (a ⛵ Row her home button) when it's away from his dock. A
  boat only floats on open sea of a sea-linked map outside standing fog
  (`afloatAt`); a hero saved aboard anywhere else loads on the nearest open
  sea, or ashore with the boat beside them (`normalizeSave`, `safeSpawn`).
  The menu map draws whichever overworld you're on, its landmarks
  (`ZoneDef.landmarks` — named spots that aren't places), "◀ Dawnreach"-style
  markers on its sea edges, ⛵ where the boat is moored (or a line saying
  which map it's on), and the Great Fogbank (a bank no boat passes, lifted
  only in Act III) with its own line. Each sea area has its own music
  (`seaAreaAt` in `boat.ts` → `SEA_TRACK` in `lib/audio.ts`, which wins over
  the zone kind's track): a shanty while sailing Dawnreach's waters, the
  Silver Shallows' theme anywhere on that map, a misty loop near the Great
  Fogbank while it stands (in at `FOGBANK_NEAR`, out past `FOGBANK_LEAVE`).
  **Sea critters** (#75 item 14d): an enemy lives on land or at sea
  (`EnemyDef.habitat`, carried onto `BattleEnemy`; missing = land). A sea
  critter wanders open sea only (`attachWander`'s `afloat` — its box through
  `hitBox(…, afloat)`, so never land, fog or off the map), with a faint ripple
  under it; each critter fights only a hero in its own element — sailing for a
  sea critter, on foot for a land one, bosses too (`meetsHero`, `lib/travel.ts`,
  checked in the canvas's contact loop through `lib/encounter.ts`'s
  `startsBattle`, with Calm). Every enemy that could reach a hero standing
  where a scene starts, and could fight them as they're getting about
  (`idleReach`: a critter's leash + its touch, a boss's touch), rests — asked
  again on landing or climbing aboard, for the new way of getting about. A
  critter falls asleep: it holds still, drawn a little faded (`SLEEP_OPACITY`,
  less than Calm's), its level hidden, with a little "z" and "Z" rising from
  its head and fading on a loop (held still under reduced motion), drawn
  over the hero and the boat — by the way up (up-right, up-left, straight up,
  out to a side) that reads most surely as its own as it falls asleep
  (`lib/sleepMark.ts` `zzPath`, by `markCost`: covering a boss — or coming
  within `BOSS_MARGIN` (8 px) of it — worst, then anyone else, a roof, the
  lighthouse or the map's edge (`edgeBoxes`), then the hero — each of those
  outweighing all that follows, however much adds up — then, added up, where
  an awake critter roams (`patchBox`), Ember's spot, the room round the hero,
  coming near anything (a twentieth of covering it) and a letter nearer
  someone else's face (an awake critter's double, `FOE_FACE`); a sleeper's
  hidden level counts for nothing; ways away from the hero first — tested on
  every map, with the hero anywhere within reach, on a cell or between, on
  foot or sailing),
  fading right down while they cross anyone or come nearer anyone's face than
  their sleeper's — hidden by an awake critter's or a boss's, eased so a
  passer-by doesn't make them flicker — and hidden with the hero (or the boat)
  on it; as a scene starts, or on landing or boarding, Ember sits on a
  sleeper's far side (or a side: on ground she can stand on, outdoors, her box
  off anyone's face or shown label; else the first of those off the sleeper at
  least — never on it — `emberSpot`), and the letters are planned round her
  spot. Like Calm it lets the hero
  pass — heading towards one says, once a session (`battleStore`, so sign-out
  resets it), "💤 Sleepy critters let you pass. They wake up when you move
  away." (`onSleeper`; with another toast up, the next time; it counts once
  it's been up 2.5 s, so a battle cutting it short leaves it to say again) —
  until they've left its patch; then it
  can't touch them unless they steer back (`standDown` / `restOf` /
  `staysDown`, checked every frame). A boss is drawn as ever — it never lets
  the hero past: it only holds back while they stand still, back away or step
  aside, and fights the moment they head past it (measured along the line
  from it to where they began). So a Flee, a reload, an arrival or a landing
  never drops the hero straight into a fight. One frame's meeting with an
  enemy is `meetFoe` (`lib/encounter.ts`, table-tested): a bump's cooldown
  (`arm`: a menu closed, a chest, the save crystal, a landing, Calm wearing
  off — never shortening one already running) spares only `spared` critters
  — those touching the hero as it's armed (`graceOf`) and any that comes onto
  a hero standing still (not moved this frame) while they're `guard`ed (the
  cooldown, or 3 s after saving, as long as "💎 Game saved!") — each while
  the hero stands or steps away, until it steps clear; walking into one
  fights, and a boss is never spared (#114t: the cooldown used to let the
  hero walk through anything, bosses too); and none fights in the two frames
  after a cooldown is armed, while its menu or talk takes the world's pause. The Silver Shallows has three (Bubble
  Puffer, Inkling, Starfix — nature, tier 5 since 14c), placed by
  `seaCritters.test`'s rules: a 5×5 leash square of open sea, 3+ cells from any
  land or the edge a boat sails in by. A battle at sea is fought over
  open water (`battleBackdrop(zone, 'sea')` → `/backgrounds/<zone>-sea.png`,
  `tiles.sea_backdrop`) from Marlow's boat (`BattleStage`'s `afloat`: the boat
  behind hero and companion, its hull's front over their feet, the companion
  on deck (`DECK_LIFT`), all decorative; `SeaFloor` keeps water under their
  feet down the whole screen, however much the menu squeezes the stage);
  losing one sends the boat home to Marlow's dock (`boatAfterDefeat`) and the
  defeat screen says so (in place of its 💡 tip, so the button fits a 320 px
  phone).
  Zone ids from a save are checked with `isZoneId` (own keys of `ZONES` —
  never `in`, which lets `constructor` through). A zone can have a
  lighthouse (`ZoneDef.lighthouse`: the 2×2 rock it stands on): the canvas
  draws the tower two tiles taller than the rock, over characters but under
  roofs, its lamp pulsing and two beams sweeping round.
  **After the Spire** (#75 item 14): once the Spire's own "🌟 See how it
  ends" closes the climb (`spireVictoryDue` waits for `overlay !== 'spire'`),
  the finale (`spireVictoryPanels`) runs straight into `HOMECOMING_PANELS` —
  picture panels (`StoryPanel.scene`, drawn by `components/StoryScene` from
  the game's own backdrops and sprites) that fade in and out through black —
  then `WorldScreen` puts the hero to bed at the Sleepy Sheep Inn
  (`restAtHomeInn`, `lib/save.ts`; saved at once) under the dark, `WakeFade`
  says "The next morning…" and brings the morning in, holding it
  `MORNING_MS` (the world stays paused; a hero who arrives indoors finds that
  roof already off), and `ACT2_PANELS` follow (`act2Due` waits for `waking`
  to end). A save between the finale and Act II always loads asleep at that
  inn (`normalizeSave`). `StoryPanels` ignores a tap until the panel on
  screen has faded in, and it and `WakeFade` make the rest of the page
  `inert` while they're up (`hooks/useInertOutside`).
