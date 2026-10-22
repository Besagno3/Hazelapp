---
paths:
  - hazel-game/src/features/battle/**
  - hazel-game/src/lib/{battleTurn,battleMath,gauntlet,powerups}.ts
  - hazel-game/src/store/battleStore.ts
  - hazel-game/src/content/{companion,spells,abilities,enemies,avatars}.ts
---
# Battle — read `hazel-game/docs/architecture/battle.md` before changing these files

Non-negotiables:

- The rules of a turn are pure resolvers + tuning in `lib/battleTurn.ts` (damage in `lib/battleMath.ts`). The fight's live numbers live in `battleStore` and are read with `combatState()` *at the moment a command resolves* and written back at once with `applyCombat` — never write HP from a timer or a render-captured value (#70). The HUD showing the old HP until a blow lands is display-only lag.
- `useBattleFx` owns every cosmetic timer and motion; `BattleHud` / `BattleStage` / `BattleMenus` / `BattleResult` are the view; `BattleArena` owns the turn flow.
- `battleStore` is session-only and never persisted: mercy (`losses` by `lossKey`: kind + tier), the tiers already explained, the Library nudge.
- Danger tiers (`BattleEnemy.tier`) scale max HP, coins, every blow, a regular enemy's power-move chance and the win XP — never `level`, the question level.
- Every command is answered by a question; a spell or Pair Attack asks `SPELL_LEVEL_BONUS` (3) levels up, spends ◆ (`CHARGE_MAX` 4) and a miss fizzles and refunds. Defend questions are timed by age (`defendTimeMs`), paused while the tab is hidden, switchable per player; running out is a wrong answer. The speed trigger raises the battle's question level by 1 after 5 quick right answers (max +2 a battle).
- Banners queue (#97c); a win or loss clears them until the next fight. No game over: defeat wakes the player at the last inn rested at (`wakeAfterDefeat`).
- The battle top bar hides below 360 px wide or 500 px tall; 🏃 Flee comes last in the page so Tab reaches Attack first. Bench: `battle` in `docs/OPERATIONS.md`.
- Hero types and their signature abilities come from `content/avatars.ts` (`heroOpening`, `STYLE_*`); enemy habitat (land / sea) decides who can fight whom (`meetsHero`).
