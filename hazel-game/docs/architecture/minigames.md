# Mini-games (`src/features/minigames/`)

> The reference for the mini-games' stage and each game (#192; the plan is
> `docs/DESIGN-MINIGAMES.md`). Keep it accurate: when you change how this
> works, change it here in the same commit.

Covers: the host's button, `world.minigame`, `MiniGameStage` (the zoom, the
title card, the play area, the reward), the shared rules and pay
(`lib/minigames.ts`), the shared look (`styles.ts`, `parts.tsx`), the bench,
and each game — so far 🧪 Potion Lab.

- **Mini-games (docs/DESIGN-MINIGAMES.md, #192):** learning games on their
  own full-screen **stage**, one per topic, each run by a host in the world.
  The host (`MINIGAMES[id].host`, `gameHostedBy`) offers it from their first
  line (`DialogueOverlay`, a gold "🧪 Potion Lab" beside any service; like a
  service never over the host's own quest talk, and on a step through them
  only on its last line) → `OPEN_GAME` → machine substate
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
  when a round is done; `lib/minigames.ts` (`claimPage` / `claimRound`, pure)
  saves `mg:<game>:page:<key>` / `star:<n>` flags (additive, no save bump)
  and pays `MINIGAME_PAGE_XP` per new page and `MINIGAME_STAR_XP` +
  `MINIGAME_STAR_COINS` per new star (economy, in `content/items.ts`) (★ first round, ★ half the collection,
  ★ all of it) and the game's `firstItem` once — replays pay nothing but
  still `recordActivity`. **Bands:** `bandFor(skillLevelFor(topic))` — 1–3
  Gentle, 4–6 Medium, 7–10 Tricky — the kid may pick another, remembered per
  kid and game on this device (`rememberBand`; picking the suggested band
  again forgets it, `forgetBand`, so it grows with the level); a mini-game
  **never moves the question level**. No timers, no AI: each game's rules are pure in
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
  the colour shows. The
  bench: `bench/minigame.html?game=&level=&pages=&flags=&ember=` mounts the
  stage alone (start Vite with a stand-in `VITE_SUPABASE_URL`).
