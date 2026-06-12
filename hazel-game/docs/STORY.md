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
spark of light, and dragons grow on bravery and bright answers.

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
  (Special unlocked) → Fiend (boss + crystal flag). Villager dialogue
  flips to a gratitude line after the crystal is restored.
- **Finale** (`endingPanels(heroName)`): crystals blaze → villagers'
  callbacks (Tally counts shooting stars…) → Ember full-grown → the hero
  named as the reason → open door to New Game+ ("trickier riddles").

## 6. Mini-quests (one per zone)

Pattern (all in `quests.ts`, resolved through dialogue + the zone's
riddle-chest): the Fiend locked something precious in the chest → villager
asks for help → opening the chest completes the quest on next talk →
reward (25 coins + a potion/hint) + a thank-you beat. Completion works even
if the kid opens the chest before hearing the offer ("You found them
already?!" energy). Flags: `quest:<id>:offered`, `quest:<id>:done`.

## 7. Flag glossary

| Flag | Set by |
|---|---|
| `intro-seen` | finishing the opening cutscene |
| `met-elder` | Elder Lumen's first greeting line |
| `ember-hatched` | first battle victory |
| `ember-hatch-seen` | finishing the hatch cutscene |
| `crystal-<topic>-restored` | beating that topic's Fiend |
| `gate:<zone>:gate:<x>,<y>` | answering that gatekeeper |
| `quest:<id>:offered` / `:done` | quest dialogue |
| `ending-seen` | finishing the ending cutscene |

## 8. Future story hooks (phase 4+)

- **Companions:** recruitable story NPCs (Pip wants to come SO badly);
  Ember gains a battle action when companions land.
- **New Game+:** the Fiends return "with trickier riddles" — higher skill
  levels, remixed dialogue.
- **Ember side-moments:** snack-finding micro-beats in each zone.
- **A fifth crystal** if a fifth topic ships (History → "Crystal of
  Memory" pairs naturally with the fog).
