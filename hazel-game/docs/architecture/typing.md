# Touch typing (#165, `src/features/typing/`)

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

- **Touch typing (#165, `features/typing/`, `content/typing.ts`, `lib/typing.ts`):**
  Librarian Sage teaches it inside the Library's panel (📚 Library → ⌨️
  Typing lessons): `TYPING_LESSONS`, 13 in the classic order (the home row
  from the bump keys out, the top row, the bottom row, capitals with the other
  hand's Shift, true-fact sentences), each open once the one before is
  cleared (`typing:<id>` flags, `typingLessonOpen`), `TYPING_LESSON_XP` the
  first time, the ✍️ Scribe's Quill badge (`TYPING_BADGE_ID`) for all of them.
  Keys are known by their PHYSICAL code (`KEYBOARD_ROWS`, `KEY_BY_CODE`: the
  standard finger for each) and matched by what they type (`charKey`);
  `useTypingRun` listens on `window` (keydown/keyup, the keys held, Space and
  characters `preventDefault`ed) and steps the pure `stepTyping`
  (`lib/typing.ts`): typed / done / wrong (a miss) / hold / caps (nudges, not
  misses) / none. **The home-row hold** (`anchorsFor`): the other hand holds
  its bump key — J for a left-hand letter, F for a right-hand one — or its
  Shift for a capital; nothing for the space bar; never Shift for a letter
  (Windows' FilterKeys / Sticky Keys). A per-player save setting,
  `SaveData.typingAnchor` (additive, on by default; 📜 Menu → ⌨️ Typing and
  the lessons list). `KeyboardDiagram` draws the keyboard and two hands
  (target gold, anchor blue, the finger lit); `TypingLine` the line.
  `keyboardStore` (`watchKeyboard` in `App`) remembers the first press from a
  physical keyboard this session (`fromPhysicalKeyboard`: a glass keyboard
  names no code); the lessons ask for one first. New lessons go in
  `TYPING_LESSONS` — `typing.test` checks a drill uses only keys taught by
  then.
  `useTypingRun` leaves Space to a focused button unless the line wants a
  space next (`onControl`; a Space it takes, it takes on keyup too), and
  never types over a focused text field (`inField`); `hints.ts` says the next
  key in words for a screen reader (`keyHint`, the short `keyName` between
  nudges) and which key to flash (`wrongKey`). The clocks on the bursts and
  the song wait for every letter's lesson (`lettersLearned`, lesson 11
  `LETTERS_LESSON`) and the player's countdown setting; `TypeBurst`'s
  `readyMs` holds the clock a beat (`DefendTimer`'s `ready`: "Ready…", and
  run out it says "⏰ Time's up"; urgency the last 5 s on a clock of 10 s and
  over, a third of a shorter one — `features/battle/urgency.ts`);
  `LITTLE_HANDS_AGE` (8) lengthens the race and the song; a name's hyphen
  types as a space (`plainName`). A finished lesson or desk line stays
  `LINE_HOLD_MS` before the next; `LineRun`'s `announce` reads the line to a
  screen reader where no lesson live line does (the chest's lock, the letter)
  and `compact` drops the hands; `spellLine` spells drill lines ("F F F, J J
  J"); `TypeBurst` and `LineRun` take focus as they appear. The right key with
  the wrong Shift ("1" for "!") is a `caps` nudge, never a miss (only when the
  key really typed one of the lit key's characters); the diagram's
  `targetChar` draws a shifted mark on its lit key and lights the other
  hand's Shift when no Shift anchor is blue (`keyName` lives in
  `content/typing.ts`). `TypingLine` reads as hidden text ("Type: …",
  spelled for a drill via `spoken`) with `data-line` for the bench; the
  focused boxes are named groups; the live task reads "Type this: …"; a
  typing clock (`what: 'to type'`) doesn't tick aloud; `shortWindow()`
  (under 700 px tall) drops the hands on the desk and the letter.
  `keyboardStore.keysDown()` is the set of keys physically down (kept by
  `watchKeyboard`'s capture-phase listeners); a run and a leaves round start
  from it, so an anchor held across lines stays held. Each typing screen
  keeps one live region across its states (the lesson, the desk, the leaves,
  the lock's overlay, the letter) rather than mounting result text anew. Where a screen has no button to
  land on (the desk's list, the keyboard gate, the lessons list once all are
  cleared, the shelf on the way back, a result card) its heading takes the
  focus (`tabIndex={-1}`, `focus:outline-none`), so a keyboard and a reader
  start at the top of what changed.
  **Back to the Library (#166):** a kid back in the world (a sign-in, a kid
  picked) who hasn't cleared lesson 1 is sent to Sage once a session
  (`WorldScreen`'s `LIBRARY_NUDGE` toast; `battleStore.libraryNudgeSaid`),
  a beat after arriving and waiting out a story, an overlay or a toast —
  only once the intro has played, never to a glass keyboard.
  **In battle (item 2):** once a keyboard is seen and lesson 1 is cleared
  (`typingUnlocked`), a right Attack or block answer is followed by a ✍️
  scribe burst (`features/battle/TypeBurst.tsx`, in `QuestionCard`'s
  `afterAnswer` slot): `burstWord` (the hero's, Ember's or the foe's name,
  lowercase) against `BURST_MS` on the defend timer's bar; typed in time, an
  Attack hits `SCRIBE_ATTACK_MULT`× (`scribeRef`, read when ▶ Go! resolves
  it) and a block adds `SCRIBE_BLOCK_CHARGE` ◆ at once; too late or ▶ Go!
  first, nothing. Each right key sparks on the hero.
  **After a win (item 3):** with a keyboard seen, one win in three
  (`rollTypingBonus`, `TYPING_BONUS_CHANCE`) adds a bonus scroll to the
  victory panel (`features/battle/TypingBonus.tsx`, through `BattleResult`'s
  `bonus` / `onClaimBonus`): the hero's, Ember's or the foe's name as it is
  written, no clock, for coins, XP, a potion or a feather (`claimBonus` in
  the arena pays it once, at the last key).
  **As a battle opens (item 4):** one regular critter in three (`nameRaceDue`,
  `NAME_RACE_CHANCE`; never a boss or a swift critter), once every letter's
  lesson is cleared (`nameRaceOpen`) and only with the defend countdown on,
  starts on a `race` turn: the critter's name (`enemyWord`) within
  `NAME_RACE_MS` (`NAME_RACE_LITTLE_MS` under `LITTLE_HANDS_AGE`). Won, a free
  blow at `FIRST_STRIKE_SHARE` then the hero's turn (`heroStrike`'s `then`);
  lost, the critter darts in first (`enemyTurn`), as a swift one does.
  **The scriptorium (item 5):** 📚 Library → 📜 The Scriptorium
  (`features/typing/Scriptorium.tsx`): pages to copy out line by line
  (`LineRun`, shared with the lessons) — the explanations of the shelf's
  missed questions first, then the fun facts (`scriptoriumPages`,
  `scribeText` makes a passage typeable or drops it, `pageLines` wraps it);
  `SCRIPTORIUM_XP` once a page (`page:<id>` flags, `pagesCopied`); open once
  the capitals lesson is cleared (`scriptoriumOpen`).
  **The song that breaks the hush (item 6):** a boss in `BOSS_SONGS`
  (`songFor`; the Hush Fiend) winds up its power move into a `song` turn
  instead of the plain warning, with a keyboard and lesson 1: a line of the
  song (one per wind-up, round and round) within `SONG_MS`. In time, the
  move drops to a plain blow (`songDone` → `setIntent('attack')`); too slow,
  the warning as ever — Guard still blocks it.
  **🍂 Falling Leaves (item 7):** 📚 Library → 🍂 Falling Leaves
  (`features/typing/FallingLeaves.tsx`, rules in `lib/leaves.ts`: `stepLeaves`
  / `pressLeaf`, pure): letters from the keys the lessons have taught
  (`leafPool`) drift down; the right key catches the lowest such leaf; three
  on the ground or the clock end the round; milestones of 10 / 25 / 50 in a
  round pay `LEAVES_XP` once (`leaves:<n>` flags).
  **Pangram chests (item 8):** about one riddle-chest in four
  (`pangramChest`, by its id) also has a scribe's lock: with a keyboard and
  the capitals lesson, `PathQuestionOverlay` offers its pangram
  (`pangramFor`, from `PANGRAMS`) above the riddle; typed, the chest opens
  with `PANGRAM_BONUS_COINS` on top. The riddle stays on offer.
  **Pen-pal replies (item 9):** a letter quest in `PEN_PALS` (Shush's) lets
  the kid add a line in their own hand at its bring step: `DialogueOverlay`
  offers it (a keyboard and the capitals lesson), one of a few lines picked
  and typed; kept by its number (`penPalReplyFlag`, never free text) and
  read back by the giver at the end (`penPalReadLine`). `QuestConversation`
  carries its `questId` and `step` for it.
