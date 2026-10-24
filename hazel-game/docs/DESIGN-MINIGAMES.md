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

**A fourth band, Expert** (§8), for ages about 12–18, on the games that
have it: secondary-school content, a plainer voice, and the Expert seal. The
band suggested follows the kid's age as well as the level (§8.2): a new
teen is offered Expert, not Medium.

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
- **Expert (§8, PR 11):** all twelve jars and the strip; an order asks for a
  pH in tens from pure water — a Thunder Draught "a thousand times as alkaline
  as pure water" (pH 10), never neutral, the potions named for the band, not
  for a colour, and the bottle on the ticket colourless; the kid guesses the
  jar's pH as a number (fifteen buttons, 0–14, no colours by them), and
  Tadpole says it plainly, in tens, and in the jar's own words — an acid more
  or less acidic than the guess, a base more or less alkaline: "Spot on:
  lemon juice is about pH 2.", "pH 9 is alkaline. Lemon juice is about pH 2 —
  seven steps below your 9: ten million times more acidic.", "Lemon juice is
  about pH 2 — two steps above your 0: a hundred times less acidic." A jar
  that varies has a range (vinegar pH 2–3, soap 9–12): any pH in it is spot
  on, and a miss counts to both ends ("five or six steps"). A jar that doesn't
  fill the order says which way to look ("try a more alkaline jar"). Every
  guess spot on in a round is the Expert seal. A Brew Book page waits till
  its jar's brewed this round — no colour, kind or fact, which gave the pH
  away. Where the counter's rows would run under the scene, or leave it too
  small to see the cauldron's colour (a short window, or one too narrow for
  the round's jars on the counter — the `jars-6/9/12` screens), the jars are
  in the step card, first in the side panel; Stir stays at the foot of the
  card, so the pH buttons don't move under the finger, and a step's buttons
  wait a moment as it starts, so a double tap's second doesn't press what
  came under it.

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
- **Expert (§8, PR 12):** an order is a ratio, a rate or a percentage change —
  "25% more pie than last week's 1 pie", "the bigger share of 1 pie, split
  5 : 1", "enough for 4 people, when 1 pie feeds 6" — and the amount of pie is
  the kid's to work out (nine orders, so three mornings never repeat one, up
  to two pies, each a different amount; every unit said — "when 2 pies serve
  3 tables"). Always two pies on the board, so it doesn't say whether the
  order is more than one; the ticket shows the order's numbers ("+25%",
  "5 : 1", "4 people"), never its pie; a cut that can't make it is said after
  a miss, not as it's picked, with the way in ("Thirds can't make this order
  exactly. Work out 25% of 1 pie, then add it on.") — and then "Cut it another
  way" is the gold button, and the cut is said again if the box is fixed
  anyway. A miss gets a plain heading and one way in ("Too little" — "Work
  out 25% of 1 pie, then add it on."; a share, "Count the parts in 5 : 1,
  then take the bigger share."), with the order in sight (on a short screen
  it sticks at the top of the card). A right box shows the working ("25% of 1
  pie is a quarter, so 25% more than 1 pie is one and a quarter pies."), and
  the reward keeps the working of an order the kid missed first; every box
  right at its first close is the Expert seal.

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
- **Expert (§8, PR 13):** gear ratios in numbers. A job is said in turns a
  minute — "Make the Great Hands turn clockwise ↻, 45 times a minute. The
  crank turns 15 times a minute; the machine's gear has 8 teeth." — or in
  turning force — "…with four times the crank's turning force. The
  machine's gear has 32 teeth." — never as "twice as fast"; the kid works
  out the ratio and picks the crank's gear from four (8, 16, 24, 32 teeth:
  each job is made by exactly one), and joins it up the right way round.
  Tock says a miss in the job's numbers with the rule ("turned 30 times a
  minute, not 45. Turns out = turns in × crank teeth ÷ machine teeth."; a
  force job's is headed "Not enough force" or "Too much force"), and a right
  run the gear ratio as a school book gives it, driven : driver, and the
  trade ("A 24-tooth crank gear turning an 8-tooth machine gear: the gear
  ratio, machine : crank, is 8 : 24 = 1 : 3, so 15 turns a minute became
  45, with a third of the crank's turning force."). Every machine right at
  its first turn of the crank is the Expert seal. After review round 1: the
  job stays in sight in the step card on a short screen (it was scrolled
  away as the four gears were picked); a peg tapped after a miss starts no
  wait (the next was swallowed); every gear's teeth are the same size as
  drawn (the 32's were deep and all ink); the reward keeps the first missed
  machine's working; the title card's second step shows a big gear turning
  a small one. After round 2: the right run's lesson bridges the ratio to
  the turns ("…is 8 : 24 = 1 : 3: the machine turns 3 times for each turn
  of the crank, so…"); the step-start scroll moves only as far as Turn the
  crank and the job need (it had scrolled a phone on its side's board away,
  and Gentle's how-to); the job line sticks on Expert only; Enter on the
  crank's peg straight after Change the gears is a double Enter's second;
  the title card's gears turn opposite ways.

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
- **Expert (§8, PR 14):** transformations on a coordinate grid. The canvas
  has axes, 0 to 6 at its lines, x across and y up from the bottom-left
  corner, and no paint to mix: step 1 names the move from a point and its
  image, marked on the canvas — bare till then, as the painted part's shape
  would give the move away; on a phone drawn small beside the moves too —
  "A (1, 4) maps to A′ (5, 4)." — from six
  (reflect in x = 3, in y = 3 or in y = x; rotate 180° or 90° clockwise
  about (3, 3); translate by (3, 0)), each taking A somewhere else; a wrong
  one says where it takes A ("Reflect in y = x: A goes to (4, 1), not
  (5, 4)."). Then the kid paints the image ("Reflect the top-left triangle
  in the line y = x.") — the squares said by their corners' coordinates,
  the painted part read too — and checks it. No other move paints the
  picture right (its painted part's colours swap in one place where the
  pattern's own mirrors would let one). No mirror line is drawn till a check
  finds a square to fix: then the line, the centre or the vector shows (and
  a square says what it's the image of) and Madame Hue gives the rule ("A
  reflection in y = x swaps the coordinates: (x, y) goes to (y, x)."); the
  lesson is the rule and one thing more (a half turn is two reflections;
  the quarter turns, rotational symmetry of order 4; turned the other way
  about (3, 3), the picture's the same) — on the reward, the
  first missed picture's. Each pair of rounds turns the moves' order and
  gives each move the other A, so the third round isn't the first again. Every move named at the first try and every image exact
  at the first check is the Expert seal — claimed with the round's pay as
  the third matches, so leaving from the free canvas keeps it too.

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
- **Expert (§8, PR 15):** intervals, in the tunes. A round reads one tune from
  the staff, hears one, reads one (five to seven notes on all five chimes),
  and in each Lyra marks two notes — by their place in the tune, not their
  names: "From note 1 to note 3: what interval?" — to name from six: a minor
  or major 2nd, a minor or major 3rd, a perfect 4th or 5th (in columns by
  number). A heard tune's two are marked from the first listen, and "▶ Notes
  1 and 2" plays them alone; the marks stay, fainter, as it's played back. Whichever is picked, she gives the method, step by step the way
  the tune goes: "E down to C: 3 letter names, E D C — a 3rd; E–D 2 + D–C 2
  = 4 semitones — major." — then the tune's played back. Each tune asks the
  intervals its own notes make, in turn, read and heard alike (but the 5th,
  only in Lightly Row's seven notes, always read), from another pair of its
  notes each time it comes round (most here make only 2nds and
  3rds; Ode to Joy a minor 2nd and 3rd, Old MacDonald a perfect 4th, Lightly
  Row a 4th and, at seven notes, a perfect 5th — asked wherever it's there).
  A round's third tune, the longest, is Lightly Row, Old MacDonald or Ode to
  Joy in turn, each asking its intervals in turn as it comes, so every round
  asks a minor or perfect one, the 5th comes every third round and a new
  teen meets every kind in the first six. The chimes keep their letters, not their colours'
  names; Lyra speaks plainly; while a tune's played its Songbook page stays
  shut and no page shows its notes. Every interval named at the first pick
  and every tune played back with no wrong chime is the Expert seal, and the
  reward teaches the first tune whose interval was missed (else the first
  with a wrong chime). An octave, keys and
  sharps and flats would need more chimes — not built (§8.5).

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
- **Expert (§8, PR 16):** sky coordinates. Every picture is on an
  altitude–azimuth grid — altitude up from the horizon, azimuth round from
  north through east — each star where it really is from the coast that
  night: Vela sets up at one latitude a round (20°, 15°, 25° N in turn —
  where the Southern Cross clears the horizon too), and each picture is
  shown at its own time of night (its sidereal time), well up, its top
  under about 45°. A degree of azimuth is drawn as wide as one of altitude,
  so the coordinates are read straight off the grid (up high a picture's a
  little wider than it looks); the grid can be 1° a line (Orion's Belt) or
  10° (the Summer Triangle, with fainter lines every 5°); the ground shows
  where the view dips under the horizon. Vela gives one of the picture's
  bright stars by its coordinates ("Vega is at altitude 36°, azimuth 56°.
  Find it on the grid and tap it."); a wrong star says where it is and which
  way to look ("…Vega is higher and to the left. Try again."), then the
  picture's joined as on Tricky, from the star found; each time a picture
  comes round it asks another of its bright stars, never the same a round
  or three apart, and never one with another star close by (Orion's belt
  stars are 6 sky units apart); a tap as near one star as another isn't
  judged. On the Little Dipper the North Star, within a degree of due
  north, is as high as the latitude: read its altitude and pick the
  latitude from four (it, 90° less it, south, a grid line off); the reason's
  said either way. The lessons are where each picture is in the sky (the
  celestial equator and declination said once, never setting, the
  ecliptic). Star names are given, not shown; no hint for the coordinates;
  Vela speaks plainly. Every star found at the first tap and every
  latitude read first time is the Expert seal. Right ascension and hour
  angle aren't asked (§8.5); declination comes in the lessons. Review round
  1: the stars were drawn at a place and a turn they can't have from the
  coast (Vega at azimuth 83° needs 36° N or more), and the flat grid gave
  high stars' azimuths wrong — each is now where it really is (`RADEC`, the
  J2000 catalogue); the grid's lines 3:1 and a pixel at every size, its
  numbers bigger beside a big sky; joins said plainly.

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
  it starts; the next empty place is marked. Review round 2: a check keeps
  the longest run already in order, each card moved to its own place, and
  floats back the rest — by place, the oldest put last sent every card back
  with "Not yet!"; Medium always keeps the set's oldest card, so a drawer
  spans two thousand years or more; the keyboard starts at the washed-up
  cards.

### 5.9 🐉 Ember Air Mail — Maps & Places · Postmaster Pidge, Port Lantern

- **Loop:** a parcel with a clue → steer Ember across a map grid with compass
  buttons, one square at a time → deliver. The route is drawn as you go.
- **Gentle:** four directions; the place to go shown as a picture.
- **Medium:** eight directions and grid squares (B3); clues from landmarks.
- **Tricky:** a simple map of the real world: continents and oceans,
  north/south of the equator; distance by the map's scale.
- **Collection:** nine stamps, one per kind of delivery.
- **Built (PR 9):** Gentle flies the bay (four directions, the place a
  picture); Medium the town (eight directions, squares like C5, a house by
  its square or a landmark); Tricky a blocky world (12 × 6 squares of 30°,
  four directions — the map's squares are counted for its scale), its east
  and west edges joined, then "How far?" at about 3,000 km a square. The
  stamps are the kinds of post (three a band), each a true thing about maps
  and the world; each continent and ocean says one more. Pidge has no quest,
  so 🐉 is her gold offer; the first round gives a Hint Feather. Review
  round 1: a first wrong delivery on the town or the world says how to find
  the place on the map, only a second which way (else the map need never be
  read); "How far?" is the shortest way from Europe, by the map's scale.
  Review round 2: "How far?" is a ruler — a straight line from Europe to the
  place's nearest square, drawn on the map; Tricky's clue isn't answered
  for the kid ("Which place fits the clue?").

### 5.10 🔨 Word Forge — Words & Stories · Scrivener Dot, Inkwell Cove

- **Loop:** a meaning ("full of hope") → choose word-part tiles → hammer them
  together on the anvil → a real word goes on Dot's word wall with its
  meaning.
- **Gentle:** two words into one (sun + flower), and -s.
- **Medium:** un-, re-, pre-; -ful, -less, -er, -est.
- **Tricky:** Greek and Latin roots (tele + scope = far + look; bio + logy).
- **Collection:** the word wall, a family of words per root.
- **Built (PR 10):** nine families of three words — Gentle joins two words
  (sun + flower, rain + bow) and makes more than one (cat + s, fox + es);
  Medium builds on a root word (un + kind, help + ful, re + view); Tricky
  joins Greek roots, each tile saying what it means (tele "far" + scope
  "look"). Dot reads out a meaning; the kid puts two parts on the anvil, in
  order, and hammers. The other way round, a real word that means something
  else (telegraph), -s for -es, or no word at all is each said kindly, with a
  hint. Dot has no quest, so 🔨 is her gold offer; the first round gives a
  Focus Tea.
- **Review round 1:** every pair of parts a tray can make is a real word
  Dot names and explains ("Unless is a real word…") or a looked-at not-word
  — she'd told kids "suns" and "photography" weren't words. Hints build on
  what the try got right; both -s and -es are always in the tray; Tricky's
  meanings are in everyday words ("what a scientist peers into to see
  germs"), so a root is worked out, not matched — the Expert band (§3.3)
  takes the tiles' meanings away. The family is named, with its mark, only
  once its word is forged.
- **Review round 2:** no advice can lead to another miss — a right part is
  kept ("Keep “tele”!"), two add-ons need a root word; Tricky's first hint
  names one meaning; a wall page is read in a place kept for it, so nothing
  moves under the finger; the reward recaps the round's three words.

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

## 8. The Expert band (ages about 12–18)

Agreed 2026-10-23, built after the tenth game: this section first, then one
PR a game, each with its two review rounds (§6).

### 8.1 Why
Tricky tops out at upper-elementary content; a new teen starts on Medium (a
start level is the age less 5, at most 6 — `lib/age.ts`); and every band's
look and voice are a young kid's. A 14-year-old in the Potion Lab colours
cabbage juice. Expert brings each game up to secondary school — in the same
world, with the same host.

### 8.2 Who's offered it
- **A fourth band, Expert,** on the title card, once a game has it
  (`MiniGameDef.expert`); till then a game shows three.
- **The suggestion follows age as well as level.** A level is relative to the
  kid's age (4–6 is right for a typical kid of that age); a band's content
  isn't — Medium is for about 8–9, whoever plays it. So the band suggested is
  the higher of today's (`bandFor(level)`) and the band for the kid's *content
  age*, their age plus half how far their level is from typical
  (`age + (level − 5) / 2`): under 8 Gentle, 8–9 Medium, 10–11 Tricky, 12 and
  up Expert (Tricky where a game hasn't Expert yet). A new 12-year-old (level
  6) is offered Expert; a 10-year-old at a typical level 5, Tricky (Medium
  before); a 9-year-old at level 3, Medium (Gentle before); a young kid's
  suggestion never drops (a 7-year-old at level 10 keeps Tricky). Any band
  can still be picked, and the pick is remembered as now. Where the age
  lifted it, the title card says so — "Picked for your age.", or "Tricky is
  suggested for your age." — and not what the level alone suggests: a new
  teen starts at level 6 at most, so it read as a verdict.
- **The title card on Expert** speaks to a teen: the game's own Expert hello,
  its three steps and a line on what Expert is (`MiniGameDef.expert`: `note`,
  `hello`, `steps`), and its own pictures where the younger bands' would
  mislead (`GameScreens.expertSteps`: the Potion Lab's guess is a scale, not
  colours).
- A mini-game still never moves the question level (§3.3).

### 8.3 What changes on Expert
- **The content** (§8.5): secondary-school ideas, with the numbers and words
  that go with them.
- **A plainer voice:** the host's lines on Expert drop the exclamations and
  the cheering (their own right-lines, a shorter hello); a hint says what's
  wrong and one thing to try.
- **Less handed over:** what the younger bands print for the kid — a tile's
  meaning, a colour's name, a map's labels — is the thing to know on Expert:
  a hint after a miss, not a label before.
- **An optional challenge, no clock — the Expert seal:** a round on Expert
  with every answer spot on. Each game says how many of its round's answers
  were (`onFinish({ …, spotOn: { right, of } })`); the stage records the seal
  (`mg:<game>:seal`, a save flag, `sealFlag`), the title card shows it with
  the stars ("🏅 The Expert seal: an Expert round spot on every time."), and
  the reward says how the round went: won, with what's new ("The Expert
  seal: spot on every time"); won again ("Spot on every time — the Expert
  seal again."); or "Spot on: 2 of 3." and "Spot on every time wins the
  Expert seal." (or, held from before, "it's yours to keep"). It pays
  nothing (§3.4) and no star needs it. A miss is still the lesson, and a
  round still can't be lost.
- The look stays the game's: the same world, host and stage.

### 8.4 Rewards
- **No new pages, no new pay.** Expert's jobs fill the same collection, so a
  teen can fill it on Expert alone and a younger kid still can without it.
  Stars, XP, coins and the first round's item are as §3.4.
- Where a game's pages are split by band (Ember Air Mail's stamps, Word
  Forge's families), Expert draws from all of them.

### 8.5 Each game's Expert

| Game | On Expert | For example |
|---|---|---|
| 🧪 Potion Lab | The pH scale in numbers, counted in tens: an order asks for "a thousand times as acidic as pure water"; the kid guesses the jar's pH, 0–14, and Tadpole says where it sits and what neutralises it. | "Lemon juice is about pH 2: five steps below 7, so a hundred thousand times as acidic as pure water." |
| 🥧 Dot's Bakery | Ratios, rates and percentage change, boxed in pie: a share in a ratio, enough for so many people, a percentage more or less than last week's — the amount is the kid's to work out. | "25% less pie than last week's 2 pies"; "the smaller share of 1 pie, split 3 : 5" |
| ⚙️ Clocktower Gears | Gear ratios in numbers: a machine's turns a minute from the crank's, or the turning force it needs — the kid works out the ratio and picks the crank's gear (8 to 32 teeth); the gears between still set only the way round. (Two pairs in a train — a compound gear — would need a new kind of peg: not built.) | "The crank turns 15 times a minute: make it turn 45"; "four times the crank's turning force" |
| 🪞 Mirror Mural | Transformations on a coordinate grid: reflect in a line (x = 3, y = 3, y = x), rotate 90° or 180° about a point, translate by a vector; name the one that maps a point onto its image, then paint the image. | "A (2, 5) maps to A′ (5, 2): which move?" |
| 🎵 Echo's Call | Intervals, in the tunes: name the interval between two notes Lyra marks (a 2nd to a 5th on the five chimes), major, minor or perfect, read on the staff or heard. (An octave, keys and sharps and flats would need more chimes: not built.) | "From note 1 to note 3: what interval?" — "E down to C: a major 3rd." |
| ✨ Vela's Star Charts | Sky coordinates: altitude and azimuth on a grid, each star where it really is from the coast that night; the pole star's altitude as your latitude; declination in the lessons. (Right ascension and hour angle: not asked.) | "Polaris is 20° up: how far north are you?" |
| 🌳 Ringwood's Rings | Cross-dating with climate data: match a beam's rings to a rainfall record, find the dry years in both, date it to the year. | "Thin rings — and the chart's dry years?" |
| 📜 Index's Timeline | Cause and effect across eras: what led to what; years across BCE and CE; centuries named. No wars, battles, disasters or religion (§3.2). | "Paper → printing → …"; "300 BCE to 1450 CE is…" |
| 🐉 Ember Air Mail | Latitude and longitude on a 15° grid, and time zones: deliver to coordinates, then say when it arrives. | "35° N, 135° E"; "9:00 in London — in Tokyo?" |
| 🔨 Word Forge | Etymology: tiles without their meanings, Latin roots as well as Greek (port, dict, spect, aqua, chrono, geo, -logy, -meter), and what a root means once the word's forged. | "chrono + meter"; "What does port mean in transport?" |

Each game's §5 section gets its Expert note as its PR lands.

### 8.6 The PRs
- **PR 11:** this section, and the plumbing: `PlayBand` (the three bands and
  `expert`), `MiniGameDef.expert`, the suggestion from age and level, the
  title card's fourth band, the remembered band, the seal (`spotOn`,
  `mg:<game>:seal`), the bench's `band=`; a game without Expert yet plays
  Tricky if handed it (never offered); and 🧪 Potion Lab's Expert.
- **PRs 12–20:** one game each, in §5's order.
