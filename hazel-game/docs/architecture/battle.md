# Battle (`src/features/battle/`)

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

- **Battle** (`features/battle/BattleArena.tsx`): FF-style side-profile command
  battle — Attack / Spells / Companion / Guard / Items / Swap / Flee, every command resolved by
  a question; enemy counterattacks are blocked by defend questions. **Spells**
  (the Spellbook, `content/spells.ts`): the hero casts any learned spell
  (Mend / Aegis / Sage strikes — Sage Aria's Chorus Call sings a ◆ back, #75 item 15g — / Remembrance / Ember's Breath, Radiant Breath once Ember shines) by answering one *super-hard*
  question (`SPELL_LEVEL_BONUS` = 3 levels up); each spends charge (◆, the mana
  gauge filled by correct answers, `CHARGE_MAX` = 4) and a miss fizzles +
  refunds the charge. **Companions** (`content/companion.ts`): Ember (always;
  fights once hatched), Pip and Wisp (join when their quests are done) — one
  fights beside the hero: a strike with a perk (Ember +◆, Pip crosses out a
  wrong answer on the next question, Wisp mends) and **Pair Attacks** (hero +
  companion power combined, super-hard question, charge cost, fizzle on a
  miss). **🔄 Swap** changes companion as a free action. **Hero types**
  (`FightStyle`) set attack / block (`STYLE_ATTACK` / `STYLE_BLOCK`) and spell
  power (`STYLE_MAGIC` — what spells and Pair Attacks scale from; the original
  three's equals their attack); every type has two signature abilities —
  **Valor** (aggressive): **Battle Cry** (opens focused: the first landed
  Attack ×2, via `applyFocus`) and **Lionheart** (Attacks ×1.5 below half HP,
  `lionheartMultiplier`); **Bastion** (defensive): **Shell Up** (opens
  guarded) and **Rock Steady** (a wrong defend answer still blocks half his
  block, `defendReduction`); **Talon** (balanced): **Second Wind** (once a
  fight a knockout leaves 1 HP, `CombatState.secondWind` in `resolveEnemyTurn`)
  and **Keen Eye** (+3 HP per right answer, `keenEyeHeal`); **Kira** (swift):
  **Counter Strike** (`counterDamage` → `resolveEnemyTurn`'s `counter`) and
  **Fox Sense** (a free hint a fight, `CombatState.freeHint`); **Selene**
  (mystic): **Spark Start** (opens with 2◆) and **Spell Power** (the highest
  spell power) — the opening perks come from `heroOpening(style)`, handed to
  `battleStore.start` by `WorldScreen`. Enemies sometimes
  **telegraph a power move** (charge turn → 2× blow; Guard blocks it), Sage
  spells are **super effective** vs their topic, **answer streaks** power up
  hits, and after two losses to the same enemy its questions get easier
  (**mercy** — session-only; near home no change to damage, while a critter
  with "!" marks also fights like a tier-1 one from then on: `mercyFor`'s
  `fightTier`, applied at the encounter by `atTier`). **Defend questions are
  timed** (`DefendTimer`, `defendTimeMs(age)`: 25s at age 5, 1.5s less per
  year, 10–25s, +5s under mercy, paused while the tab is hidden; switch off
  per player in 📜 → ⚔️ Battle; running out lands the blow as a wrong
  answer). **Speed trigger:** 5 quick (within half the age countdown, no
  Hint Feather or Pip's peek) correct answers in a row raise the battle's
  question level by 1 on the spot (max +2 per battle, saved at the end or
  on Flee). **Danger tiers** (#75 item 12): `BattleEnemy.tier` (from
  `placementTier` at spawn) scales max HP and coins (`spawnEnemy`), every
  blow (`enemyAttack`), a regular enemy's power-move chance (`nextIntent`) and
  the win XP (`defeatXp`) — never `level`, the question level; the HUD shows
  its "!" marks beside "Lv", the first fight against each tier's marks in a
  session opens with a 💪 tap-to-continue line saying what they mean
  (`toughCallout`, chained after a boss's monologue, then the 💛 mercy line), a
  far defeat says what to do (`defeatTip`), and a healer's mend is capped
  (`HEALER_REGEN_MAX`) so no region makes a fight stall. Fiends (bosses) have enrage phases — every boss
  says its own menacing line as it crosses into each (`BOSS_RAGE` / `rageLine`,
  `content/enemies.ts`) — and restore their crystal on defeat. No game over — defeat wakes the player, healed, inside
  the last inn they rested at (`wakeAfterDefeat`; home to Lumina Village,
  `HUB_ZONE`, if they've never rested away from it). **Structure (#87, kept by the #99 port):** the rules of a turn are
  pure resolvers + tuning in `lib/battleTurn.ts` (damage formulas in
  `lib/battleMath.ts`); the fight's live numbers (HP, charge, guard, shield,
  enrage phase, item buffs) live in `battleStore` and are read with
  `combatState()` *at the moment a command resolves* and written back at once
  with `applyCombat` — never write HP from a timer or a render-captured value
  (#70). The HUD may *show* the old HP until a blow lands; that lag is
  display-only. `useBattleFx` owns every cosmetic timer and motion (floats,
  banner, lunges, the per-move choreography from `choreography.ts`,
  fireballs, flinch, cheer); `BattleHud` / `BattleStage` / `BattleMenus`
  (command, Spells, Items, companion, Swap) / `BattleResult` are the view;
  `BattleArena` owns the turn flow. Session-only `battleStore.losses` drives
  mercy, keyed by `lossKey` (kind + the tier it roams at). The callout
  banner is a dark pill over the stage's sky, out of the layout (a zero-height
  live region), so it reads on any backdrop and never moves the answers.
  Banners queue (#97c): a new one waits until the one up has had its time; a
  banner that `answers` another replaces it at once; an action banner
  (`kind: 'swap' | 'pair'`) cuts in, drops waiting ones of its kind and sends
  a cut-short callout back to the front; a win or loss clears them and shuts
  them until the next fight (`clearBanners`, #159 r1–r2), so a late "So
  quick!" never lands on the result.
