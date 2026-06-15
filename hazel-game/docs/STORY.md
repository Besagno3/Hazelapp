# Hazel Quest — Story Bible

The narrative source of truth for the world of **Lumina** (#37 story pass).
All in-game text lives in `src/content/` (`story.ts`, `npcs.ts`, `quests.ts`);
this document is the guide for writing more of it consistently.

---

## 1. The world in one breath

Lumina runs on the light of four **Crystals of Knowing** — Numbers, Nature,
Gears, and Wonder. A **fog of Forgetting** rolled in; four **Fiends** drank
the crystal light and hid at the corners of the world. A kid from Lumina
Field — carrying **the last dragon egg** — sets out to restore the crystals.
Learning is literally the magic system: every answered question returns a
spark of light, and dragons grow on bravery and bright answers. When all four
crystals shine, their light gathers at the **Crystal Spire** at the heart of
the world and burns the fog away for good.

The world is **10 zones**: the Lumina Field hub, the four topic regions, and
five quieter **story zones** reached through the hero's home, **Lumina
Village** (Whispering Woods → Clockwork Depths, Starfall Coast, and the Crystal
Spire). The story zones have no Fiends — they carry the narrative, hold save
crystals, and let the world breathe between battles.

## 2. Tone & voice rules

One register for everyone (decided 2026-06-12): playful, warm, ~ages 7–11.

- **Short lines.** One thought per text box. No semicolons in dialogue.
- **Wonder over peril.** Danger is "the fog took the stars' names," never
  anything scary-scary. Fiends are grumpy hoarders, not horrors.
- **Failure is gentle, effort is praised.** Nobody mocks a wrong answer —
  not even Fiends (they gloat about *themselves*, not the player).
- **Humor beats:** every villager gets one joke ("VERY uncountable sheep",
  "popcorn machine is back in business").
- **Learning is heroic, never homework.** Words like *brave answer*,
  *bright idea*, *curiosity* — never *test*, *grade*, *study*.
- Villains get theatrical ALL-CAPS sparingly; kids' lines get exclamation
  marks; Sages speak in cozy metaphors.

## 3. The hero & Ember 🐲

**The hero** (player's avatar — Blaze/Shield/Nova) is a curious kid from
Lumina Field. Personal stake: on the morning the fog arrived, the hero found
**the last dragon egg of Lumina** — the one thing the fog couldn't touch.
The egg chose them; raising it is their quest as much as the crystals are.

**Ember, the last dragon** (companion, the heart of the story):

| Stage | Trigger | Map sprite | Story beat |
|---|---|---|---|
| 🥚 Egg | game start (intro scene) | bobs behind the hero | "Warm as a good idea" |
| 🐲 Hatchling | **first battle victory** (flag `ember-hatched`) | small, trails the hero | Hatch cutscene plays back in the world |
| 🐲 Young dragon (whelp) | 2 crystals restored | bigger | Pip feeds them crackers |
| 🐉 Full-grown | 4 crystals | biggest | Spreads wings in the ending |

Ember is in battles too (beside the hero, roars when a Special lands) and on
the HUD/menu. Mechanical effects (Ember abilities) are deliberately deferred
to phase 4 companions — Ember is pure story/affection for now, so the kid's
answers stay the only skill input.

## 4. Cast

**Hub (Lumina Field):** Elder Lumen 👴 (exposition, dragon lore), Pip 🧒
(tutorial hints, Ember superfan), Innkeeper Poppy 👩‍🍳, Librarian Sage 🦉,
Merchant Maple 🦝.

**Per zone — pattern: Sage (teacher) + Villager (quest giver) + Merchant:**

| Zone | Sage | Villager & quest | Fiend |
|---|---|---|---|
| Numbria (math) | Sage Abacus 🧙 — *Prime Burst* | Tally 👧 — *Tally's Counting Stones* | **The Null Fiend** 👹 — turned every number to zero |
| Verdara (science) | Sage Flora 🧝 — *Photon Bloom* | Fern 👦 — *Fern's Glow-Moss* | **The Smog Fiend** 🌫️ — fog where no one asks why |
| Gearfall (engineering) | Sage Cog 🧑‍🔧 — *Gear Storm* | Rivet 👷 — *Rivet's Golden Gear* | **The Rust Fiend** 🤖 — nothing turns, nothing gets fixed |
| Chromaria (creativity) | Sage Muse 🧚 — *Rainbow Riff* | Doodle 🧑‍🎨 — *Doodle's Color Seed* | **The Gray Fiend** 🌑 — drank the colors, hushed the songs |

**Expansion zones** — Lumina Village is combat-free; the three themed zones
(#55) have their own **question topic**, three roaming critters, a gatekeeper
gate and a riddle-chest (no Fiend/crystal/Sage — crystals stay the core four);
the Crystal Spire holds the endgame:

| Zone | Topic | Warden boss → unlocks | Cast |
|---|---|---|---|
| Lumina Village (home) | — (safe) | — | Grandmother Wick 👵 (gran, dragon lore), Bramble 🧑 (childhood friend, burns the bread), Lantern-Keeper Sol 🧓 (lanterns brighten per crystal) |
| Whispering Woods | 🦋 Nature & Animals | Thicket Warden 🦌 → Verdara | Hazel the Spellwright 🧙‍♀️ (explains the Spellbook), Wisp 🧚 (made of unanswered questions) |
| Starfall Coast | 🪐 Space | Tide Colossus 🐳 → Chromaria | Old Marlow 🎣 (the fish forgot the way home), Vela 🔭 (every star has a question for a name) |
| Clockwork Depths | ⏳ Time & History | Clockwork Titan 🦾 → Gearfall | Cricket 🐭 (gear-tender), Echo 🤖 (the last lantern-bot, everything comes back three times) |
| The Crystal Spire | endgame climb | — | Keeper Aurora 🔮 (kept the Spire since before the fog; reacts to crystals) + the Spire icon 🗼 |

**Warden keys (#58):** each themed zone's **warden boss** drops a **key** that
opens one Fiend's gate (Woods→Verdara, Coast→Chromaria, Depths→Gearfall). So
three of the four Fiends are locked behind a themed-zone challenge; **Math/
Numbria stays open** as the guaranteed first crystal. Bump a keyed Fiend gate
without the key and it names the warden to beat; with the key it grinds open.
Beating a warden gives the key + a trophy badge + boss XP.

**The hidden villain (#55):** **Umbra, the Forgotten One** — what was left when
the world chose to forget it. The four Fiends were only its hands. It is
revealed gradually: each crystal cutscene ends on a 🌑 omen panel (escalating
taunts from the Spire), and after all four crystals the "ending" becomes the
*call to climb the Spire*. Umbra is the final boss at the top of the climb.
Voice: ancient, tired, theatrical, oddly lonely — never cruel to the player;
on defeat it concedes the theme ("out-remembered… by a child…").

**Fiend voice formula** (`story.ts BOSS_LINES`): 2 intro boxes — (1) a sneer
that name-drops the egg/curiosity, (2) "I am the X Fiend!" + their crime —
then last words on defeat that *concede the theme* ("your answers… counted").

## 5. Structure

- **Act 0 — Training Grounds:** quiz rounds; no story yet (intentional —
  get to fun fast).
- **Opening cutscene** (`INTRO_PANELS`, plays on first world entry): world →
  fog → Fiends → the egg → call to adventure. 5 storybook panels.
- **Act 1 — first victory:** Ember hatches (cutscene on returning to the
  world). The world's reactivity teaches: villagers mention quests, the
  Elder comments on the egg/Ember.
- **Acts 2–5, any order (FF1-style open structure):** each zone = gate
  (question lock) → villager mini-quest (riddle-chest fetch) → Sage
  (spell added to the Spellbook) → Fiend (boss + crystal flag). Beating a
  Fiend plays a short **crystal-restored cutscene** (`CRYSTAL_PANELS[topic]`)
  back in the world; villager dialogue flips to a gratitude line.
- **The Spire wakes** (`SPIRE_PANELS`, after the FIRST crystal): introduces the
  Crystal Spire and Keeper Aurora — the convergence point and the new endgame
  destination, reached through Lumina Village.
- **Call to the Spire** (`endingPanels(heroName)`, at four crystals): the
  crystals return and the fog thins… but it pulls into one dark knot atop the
  Spire and Umbra calls the hero up. The Spire door (icon 🗼) opens.
- **The Spire climb** (`content/spire.ts`, `SpireOverlay`): a multi-floor
  question gauntlet, each floor harder and on different topics, candle-lights
  for mistakes, ending in the **Umbra** boss floor. Lose → cast back to the
  hub, healed (climb again any time). Win → the true finale.
- **True finale** (`spireVictoryPanels(heroName)`): Umbra unravels, Ember roars
  full-grown, Aurora bows, the hero is named as the reason — open door to New
  Game+ ("trickier riddles than ever").

**Magic — the Spellbook:** in battle the hero casts learned spells by
answering one *super-hard* question (3 levels above the enemy). Every hero
knows **Mend** (heal); each Sage adds a signature strike; **Aegis** (shield +
heal) unlocks at the first crystal; **Ember's Breath** (huge damage) unlocks
when Ember is full-grown. Spells cost charge (◆) filled by correct answers; a
miss fizzles harmlessly and refunds the charge — effort is never punished.

## 6. Quests (one per zone + one in the hub)

Quests are ordered **steps** over the save file (`quests.ts`, #42) — three
mechanics, each used at least once so every zone plays differently:

| Quest | Giver | Mechanic |
|---|---|---|
| Tally's Counting Stones (Numbria) | Tally 👧 | classic riddle-chest fetch |
| The Firefly Defenders (Verdara) | Fern 👦 | **defeat quest** — beat all three zone critters, any order; the hint names whoever's left |
| Rivet's Golden Gear (Gearfall) | Rivet 👷 | **multi-step** — chest → Sage Cog polishes it → report back |
| Doodle's Color Seed (Chromaria) | Doodle 🧑‍🎨 | **delivery** — carry the seed (shown in the menu) to Sage Muse, return |
| Pip's Lucky Marble (hub) | Pip 🧒 | **cross-zone defeat** — beat the Count Bat in Numbria |

Conversation shape: giver offers → giver reminds with the current step's
hint → step-target NPCs (Sage Cog, Sage Muse) speak their own step lines →
giver celebrates + reward. Completion works even if the kid did the deed
before hearing the offer. The menu shows a quest log (active quests +
current hint) and carried items. Flags: `quest:<id>:offered`,
`quest:<id>:done`, `quest-step:<stepId>`; kill counts live in `save.kills`.

## 7. Flag glossary

| Flag | Set by |
|---|---|
| `intro-seen` | finishing the opening cutscene |
| `met-elder` / `met-wick` / `met-hazel` / `met-aurora` | those NPCs' first greeting lines |
| `ember-hatched` | first battle victory |
| `ember-hatch-seen` | finishing the hatch cutscene |
| `crystal-<topic>-restored` | beating that topic's Fiend |
| `crystal-<topic>-scene-seen` | finishing that crystal's restored cutscene |
| `spire-awake-seen` | finishing the Spire-awakens cutscene (after 1st crystal) |
| `gate:<zone>:gate:<x>,<y>` | answering that gatekeeper (or using a key on it) |
| `key-<id>` | holding a warden's gate key (#58) |
| `quest:<id>:offered` / `:done` | quest dialogue |
| `ending-seen` | finishing the four-crystal "call to the Spire" cutscene |
| `spire-cleared` | beating Umbra at the top of the Spire climb |
| `spire-victory-seen` | finishing the true-finale cutscene |

## 8. Future story hooks (phase 4+)

- **Companions:** recruitable story NPCs (Pip wants to come SO badly);
  Ember gains a battle action when companions land.
- **New Game+:** the Fiends return "with trickier riddles" — higher skill
  levels, remixed dialogue.
- **Ember side-moments:** snack-finding micro-beats in each zone.
- **A fifth crystal** if a fifth topic ships (History → "Crystal of
  Memory" pairs naturally with the fog).
