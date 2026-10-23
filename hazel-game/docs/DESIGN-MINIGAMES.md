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

- **Header:** 🗺️ Map (the way out, named the same on the title card and the reward) · the title plate (the game's name, its place under it) ·
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
  (`MINIGAME_STAR_XP`, `MINIGAME_STAR_COINS`, in `content/items.ts` with the
  rest of the economy). A game may give one item the
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
- **`MINIGAMES[id].host`** — who runs each game (`gameHostedBy(npcId)` reads
  it back). `DialogueOverlay` offers the game from the host's first line, as a
  service, never over the host's own quest talk; `npcWanders` keeps a host still.
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
- **The bench:** `bench/minigame.html?game=<id>&level=<1–10>&pages=<n>` mounts
  the stage on its own (stub stores, any screen size), for screenshots and the
  UX reviews; the level picks the band, as the kid's topic level does.
- **Tests:** each game's rules (unit), the stage and each game (component), the
  machine's new state, the dialogue's button.

## 5. The ten games

Each entry: who and where · the loop · the three bands · the collection.

### 5.1 🧪 Potion Lab — Science · Trader Tadpole, Tadpole's Tonics, Verdara

A real experiment: **red cabbage juice changes colour** with acids and bases.
- **Loop:** an order ("Fern needs a Berry Potion that glows pink") → pour one
  jar into the purple cabbage juice → guess what happens → stir and see → the
  host explains. The order is done when the potion is the colour asked for.
- **Gentle:** six jars; guess the colour: pink, stays purple, or blue-green.
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
- **Collection:** the Regulars' Book — eight Lumina Village townsfolk
  (Grandmother Wick, Keeper Sol, Mayor Marigold, Guard Rook, Nib, Pip, Bramble,
  Innkeeper Poppy), each with a favourite pie; a page the first time each is
  served right. Three orders make a morning (a round).
- **Built (PR 2):** Baker Dot also gives a quest, so the 🥧 button shows over
  her quest's offer and reminders (leaving them as they were) and never over its
  reward; the first morning gives a Sunseed Snack.

### 5.3 ⚙️ Clocktower Gears — Engineering · Tock, Gearfall Canyon

- **Loop:** a board of pegs between a crank and a machine (the clock hands, a
  bell…) → pick a gear from the tray, tap a peg to place it → turn the crank
  and watch.
- **Gentle:** join the crank to the machine; see each gear turn the other way.
- **Medium:** the machine must turn the right way (an odd or even chain).
- **Tricky:** speed too: big and small gears (8, 16 and 24 teeth) to make it
  turn twice as fast or half as fast.
- **Collection:** the Clocktower's machines brought back to life, nine of them
  (the Machine Book).
- **Built (PR 3):** the pegs sit on a hex grid, so a gear touches up to six
  others and three that all touch jam (Medium and Tricky boards can; Gentle's
  can't). The tray is the crank's gear on Tricky (8, 16 or 24 teeth against
  the machine's): gears between change only the way round, never the speed.
  Tricky's crank starts with no gear picked, and its ticket says the
  machine's teeth. Tock also gives a quest, so ⚙️ shows quietly over its
  offer; the first round gives a Spark Cell.

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
- **Built (PR 4):** nine 6×6 tiles, each the same across and down, so every
  mirror fits each; the paint to mix first is one the kid paints with (on an
  opposite mirror, an opposite). Squares are painted by a tap, a drag across
  them or the arrow keys and Enter. The kid's picture is kept as the name of
  one save flag (its code), so no save bump. Madame Hue also gives a quest,
  so 🪞 shows quietly over its offer; the first round gives a Mirror Charm.
  After review round 1: a half turn's picture is a pinwheel (the top-right
  quarter's colours swap), so the top half flipped down doesn't match it;
  every painted square and paint shows its colour's letter, and a picture's
  two colours are never a pair a colour-blind eye mixes up (but opposites);
  the mirror's marks stay on the canvas to fix there and then; an opposite
  mirror's paints come in their pairs, side by side; the round is paid as the
  third picture matches, so the free canvas is just for fun. After round 2:
  no picture's half is red and orange or green and blue either; the mirror
  held up before painting asks for paint first; the reward shows the picture
  hung.

### 5.5 🎵 Echo's Call — Music · Bard Lyra, the Music House, Chromaria

- **Loop:** Lyra plays a short tune on five coloured chimes → the kid plays it
  back. Listen again any time. A tune grows a note each round.
- **Gentle:** three chimes, high or low, 2–4 notes.
- **Medium:** five chimes (a five-note scale), 4–6 notes; "did it go up or
  down?".
- **Tricky:** read the tune from notes on a staff, or find the wrong note.
- **Collection:** Lyra's songbook — the openings of eight old public-domain
  tunes.
- **Built (PR 5):** the tunes are Hot Cross Buns, Mary Had a Little Lamb,
  Frère Jacques, Au Clair de la Lune, Go Tell Aunt Rhody, Ode to Joy, Old
  MacDonald and Lightly Row (Old MacDonald for Jingle Bells, whose first
  seven notes are all E), each on C–G; Gentle's three chimes are C D E, which
  play the first five (its band note says "five of the eight", and Lyra says
  when a kid knows them all). A round is three tunes, each a note longer; a tune
  listened to or read asks its shape (higher, lower, the same) before it's
  played back. Tricky reads one from the staff and, in another, spots Lyra's
  wrong note on the staff (listen → spot → play it right: no shape question).
  The chimes light as they ring, so it's all there with the sound off (the
  default); Lyra asks for it, and a "Sounds" switch turns sound effects on. Lyra also gives a
  quest, so 🎵 shows quietly over its offer; the first round gives a Rainbow
  Ward.

### 5.6 ✨ Vela's Star Charts — Space · Vela, Vela's Observatory, Starfall Coast

- **Loop:** Vela names a star picture → tap its stars in order to join them →
  a fact card.
- **Gentle:** 3–5 stars, the outline shown (Orion's Belt, Cassiopeia).
- **Medium:** 7–10 stars, only a picture to go by; use the Big Dipper's pointer
  stars to find the North Star.
- **Tricky:** no outline and a turned sky (the sky turns through the night);
  how far the light travelled.
- **Collection:** nine constellations on Vela's chart.
- **Built (PR 6):** Gentle joins Orion's Belt, the Summer Triangle, the
  Southern Cross and Cassiopeia (3–5 stars, outline dotted); Medium the Big
  Dipper, the Little Dipper (the North Star found first, from Merak and
  Dubhe), Orion, Cygnus and Leo (6–8 stars, the card only); Tricky all nine
  on a turned sky, each card with how long its light took. The chart's nine
  pages are those pictures (the Summer Triangle and Orion's Belt are
  asterisms, not constellations — the card says so for the Triangle). Vela
  has no quest, so ✨ is her gold offer; the first round gives a Glimmer
  Candle. Review round 1: every picture is drawn the real sky's way round
  (turned, never mirrored — Cassiopeia, Leo and the hunt's Big Dipper were
  mirrored); Tricky says how far the sky has turned; the picture's stars are
  bigger than the sky's others; the step's card sits by the sky. Review
  round 2: the North Star hunt's words match its redrawn stars and it has a
  hint; star names are placed clear of the stars and each other.

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
- **Built (PR 7):** the grove's weather is one for every tree, so their
  rings match. Gentle counts a young tree's slice (4–8 rings) and finds its
  wettest year; Medium reads a core of 10–14 rings (not 20: a core's thin
  rings must stay big enough to tap) — the year a thing happened, counted
  back from the bark, then every dry year; Tricky slides an old beam's core
  along a living tree's till the thin rings line up. The grove book's eight:
  Silver Birch, Weeping Willow, Beech, Rowan, Old Oak, Lodgepole Pine, Yew,
  Giant Sequoia. Ringwood has no quest, so 🌳 is his gold offer; the first
  round gives a Lucky Clover. Review round 1: a tap acts as the finger lifts
  (a swipe to scroll counted rings), and a thin ring the step wants is as
  easy to hit as a wide one; a young tree's slice is its age, the same every
  round, and an event's year the same in every tree; Tricky's living tree is
  living, its hint says thin under thin and wide under wide, and a tap along
  its core moves the beam there. Review round 2: each step's start says the
  next ask; each ring is drawn its width from a pith dot (the first looked the
  widest) and the bark isn't a ring; on a short split screen Tricky's cores
  take the board's width.

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
- **Built (PR 8):** each card tapped goes in the next empty place, oldest
  first (one on the line tapped comes back) — tapping a card then a gap made
  a phone scroll between the tray and the line for every card. The sets'
  events are inventions, discoveries and buildings, no wars, disasters or
  religion. Tricky's years are on its cards; Gentle's and Medium's come out
  when the drawer's filed. Index gives a quest too, so 📜 shows quietly over
  its offer; the first round gives a Forget-Me-Knot. Review round 1: a clue
  is about the first wrong place and names only cards on the board (most
  named a card not dealt); Medium deals no two cards closer than 30 years
  (it had 1885 and 1889, with no years shown); Tricky says what BCE means as
  it starts; the next empty place is marked.

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
