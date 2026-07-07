# Hazel Quest — Expansion Bible (Acts II–IV)

The complete content specification for the 4× expansion. Companion to
`STORY.md` (Act I bible — tone rules, voice formulas, flag conventions all
still apply) and `ROADMAP-4X.md` (delivery waves). Everything here follows
the shipped patterns: Sage + quest-giver + merchant per crystal zone, warden
keys named for their destination, one joke per villager, Fiends who concede
the theme, failure that never punishes.

---

## 1. The expansion in one breath

Umbra falls at the top of the Spire — and the world **remembers**. Remembered
places wake up (Act II: the Crystal of Memory). A full-grown Ember carries
the hero across the sea to a continent that *never forgot* (Act III: the
Crystal of Voices). And the returning memories finally answer the real
question: the fog was never an attack. Umbra was **Aster, Lumina's first
Sage**, who collected every question nobody could answer until the world,
tired of hard questions, forgot them. The finale is not a bigger battle — it
is answering the one question that matters: *the Forgotten One's name*
(Act IV: The Name).

Thread that ties it together: **Wisp** (Whispering Woods, "made of
unanswered questions") has been a fragment of Aster since Act I.

## 2. Act map & how it hooks the shipped game

| Act | Trigger (existing flag) | New crystal | New topics | Zones added |
|---|---|---|---|---|
| I (shipped) | — | 4 crystals | 7 topics | 11 |
| II — The Crystal of Memory | `spire-cleared` | #5 Memory (history) | geography (extra) | +4 |
| III — The Starfall Sea | `crystal-history-restored` | #6 Voices (words) | words, music (words → crystal) | +10 |
| IV — The Name | `crystal-words-restored` | — (the Name) | all, remixed | +6 + Dream Root gauntlet |

Crystal-count-derived systems re-derive from `TOTAL_CRYSTALS = 6`:
Ember stages (see §8), Aegis unlock (≥1, unchanged), Spire seal (Act I seal
stays "first 4"; Acts gate on their trigger flags instead).

## 3. Topic & crystal registry after the expansion

| Topic | Kind | Crystal | Zone | Sage | Fiend |
|---|---|---|---|---|---|
| math | crystal (I) | Numbers | Numbria | Abacus | Null Fiend |
| science | crystal (I) | Nature | Verdara | Flora | Smog Fiend |
| engineering | crystal (I) | Gears | Gearfall | Cog | Rust Fiend |
| creativity | crystal (I) | Wonder | Chromaria | Muse | Gray Fiend |
| nature | extra | — | Woods, Grove | — | — |
| space | extra | — | Coast | — | — |
| **history** | **crystal (II)** | **Memory** | **Sunken Archive** | **Chronicle** | **Hollow Fiend** |
| **geography** | extra (II) | — | Wayfinder Isles | — | — |
| **words** | **crystal (III)** | **Voices** | **Chorus Isle** | **Aria** | **Hush Fiend** |
| **music** | extra (III) | — | Songstone Cliffs | — | — |

Ten topics total. Every new topic ships with: edge-function persona line
(table-driven after Wave 0), fun-facts pool entry, button/sky/ground styling.

---

## 4. ACT II — The Crystal of Memory

**Premise.** The morning after the Spire, the fog is gone — and the world
starts remembering things it forgot it had lost. A road out of Moonwell
Grove that was never there before leads to places the maps don't show.
Grandmother Wick: "We didn't lose them, little spark. We *forgot* them.
That's worse, and it's fixable."

**Act II opening cutscene** (`ACT2_PANELS`, 5 panels, flag `act2-seen`,
plays on first world entry with `spire-cleared`): the fog lifts → villagers
remembering (Poppy remembers a recipe, Sol remembers a sixth lantern) → the
old road appears → Wick's line → call to the Archive.

### Zones (4)

| Zone (id) | Topic | Role | Notes |
|---|---|---|---|
| Remembrance Hill (`remembrance-hill`) | — (safe) | Act II crossroads off Moonwell Grove | Hall of Names monument — one plaque per restored crystal; combat-free like the Village |
| Eldergrove (`eldergrove`) | history | warden zone | trees with memory-rings; gate + riddle-chest + 3 critters + **Ringkeeper** warden → **Memoria Key** |
| Foglight Marsh (`foglight-marsh`) | history | combat/explore | where the last of the fog pooled; optional mini-boss **the Last Fogbank** (trophy badge, no key) |
| The Sunken Archive (`sunken-archive`) | history | **crystal zone** | a great library the world forgot; keyGate (Memoria Key) → **Hollow Fiend**; Sage Chronicle; save crystal |

### Cast (12 new NPCs)

| Zone | NPC | Role | Hook / joke |
|---|---|---|---|
| Remembrance Hill | Keeper Mnem 🗿 | villager (elder) | reads the Hall of Names; "I never forget a face. Names, ALWAYS. Faces, never." |
| Remembrance Hill | Posy 👧 | villager | leaves flowers for names nobody claims; quest-giver (escort) |
| Remembrance Hill | Trader Knack 🧳 | merchant | sells "pre-remembered" goods; "Lightly forgotten. Deep discount." |
| Eldergrove | Old Ringwood 🌳 | villager (talking tree) | counts its own rings and loses count at 900; warns of the Ringkeeper (signpost pattern) |
| Eldergrove | Fen the Forager 🧺 | villager | quest-giver (collection); "I remember where I hid my acorns. All 4,000. Roughly." |
| Eldergrove | Moss 🐢 | flavor critter-friend | ambient one-liners; slowest wanderer in the game (tuning joke) |
| Foglight Marsh | Lightkeeper Brume 🏮 | villager | keeps the marsh lanterns; "The fog and I had an arrangement. It left." |
| Foglight Marsh | Puddle 🐸 | flavor | remembers being a tadpole "like it was yesterday. It was yesterday." |
| Foglight Marsh | Ferryman Slosh ⛵ | merchant | poles a raft-shop; stocks potions |
| Sunken Archive | **Sage Chronicle** 🦉 | sage | teaches **Time Ripple**; speaks in footnotes ("see also: bravery") |
| Sunken Archive | Index 🐭 | villager | quest-giver (delivery); a mouse who alphabetizes everything, including her sneezes |
| Sunken Archive | Binder 📚 | innkeeper | beds between the stacks; "Quietest inn in Lumina. The books insist." |

**Reactive-dialogue pass (existing zones):** every hub/village NPC gains one
`ifFlag: 'act2-seen'` "now I remember…" line; Elder Lumen and Wick begin the
Aster breadcrumbs (`met-mnem` → Wick: "The first Sage? Oh, spark… nobody
remembers the first Sage. Not even me. *Especially* me."). Wisp's dialogue
turns strange and important: "I feel… alphabetized. Something is remembering
ME."

### Enemies (8 new defs)

| Zone | Critters (−1 / 0 / +1) | Behavior archetype (Wave 0.5) |
|---|---|---|
| Eldergrove | Ring Beetle 🪲 / Sap Sprite ✨ / Hollow Acorn 🌰 | Hollow Acorn is **shielded** (Guard first) |
| Foglight Marsh | Mist Newt 🦎 / Bog Lantern 🏮 / Murk Toad 🐸 | Bog Lantern is a **trickster** (decoy options) |
| Sunken Archive | Dust Tome 📖 / Ink Wisp 🖋️ / Quill Imp 🪶 | Quill Imp is **swift** (timed answers) |

**Bosses:**
- **The Ringkeeper** 🦌🌳 (Eldergrove warden, `levelOffset +1`) → **Memoria
  Key** + trophy. Signpost: Old Ringwood. Intro: "Every ring is a year, and
  every year is MINE." Defeat: "…take the key. Some years are meant to be
  given away."
- **The Last Fogbank** ☁️ (Marsh mini-boss, optional) → **Foglight Badge**.
  A leftover puddle of fog with stage fright.
- **The Hollow Fiend** 🕳️ (Archive, crystal Fiend) — a Fiend-shaped *absence*;
  an old hand of Umbra that never got the news. Voice formula: (1) sneer:
  "The master fell? Then I shall hoard what's left — the BEFORE-TIMES!";
  (2) "I am the Hollow Fiend! I ate the day before yesterday!"; defeat
  concession: "You… remembered me. That's… nobody ever…" (restores the
  **Crystal of Memory**, flag `crystal-history-restored`).

### Quests (4 new)

| Quest (id) | Giver | Mechanic | Reward |
|---|---|---|---|
| The Flower for No Name (`flower-noname`) | Posy | **escort** (new): walk Posy from the Hill to the Hall through the Marsh; she stops when enemies are near | 35c + potion |
| Fen's Forgotten Acorns (`fen-acorns`) | Fen | **collection** (new): 3 riddle-chests across Eldergrove, hints chain | 35c + hint |
| A Letter, Long Overdue (`archive-letter`) | Index | delivery: carry an unsent letter from the Archive to Grandmother Wick (cross-act nostalgia beat) | 40c + potion |
| The Lantern Ledger (`marsh-lanterns`) | Brume | multi-step: chest → light 3 lanterns (talk-steps) → report | 35c + hint |

### Cutscenes & flags (Act II adds ~23 panels)

`ACT2_PANELS` 5 · `CRYSTAL_PANELS.history` 3 (omen panel now whispers the
word "Aster" without explanation) · Ringkeeper key beat 2 · Hall of Names
dedication 3 · Wisp "remembering me" beat 2 · Archive discovery 3 · escort
quest ending 2 · misc reactive 3.
New flags: `act2-seen`, `met-mnem`, `met-chronicle`, `key-memoria`,
`crystal-history-restored`, `crystal-history-scene-seen`, `fogbank-cleared`,
`wisp-stirring`.

---

## 5. ACT III — The Starfall Sea

**Premise.** With five crystals lit, Ember spreads full wings: the hero can
**fly**. Across the sea — where Old Marlow's fish went, where Vela's stars
point — is a continent the fog never touched, because its people never
stopped telling the stories. They remember Umbra's name… but it's *rude to
say a name its owner lost*. They'll teach the hero how to earn it.

**Act III opening** (`ACT3_PANELS`, 5 panels, flag `act3-seen`): Ember's
wings → the flight (world-map reveal) → landfall at Port Lantern → "you're
the child who out-remembered the Forgotten One" → the custom of the name.

**Travel:** world-map flight screen (Ember as vehicle); fast-travel to any
save crystal once visited. Flag `flight-unlocked` at `crystal-history-restored`.

### Zones (10)

| Zone (id) | Topic | Role |
|---|---|---|
| Port Lantern (`port-lantern`) | — (safe) | harbor hub; inn, shop, library; Act III quest board |
| Driftwood Shallows (`driftwood-shallows`) | geography | combat/explore, gate + chest |
| The Wayfinder Isles (`wayfinder-isles`) | geography | warden zone → **Compass Golem** → **Chorus Key A** |
| Gale Atoll (`gale-atoll`) | geography | combat/explore; windy — wanderers drift (flavor) |
| The Story Reef (`story-reef`) | words | combat/explore, gate + chest |
| Inkwell Cove (`inkwell-cove`) | words | warden zone → **Riddle Leviathan** → **Chorus Key B** |
| Songstone Cliffs (`songstone-cliffs`) | music | combat/explore; echo gimmick in dialogue |
| The Quiet Quarter (`quiet-quarter`) | words | combat/explore; where the Hush Fiend's silence pools |
| Chorus Isle (`chorus-isle`) | words | **crystal zone**; double keyGate (both Chorus Keys) → **Hush Fiend**; Sage Aria; save crystal |
| Chartmaker's Rest (`chartmakers-rest`) | — (safe) | story zone; the Chartmaker knows every place's name but one |

The Hush Fiend's gate has **two locks** — the first double-key gate
(escalation of the shipped keyGate pattern).

### Cast (30 new NPCs — 3 per zone)

Compact roster (role / hook):

- **Port Lantern:** Harbormaster Gale ⚓ (elder; "I've never lost a ship.
  Misplaced, yes."), Skipper Juno 🧭 (quest-giver, escort-by-sea), Chandler
  Wick-Wax 🕯️ (merchant, distant cousin of Grandmother Wick — both deny it).
- **Driftwood Shallows:** Beachcomber Reel 🎣, Sandy 🦀 (flavor; sidles
  sideways), Salt the Younger 🧂 (quest-giver, collection).
- **Wayfinder Isles:** Cartographer Lo 🗺️ (signpost for the Golem), Pebble
  🐧 (flavor; walks in perfect grid lines), Drift 🪁 (quest-giver).
- **Gale Atoll:** Windkeeper Sough 🌬️, Gully 🕊️ (flavor), Kite-Maker Tass 🪁
  (merchant).
- **Story Reef:** Tale-Fisher Yarn 🎏 (quest-giver, puzzle-chain), Bloop 🐠
  (flavor; narrates itself in third person), Verse 🧜 (villager; rhymes until
  asked to stop, can't).
- **Inkwell Cove:** Scrivener Dot ✒️ (signpost for the Leviathan), Smudge 🦑
  (flavor), Barnacle Bess 🐚 (merchant).
- **Songstone Cliffs:** Choir-Mistress Reso 🎶 (quest-giver, timed-lantern
  variant: ring 3 songstones), Echo-of-Echo 🗿 (flavor; repeats the LAST word
  word), Hum 🐝 (flavor).
- **Quiet Quarter:** Librarian Shush 🤫 (mirror of hub Librarian Sage; they
  pen-pal), Mime 🎭 (flavor; "speaks" in emoji-only text boxes — one authored
  gag), Whisper-Monger Sotto 🗣️ (merchant; sells secrets, mostly recipes).
- **Chorus Isle:** **Sage Aria** 🎼 (teaches **Chorus Call**; speaks in
  song-fragments), Coda 👧 (quest-giver; collecting the island's lost
  refrains), Maestro Brio 🎻 (innkeeper; "rest is a note too").
- **Chartmaker's Rest:** the Chartmaker 🧓 (has mapped everything except one
  name — hands the hero the **Blank Chart**, Act IV's key item), Pen 🐦
  (flavor), Inka 👩‍🎨 (villager).

### Enemies (21 new defs)

Three critters per combat zone (7 zones), each zone including one Wave-0.5
behavior archetype:

| Zone | Critters | Archetype |
|---|---|---|
| Driftwood Shallows | Compass Crab 🦀 / Gull Scout 🕊️ / Tide Snail 🐌 | shielded (Tide Snail) |
| Wayfinder Isles | Marker Post 🚩 / Latitude Cat 🐈 / Globe Beetle 🪲 | trickster |
| Gale Atoll | Zephyr Pup 🌬️ / Kite Ray 🪁 / Squall Chick 🐤 | swift |
| Story Reef | Word Eel 🐍 / Riddle Jelly 🪼 / Page Ray 📄 | trickster |
| Inkwell Cove | Blot 🖋️ / Cuttle-Scribe 🦑 / Margin Shrimp 🦐 | healer pack (Cuttle-Scribe) |
| Songstone Cliffs | Echo Bat 🦇 / Chime Gull 🔔 / Drum Crab 🥁 | swift |
| Quiet Quarter | Hushling 🤫 / Muffle Moth 🦋 / Blank Sprite ⬜ | shielded |

**Bosses:**
- **The Compass Golem** 🧭🗿 (Wayfinder warden) → **Chorus Key A**. Intro:
  "All directions lead to ME." Defeat: "…north was… that way… all along."
- **The Riddle Leviathan** 🐋 (Inkwell warden) → **Chorus Key B**. Speaks
  only in riddles, including its own defeat line ("What has been beaten,
  yet feels lighter? …me").
- **The Hush Fiend** 🔇 (Chorus Isle, crystal Fiend) — drank the continent's
  out-loud voices; people here still remember, but silently. Intro sneer
  name-drops Ember's roar; crime: "I am the Hush Fiend! I shushed the sea!"
  Defeat concession: "…say it, then. Say everything. Out loud…" — restores
  the **Crystal of Voices** (`crystal-words-restored`). Omen panel: the 🌑
  is *absent* — instead, a small voice: "she used to sing to us. the first
  sage. before you forgot her." **(Pronoun reveal: Aster was a she.)**

### Quests (8 new)

| Quest (id) | Giver | Mechanic | Reward |
|---|---|---|---|
| Ferry the Fretful (`juno-ferry`) | Skipper Juno | escort across Shallows | 40c + potion |
| Salt's Sea-Glass Set (`salt-seaglass`) | Salt the Younger | collection (3 chests, 2 zones) | 40c + hint |
| The Unfinished Map (`drift-map`) | Drift | cross-zone defeat (one critter per Isle zone) | 45c + potion |
| Yarn's Tallest Tale (`yarn-tale`) | Tale-Fisher Yarn | **puzzle chain** (new): 3 ordered riddle-gates, each hint from the last answer | 45c + hint |
| Ring the Songstones (`reso-songstones`) | Choir-Mistress Reso | **timed-gentle** (new): ring 3 stones while the song lasts; failing just restarts the song, cheerfully | 45c + potion |
| The Pen-Pal Papers (`shush-letters`) | Librarian Shush | delivery to hub Librarian Sage (cross-continent!) | 50c + hint |
| Coda's Lost Refrains (`coda-refrains`) | Coda | collection + talk-steps (each refrain sung back) | 45c + potion |
| The Blank Chart (`blank-chart`) | the Chartmaker | multi-step story quest → unlocks Act IV | Blank Chart (key item) |

### Economy 4× (lands with Act III)

| Item | Type | Effect |
|---|---|---|
| Berry Potion (existing) | consumable | heal 50 |
| Moonberry Potion | consumable | heal 100 |
| Hint Feather (existing) | consumable | remove a wrong option |
| Lucky Plume | consumable | hint that persists the whole battle |
| Anchor Charm | charm (equip 1) | +defense (Iron Guard-shape bonus) |
| Quill Charm | charm | +XP per correct |
| Compass Charm | charm | +coin drops |
| Songstone Charm | charm | +1 starting charge ◆ in battle |
| Ember's Scarf 🧣 | cosmetic | Ember wears it on map + battle |
| Ember's Lantern 🏮 | cosmetic | Ember glows in dark zones |
| Star/Moon Badge (existing) | collectible | — |
| Tide, Ring, Chart, Chorus Badges | collectibles | one per Act II/III region |
| Room With a View | inn upgrade (Port Lantern) | inn rest also fills 1 charge |
| Recipe Secrets ×3 (Sotto) | fun items | pure dialogue/flavor payoffs |

Charms use the `power_ups` math shape (`effectiveStacks` capped), stored in
the save (v2), **one equipped at a time** — a choice, not a stat pile.

### Act III flags

`act3-seen`, `flight-unlocked`, `met-aria`, `key-chorus-a`, `key-chorus-b`,
`crystal-words-restored`, `crystal-words-scene-seen`, `blank-chart-held`,
per-quest flags per convention. ~35 new panels (opening 5, crystal 3,
2 warden beats 4, Chartmaker 4, flight tutorial 3, quest beats ~8, reactive ~8).

---

## 6. ACT IV — The Name of the Forgotten One

**Premise.** The Blank Chart shows one unmapped place: **under** the Crystal
Spire. The Dream Root — the tangle of everything Lumina chose to forget —
reaches down where the Spire reaches up. At its heart the hero walks
Lumina-That-Was: the world as it looked before the fog, when a first Sage
named **Aster** 🌼 answered every question in the land… until the questions
got too hard, and the people stopped asking, and stopped saying her name.
Wisp was the first thing she forgot she was.

**The rule of the finale:** Umbra is never fought to zero. The last "battle"
ends when the hero **answers the only question Umbra has left**: *"What was
my name?"* — answerable only if the testimony quest is done. Learning the
name IS the power. (Tone check: the saddest beat in the game must still
land warm — Aster isn't rescued by strength but by being remembered.)

### Zones (6) + the Dream Root gauntlet

| Zone (id) | Topic | Role |
|---|---|---|
| The Dream Root Door (`dreamroot-door`) | — (safe) | beneath-Spire antechamber; Keeper Aurora relocates here; final save crystal |
| Lumina-That-Was: the Field (`memory-field`) | mixed | echo of the hub, golden-hour palette; memory-NPCs |
| Lumina-That-Was: the Village (`memory-village`) | mixed | echo of Lumina Village; young Wick, young Lumen |
| The First Classroom (`first-classroom`) | mixed | where Aster taught; combat/explore + chest |
| Aster's Garden (`asters-garden`) | mixed | warden zone → **the Gardener** → **Aster's Key** |
| The Nameless Hall (`nameless-hall`) | — | finale stage; keyGate (Aster's Key) → the Dream Root descent |

**The Dream Root descent** (reuses the Spire-climb engine, descending):
7 floors, all 10 topics remixed, `SPIRE_LIVES`-style candle-lights.
Floors 2/4/6 are **Memory Wardens** — echo-fights of the Thicket Warden,
Tide Colossus, and Clockwork Titan ("the Root remembers your victories —
prove them again"). Floor 7: **Umbra Remembered** — a battle that ends at
the name question, not at 0 HP.

### Cast (11 new NPCs)

| Zone | NPC | Hook |
|---|---|---|
| Dream Root Door | Keeper Aurora 🔮 | relocated; her oldest lines finally pay off |
| Memory Field | Young Lumen 👦 | Elder Lumen as a boy; doesn't get why the hero smiles at him |
| Memory Field | The Popcorn Cart 🍿 | the popcorn machine's ancestor — the callback |
| Memory Field | First-Merchant Fair 🎪 | merchant (memory-goods; sells nothing, gives everything — it's a memory) |
| Memory Village | Young Wick 👧 | Grandmother Wick as a girl, mid-bread-burn (Bramble's joke inherited) |
| Memory Village | The Unnamed Dog 🐕 | flavor; every kid in old Lumina called it a different name; ambient lines are all of them |
| First Classroom | The Lesson Bell 🔔 | flavor; rings itself, apologizes |
| First Classroom | Monitor Prim 📏 | quest-giver (testimony quest step) |
| Aster's Garden | The Gardener 🌱 | warden + signpost in one; tends questions like seedlings; "some questions take years to bloom. Water them anyway." |
| Aster's Garden | Sprout 🌼 | flavor; a question seedling; says only "why?" |
| Nameless Hall | **Aster / Umbra** 🌼🌑 | the finale; post-game: the **sixth Sage** in the Hall of Names |

### The testimony quest — *Say Her Name* (`say-her-name`)

The act-long spine quest (giver: Wisp, who asks for help remembering what
it is). **Cross-world talk-steps** — gather five testimonies:
Grandmother Wick (Village) → Keeper Mnem (Hall of Names) → the Chartmaker
(Rest) → Sage Chronicle (Archive) → Young Wick (Memory Village). Each step
is a 2–3 line memory of the first Sage; the fifth reveals the name.
Completing it sets `name-learned` — the flag the finale checks. Reward:
**Wisp joins the party permanently** (see §7) and gains a face.

### Other Act IV quests (3)

| Quest | Giver | Mechanic | Reward |
|---|---|---|---|
| The Bell's Apology (`bell-apology`) | Monitor Prim | puzzle chain in the Classroom | 50c + Lucky Plume |
| A Garden Rewatered (`garden-water`) | the Gardener | collection (3 chests) + defeat 3 | 50c + potion |
| One More Name (`unnamed-dog`) | the Unnamed Dog | cross-zone: ask 3 memory-NPCs the dog's name (they all disagree); hero picks one — it sticks in the epilogue | Dog Badge 🐕 |

### Enemies (9 new defs + 4 echo-bosses)

| Zone | Critters | Archetype |
|---|---|---|
| Memory Field/Village | Faded Echo 👥 / Lost Sock Golem 🧦 / Misplaced Key 🔑 | trickster (the Key hides among decoys) |
| First Classroom | Chalk Wisp 🖍️ / Eraser Imp 🧽 / Sum Gremlin ➗ | swift |
| Aster's Garden | Thorn of Doubt 🌵 / Wilt Sprite 🥀 / Bramblewhy ❓ | healer pack |

Bosses: **the Gardener** (warden → Aster's Key), 3 **Memory Wardens**
(echo stats +2 levels, remixed intro lines), **Umbra Remembered** (finale).

### Finale & epilogue (~30 panels)

- `ACT4_PANELS` 5 (the door under the Spire) · descent floor taunts (Umbra's
  voice, softening floor by floor — from theatrical to just tired) ·
  `namePanels(heroName)` 6 — the name question, the answer, the unraveling
  into 🌼 · **epilogue pass**: every named NPC in all ~40 zones gets one
  `ifFlag: 'umbra-named'` ending line (the gratitude-flip system, world-wide)
  · post-credits 3: Aster teaching again in the First Classroom, Wisp beside
  her, the Hall of Names with no blank plaques. Door to NG+.

Flags: `act4-seen`, `name-learned`, `umbra-named` (replaces "beat Umbra
again" — the true-true ending flag), `dog-named-<choice>`, `wisp-joined`.

---

## 7. Companions (Wave 2 system, roster grows per act)

Party = hero + Ember + **one** companion (keeps battles readable for 7–11).
One companion action per turn cycle, no question required (they're helpers,
not the skill input — the kid's answers stay the only skill).

| Companion | Joins | Battle action (1×/battle unless noted) | Story voice |
|---|---|---|---|
| Pip 🧒 | Act II start (`act2-seen` + talk) | **Lucky Marble:** removes one wrong option | Ember superfan; narrates everything like a legend |
| Wisp 🧚 | end of *Say Her Name* | **Question-Light:** +1 charge ◆ when an answer is wrong (2×/battle) | remembering itself act by act |
| Vela 🔭 | Act III (`flight-unlocked` + her quest) | **Star Chart:** reveals the enemy's next intent | names stars after the hero's answers |
| Aster 🌼 | NG+ only | **The First Lesson:** one wrong answer counts as right (1×/battle) | the sixth Sage; gentle, asks the hero questions back |

Ember (all parties, from Wave 2): **Roar** — once per battle, stage-scaled
bonus damage on the next landed attack; full-grown adds flight on the map.

## 8. Ember stages re-derived (6 crystals)

| Stage | Trigger | Notes |
|---|---|---|
| 🥚 Egg | start | unchanged |
| 🐲 Hatchling | first victory | unchanged |
| 🐲 Whelp | 2 crystals | unchanged |
| 🐉 Dragon | 4 crystals | unchanged; **flight** unlocks at crystal #5 |
| ✨ Radiant | 6 crystals | new final stage; Ember's Breath upgrades to Radiant Breath (4.2×) |

Derived from `crystalCount / TOTAL_CRYSTALS` thresholds, not literals
(Wave 0.1).

## 9. Spell master list (7 → 15)

| Spell | Source | Unlock | Effect (cost ◆) |
|---|---|---|---|
| Mend | — | always | heal 60 (1) |
| Aegis | — | ≥1 crystal | shield + heal 25 (2) |
| Prime Burst / Photon Bloom / Gear Storm / Rainbow Riff | Sages I | meet Sage | 2.5× strike (2) |
| Ember's Breath | Ember | dragon stage | 3.6× (3) |
| **Time Ripple** | Sage Chronicle | meet (Act II) | 2.2× + skip the enemy's next turn (3) |
| **Chorus Call** | Sage Aria | meet (Act III) | 2.5× + refund 1 ◆ on a correct cast (2) |
| **Beacon** | Lighthouse quest (Act III) | quest reward | next 3 questions show one fewer wrong option (2) |
| **Second Wind** | Hall of Names (Act II) | dedication scene | once per battle: survive a KO at 1 HP (2) |
| **Starlight** | Vela (companion bond) | Vela joined | 3.0×, always available at night-themed zones flavor (3) |
| **Radiant Breath** | Ember | radiant stage | upgrades Ember's Breath, 4.2× (3) |
| **The First Lesson** | Aster | NG+ | convert one wrong answer to right (4) — spell twin of her companion action |

All new spells keep the shipped contract: cast = one super-hard question
(+3 levels), fizzle refunds the charge.

## 10. Master quest table (6 shipped + 19 new = 25)

Act I: counting-stones, firefly-defenders, golden-gear, color-seed,
pips-marble, grove-moonwell. Act II: flower-noname, fen-acorns,
archive-letter, marsh-lanterns. Act III: juno-ferry, salt-seaglass,
drift-map, yarn-tale, reso-songstones, shush-letters, coda-refrains,
blank-chart. Act IV: say-her-name, bell-apology, garden-water, unnamed-dog.
Plus 3 companion-join micro-quests (Pip, Vela, Wisp is quest-granted).
Mechanics coverage: chest, defeat, multi-step, delivery, cross-zone,
**escort, collection, puzzle-chain, timed-gentle, testimony** — every
mechanic used at least twice by Act IV.

## 11. Content totals check (vs. 4× targets)

| Dimension | Shipped | This bible adds | Total | Target |
|---|---|---|---|---|
| Zones | 11 | 20 (+ Dream Root gauntlet) | 31 + gauntlet | ~40 ✅ (side dungeons in Wave 4 close the gap) |
| NPCs | 33 | 53 + memory-echo variants | ~90–100 | ~120 (epilogue/NG+ variants close it) |
| Enemy defs | 28 | 38 + 4 echo-bosses | ~70 | ~100 (NG+ remixes are variants, not defs) |
| Bosses | 8 | 12 | 20 | ~28 (side-dungeon bosses in Wave 4) |
| Quests | 6 | 19 + 3 joins | 28 | ~25 ✅ |
| Panels | ~37 | ~110 | ~150 | ~150 ✅ |
| Spells | 7 | 8 | 15 | ~18 (NG+ variants) |
| Shop items | 4 | 16 | 20 | ~20 ✅ |
| Crystal topics | 4 | 2 | 6 | 6 ✅ |
| Topics | 7 | 3 | 10 | 10–12 ✅ |
| Companions | 0 | 4 (+ Ember mechanics) | 4 | 3–4 ✅ |

Remaining gap to 40 zones / 28 bosses is deliberately assigned to Wave 4's
optional side dungeons (2–3 mini-Spires, one boss + 2–3 zones each) so the
mainline acts stay tight.

## 12. Open decisions (flag before building)

1. **Charm system vs. more power-ups** — charms-as-equipment adds a menu
   surface; confirm it earns its UI weight for the age band.
2. **Timed mechanics** — `timed-gentle` and the *swift* archetype introduce
   soft timers; keep the "failing restarts cheerfully" rule everywhere or
   cut timers entirely if playtests show stress.
3. **Aster's name & gender** — placeholder creative choices; easy to change
   until Act III's omen ships (first pronoun reveal).
4. **Double-key gate** (Chorus Isle) — needs a small `keyGate` extension
   (array of key flags); confirm before Act III maps are drawn.
5. **Memory-echo NPCs** (young Wick/Lumen) — same `NpcDef` shape, new ids;
   decide whether echoes share sprite assets with their elders.
