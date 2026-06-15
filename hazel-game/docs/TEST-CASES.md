# Test Cases

Test cases for current and planned behavior. **Update before every commit** —
write cases for whatever you just built.

Status: ⬜ not written · 🟦 written, not passing · ✅ automated & passing
Type: U = unit · C = component · E = end-to-end · M = manual

Run the suite with `npm test` (`npm run test:watch` / `test:ui` while developing).

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-01 | U | ✅ | utils | RETIRED (#43) — `calcAttackDamage` deleted; battle math covered by TC-124/125 |
| TC-02 | U | ✅ | utils | RETIRED (#43) — see TC-124/125 |
| TC-03 | U | ✅ | utils | RETIRED (#43) — see TC-124/125 |
| TC-04 | U | ✅ | utils | `cn()` merges + dedupes conflicting Tailwind classes |
| TC-05 | U | ✅ | gameFlow | RETIRED with gameStore (#37) — topic now in machine context, see TC-117 |
| TC-06 | U | ✅ | saveStore | RETIRED with gameStore (#37) — rounds counted in the save, see TC-126 |
| TC-07 | U | ✅ | saveStore | world unlocks after `ROUNDS_TO_UNLOCK` passed rounds (saveStore.test) |
| TC-08 | U | ✅ | saveStore | failed rounds do NOT count toward unlock (saveStore.test) |
| TC-09 | U | ✅ | gameFlow | ENCOUNTER enters `battle` (gameFlow.test; HP lives in battleStore now) |
| TC-10 | U | ✅ | gameFlow | BATTLE_END returns to `world.exploring` (gameFlow.test) |
| TC-11 | U | ✅ | gameFlow | RESET returns to `boot` from anywhere (gameFlow.test) |
| TC-12 | C | ⬜ | AuthPage | invalid credentials show the error message |
| TC-13 | C | ⬜ | AuthPage | toggle switches between Sign In / Create Account |
| TC-14 | C | ⬜ | AuthPage | submit button disabled while `loading` |
| TC-15 | C | ⬜ | TopicSelect | picking a topic moves to the quiz phase |
| TC-16 | C | ⬜ | QuizRound | selecting an answer locks further selection |
| TC-17 | C | ⬜ | QuizRound | perfect score shows "Round Passed!" |
| TC-18 | C | ⬜ | QuizRound | sub-threshold score shows "Keep Trying!" |
| TC-19 | C | ⬜ | AvatarSelect | picking an avatar stores it and enters `world` |
| TC-20 | C | ⬜ | WorldMap | "Challenge!" starts a battle with that NPC |
| TC-21 | C | ⬜ | BattleArena | 3 correct attack answers reduce NPC HP |
| TC-22 | C | ⬜ | BattleArena | NPC HP reaching 0 ends the battle as a win |
| TC-23 | C | ⬜ | BattleArena | player HP reaching 0 ends the battle as a loss |
| TC-24 | E | ⬜ | flow | full path: auth → 3 rounds → avatar → battle → win |
| TC-25 | U | ⬜ | authStore | `setSession` populates `user`; `clearSession` nulls both |
| TC-26 | C | ⬜ | App | loading state shows until the session check resolves |
| TC-27 | C | ⬜ | App | a valid session renders the game, not the auth screen |
| TC-28 | E | ⬜ | App | reload with a valid session stays in the game |
| TC-29 | C | ⬜ | AuthPage | sign-up with no session shows the confirm-email notice |
| TC-30 | C | ⬜ | SignOutButton | sign-out clears session + progress, returns to auth |
| TC-31 | C | ⬜ | AuthPage | toggling sign-in/sign-up clears any error/notice |
| TC-32 | U | ✅ | age | `calcAge` returns whole years; subtracts 1 before birth month |
| TC-33 | U | ✅ | age | `ageToStartLevel` / `clampLevel` clamp to MIN/MAX skill level |
| TC-34 | U | ✅ | age | `skillLevelFor` falls back to age start level when topic unset |
| TC-35 | C | ⬜ | AuthPage | sign-up shows birth month/year selects; sign-in hides them |
| TC-36 | C | ⬜ | AuthPage | sign-up without birth date shows a validation error |
| TC-37 | U | ⬜ | profileStore | `loadProfile` maps a snake_case row to a `Profile` |
| TC-38 | U | ⬜ | profileStore | `setSkillLevel` updates one topic, leaves others intact |
| TC-39 | U | ⬜ | profileStore | `clearProfile` resets profile/loading/error |
| TC-40 | U | ⬜ | questions | `fetchQuestions` maps generated items to `Question[]` with ids |
| TC-41 | U | ⬜ | questions | `fetchQuestions` throws when the edge function returns an error |
| TC-42 | E | ⬜ | generate-questions | returns N valid 4-option questions for a topic+age+level |
| TC-43 | E | ⬜ | generate-questions | rejects an invalid topic / out-of-range age with 400 |
| TC-44 | E | ⬜ | generate-questions | drops malformed questions (not exactly 4 options) |
| TC-45 | U | ✅ | age | `nextSkillLevel` raises by 2 on a flawless run |
| TC-46 | U | ✅ | age | `nextSkillLevel` raises by 1 on a strong consecutive run |
| TC-47 | U | ✅ | age | `nextSkillLevel` lowers by at most 1 on a weak round |
| TC-48 | U | ✅ | age | `nextSkillLevel` stays clamped within MIN/MAX |
| TC-49 | C | ⬜ | useGeneratedQuestions | shows loading until questions resolve |
| TC-50 | C | ⬜ | QuizRound | a fetch error shows ErrorScreen with retry + back |
| TC-51 | C | ⬜ | QuizRound | completing a round persists the new skill level |
| TC-52 | C | ⬜ | QuizRound | answering reveals the explanation + a Next button (no auto-advance) |
| TC-78 | C | ⬜ | QuizRound | Next advances; the last question's button shows results |
| TC-53 | C | ⬜ | BattleArena | a battle result persists the new skill level for the topic |
| TC-54 | C | ⬜ | TopicSelect | unlock copy reflects PASS_THRESHOLD / ROUNDS_TO_UNLOCK |
| TC-55 | C | ✅ | StatusScreens | `LoadingScreen` renders the given label |
| TC-56 | C | ✅ | StatusScreens | `ErrorScreen` shows message; omits actions when no handler |
| TC-57 | U | ✅ | level | `playerLevel` is 1 at 0 XP and advances every 100 XP |
| TC-58 | U | ✅ | level | `xpProgress` reports into/needed/fraction for the level |
| TC-59 | U | ✅ | level | `npcDefeatXp` rewards more for higher-level NPCs |
| TC-60 | U | ✅ | enemies | RETIRED with lib/npc (#37) — authored placements now, see TC-119/120 |
| TC-61 | U | ✅ | enemies | RETIRED with lib/npc (#37) — see TC-119/120 |
| TC-62 | U | ✅ | enemies | RETIRED with lib/npc (#37) — age scaling covered by zone tests |
| TC-63 | U | ✅ | errors | `errorMessage` returns strings / Error messages intact |
| TC-64 | U | ✅ | errors | `errorMessage` includes Supabase code / details / hint |
| TC-65 | U | ✅ | errors | `errorMessage` handles null and serialises opaque objects |
| TC-66 | C | ⬜ | ErrorBoundary | an uncaught render error shows the real message |
| TC-67 | U | ⬜ | questions | `prefetchQuestions` then `fetchQuestions` consumes the prefetched batch |
| TC-68 | U | ⬜ | questions | `fetchQuestions` without a prefetch requests fresh |
| TC-69 | E | ⬜ | generate-questions | reuses cached questions within ±2 levels of the player |
| TC-70 | E | ⬜ | generate-questions | caches freshly generated questions for later reuse |
| TC-71 | E | ⬜ | generate-questions | bumps `times_asked` on every question returned |
| TC-72 | C | ✅ | LevelBadge | renders nothing when no profile is loaded |
| TC-73 | C | ✅ | LevelBadge | shows the level + XP progress derived from profile XP |
| TC-74 | U | ✅ | powerups | bonuses are zero with none, and scale with stack count |
| TC-75 | U | ✅ | powerups | `totalPowerUps` sums every stack |
| TC-76 | C | ⬜ | LevelUpModal | appears when a power-up is owed (level > chosen + 1) |
| TC-77 | C | ⬜ | LevelUpModal | choosing a power-up records it and closes / advances |
| TC-78 | U | ✅ | questions | `flagQuestion` inserts profile_id + question_id + chosen reason |
| TC-79 | U | ✅ | questions | `flagQuestion` defaults reason to null when not provided |
| TC-80 | U | ✅ | questions | `flagQuestion` no-ops on synthetic `fresh-…` IDs (FK would fail) |
| TC-81 | U | ✅ | questions | `flagQuestion` throws "sign in" message when no session |
| TC-82 | U | ✅ | questions | `flagQuestion` wraps auth errors with a flag-context prefix |
| TC-83 | U | ✅ | questions | `flagQuestion` wraps DB insert errors with a flag-context prefix |
| TC-84 | C | ✅ | FlagButton | starts with a "Report this question" button |
| TC-85 | C | ✅ | FlagButton | clicking opens the reason picker; Cancel closes it |
| TC-86 | C | ✅ | FlagButton | choosing a reason calls `flagQuestion` and shows "Reported" |
| TC-87 | C | ✅ | FlagButton | a failed flag surfaces the underlying error |
| TC-88 | M | ⬜ | QuizRound | result screen shows wrong questions + correct answers + explanations |
| TC-89 | C | ✅ | LoadingScreen | shows a topic-specific fact when a topic is provided |
| TC-90 | C | ✅ | LoadingScreen | falls back to a generic fact when no topic is provided |
| TC-91 | U | ✅ | funFacts | every topic pool has at least 3 facts; `pickFact` is seed-deterministic |
| TC-92 | U | ✅ | streak | `todayIso` formats YYYY-MM-DD in local time |
| TC-93 | U | ✅ | streak | `todayIso` zero-pads single-digit months and days |
| TC-94 | U | ✅ | streak | `isoOffset` returns the prior day |
| TC-95 | U | ✅ | streak | `isoOffset` handles month / year rollovers |
| TC-96 | U | ✅ | streak | `nextStreak` is unchanged on same-day replay |
| TC-97 | U | ✅ | streak | `nextStreak` increments after yesterday |
| TC-98 | U | ✅ | streak | `nextStreak` resets to 1 after a gap |
| TC-99 | U | ✅ | streak | `nextStreak` starts at 1 from null |
| TC-100 | C | ✅ | StreakBadge | renders nothing at 0; pluralises days; flags "Best streak!" on tie |
| TC-101 | U | ✅ | powerups | `effectiveStacks` is identity for 0-5 |
| TC-102 | U | ✅ | powerups | `effectiveStacks` adds 0.5 per stack between 6 and 10 |
| TC-103 | U | ✅ | powerups | `effectiveStacks` adds 0.25 per stack past 10 |
| TC-104 | U | ✅ | powerups | bonuses soft-cap past 5 stacks (attack/vitality) |
| TC-105 | U | ✅ | powerups | `choicesForLevel` returns the requested count from the catalogue |
| TC-106 | U | ✅ | powerups | `choicesForLevel` is deterministic per level (no refresh-reroll) |
| TC-107 | U | ✅ | powerups | `choicesForLevel` rotates across consecutive levels |
| TC-108 | U | ✅ | age | `nextSkillLevelFromBattle` matches `nextSkillLevel` when raising |
| TC-109 | U | ✅ | age | `nextSkillLevelFromBattle` never lowers on a weak battle |
| TC-110 | U | ✅ | age | `nextSkillLevelFromBattle` still respects the [1, 10] clamp |
| TC-111 | M | ⬜ | WorldCanvas | arrow keys / WASD move the player; bumping an enemy starts a battle |
| TC-112 | M | ⬜ | WorldScreen | KaPlay chunk is lazy-loaded (`/dist/assets/WorldScreen-*.js`) |
| TC-113 | M | ⬜ | TopicSelect | `DEV: skip to world` button appears only in dev, not production |
| TC-114 | M | ⬜ | WorldCanvas | no `KAPLAY already initialized` console warning after StrictMode removal |

## JRPG build (#37, phases 0–3)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-115 | U | ✅ | gameFlow | boots to `topicSelect` on a fresh save; straight to `world` when unlocked + avatar |
| TC-116 | U | ✅ | gameFlow | PICK_TOPIC enters quiz with topic in context; EXIT_QUIZ returns |
| TC-117 | U | ✅ | gameFlow | ENTER_WORLD is guard-blocked while locked; routes via avatarSelect without an avatar; CHOOSE_AVATAR guarded on the save |
| TC-118 | U | ✅ | gameFlow | world overlays (dialogue/service/path/menu) open and CLOSE back to exploring |
| TC-119 | U | ✅ | zones | every map row is uniform width with only legend chars; spawns/exits/placements land on walkable tiles |
| TC-120 | U | ✅ | zones | each topic has a zone containing its Fiend; zone enemies match the zone topic; hub is safe and links to all four |
| TC-121 | U | ✅ | save | `normalizeSave` repairs junk/partial payloads; unknown zone falls back to hub |
| TC-122 | U | ✅ | save | `migrateLegacy` carries world unlock / passed rounds / avatar from the old `hazel-game` key |
| TC-123 | U | ✅ | save | `pushLibrary` dedupes by question id and caps at LIBRARY_MAX (oldest out) |
| TC-124 | U | ✅ | battleMath | correct answers outdamage glancing blows; wrong answers never deal zero |
| TC-125 | U | ✅ | battleMath | Specials > 2× basic; bosses hit harder and enrage by phase; defend blocks scale with style + Iron Guard |
| TC-126 | U | ✅ | saveStore | recordQuizRound counts passes, unlocks at threshold, queues misses to the library |
| TC-127 | C | ⬜ | DialogueOverlay | lines advance one at a time; service NPCs offer their service on the last line |
| TC-128 | C | ⬜ | PathQuestionOverlay | correct answer opens the gate / pops the chest (+coins); a miss closes gently and a retry fetches a new question |
| TC-129 | C | ⬜ | BattleArena | Special needs Sage + full charge; landing it deals 2.5× and resets charge; a miss fizzles without resetting |
| TC-130 | C | ⬜ | BattleArena | defeat relocates to Lumina Field with full HP (no game over); victory persists HP/coins and boss victories set the crystal flag |
| TC-131 | C | ⬜ | ServiceOverlay | shop blocks purchases over budget; inn restores HP; library re-answer removes the entry and grants XP; sage grants + equips |
| TC-132 | M | ⬜ | WorldCanvas | zone exits round-trip (hub ⇄ each topic zone) and position persists across battles and reloads |
| TC-133 | M | ⬜ | WorldScreen | restoring all four crystals shows the ending exactly once |
| TC-134 | M | ⬜ | saves | with 0008 applied, progress follows the account across two browsers |
| TC-135 | U | ✅ | story | `emberStage`: egg until first victory; hatchling→whelp→dragon by crystals |
| TC-136 | U | ✅ | story | intro/hatch panels are non-empty; ending panels include the hero's name |
| TC-137 | U | ✅ | story | every topic's Fiend has intro lines + last words |
| TC-138 | U | ✅ | quests | each topic zone has exactly one quest, given by an NPC placed in that zone |
| TC-139 | U | ✅ | quests | dialogue flow: offer → in-progress → complete (chest) → reward + retire |
| TC-140 | U | ✅ | quests | completion works even when the chest was opened before the offer |
| TC-141 | C | ⬜ | DialogueOverlay | quest title chip shows; reward granted on the closing line exactly once |
| TC-142 | M | ⬜ | story | opening cutscene plays once on first world entry; hatch plays once after first victory |
| TC-143 | M | ⬜ | story | boss fights open with the Fiend's monologue; victory panel shows last words |
| TC-144 | M | ⬜ | story | Ember trails the hero on the map and grows after the 2nd and 4th crystals |
| TC-145 | U | ✅ | quests | content sanity: givers placed in their zones, step NPCs/items exist, all three mechanics used |
| TC-146 | U | ✅ | quests | chest quest: offer → hint → complete with reward, then retires |
| TC-147 | U | ✅ | quests | defeat quest: needs all three critters; hint lists only remaining targets |
| TC-148 | U | ✅ | quests | multi-step: Sage Cog says nothing before the chest, advances the quest after |
| TC-149 | U | ✅ | quests | delivery: seed granted at offer, awakened by Sage Muse, removed on completion |
| TC-150 | U | ✅ | quests | cross-zone: Pip's marble completes via count-bat kills, even pre-offer |
| TC-151 | U | ✅ | save | normalize repairs kills (drops junk/negative) and questItems |
| TC-152 | C | ⬜ | MenuOverlay | quest log lists active quests with live hints; carried items row shows the seed |
| TC-153 | M | ⬜ | quests | beating an enemy updates a defeat-quest hint on next talk without re-entering the zone |
| TC-154 | U | ✅ | zones | no-topic zones (hub) contain no gates or chests (#43 — caught a real hub chest) |
| TC-155 | C | ⬜ | QuestionCard | double-tapping Continue resolves a battle turn exactly once (#43) |
| TC-156 | M | ⬜ | saves | after sign-out, a different account on the same browser starts fresh (legacy key consumed, #43) |
| TC-157 | M | ⬜ | quests | during Sage Cog/Muse step conversations, the Learn button still works AND the step advances (#43) |
| TC-158 | M | ⬜ | WorldCanvas | walking zone→zone renders cleanly — no black lines / canvas corruption (#45) |
| TC-159 | M | ⬜ | WorldCanvas | `world → battle → world` re-entry renders cleanly — no black lines (#45, the recurrence) |
| TC-160 | M | ⬜ | WorldCanvas | with the cursor anywhere in the window (no canvas click), arrows/WASD move the hero (#45) |
| TC-161 | M | ⬜ | WorldCanvas | the world fills the viewport responsively, keeping the 11:7 zone ratio and crisp pixels (#45) |

## Pixel-art sprite system (Tasks 1–7)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-162 | U | ✅ | spriteAnim | `frameAt` wraps correctly at loop boundary (looping clip) |
| TC-163 | U | ✅ | spriteAnim | `frameAt` clamps to `to` when loop is false and time exceeds `cycleMs` |
| TC-164 | U | ✅ | spriteAnim | `bgPosX` returns `-(frame * frameWidth)px` for a given frame index |
| TC-165 | U | ✅ | spriteAnim | `cycleMs` = frameCount × frameDuration; `frameCount` = to − from + 1 |
| TC-166 | U | ✅ | sprites | manifest validation: every registered sprite has at least an `idle` anim; `to` ≥ `from` for every anim |
| TC-167 | U | ✅ | sprites | `resolveSprite` returns `undefined` when `spriteId` is `undefined` |
| TC-168 | U | ✅ | sprites | `resolveSprite` returns `undefined` for an unknown/unregistered `spriteId` (emoji fallback path) |
| TC-169 | C | ✅ | SpriteSheet | renders the emoji fallback when no `SpriteView` is resolved |
| TC-170 | C | ✅ | SpriteSheet | renders a `<div>` with background-image when a `SpriteView` is resolved |
| TC-171 | C | ✅ | SpriteSheet | applies the `scale` prop as a CSS transform |
| TC-172 | C | ✅ | SpriteSheet | falls back to the `idle` anim when the requested `animName` is missing from the view |
| TC-173 | U | ✅ | worldSprites | `toKaplayAnims` maps each `SpriteDef` anim to the correct KaPlay `{ from, to, loop }` shape |
| TC-174 | M | ⬜ | WorldCanvas | NPC/enemy/player/Ember all display their emoji while no sprite is registered (no regression) |
| TC-175 | M | ⬜ | WorldCanvas | once a sprite is registered, the character shows idle/walk/flip animations; single-frame sprites hop |
| TC-176 | M | ⬜ | BattleArena | enemy/hero/Ember show emoji fallback while no sprite registered; attack/hurt lunge visible via CSS transform |
| TC-177 | M | ⬜ | BattleArena | once a sprite is registered, idle/attack/hurt animations play; non-slice characters still show emoji |
| TC-178 | C | ✅ | LevelBadge | falls back to Level 1 / 0 XP when no profile is loaded (always visible, incl. overworld) |
| TC-179 | C | ✅ | LevelBadge | `placement="top-center"` positions the medallion centered (battle screen); default is top-left |
| TC-180 | U | ⬜ | profileStore | `loadProfile` with no `profiles` row sets a working fallback profile (birth date from auth metadata) and upserts it, so XP accrues |
| TC-181 | M | ⬜ | App | sign-out button hidden on the battle screen; level medallion centered top in battle |
| TC-182 | U | ✅ | zones | every zone is reachable from the hub by walking exits (BFS) — no stranded screens (#50) |
| TC-183 | U | ✅ | zones | every exit has a return exit — no one-way traps (#50) |
| TC-184 | U | ✅ | spells | a fresh hero knows only Mend; meeting a Sage adds that topic's signature spell (#51) |
| TC-185 | U | ✅ | spells | Aegis unlocks at the first crystal; Ember's Breath only when Ember is full-grown (4 crystals, hatched) (#51) |
| TC-186 | U | ✅ | spells | every known spell costs ≤ `CHARGE_MAX` and the spell question is super-hard (`SPELL_LEVEL_BONUS` ≥ 2) (#51) |
| TC-187 | U | ✅ | story | every topic has a crystal-restored cutscene; the Spire-awakens scene is present (#50) |
| TC-188 | M | ⬜ | BattleArena | 📖 Spells opens the Spellbook; picking a spell asks one super-hard question; correct casts the effect (damage/heal/shield), a miss fizzles and refunds charge (#51) |
| TC-189 | M | ⬜ | WorldScreen | beating a Fiend plays that topic's crystal cutscene; the first crystal also triggers the Spire-awakens scene; both play once (#50) |
| TC-190 | M | ⬜ | World | the five expansion zones (Village, Woods, Coast, Depths, Spire) are walkable from the hub via the village and back again (#50) |

## Regression cases (tied to ISSUES.md)

| ID    | Type | Status | Issue | Case |
|-------|------|--------|-------|------|
| TC-R1 | E | ⬜ | #1 | reload without a valid session returns to the Auth screen |
| TC-R2 | U | ✅ | #2 | 4/5 correct passes a round at the intended threshold |
| TC-R3 | U | ⬜ | #3 | missing Supabase env produces a clear error, not a crash |
| TC-R4 | C | ⬜ | #6 | sign-up pending confirmation does NOT enter the game |
| TC-R5 | M | ⬜ | #23 | after 0005, a quiz round increases `select count(*) from questions` |
| TC-R6 | M | ⬜ | #24 | after 0006, two back-to-back rounds return non-overlapping question IDs |
| TC-R7 | M | ⬜ | #26 | flagging a question removes it from the next call's cache pool |

---

## Notes
- Test runner: **Vitest** (`npm test`), jsdom environment, setup in
  `src/test/setup.ts`. Test files live next to their subject as `*.test.ts(x)`.
- 21 cases automated (30 `it` blocks); the rest are written but not yet
  implemented (⬜).
- When a case is automated, change its status to ✅.
