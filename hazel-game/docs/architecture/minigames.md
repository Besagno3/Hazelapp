# Mini-games (`src/features/minigames/`)

> The reference for the mini-games' stage and each game (#192; the plan is
> `docs/DESIGN-MINIGAMES.md`). Keep it accurate: when you change how this
> works, change it here in the same commit.

Covers: the host's button, `world.minigame`, `MiniGameStage` (the zoom, the
title card, the play area, the reward), the shared rules and pay
(`lib/minigames.ts`), the shared look (`styles.ts`, `parts.tsx`), the bench,
and each game — so far 🧪 Potion Lab, 🥧 Dot's Bakery, ⚙️ Clocktower Gears, 🪞 Mirror Mural, 🎵 Echo's Call, ✨ Vela's Star Charts, 🌳 Ringwood's Rings, 📜 Index's Timeline, 🐉 Ember Air Mail and 🔨 Word Forge.

- **Mini-games (docs/DESIGN-MINIGAMES.md, #192):** learning games on their
  own full-screen **stage**, one per topic, each run by a host in the world.
  The host (`MINIGAMES[id].host`, `gameHostedBy`) offers it from their first
  line (`DialogueOverlay`, a gold "🧪 Potion Lab" beside any service — over
  their quest's offer too, as quiet there as "I'm on it!", leaving it
  offered; over a reminder, keeping its own bookkeeping from the last line as
  ▼ Next would; never over a reward or a riddle; on a step through them only
  on its last line, which it finishes) → `OPEN_GAME` → machine substate
  `world.minigame` (context `game`) → `features/minigames/MiniGameStage`
  (a `ModalLayer`): a round window grows from the middle (`ZOOM_MS`; a fade
  with reduced motion), the title card (logo, the host's hello, three "how to
  play" steps, the band, the collection and stars, Back / Play — Play focused
  without scrolling, a held Enter ignored), the game,
  and a reward after each round (`RewardScreen`: what was made, the stars,
  what was learned, only what's new). The stage plays the game's `music`
  (`overlayOwnsMusic`, `machines/gameFlow.ts`, makes `App` step aside), hides
  the map's toasts, sets `openedFlag` (📜
  Menu → 🎮 Mini-games, `MiniGamesPanel`), and pays: a game calls
  `onPage(page, label)` as it finds a collection page and `onFinish(outcome)`
  when a round is done (a game with something just for fun before the reward
  — Mirror Mural's free canvas — calls `onClaim(spotOn?)` as the round is
  earned: it pays then, once, and records the Expert seal, so leaving by 🗺️
  Map keeps both, and `onFinish` only shows the reward); `lib/minigames.ts` (`claimPage` / `claimRound`, pure)
  saves `mg:<game>:page:<key>` / `star:<n>` flags (additive, no save bump)
  and pays `MINIGAME_PAGE_XP` per new page and `MINIGAME_STAR_XP` +
  `MINIGAME_STAR_COINS` per new star (economy, in `content/items.ts`) (★ first round, ★ half the collection,
  ★ all of it) and the game's `firstItem` once — replays pay nothing but
  still `recordActivity`. **Bands:** `bandFor(level, age, !!def.expert)` —
  from the level, 1–3 Gentle, 4–6 Medium, 7–10 Tricky, raised where the
  kid's content age (`age + (level − 5) / 2`) calls for more: 8–9 Medium,
  10–11 Tricky, 12 and up **Expert** (DESIGN §8) on a game with it
  (`def.expert`: its `note` under the chooser, and on Expert its own `hello`
  and three `steps` on the title card; `PlayBand` is the three bands and
  `expert`, `PLAY_BANDS`); where the age lifted it the card's note says so,
  with what the level alone suggests (`bandFor(level)`); a game without
  Expert yet plays Tricky if handed it
  (`upToTricky`). The kid may pick another, remembered per kid and game on
  this device (`rememberBand`, Expert only where the game has it; picking
  the suggested band again forgets it, `forgetBand`, so it grows with the
  level). On Expert a game says how many answers were spot on
  (`RoundOutcome.spotOn`); all of them is the **Expert seal**
  (`mg:<game>:seal`, `sealFlag`): shown on the title card with the stars and
  on the reward (won, in what's new; won again; or "Spot on: r of n", with
  "yours to keep" where it was held before — `Seal`), counted only on Expert
  and from a round with something in it (`spotOn.of > 0`), never paid; the
  title card's pictures are `GameScreens.expertSteps` on Expert where a game
  has them; the reward's buttons are in a footer of their own under what
  scrolls, so they're always in view and over nothing, and a tap on them
  waits `SETTLE_MS` as the reward comes up (a key doesn't: no click count) —
  the last step's double tap had skipped the reward; the stage's
  `round` starts at the rounds this kid has finished in the game on this
  device (`roundsPlayed`, `noteRoundPlayed` as a round ends), so a visit
  picks up a game's orders where the last left off rather than at the same
  first round; a mini-game **never moves the question level**. No timers, no AI: each game's rules are pure in
  `lib/minigames/<game>.ts`. Each game's play screen loads on first play
  (`GAME_SCREENS[id].Play`, `retryableLazy` in a `LazyBoundary`, "The … didn't
  open. Try again."; a bug in it stays on the stage too, `PlayCrashed`, with
  the details for grown-ups and 🗺️ Map); its title-card art loads with the
  stage. A game focuses where it starts as it mounts (the Potion Lab: the
  jars, described by the order's ticket); the way out is "🗺️ Map" on the
  title card, the header and the reward. Shared look:
  `features/minigames/styles.ts` (the navy window, gold buttons, pixel titles
  in Jersey 15 — `public/fonts`, Tailwind `font-pixel`, a cyan `focusRing` on
  every button) and `parts.tsx`
  (`Stars`, `HostBubble` — a live region, `phoneStrip` on phones — `EmberSprite`,
  `Ticket`, `StepChips`). Hosts never wander (`npcWanders`). **🧪 Potion Lab**
  (`verdara-merchant`, Trader Tadpole, `lib/minigames/potionLab.ts`,
  `features/minigames/potionLab/`): red cabbage juice as a pH indicator — 12
  jars (Gentle 6, Medium 9, Tricky 12, `jarsFor`), colours by pH (`shadeOf`:
  three on Gentle / Medium by kind; five on Tricky by where a jar's whole-number
  pH sits on `TRICKY_STRIP`, whose ranges are also the guesses' labels,
  `stripLabel`), guesses by band (`guessOptions`: the colour; acid / neutral /
  base, with `guessKey` from kind to colour; the five-colour strip),
  orders (`orderFor`, every one brewable at its band; on a phone or a short
  screen the order is in the step card too), the Brew Book (a page per jar
  with its name, read back by Tadpole and under the book, `pageLine`; a jar
  in it says "📖 In book" on the counter, never its kind), `STIR_MS` before
  the colour shows. On Expert: all twelve jars and the strip, an order of one
  pH said in tens from pure water (`orderFor` → `Order.ph` from
  `EXPERT_ORDERS`, `orderWords`; `fillsOrder` when the order's pH is in the
  jar's), the pH guessed as a number (fifteen buttons; `guessedRight` when
  it's in the jar's range — `Jar.range`, `phRange`, `phWords` — `stepsOut`
  how far from it), Tadpole's verdict in tens and in the jar's own words
  (`guessVerdict`, `TIMES` and `STEPS` across the whole scale, `kindAt`; a
  range counted to both ends), which way to look after a jar that doesn't
  fill the order (`orderNudge`), `scaleWords` in the why and the page — a
  Brew Book page waits till its jar's brewed this round (`held`: no colour,
  kind or fact) — and the round's guesses spot on as `spotOn`. The counter
  shows only where its rows clear the scene and leave it room —
  `jars-6`, `jars-9`, `jars-12` in `tailwind.config.js`, by the round's jars
  (`JARS_AT`, literal classes) — else the jars are in the step card, first in
  the side panel; a jar's "In book" word shows only where the jar has room
  for it (a container query; 📖 alone where it's narrower). Stir sticks to
  the card's foot while a guess is made (`scroll-pb-24` on the panel then,
  and the guesses scrolled clear of it as the step starts, never on a tap),
  the card scrolls to the result only once it's brewed, and a step's buttons
  wait `SETTLE_MS` as it starts (`useSettled(step)`: jars, guesses, Give,
  Try another). **🥧 Dot's Bakery** (`village-baker`, Baker Dot, Lumina
  Village — she also gives a quest, so the game shows over its offer;
  `lib/minigames/bakery.ts`, `features/minigames/bakery/`): fractions with
  pie — three orders a morning (`orderFor(band, round, i, queue)`,
  `ORDERS_PER_ROUND`: what's asked by the slot, who asks from `morningQueue`,
  regulars not in the book first, since the stage starts each visit at round
  0) from eight regulars of the village (`REGULARS`, each a real NPC with a
  favourite pie — the Regulars' Book, a page each served right); the kid picks a cut (`CUTS`: halves and quarters on Gentle; thirds,
  sixths and eighths too on Medium and Tricky), taps slices into the box on
  `PieArt` (or − / +) and closes it: `check` against the order, any cut that
  makes it right (`compare`), a box that's off said back (`boxWords`,
  `verdictWords`) and fixable, a cut that can't make it said so (`cutHint`,
  with "Cut it another way" as the gold button) — both naming the order as it
  was asked (`askedWords`: Tricky's number stays a number, a shared order two
  shares; the ticket's picture too), so converting and adding are the kid's;
  Medium orders more than a pie; Tricky asks in percentages and decimals
  (`numberWords`, `asNumber`) and boxes two people's orders together
  (`Order.with`); on Expert an order is a ratio, a rate or a percentage
  change (`EXPERT_ASKS`, `Order.expert`: the ticket's `badge`, a miss's `how`,
  a right box's `working`), always on two pies (`boardPies`), its cut hint
  only after a miss (`cutHint` is null there; `verdictWords` says it, as
  `cantMakeWords`, and the cut is said again if the box is fixed — `told`;
  a cut that can't make it makes "Cut it another way" the gold button on
  every band), and the boxes right at their first close are `spotOn`; the
  reward keeps an Expert morning's first missed order's working, and the
  morning's "is the same as" lesson on the others
  (`learnedLine`; more slices than a pie has are "Three halves is the same as
  one and a half pies."). The pies are in the step card on a phone (as wide
  as it, so an eighth can be tapped, but no taller than about a third of the
  screen, so the box and its button fit under them) and beside the steps from `sm` up,
  sized from the board (up to 260 px; the scene gets 45 % of the side, 88 px
  on a short screen) so they stay in sight. In a side panel up to 800 px
  high the step card comes first, with the order in it (`OrderLine`; who
  it's for left off on a phone on its side, and the order there after a miss
  too), so the cuts start in view; in the 300 px panel (`sm` to `lg`) and on a 320 px
  phone each cut has its word under its picture (`narrowCuts`); up to 600 px
  high the order line sticks at the top of the card (`scroll-pt-24` keeps
  its room), and on a short side panel the closed card leaves the pies and
  what's in the box to the board. A step's buttons wait `SETTLE_MS` for a
  tap as it starts (`useSettled`, `ready`: a cut, a slice tapped on the
  board, Close, Fix, Cut it another way, Hand it to, and − / + for a tap's
  second — a key, with no click count, isn't held back, here and in the
  Potion Lab), and the last order is served once. The gold button scrolls into
  view as a step starts, never on a slice tap, and what's in the box has a
  fixed height above − / +, so nothing moves under a kid's finger. On the
  board a slice in the box keeps its filling, lifted with a gold outline and
  a tick; the ticket and the closed box draw what's in it full and the rest
  pale. The scene's customer and
  Ember stand over the SVG as HTML (no `foreignObject`). **⚙️ Clocktower
  Gears** (`gearfall-clockkeeper`, Tock, Gearfall — he gives a quest too;
  `lib/minigames/gears.ts`, `features/minigames/gears/`): gear trains — three
  machines a round (`jobFor(band, round, i, queue)`, `JOBS_PER_ROUND`; which
  machine from `roundQueue`, machines not in the book first; the board and
  what's asked by the slot). A board (`board(rows)`: `E` the crank's peg, `X`
  the machine's) is pegs on an odd-r hex grid one peg apart (`pegAt`,
  `touching`); the crank and the machine slide on their axles to touch only
  their own peg's gear at any size (`ends`, `radius`: teeth ÷ 32 pegs).
  `run` turns the crank clockwise: every gear it reaches turns the other way
  from the one turning it (a breadth-first walk), a gear pushed both ways is
  `jammed` (one ring of three gears that all touch — the two pushed the
  same way and a third touching both, never the crank's own peg if there's a
  choice — marked and shaken, the same whatever order the pegs were
  tapped), a train that stops short is
  `not-joined`, and the machine's speed is crank teeth ÷ machine teeth;
  `check` against the job (Gentle: just turn; Medium: `turn`; Tricky: `turn`
  and `speed`, the crank's gear picked from `CRANK_TEETH`), said back by
  `verdictWords` and taught by `learnedLine` ("Five gears between…: an odd
  number, so it turns the same way as the crank"). Gentle's boards can't
  jam; Medium's and Tricky's offer both ways round (tested by trying every
  filling, `solve`); four or five boards a band, so a round's three change.
  Tricky's crank starts with no gear (`Pick the crank's gear first`) and its
  ticket says the machine's teeth. On Expert a job is said in numbers
  (`Job.rpm`: the crank's turns a minute; `Job.force`: turning force, the
  speed's inverse — `forceWords`), the crank's gear is one of
  `EXPERT_TEETH` (8, 16, 24, 32; each job made by exactly one, and the
  board's frame holds the 32, `biggestFor`), a miss is said in the job's
  numbers with the rule and a right run with the ratio (`ratioWords`), and
  the machines right at their first run are `spotOn`; the gear ratio is
  said driven : driver (`ratioWords(machine, crank)`: "8 : 24 = 1 : 3"), a
  force job's miss is headed in force (`FORCE_HEADS`) and said with
  `forceAmount` ("not four times"), and the reward keeps the first missed
  machine's lesson. The job line (`JobLine`) is in the step card on a phone
  and a short screen (up to 500 px from `sm`), smaller on a narrow phone;
  on Tricky and Expert up to 800 px, and on Expert from `sm` up to 600 px
  it sticks at the panel's very top (`-top-4`), smaller, with the four
  gears in a row and the how-to left to the title card — the panel's
  scroll padding is its height then, so keyboard focus lands below it.
  What happened comes into sight with its button the same way. As a step starts (a
  machine, Change the gears, Take all the gears off — never a peg tap, even
  one that clears a miss) `stepScroll` (`minigames/stepScroll.ts`, pure,
  tested; Mirror Mural's Expert uses it too) moves the scroller
  only as far as it must: Turn the crank wholly in sight, and on Tricky and
  Expert the job line — or the crank's gears under a stuck one — not under
  what sticks at the top (the line, or a phone's board); where both can't
  be, the job wins on Tricky and Expert, the button on Gentle and Medium.
  Never on a phone on its side under 640 px, where the board scrolls with
  the page. The scrollers aren't anchored (`overflow-anchor: none`: Take all
  the gears off coming up below had moved the gears under the line). On
  every band a step's buttons wait `SETTLE_MS` as it starts (`useSettled`,
  keyed on the machine, `again` — Change the gears and Take all the gears
  off — and the runs: the pegs, the crank's gears, Turn the crank, Change
  the gears, Take all the gears off, Next machine — gears placed one after
  another aren't held back, after a miss either, nor is a key), so a double
  tap's second doesn't press what came under the finger; Enter on the
  crank's peg just after focus moved there is a double Enter's second
  (`useFocusMoved().fresh`, `keys.ts`). `GearShape` sizes a tooth's depth
  and outline by the space between teeth, so every gear's teeth match
  (`toothDepth` for a set drawn together); the frame leaves the top and
  bottom rows' teeth room. Each peg is an SVG `role="button"` (Enter /
  Space, a held key once; a drawn focus ring) named by row and place, what it
  touches and, after a run, what its gear did ("Middle row, peg 1: a gear,
  turning anticlockwise ↺. Take it off. Touches the crank, top row peg 1 and
  middle row peg 2."); focus starts on the crank's peg (the pegs come first
  on the page) and a peg tapped keeps it. A run spins what turned for three
  turns of the crank (`animate-spin`, each gear's period from its teeth;
  reduced motion: still) with a bold arrow on each hub; before a run a dashed
  arrow on the machine shows which way it must turn.
  The frame (`boardBox`) holds all three rows and the crank's handle all
  the way round (`HANDLE`); from `sm` up the board is sized to its space
  (`useFitWidth`, a ResizeObserver) with its heading on it and its labels
  under its ends; Tab goes left to right from the crank's peg. On a phone
  the board sticks to the top while the steps scroll, and the page keeps its
  height as scroll padding so a result never lands under it; the gold button
  scrolls into view as a step starts, never on a peg tap. From `sm` up the
  Clocktower's room (the great clock, today's machine on its plate, stopped
  or running) is above the board; a phone and a short screen keep just the
  board (not sticky on a phone on its side under 640 px). `useFitWidth`
  (`features/minigames/useFitWidth.ts`) is shared: a board's width that fits
  its space from `sm` up, null on a phone. **🪞 Mirror Mural**
  (`chromaria-curator`, Madame Hue, Chromaria — she gives a quest too;
  `lib/minigames/mural.ts`, `features/minigames/mural/`): symmetry and colour
  mixing — three pictures a round (`jobFor`, `roundQueue`: those not in the
  Gallery first). Nine 6×6 patterns (`PATTERNS`, each the same across and
  down so every mirror fits, drawn in two colour slots — never two a
  colour-blind eye mixes up, but opposites); a job's `kind` says how the
  given part makes the rest (`source`, `given`): `across` (Gentle, Medium),
  `down` (Medium), `four`, `turn` (rotational: its top-right quarter's
  colours swap, a pinwheel, or the top half flipped down would match too)
  and `opposite` (each colour's opposite, `OPPOSITE`; Tricky — its paints
  come in their pairs, side by side). Every painted square and paint shows
  its colour's letter (`GLYPH`), the kid's bare squares are outlined. The
  kid mixes the paint first from two pots (`mix`, `recipe`; Tricky has white
  for tints — paint, not light), a wrong pair said kindly (`mixWords`, in
  the step's status; Madame Hue's line stays put); then paints (tap, a drag
  across the squares — pointer events with `elementFromPoint`, the main
  button and one pointer by id, `touch-none` on the canvas — or the arrow
  keys between the kid's squares, one in the tab order, and Enter), each
  square named by place, colour and the square it copies; the mirror
  (`mismatches`, `checkWords`) marks on the canvas what doesn't match yet,
  focus on the first marked, and painting goes on — each mark cleared as
  it's repainted; a perfect match pays the page and, the third, the round
  (`onClaim`). Then a free canvas: the left half painted, the right
  mirrored live and hatched (`mirrored`); "Hang it in the Gallery" keeps it
  in the save as one flag whose name holds its code (`mineFlag(id,
  encodeMine(grid))`, the old one dropped — §3.5; the whole copy wins
  between devices, so flags aren't merged), shown under the Gallery; this
  round's pictures show there, and on the wall, in the kid's colours, and the
  reward shows the one hung (`RoundOutcome.picture`). From `sm` up
  `mural/layout.ts` (`fitCanvas`, pure) fits the canvas: the paints are drawn
  at fixed sizes, so how tall they stand at a width is worked out
  (`controlsHeight`) rather than measured — only the space is — and the
  canvas goes beside them (a column at least `BESIDE_PX` wide) or under them,
  whichever leaves it bigger, compact paints where they save room; below a
  floor (26 px squares) it keeps that size and the board scrolls (`tight`;
  the board keeps its scrollbar's room so one can't change the space) — as
  painting starts, the gold button into sight there (`stepScroll`, the
  canvas's top kept). They
  stay in place, unseen, while mixing and after a match so the canvas never
  changes size; on a phone the mirror's rule sits over the canvas. A step's
  buttons wait `SETTLE_MS` as it starts (`useSettled`, shared): a double
  tap's second tap does nothing to what came under the finger — the paints
  and the canvas's pointer too (a key paints at once); the mirror held up
  before a square is painted marks nothing, and says so on the gold button
  ("Paint a square first", `aria-disabled`); a held Enter paints once. The
  in-board scroll runs as a step starts, once the canvas has its fit, not at
  a check, and on the free canvas (its paints stand taller) Hang it wins
  over the canvas's top. The
  mark is sized from the canvas (container units), so a square's letter shows
  in it; the focus ring is drawn over it. On a tall enough screen Madame
  Hue's bubble sticks to the top of the panel (`useStickyHeight`, shared with
  Clocktower Gears' board). The room above (this round's three frames) from
  `sm` up, but not where it's narrow and short too (up to 767 × 620: the
  board needs the height). The canvas is described by how the keys work it
  (`mm-keys`). On Expert (`Job.expert`) the kinds are its six moves (`MOVES`:
  `across`, `down`, `diag` — y = x, `turn`, `quarter` — quarter turns
  clockwise, `shift` — by (3, 0); `source` for each, tested corner for
  corner against `mapPoint`), two rounds of three; step 1 (`'name'`, no
  pots) names the move from `Job.p` (A, inside every move's painted part,
  each move taking it somewhere else) and `pImage` (A′): `nameAsk` (each A
  kept with its point), `nameWords`, `MOVE_NAME`; each pair of rounds turns
  the order of a round's three moves on one and gives each move the other A,
  so a picture's number doesn't give its move away; the ticket
  and the phone's line hide the move till then (`jobWords(job, named)`), and
  the canvas is bare (`BARE`: the painted part's shape gave the move away).
  On Expert the goal is `unfaked`: the first of `SWAPS` (the given part's
  two colours swapped in one place) that leaves no other way of copying it
  (`fakes`, against `OTHER_MAPS` — every kind's `source`, the square's turns
  and mirrors, two slides, the quarter turned the wrong way in place — a
  quarter turn anticlockwise about (3, 3) makes the same picture as the
  clockwise ones) — every pattern is the same across and down, so a half
  turn had painted x = 3's picture; the test writes the ways out apart from
  `OTHER_MAPS`, and paints each picture by every move through `mapPoint`.
  Expressions are said on one line (`tie`: no-break spaces). `marks.tsx`:
  `Axes` puts 0–6 round the canvas inside its fitted size (`AXIS`), and
  `MoveMarks` (an SVG in the canvas's coordinates) draws A and A′, or —
  once a check has marked squares — the move's line, centre (with an arc
  for how far round, clockwise) or vector, its arrowhead its own (`useId`),
  with its rule (`ruleWords`, `markWords(n, job)`; over the canvas on a phone
  too); `AskPicture` draws A and A′ small beside the moves on a phone (on
  one on its side, the moves three across beside it), and Step 1 scrolls it
  into sight with That's the move (`stepScroll`, the picture winning; from
  `sm` the side panel, the ask winning, under a stuck bubble). The squares
  are said by their corners ("Square (3, 5)
  to (4, 6): bare."); while painting the given ones are in the arrow keys'
  grid too ("…: purple, given.", `aria-disabled`), and a kid's square says
  what it's the image of only once it's marked. The letters are drawn over
  the line (`z-[1]`); the free canvas has its x = 3 (its lines `tie`d too);
  Expert's title card paints with no line (`StepImage`). Its lessons are the
  moves' (`learnedLine`; the reward's the first missed picture's), Madame
  Hue speaks plainly, and the pictures right at their first naming and
  first check are `spotOn`, passed to `onClaim` (typed as the game's own
  in `PlayArea`).
  The steps' buttons wait for a tap's second, not a key's (`e.detail`), on
  every band. **🎵 Echo's Call** (`chromaria-musician`, Bard Lyra, Chromaria —
  she gives a quest too; `lib/minigames/echo.ts`, `features/minigames/echo/`):
  pitch, melody and reading notes — five chimes, C D E F G low to high, each
  its colour, letter and name (`CHIME`), long to short. Three tunes a round,
  each a note longer (`echoFor`, `roundQueue`: those not in the Songbook
  first, only those the band can play): the openings of eight old tunes
  (`TUNES`, all public domain). Gentle has three chimes (C D E, five tunes)
  and 2–4 notes; Medium all five and 4–6; Tricky 5–7, read from a staff
  (`staff`) or listened to with one note Lyra plays wrong (`wrong`, a step
  off) and found on the staff. Each echo: Lyra plays it — each chime lights
  as it rings, and once she's done what she played is said for a reader —
  then "did it end higher, lower or the same?" (`shape`, said kindly either
  way), then the kid plays it back: a wrong chime says where the right one
  is (`judge`, `tapWords`) and nothing's lost; the last note pays the page.
  The staff's notes are said by their place, not their name (reading is the
  job; `PLACE`), even in the shape answer; the staff's lines are drawn once
  behind its note columns, with a treble clef. Once the wrong note's found
  she plays the tune as written. The chimes ring through `lib/tones.ts`
  (`playTone`: a Web Audio bell at any pitch, following the sound-effects
  setting — off by default — so the game works silent, and has a "Sounds"
  switch for that setting; `wakeTones` wakes the audio in the Listen tap, as
  iOS needs); the stage plays no music for it (`music: null`). Her verdicts
  are in the step's card too (`Said`, not live — her bubble is), as on a
  phone the bubble's below the fold; Listen is one button ("Listen again"
  after), Next under it in a place kept from the start. Two columns only on
  the `split` screen (`tailwind.config.js`: 768 px wide, or a phone on its
  side from 640) — narrower tall windows stack like a phone, the step card
  under the chimes so it growing never moves one (and each step scrolls back
  to the board's top). The board itself puts the step beside the chimes on
  any screen on its side from 560 px, under them on one held upright; the
  Sounds switch sits over the chimes, named, but by the step's heading on a
  phone under 640 px high (by its icon there, `compact`). A
  step's buttons wait as it starts (`useSettled`), and the listen step's
  Next as it first appears too (a second settle, keyed on `heard` — for it
  alone) — a tap's, not a key's (`e.detail`); a held Enter rings a chime
  once. Under the chimes, which way is higher; the staff's geometry is
  `staffY` / `STAFF_LINES` in `echo.ts`. On Expert (`Echo.pair`) the modes
  are staff, ear, staff (5–7 notes, all five chimes) and the `interval`
  step takes the shape's place: `asked` gives the two notes Lyra marks
  (`pairFor`: a perfect 5th where the notes make one, else the tune's turn
  of `EXPERT_ASKS` — each made by its first five notes, tested — from the
  next of the pairs that make it, `pairsMaking`; `echoFor`'s turn is the
  round plus one each time the songbook's gone round, so each comes up read
  and heard, and on Expert `roundQueue`'s third tune is `EXPERT_THIRD`'s
  turn, its own turn how many times it's been third), `intervalOf` names what two chimes make (letter names for the
  number, `SEMITONES` for its kind), `intervalQuestion` asks it by the notes'
  places and `intervalWords` gives the method either way (the letters the
  way the tune goes, the semitones step by step); the staff's and the
  slots' two notes are marked while it's asked and, fainter, played back (a
  heard tune's from the first listen; `listen(e, only)` plays the two
  alone); the staff's C has its ledger line past the head. A double Enter's
  second press on the chime or staff note focus just moved to does nothing
  (`useFocusMoved`, every band). The chimes say their letters only, as does
  what Lyra played for a reader; Lyra speaks plainly; the Songbook keeps
  the tune being played `held` and every page's notes hidden (`bare`) till
  it's echoed; an interval right at the first pick with no wrong chime
  played back is `spotOn`, and the reward keeps the first tune's lesson
  whose interval was missed, else the first missed (`missedLesson`). The
  chimes' description adds what Lyra said of the answer (`ec-said`), as a
  focus move can cut her live bubble short.
  **✨ Vela's Star Charts** (`coast-stargazer`, Vela, Starfall Coast — no
  quest of her own, so ✨ is her gold offer; `lib/minigames/stars.ts`,
  `features/minigames/stars/`): star pictures and how far starlight travels.
  Nine pictures (`PICTURES`: stars on a 100 × 100 sky, lines between them, a
  note, and one star's light-travel time — rounded, or "at least"); Gentle's
  four with a dotted outline, Medium's five with only the card, Tricky all
  nine on a sky turned (`TURNS`), the years on the card (`learnedLine`).
  Every picture is the real sky's way round — turned, never mirrored
  (`stars.test` checks three stars of each against their J2000 positions);
  a turned one is said without "up" (`turnedLooks`, `looksWords`, and
  `turnWords` for how far). Each job (`jobFor`) adds tiny extras, seeded,
  clear of every star and every line drawn (`EXTRA_GAP`, `segmentGap`).
  Joining: tap a star, then one it's joined to (`isLine`, `lineKey`,
  `joinWords`, kind either way); the last tapped stays picked, and tapped
  again stays picked; with every line from it joined, a tap on another
  starts the next stroke; "Show me a line" makes two glow and picks the
  first, from the star picked if it can. Medium's Little Dipper first finds
  the North Star: the Big Dipper's bowl drawn top right (`POINTER_GUIDE`,
  `GUIDE_BOWL`), Merak then Dubhe (`POINTERS`), then the arrow to Polaris
  (`pointerArrow`). The sky is one pointer target, acting as the finger
  lifts (a press that moves `SWIPE_PX` or is cancelled is the page
  scrolling): a tap picks the nearest star within reach (`TAP_REACH`, 7% of
  the sky but at least `TAP_REACH_PX` on a small one), so small stars are
  easy to hit; from the keyboard one star is in the tab order (a picture's,
  never one of the others) and the arrow keys move to the nearest that way;
  each star is said by where it is (`placeWords`; alike ones numbered) and,
  picked or joined, its name — placed under, over, beside or at a corner of
  its star, whichever covers least (`nameSpots`, pure, tested for every
  sky), on a small sky only the picked star's and the last line's while
  joining. The hunt's words are `HUNT_WORDS`, tested against where
  `POINTER_GUIDE` draws its stars. The step's card — the picture card, the
  lines joined, the hint, what Vela said (not live — her bubble is) — is
  beside the sky or under it, whichever lets the sky be bigger
  (`useSkySize`: on a phone, the screen's height under the header, the
  card's top kept in sight; the same card width all through a picture, so
  the sky doesn't change at the payoff), the whole column up to 700 px high;
  a fact card taller than its room scrolls to its Next. **🌳 Ringwood's Rings**
  (`elder-ringwood`, Old Ringwood, Eldergrove — no quest of his own, so 🌳
  is his gold offer; `lib/minigames/rings.ts`, `features/minigames/rings/`):
  reading tree rings. The grove's weather (`weather`) is one for every tree,
  its dry years unevenly spaced, so a run of rings fits one place only; a
  ring's width is its weather's (`RING_WIDTH`). Eight trees (`TREES`, the
  year each fell or was cored, a fire's scar on some); Gentle counts a
  slice (`count`: the young tree's `age` in rings, 4–8, then the widest),
  Medium reads a core (`date`: 10–14 rings — an event's year, the same in
  every tree (`EVENTS`), counted back from the bark, then every thin ring),
  Tricky cross-dates (`match`: a beam of 8–10 rings slid along a living
  tree's 30-ring core, `matchesAt` / `fitOffset`, till it fits; "Not yet"
  says whether the thin rings line up, `thinLinedUp`). The slice and the
  core are each one pointer target, acting as the finger lifts (the shared
  `useLiftTap`: a press that moves `SWIPE_PX` or is cancelled is the page
  scrolling; a right-click or a mouse leaving drops it; a click's own
  pointer type says whether it's a pointer's) — the ring under the tap, a
  ring the step wants `WANT_PX` wide to hit (the next to count reaching
  outward only) and any ring `RING_MIN_PX`, the thinner winning, but never
  past a neighbour's middle third (`rings/hit.ts`, `ringAt`, tested as a
  table) — with
  a button per ring for the keyboard (one in the tab order, the arrow keys
  in and out) and a reader (where it is, how it grew; the slice's each over
  its ring, so a reader's press lands on it; a pointer's click after its
  tap isn't a second, `pointerClick`); the slice's rings are drawn to their
  widths (`data-band`), the core's as bands; the two Tricky cores are one
  picture, the beam slid by ◀ ▶ or a tap along the tree's core (a slice's
  card is beside it held sideways, a core's always under it, Tricky's beside
  only on a short phone — on a short split screen under, compact), both cores'
  rings said under them for a reader, live (`rr-under`). What Ringwood said
  is in the step's card by the wood, and till he's said something, what he
  asked — a tip; a step's start adds the next ask to what he says. The shared
  `Ticket` puts its chip by its heading, and `HostBubble` wraps a long word.
  **📜 Index's Timeline** (`archive-index`,
  Index, the Sunken Archive — she gives a quest too; `lib/minigames/
  timeline.ts`, `features/minigames/timeline/`): putting things in the
  order they happened. Eight sets of seven (`SETS`: inventions, discoveries
  and buildings — no wars, disasters or religion, tested — each event a
  year, "about" where it's rough, a name to say mid-sentence and a `why`
  naming no other card); Gentle and Tricky pick 3–4 or 6–7 of a set
  (`PICKS`), Medium five keeping the oldest whose neighbours are `MIN_GAP`
  years apart (as Gentle's; `yearsApart`: no year 0), dealt with at most a
  third in place, none of three, and no run in order longer than half
  (`deal`); Tricky with
  years (`yearWords`: BCE counting down; `BCE_WORDS` said as it starts),
  the others "years ago" once filed (`whenWords`). Each card tapped goes in
  the next empty place (marked "next"), oldest first, and one on the line
  tapped comes back — every tap among the washed-up cards, so a phone
  needn't scroll to and fro (held upright under 560 px wide, they and the
  timeline side by side, the step a bar kept under them); each card leaves
  a slot its own size (`CardSlot`) and, held sideways, an empty place keeps
  a card's room, so nothing moves under a finger. "Check the order"
  (`check`: the longest run already in order, with every card already in its
  place, each moved to its own place — a run of one only if in place;
  `checkWords`; `clueFor`: the first empty place and the card for it, naming
  only cards dealt) keeps those and floats the rest back, Index saying how
  many and the clue, the box by the timeline just the clue till the next
  check; a check starts the wait again. Focus starts on the washed-up cards
  (a group described by how to play), so a Tab goes to the first; a card
  placed from the keyboard moves it on to the next card left, or Check; a
  wrong check, to the first card back — where a key's press within
  `SETTLE_MS`, or a held key's repeat, does nothing (`useFocusMoved`,
  `noRepeat`); each landing is said by Index, and the same words said again
  carry a zero-width space so her bubble reads them again. `HostBubble`
  takes a `portraitClass` (the Timeline hides her picture on a short split
  screen under 760 px wide). Held sideways from 560 px (and 501 px high) the
  board is a grid: the timeline across the top, the washed-up cards (how to
  play under them) and the step's card side by side under it; held upright
  (a phone, or a tablet), the cards and the timeline side by side; on a
  phone held upright the board is the page's height at least
  (`min-h-[100cqh]`, the page a size container) and the step one bar at its
  foot, sticky (a media list with a comma is dropped by Tailwind as an
  arbitrary variant: "under 560 px or upright" is two variants); long
  words in a card's name are blocks with a soft hyphen (`Breakable`), so they
  break only where they must. **🐉 Ember Air Mail**
  (`port-postmaster`, Pidge, Port Lantern — no quest of her own, so 🐉 is
  her gold offer; `lib/minigames/airmail.ts`, `features/minigames/
  airmail/`): maps and directions. Three maps: the bay (`BAY`, 5 × 5,
  Gentle), the town (`TOWN`, 6 × 6, its squares named by `gridRef`, eight
  houses each just beside a landmark, `TOWN_CLUES`) and the world (`WORLD`,
  12 × 6 squares of 30°, each marked by its continent or ocean, the equator
  under the 3rd row, east and west joined). A job (`jobFor`) is a stamp's
  kind of post (`STAMPS`, three a band) to a place, a house (by its square or
  a landmark) or a continent or ocean (`REGIONS`, each a clue and a fact).
  The compass (`BAND_DIRS`: four, eight, four) moves Ember a square
  (`move`), and so does a tapped square next to her (`useLiftTap`); Deliver
  checks (`delivered`) or says — the first miss on the town or the world —
  how to find the place (`howToFind`, a region's `spot`), then which way
  (`missWords`, `relWords`, the nearest square by `movesBetween`); Tricky
  then asks how far the place is from Europe in a straight line to its
  nearest square (`squaresAway`, `rulerTo` — drawn as a ruler; `farChoices`
  with the answer's place by `farSeed`, the round and the place;
  `KM_PER_SQUARE` as the map's scale). The map is sized to fit with the
  card beside or under it, whichever lets it be bigger (`airmail/layout.ts`,
  pure and table-tested: `fitMap` — the card under it sized from its parts,
  `cardUnder`; beside it only where the card holds the compass, Deliver
  under the compass where the card's narrow, `stack`; under it, Deliver over
  the compass where the column's narrow, `narrow`); the side panel splits
  off on the `wide` screen (`tailwind.config.js`: from 768 px wide with
  height, or from 1000 px — not the stage's `split`: a phone held sideways
  gives the world its width); the post office scene's left out for the
  world and on a tablet held upright; on a short phone held sideways what Pidge said goes
  under the map when there's room (`saidUnder`), and on a short split
  screen a stamp's card goes beside it. Pidge's bubble re-reads the same
  words (a zero-width space every other time); for a reader the map is
  described by the clue (the round's first parcel), where Ember is and where
  the parcel's going (`targetWords`; the world's place only once a wrong
  delivery's named it). A game's focus moved from script shows its ring for
  the keyboard only: `features/minigames/lastInput.ts` (`lastInputWasKey`)
  listens from the stage's load, as `:focus-visible` matches after a mouse
  click on the title card's button too. **🔨 Word
  Forge** (`ink-dot`, Scrivener Dot, Inkwell Cove — no quest of her own, so
  🔨 is her gold offer; `lib/minigames/forge.ts`, `features/minigames/
  forge/`): how words are built. Nine families of three words (`FAMILIES`,
  each word its two parts and a meaning — Tricky's in everyday words, not
  its tiles'; three a band, `BAND_FAMILIES`); a job (`jobFor`) is a word and
  a tray of its parts and two to four others, shuffled the same each time
  (more than one: always both endings); each round starts at the next family
  (`roundQueue`); Tricky's tiles say what each part means (`PART_MEANS`), an
  add-on its hyphen (`partText`). Each part tapped goes on the anvil in the
  next place (one on the anvil tapped comes back); Hammer checks it
  (`forgeWords`: right; a real word that means something else — `realWord`,
  the asked words and `ALSO`, every pair a tray can make held by
  `forge.test` to those or a looked-at list of not-words; the other way
  round; -s for -es; two add-ons; an add-on not in the word, where it goes;
  or no word, with `hintFor`, which builds on what the try got right — a
  real word with a part right says to keep it). What's shown keeps an end
  part's hyphen on its line (`keepHyphens`); the reward recaps the round's
  three words (`builtLine`). The tray keeps each
  part's spot; the step's card is beside the board held sideways from 560
  px, Hammer above what Dot said so a long line never moves it, and on a
  short screen — or a small phone held upright — a bar kept in sight under
  it (on a short split screen one row, the meaning and Hammer: what Dot
  said is in her bubble beside the board, kept at the side panel's top). A
  page of the wall is read under it in a place kept for it, so nothing
  moves as it opens. From the keyboard, focus goes on from a part placed to the next, then
  Hammer; from a tap, to the tray. The games' keyboard guards are shared
  (`features/minigames/keys.ts`: `noRepeat` for a held Enter, `useFocusMoved`
  for a double Enter on what focus moved to, `keyed`). The
  bench: `bench/minigame.html?game=&level=&pages=&flags=&ember=` mounts the
  stage alone (start Vite with a stand-in `VITE_SUPABASE_URL`).
