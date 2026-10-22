---
paths:
  - hazel-game/src/features/typing/**
  - hazel-game/src/lib/{typing,leaves}.ts
  - hazel-game/src/content/typing.ts
  - hazel-game/src/store/keyboardStore.ts
  - hazel-game/src/features/battle/{TypeBurst,TypingBonus}.tsx
---
# Touch typing (#165) — read `hazel-game/docs/architecture/typing.md` before changing these files

Non-negotiables:

- Keys are known by their PHYSICAL code (`KEYBOARD_ROWS`, `KEY_BY_CODE`) and matched by what they type (`charKey`); the pure `stepTyping` (`lib/typing.ts`) decides typed / done / wrong / hold / caps / none.
- The home-row hold (`anchorsFor`): the other hand holds its bump key or its Shift for a capital — never Shift for a letter (Windows' FilterKeys / Sticky Keys). It's a per-player setting, `SaveData.typingAnchor`, additive.
- `useTypingRun` leaves Space to a focused button unless the line wants one next, and never types over a focused text field. Lessons wait for a physical keyboard (`fromPhysicalKeyboard`); nothing nudges a glass keyboard.
- New lessons go in `TYPING_LESSONS`; `typing.test` checks a drill uses only keys taught by then. The right key with the wrong Shift is a `caps` nudge, never a miss.
- One live region per typing screen across its states; where there's no button to land on, the heading takes the focus. `LITTLE_HANDS_AGE` (8) lengthens the race and the song.
- Pen-pal replies are kept by their number (`penPalReplyFlag`), never free text. Every typing reward pays once (`typing:<id>`, `page:<id>`, `leaves:<n>` flags).
