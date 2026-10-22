# Hazel Quest — Mini-games

As of 2026-10-22. Ten learning mini-games, one per topic, each played on its
own full-screen **stage** that opens from a person in the world. Agreed with
the owner after the visual draft (the claude.ai canvas "Hazel Quest Mini-Game
Screens": the storyboard, title card, play screen, reward, phone and the
shared frame). Built one game per PR, in the order of §6.

## 1. Why

The whole game teaches through question cards: read, pick one of four. The
mini-games teach a different way: **by doing**. Kids cut pies, mix potions,
lay gears and join stars. They guess first and then see what happens. That
makes them feel different from everything else in the game, and it suits the
kids who find reading the hard part.

Each game lives where its topic does (the science game in Verdara, the
engineering game in Gearfall), is run by someone already there, and is
optional: the story never waits on one.

## 2. The stage

Every game opens on the same stage, so a kid learns it once.

### 2.1 How it opens

1. **The counter.** The host is a person in the world. Talking to them offers
   the game from their first line, beside anything else they offer (Trader
   Tadpole still has his 🛒 Shop): a gold button with the game's emoji and
   name, "🧪 Potion Lab".
2. **The zoom.** The map pauses (as it does for menus) and a round window
   opens from the middle of the screen and grows until the close-up fills it
   (`ZOOM_MS`, about 0.6 s). With reduced motion it's a quick fade.
3. **The title card.** The game's name in big pixel letters, the host saying
   hello, three picture steps for how to play, how far the kid has got (the
   collection, the stars), the level band (§3.3), and two buttons: **Back** and
   the game's own "Let's brew!".
4. **Play**, then **the reward** after each finished round.

Back (or Escape) leaves at any point and returns the kid to the exact spot on
the map. Nothing is lost: what's been found is saved as it's found.

### 2.2 The play screen

