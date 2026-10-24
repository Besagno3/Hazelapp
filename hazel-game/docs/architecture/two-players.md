# Two players (`src/features/duel/`, co-op battles)

> Split out of the old `CLAUDE.md` Architecture section when the two-player branch was merged after the 2026-10-22 refactor. This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files. Decision: `decisions.md` → "Two players on one screen".

- **Two players (#186, `lib/playerTwo.ts`, `store/playerTwoStore.ts`,
  `features/duel/`):** **Player 2** is another kid of the family — who
  types their own PIN first (`PlayerTwoPicker`'s `PinPad`, the limits and
  locks of "Who's playing?"; the screen's own buttons wait meanwhile,
  `onAsking`; a kid already picked this session, or with no PIN yet, isn't
  asked; #188) — whose levels, power-ups and open world are read once
  (`readKidPlay`: their `profiles` row and their save's `worldUnlocked`, each
  within `LEVELS_WAIT_MS` (3 s), else this device's copies, else none — every
  topic at their age's start, no XP) and whose
  questions are asked for **as them** (`profileId` = their id), so the server
  pitches them to their own age (it never takes an age from the app, B8),
  charges their budget and keeps their seen questions their own — or a
  **guest** (a friend or a grown-up): a name (optional, `guestName`, ≤ 20,
  "Guest") and a pace, 🌱 Easier / ⚖️ Same as <kid> / 🔥 Harder
  (`GUEST_PACE_OFFSET` −2 / 0 / +2 levels from the kid playing's own for the
  topic); a guest's questions are asked for under the kid playing, so they're
  written for that kid's age (the picker says so). `playerOneSeat` /
  `playerTwoSeat` turn them into a `Seat` (`QuestionSeat` in `types` — kid,
  age, level — plus name and emoji). The pick lives in `playerTwoStore` for
  the session (a later pick drops a slower read, `pickGen`) and goes with
  the game (`putAwayGame`). **XP for every family player (#188):** right
  answers on bank questions (a starter pays none) pay each kid their own rate
  (`Seat.xpPerRight`, `seatXpPerRight`: 10 + their Scholar bonus, once their
  world is open, #122; a guest none) — the kid playing's through `addXp`, a
  sibling's straight to their row (`lib/kidXp.ts` `giveKidXp`: a read, then
  an update guarded on the XP read — read again if their own device wrote in
  between, up to `GUARD_TRIES`; their streak and play day follow; this
  device's copy of their profile moves too; one kid's writes in turn). What
  can't be written is owed on this device (`hazel-owed-xp-<kid>`), paid with
  the next XP given them here or when they next load here — through `addXp`
  (`payOwedXp` in `profileStore`: once that load's own write has landed, the
  same kid still loaded, so it goes the way any XP does: held while unread,
  today's XP for 📈 Progress). A saved gift goes into their day's record too
  (`addDayXp`). 📈 Progress's answers tally (#173) is the kid playing's
  only: `QuestionCard`'s `noted` is off for Player 2's battle questions, and
  the duel notes the kid playing's answers, never Player 2's. The screens say it (`kidXpWords`: "Saving…",
  "Saved to Mia's game.", "⭐ Mia reached level 4!", "It'll be added the next
  time Mia plays on this device."; `xpStartsLine` for a world not open yet).
  Question levels and the Library never move for Player 2, and a duel moves
  no levels for either. The question plumbing takes a kid:
  `useBattleQuestions(…, { seat })`, `quickQuestions({ kid })`,
  `moreQuestions(…, kid)`, `takeCarried(…, kid)` (the look-ahead cache key
  and carried questions are per kid), and `markSeen(id, kid)` keeps what's
  waiting and what was sent **per kid** (two kids in turn no longer reset
  each other's resend times; each kid's batch goes as theirs on the shared
  timer). **🆚 Quiz Duel** (`QuizDuel`, from a button above the Training
  Grounds' topics, any time): pick Player 2 (`PlayerTwoPicker`, the family's
  other kids and "A friend or grown-up"; `aria-pressed` tiles) and a topic
  (shown once Player 2 is picked; `aria-disabled` while a kid's levels are
  read), then turns go the kid playing, then Player 2, five each
  (`lib/duel.ts`: `DUEL_QUESTIONS_EACH`, `duelTurn`, `duelScores`,
  `duelWinner`). `useDuelRound` keeps one pool per player (the quiz's
  loading, #163: saved first, starters for a thin or slow bank, the rest
  while they play), takes each turn's question as it's reached — never one
  either player had (`allAsked`; a guest at the same level gets the same
  batch as the kid) — gives a starter after `QUICK_WAIT_MS` with nothing new
  (`withDuelStarters`), and carries what a pool couldn't use to that kid's
  next round. The screen: a scoreboard (sky for the kid playing, amber for
  Player 2, the player's turn a thick ring — names and emoji always beside
  the colour), "<name>'s turn" (focused each turn, the Next just tapped
  being gone), the topic and that player's level, the question as the quiz
  shows it with ✅ / ❌ words, 💡, 🚩, and "Next: <name>'s turn →" in the
  next player's colour (a second tap never skips a turn); "End duel" takes
  two taps (`SWITCH_ARM_MS` / `SWITCH_CONFIRM_GAP_MS`). Results: "<name>
  wins!" or "It's a tie!" (focused, confetti), "5 to 2. Great try, <name>!",
  both scores, "What <name> missed (n)" folded per player, a fun fact,
  🔁 Rematch (same players and topic, fresh questions), "New players or
  topic", "Back to the Training Grounds"; and, under the scores, the XP each
  earned (`duelXp`, paid once as the duel ends — `payDuel`; a duel is a day
  played for the kid playing even with none), the footnotes `DUEL_XP_NOTE`.
  Music: the Training Grounds'.
  **👥 Co-op battles (#187, `lib/coop.ts`, `features/world/CoopPanel.tsx`):**
  📜 Menu → "👥 Play together": "Two players" (off) opens the same
  `PlayerTwoPicker`, "👥 Play together!" (`aria-disabled` until Player 2 is
  picked and their levels read) sets `playerTwoStore.coop` (only ever with a
  Player 2; `putAwayGame` clears it); on, it says who plays the companion,
  and "Stop playing together" turns it off (Player 2 kept). In a battle
  (`BattleArena`, `coop` = `two !== null`): `one` / `two` seats — Player 2 at
  their own level for the enemy's topic (a guest's pace counted from the
  fight's level, `enemy.level`), eased by mercy (`partnerLevel`) — with their
  own pools, asked for as them (`useBattleQuestions(…, { seat, off })`:
  regular and super-hard; `off` asks nothing in a fight alone; the battle
  waits for Player 2's first questions too). Player 2's seat is **locked for
  the fight** with Ember's stage and mercy (`locked.two`): a new pick, or a
  kid's levels read late, would re-key their pools and bring the intro back
  over the fight. Player 2 never draws a question the hero's pool holds
  (`partnerPick`: round and round the rest; when all are shared — offline
  starters, or a guest at the kid's own level asking the hero's exact
  request — half a round out of step), regular and super-hard alike. Each round: the kid playing's
  command (the menu says "<name>'s move!", and the companion button is
  greyed "🦊 <name> plays next"), then **Player 2's turn** (`turn.kind
  'partner'`, `PartnerMenu`, no ← Back): the companion's strike or a Pair
  Attack on a question of theirs, or — while the companion can't fight yet
  (Ember an egg) — 📣 a cheer (`mode 'cheer'`: right, `CHEER_CHARGE` ◆ on
  top of the answer's own). Every hero move's hand-over is `endHeroTurn`
  (Player 2's turn in co-op, else the enemy's); Player 2's is `afterPartner`
  (the enemy's turn — or, after a Time Ripple, `skipEnemy`, the hero's
  again). A co-op Pair Attack is two answers (`pairStep`): Player 2's
  super-hard first, then the kid playing's (`resolvePairStep`); a miss from
  either fizzles it, the charge safe, and nobody is asked after a miss. The
  enemy's blows are blocked in turn (`defenderFor`: the kid playing first),
  each with the blocker's own question and countdown (`defendTimeMs` of
  their age); plain blows and power moves are counted apart (`blows`), so a
  boss's power moves come at both players too (the owner's call, #188). A chip above each question says whose it is ("🐼 Ada's
  question" sky / "🦊 Mia's question" amber, smaller on a short screen);
  the battle's top bar shows "👥 🐼 Ada + 🦊 Mia". `recordAnswer(…, who)`:
  every answer fills the team's ◆ and streak (and Keen Eye); only the kid
  playing's move their answers, battle ramp, speed trigger, Library and their
  XP; Player 2's right bank answers are counted for their own
  (`twoBankRight`): as the fight ends `payPartner` gives a sibling those at
  their rate plus, won, the win's XP as the kid playing gets it — under the
  team line, `BattleResult`'s `partner` says what and where (a guest: nothing);
  no ✍️ scribe burst on Player 2's; `defendTimedOut(…, who)` likewise.
  Player 2's questions are marked seen by them (`QuestionCard`'s `seenBy`).
  The result adds a team line (`BattleResult`'s `team`: "🤝 🐼 Ada 3 right ·
  🦊 Mia 2 right"; `correctCount` stays the kid playing's).
