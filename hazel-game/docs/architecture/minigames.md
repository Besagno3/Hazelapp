# Mini-games (`src/features/minigames/`)

> The reference for the mini-games' stage and each game (#189; the plan is
> `docs/DESIGN-MINIGAMES.md`). Keep it accurate: when you change how this
> works, change it here in the same commit.

Covers: the host's button, `world.minigame`, `MiniGameStage` (the zoom, the
title card, the play area, the reward), the shared rules and pay
(`lib/minigames.ts`), the shared look (`styles.ts`, `parts.tsx`), the bench,
and each game — so far 🧪 Potion Lab, 🥧 Dot's Bakery, ⚙️ Clocktower Gears, 🪞 Mirror Mural and 🎵 Echo's Call.

- **Mini-games (docs/DESIGN-MINIGAMES.md, #189):** learning games on their
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
  — Mirror Mural's free canvas — calls `onClaim()` as the round is earned: it
  pays then, once, so leaving by 🗺️ Map keeps it, and `onFinish` only shows
  the reward); `lib/minigames.ts` (`claimPage` / `claimRound`, pure)
  saves `mg:<game>:page:<key>` / `star:<n>` flags (additive, no save bump)
  and pays `MINIGAME_PAGE_XP` per new page and `MINIGAME_STAR_XP` +
  `MINIGAME_STAR_COINS` per new star (economy, in `content/items.ts`) (★ first round, ★ half the collection,
  ★ all of it) and the game's `firstItem` once — replays pay nothing but
  still `recordActivity`. **Bands:** `bandFor(skillLevelFor(topic))` — 1–3
  Gentle, 4–6 Medium, 7–10 Tricky — the kid may pick another, remembered per
  kid and game on this device (`rememberBand`; picking the suggested band
  again forgets it, `forgetBand`, so it grows with the level); the stage's
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
  the colour shows. **🥧 Dot's Bakery** (`village-baker`, Baker Dot, Lumina
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
  (`Order.with`); the reward keeps the morning's "is the same as" lesson
  (`learnedLine`; more slices than a pie has are "Three halves is the same as
  one and a half pies."). The pies are in the step card on a phone (as wide
  as it, so an eighth can be tapped, but no taller than about a third of the
  screen, so the box and its button fit under them) and beside the steps from `sm` up,
  sized from the board (up to 260 px; the scene gets 45 % of the side, 88 px
  on a short screen) so they stay in sight. The gold button scrolls into
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
  ticket says the machine's teeth. Each peg is an SVG `role="button"` (Enter /
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
  the board keeps its scrollbar's room so one can't change the space). They
  stay in place, unseen, while mixing and after a match so the canvas never
  changes size; on a phone the mirror's rule sits over the canvas. A step's
  buttons wait `SETTLE_MS` as it starts (`useSettled`, shared): a double
  tap's second tap does nothing to what came under the finger; the mirror held
  up before a square is painted marks nothing; a held Enter paints once. The
  mark is sized from the canvas (container units), so a square's letter shows
  in it; the focus ring is drawn over it. On a tall enough screen Madame
  Hue's bubble sticks to the top of the panel (`useStickyHeight`, shared with
  Clocktower Gears' board). The room above (this round's three frames) from
  `sm` up. **🎵 Echo's Call** (`chromaria-musician`, Bard Lyra, Chromaria —
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
  any screen on its side from 560 px, under them on one held upright. A
  step's buttons wait as it starts (`useSettled`), and the listen step's
  Next as it first appears too (a second settle, keyed on `heard` — for it
  alone); a held Enter rings a chime once. Under the chimes, which way is
  higher; the staff's geometry is `staffY` / `STAFF_LINES` in `echo.ts`. The
  bench: `bench/minigame.html?game=&level=&pages=&flags=&ember=` mounts the
  stage alone (start Vite with a stand-in `VITE_SUPABASE_URL`).