One frame for every game (the canvas's "Same stage, every game" board):

- **Header:** ← Back · the title plate (the game's name, its place under it) ·
  the topic chip · three stars.
- **The scene** (left, or the top on a phone): a close-up drawn in more detail
  than the map, the kid's world characters in it. Ember is in every scene
  (lighting the burner, holding the map, warming the forge) and cheers on a
  win.
- **The side panel** (right, or below on a phone): the host's portrait and
  speech bubble (a live region, so a screen reader hears each tip), the goal
  for this round (an order ticket), the step card with the controls, and the
  collection.
- **Footer:** the round's steps as chips (1 Pick → 2 Guess → 3 Brew) and "No
  timer. Take your time."

### 2.3 The reward

After a round: a big title ("Berry Potion brewed!"), the stars, **what you
learned** (one sentence, the new collection page), and **what you got** —
only what's new: XP, coins, an item. Then **Play again** (gold) and **Back**.

### 2.4 Screens and input

- **Desktop / tablet landscape:** scene and side panel side by side.
- **Phone portrait:** header, a shorter scene, the host's line in a strip, then
  the step card and controls. Every button at least 44 px.
- **Phone landscape (short):** side by side, the scene and text tightened, the
  page scrolls rather than clipping.
- **Every action is a tap or a key.** No drag-only moves: pick something, then
  tap where it goes. Tab reaches every control in order; Enter and Space work
  them; Escape is Back. Colours always come with a word or a shape.
- **Reduced motion:** no zoom, bubbling, spinning or hopping; fades only.

### 2.5 Sound

Each game names its music (the stage plays it and `App` steps aside, as for
the Spire). Until a game has its own composed loop it borrows a calm one
(`town` or `shrine`). Sound effects use the existing set (`correct`, `select`,
`chest`, `levelup`…). Echo's Call makes its notes with Web Audio and asks to
turn sound on if it's off; its chimes also light up, so it can be played by
watching.

## 3. Rules every game follows

### 3.1 Never stressful

- **No timers** (`ROADMAP-OVERWORLD.md` decision 14). Nothing counts down.
- **A wrong answer is the lesson, not a failure.** The host explains what
  happened and why; the kid tries again at once. A round can't be lost.
- **Optional.** The 🚩 never sends a kid to a mini-game, and nothing in the
  story needs one.

### 3.2 No AI questions

Every puzzle is hand-written or made by rules in a pure module
(`lib/minigames/<game>.ts`), table-tested. So the games cost nothing from the
question budget, need no safety check, and work offline. Facts are checked
when written (the history game keeps the question writer's rule: no wars,
battles, disasters or religion).

### 3.3 Difficulty: three bands

Each game has three bands — **Gentle**, **Medium** and **Tricky** — picked
from the kid's question level for the game's topic (`skillLevelFor`: 1–3
Gentle, 4–6 Medium, 7–10 Tricky). The title card shows the band and lets the
kid pick another; that choice is remembered for the game on this device. **A
mini-game never moves the question level** — that track belongs to the
questions.

### 3.4 Rewards that can't be farmed

- Progress is **save flags** (`mg:<game>:…`): what's in the collection, which
  stars are earned. Additive, so no save-version bump; it follows the kid
  between devices like the rest of the save.
- **Stars**, the same three for every game: ★ the first round finished,
  ★ half the collection, ★ the whole collection.
- **XP and coins only the first time:** each new collection page pays a little
  XP (`MINIGAME_PAGE_XP`); each star pays more XP and some coins
  (`MINIGAME_STAR_XP`, `MINIGAME_STAR_COINS`). A game may give one item the
  first time (the Potion Lab's Berry Potion). Replaying is free fun and pays
  nothing.
- XP goes through `addXp`, so a day spent in a mini-game counts for the streak
  and the 📈 Progress week (`recordActivity`).

### 3.5 Kids' data

Nothing a kid types is stored. The one thing a kid makes — a Mirror Mural
picture — is a small grid of colour numbers in their own save, shown only to
them.

### 3.6 Finding them again

The 📜 Menu gets a **🎮 Mini-games** list: each game the kid has opened, its
stars, and who runs it where ("Trader Tadpole, Verdara"). Hosts stay put
(never wander) so they're always where the list says.

## 4. How it's built

- **`content/minigames.ts`** — the registry: `MINIGAMES: Record<MiniGameId,
  MiniGameDef>` (id, name, emoji, topic, host NPC, place, music, the three
  how-to-play steps, the button's verb, collection size), and the flags
  (`mgFlag`, `pageFlag`, `starFlag`).
- **`WorldNpcDef.game`** — the host's game. `DialogueOverlay` offers it from
  the first line; `npcWanders` keeps a host still.
- **The machine** — `OPEN_GAME { game }` from `world.exploring` or
  `world.dialogue` → `world.minigame` (context `game`); `CLOSE` → exploring.
- **`features/minigames/MiniGameStage.tsx`** — the `ModalLayer`, the zoom,
  the title card, the frame, the reward, the music. A game is a component
  that gets the band and a small API: say a host line, report a page found,
  finish a round (with what was learned). The stage works out what's new,
  pays it, saves it and shows the reward.
- **Each game:** `features/minigames/<game>/` (its scene and controls) and
  `lib/minigames/<game>.ts` (its rules and content, pure).
- **`lib/minigames.ts`** — shared pure rules: band from level, stars from
  flags, what a finished round newly earns.
- **The bench:** `bench/minigame.html?game=<id>&band=<band>` mounts the stage
  on its own (stub stores, any screen size), for screenshots and the UX
  reviews.
- **Tests:** each game's rules (unit), the stage and each game (component), the
  machine's new state, the dialogue's button.

## 5. The ten games

Each entry: who and where · the loop · the three bands · the collection.

### 5.1 🧪 Potion Lab — Science · Trader Tadpole, Tadpole's Tonics, Verdara

A real experiment: **red cabbage juice changes colour** with acids and bases.
- **Loop:** an order ("Fern needs a Berry Potion that glows pink") → pour one
  jar into the purple cabbage juice → guess what happens → stir and see → the
  host explains. The order is done when the potion is the colour asked for.
- **Gentle:** six jars; guess the colour: pink, stays purple, or green.
- **Medium:** nine jars (adds orange juice, milk, egg white); guess the kind
  first — acid, base or neutral — and the colour follows.
- **Tricky:** twelve jars and a five-colour strip (red, pink, purple, blue,
  green); guess where it lands; the host gives the pH ("lemon juice is about
  pH 2").
- **Collection:** the Brew Book, a page per jar. First order filled: a Berry
  Potion for the bag.

### 5.2 🥧 Dot's Bakery — Math · Baker Dot, Lumina Village

- **Loop:** a customer orders part of a pie → choose how many equal slices to
  cut → tap slices into the box → close it. Wrong amounts are shown, not
  scolded ("that's 2 quarters — half a pie!").
- **Gentle:** halves and quarters.
- **Medium:** thirds, sixths, eighths; the same amount cut two ways (2/4 = 1/2);
  more than one pie (1 and a half).
- **Tricky:** percentages and decimals ("75% of a pie", "0.25"); two
  customers' orders added in one box.
- **Collection:** the regulars served — eight townsfolk, each with a favourite
  order.

### 5.3 ⚙️ Clocktower Gears — Engineering · Tock, Gearfall Canyon

- **Loop:** a board of pegs between a crank and a machine (the clock hands, a
  bell…) → pick a gear from the tray, tap a peg to place it → turn the crank
  and watch.
- **Gentle:** join the crank to the machine; see each gear turn the other way.
- **Medium:** the machine must turn the right way (an odd or even chain).
- **Tricky:** speed too: big and small gears (8, 16 and 24 teeth) to make it
  turn twice as fast or half as fast.
- **Collection:** the Clocktower's machines brought back to life, nine of them.

### 5.4 🪞 Mirror Mural — Creativity · Madame Hue, the Grand Gallery, Chromaria

- **Loop:** half a pixel picture by a mirror line → mix the paint the picture
  needs → paint the other half → the mirror checks it. Then a free canvas:
  paint one half, the mirror paints the rest, and it hangs in the gallery.
- **Gentle:** one mirror line, a small grid, two colours; red + blue = purple.
- **Medium:** across or down, more colours, the secondary colours.
- **Tricky:** two mirror lines (four-way) and half-turn symmetry; tints and
  opposite colours.
- **Collection:** the gallery's nine patterns. The kid's own picture hangs
  beside them (one at a time, their save only).

### 5.5 🎵 Echo's Call — Music · Bard Lyra, the Music House, Chromaria

- **Loop:** Lyra plays a short tune on five coloured chimes → the kid plays it
  back. Listen again any time. A tune grows a note each round.
- **Gentle:** three chimes, high or low, 2–3 notes.
- **Medium:** five chimes (a five-note scale), 4–6 notes; "did it go up or
  down?".
- **Tricky:** read the tune from notes on a staff, or find the wrong note.
- **Collection:** Lyra's songbook — the openings of eight old public-domain
  tunes.

### 5.6 ✨ Vela's Star Charts — Space · Vela, Vela's Observatory, Starfall Coast

- **Loop:** Vela names a star picture → tap its stars in order to join them →
  a fact card.
- **Gentle:** 3–5 stars, the outline shown (Orion's Belt, Cassiopeia).
- **Medium:** 7–10 stars, only a picture to go by; use the Big Dipper's pointer
  stars to find the North Star.
- **Tricky:** no outline and a turned sky (the sky turns through the night);
  how far the light travelled.
- **Collection:** nine constellations on Vela's chart.

### 5.7 🌳 Ringwood's Rings — Nature · Old Ringwood, Eldergrove

Old Ringwood is the tree who loses count of his rings.
- **Loop:** a slice of trunk → tap the rings from the middle out to count them
  → read them: wide rings were wet years, thin ones dry, a dark scar a fire.
- **Gentle:** 3–8 big rings; count them.
- **Medium:** 10–20 rings; find the dry years; "this ring is the year the
  bridge was built".
- **Tricky:** match the thin-ring pattern of an old beam to a living tree to
  find when the beam was cut (cross-dating, how scientists really date wood).
- **Collection:** eight trees of Eldergrove, each with its own story.

### 5.8 📜 Index's Timeline — History · Index, the Card Catalog, Sunken Archive

- **Loop:** soggy cards wash in → tap a card, then a gap on the timeline →
  check. A card in the wrong place floats back with a hint ("bicycles need
  wheels, so the wheel came first").
- **Gentle:** 3–4 cards, before and after (candle → light bulb).
- **Medium:** five cards across centuries (the pyramids, the printing press,
  the first plane, the moon landing).
- **Tricky:** 6–7 cards with years, BCE and CE, and what caused what.
- **Collection:** eight timeline sets (light, travel, writing, flight, food,
  music, buildings, medicine).

### 5.9 🐉 Ember Air Mail — Maps & Places · Postmaster Pidge, Port Lantern

- **Loop:** a parcel with a clue → steer Ember across a map grid with compass
  buttons, one square at a time → deliver. The route is drawn as you go.
- **Gentle:** four directions; the place to go shown as a picture.
- **Medium:** eight directions and grid squares (B3); clues from landmarks.
- **Tricky:** a simple map of the real world: continents and oceans,
  north/south of the equator; distance by the map's scale.
- **Collection:** nine stamps, one per kind of delivery.

### 5.10 🔨 Word Forge — Words & Stories · Scrivener Dot, Inkwell Cove

- **Loop:** a meaning ("full of hope") → choose word-part tiles → hammer them
  together on the anvil → a real word goes on Dot's word wall with its
  meaning.
- **Gentle:** two words into one (sun + flower), and -s.
- **Medium:** un-, re-, pre-; -ful, -less, -er, -est.
- **Tricky:** Greek and Latin roots (tele + scope = far + look; bio + logy).
- **Collection:** the word wall, a family of words per root.

## 6. The PRs

One game per PR, each stacked on the one before (draft, as the repo does),
each followed by **two rounds of `/saas-code-review` and `/saas-ux-review`**
with every finding fixed before the next game starts:

1. The stage + 🧪 Potion Lab (this doc goes in with it)
2. 🥧 Dot's Bakery
3. ⚙️ Clocktower Gears
4. 🪞 Mirror Mural
5. 🎵 Echo's Call
6. ✨ Vela's Star Charts
7. 🌳 Ringwood's Rings
8. 📜 Index's Timeline
9. 🐉 Ember Air Mail
10. 🔨 Word Forge

## 7. Later

- Each game's own music (`tools/assets/audio.py`); until then they borrow.
- A side quest per game that sends a kid there the first time.
- A 🎮 line on 📈 Progress for grown-ups (games played, stars).
