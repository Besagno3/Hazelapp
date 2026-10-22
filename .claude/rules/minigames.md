---
paths:
  - hazel-game/src/features/minigames/**
  - hazel-game/src/lib/minigames*
  - hazel-game/src/lib/minigames/**
  - hazel-game/src/content/minigames*
  - hazel-game/bench/minigame*
  - hazel-game/docs/DESIGN-MINIGAMES.md
---
# Mini-games — read `hazel-game/docs/architecture/minigames.md` (and `hazel-game/docs/DESIGN-MINIGAMES.md`) before changing these files

It is the full reference (the host's button, the stage, bands, pay, the shared look, each game). Non-negotiables:

- A mini-game **never moves the question level**, has no timers and asks no AI questions; each game's rules are pure in `lib/minigames/<game>.ts`.
- Pay goes only through `claimPage` / `claimRound` (`lib/minigames.ts`): XP, coins, stars and the first item once each, as save flags (`mg:<game>:…`, additive — no save bump); a round that pays nothing still calls `recordActivity`. The amounts are economy tuning in `content/items.ts`.
- The host's 🧪-style button follows the service rule in `DialogueOverlay`: never over the host's own quest reward; it never takes or pays a quest except to finish a step through them, once.
- The stage is a `ModalLayer`; the play screen is lazy (`retryableLazy` in a `LazyBoundary` with both `failed` and `crashed`); a game focuses where it starts as it mounts, and each step's gold button comes into view; the way out is "🗺️ Map" (read "Back to the map") everywhere.
- Every flags selector uses a stable `EMPTY_FLAGS`; a colour always comes with a word; every button carries `focusRing`; short screens are `[@media(max-height:500px)]` (min/max-[…] variants make no CSS).
- Render it on the bench (`bench/minigame.html`, a stand-in `VITE_SUPABASE_URL`) at phone, short-landscape and desktop sizes before a push.
