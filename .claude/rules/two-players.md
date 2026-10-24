---
paths:
  - hazel-game/src/features/duel/**
  - hazel-game/src/features/world/CoopPanel*
  - hazel-game/src/lib/playerTwo*
  - hazel-game/src/lib/kidXp*
  - hazel-game/src/lib/duel*
  - hazel-game/src/lib/coop*
  - hazel-game/src/store/playerTwoStore*
---
# Two players — read `hazel-game/docs/architecture/two-players.md` before changing these files

Non-negotiables:

- Player 2 is another kid of the family — who types their own PIN first (`PlayerTwoPicker`'s `PinPad`) — or a guest. A kid's questions are asked for as them (`profileId` = their id: their age, budget and seen questions); a guest's under the kid playing. The server never takes an age from the app (B8).
- Only the kid playing's answers move their question levels, battle ramp, speed trigger, Library and 📈 Progress tally (`QuestionCard`'s `noted` off for Player 2's). Question levels and the Library never move for Player 2.
- XP: each family player earns their own rate (`seatXpPerRight`) on bank answers once their world is open (#122); a guest earns none. A sibling's XP goes only through `giveKidXp` (`lib/kidXp.ts`: read, then an update guarded on the XP read — never written over a row it didn't read; owed on the device when it can't be written, paid through `addXp`). It writes kid-play columns only, so no 👪 window.
- Player 2's seat is locked for a fight (`locked.two`), and Player 2 never draws a question the hero's pool holds (`partnerPick`).
