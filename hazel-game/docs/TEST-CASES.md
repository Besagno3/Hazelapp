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
| TC-191 | U | ✅ | topics | the four crystal topics carry crystal/fiend/zone fields; nature/space/history are styling-only; `topicInfo` resolves all seven (#55) |
| TC-192 | U | ✅ | topics | `TOPICS` = the four crystal topics; `crystalInfo` returns their crystal fields (#55) |
| TC-193 | U | ✅ | spire | Spire floors escalate (non-decreasing level) and end in exactly one boss floor — the hardest (#55) |
| TC-194 | U | ✅ | spire | every Spire floor draws from real question topics; intro/lives/reward present (#55) |
| TC-195 | U | ✅ | story | each crystal scene ends on a 🌑 villain-omen panel; the finale (`spireVictoryPanels`) names the hero (#55) |
| TC-196 | U | ✅ | zones | the three themed zones carry a topic + enemies + a gate + a chest; invariants still hold (covered by zones.test, #55) |
| TC-197 | M | ⬜ | SpireOverlay | the Spire icon is sealed under 4 crystals; with all four it opens the climb; clearing it plays the true finale, losing returns to the hub healed (#55) |
| TC-198 | M | ⬜ | World | nature/space/history gates/chests/battles ask themed questions once the edge function is redeployed (#57) |
| TC-199 | U | ✅ | keys | each warden key maps to a real boss placed in its themed zone and a crystal zone whose keyGate sits on a `G` tile (#58) |
| TC-200 | U | ✅ | keys | keyForBoss/keyForZone round-trip; Numbria has no keyGate; exactly 3 of 4 Fiends are key-gated (#58) |
| TC-201 | U | ✅ | keys | bossDefeated keys Fiends off the crystal flag and wardens off the key flag (#58) |
| TC-202 | M | ⬜ | World | bumping a key-gated Fiend gate without the key names the warden; beating the warden then opens it; the warden stays gone afterward (#58) |
| TC-203 | M | ⬜ | BattleArena | beating a warden shows the key reward (not a crystal), adds a trophy badge, and grants boss XP (#58) |
| TC-204 | U | ✅ | keys | each key is themed to its destination crystal zone (`<zone>-key`), and the warden's home zone topic differs from the destination's (#59) |
| TC-205 | U | ✅ | keys | each warden home zone places exactly one `*-warden-sign` signpost NPC (#59) |
| TC-206 | M | ⬜ | World | the warden signpost warns before the fight, then flips to a "you won it" line once the key is held (#59) |
| TC-207 | U | ✅ | zones | every gate is a double-wide opening — 2 orthogonally-adjacent `G` tiles share one canonical id via `gateIdAt` (zones.test) |
| TC-208 | U | ✅ | zones | each `keyGate` cell sits on a `G` and resolves to a real gate group id (zones.test) |
| TC-209 | M | ⬜ | World | an open gate (question or key) is 2 tiles wide and the hero can walk through either tile |
| TC-210 | U | ✅ | settings | audio is off by default; `normalizeSettings` coerces only literal `true`, clamps volumes 0..1, falls back on garbage (settings.test) |
| TC-211 | U | ✅ | audio | `trackForScreen` maps screens→music; boss theme only for boss battles (audio.test) |
| TC-212 | M | ⬜ | audio | with files in `public/audio/`: Music/Sound toggles persist across reload; SFX fire on wrong-answer/hit/levelup/victory; music follows the screen (overworld ⇄ battle ⇄ boss) |
| TC-213 | M | ⬜ | audio | Spire music plays while climbing; switches to the Final Battle track only once the Umbra (boss-floor) fight is underway, then back to overworld on exit |
| TC-214 | U | ✅ | profile | local profile cache round-trips; `mergeProfiles` keeps higher xp/skill/power-up/streak, ignores other-user cache, null local → remote (profile.test) |
| TC-215 | M | ⬜ | profile | earning XP then refreshing keeps the level (no reset to 1) even when the Supabase write fails; MenuOverlay shows the "XP isn't saving" warning on remote-write failure |
| TC-216 | M | ⬜ | audio | with Music enabled, refresh the page: music stays silent until the first click/tap/key, then starts automatically (autoplay-unlock recovery) and follows the screen thereafter |
| TC-217 | U | ✅ | wander | `npcWanders`: pure-flavor villagers roam; every service role + any villager marked `stationary` stays put (wander.test) |
| TC-218 | U | ✅ | wander | over the real roster: every quest-giver and every non-villager NPC is stationary; some flavor villagers (e.g. Bramble) still roam (wander.test) |
| TC-219 | U | ✅ | wander | `pickWanderDir` idles at low rng, returns unit-length steps otherwise, never indexes out of range at rng→1 (wander.test) |
| TC-220 | U | ✅ | wander | `withinLeash` / `clampToLeash`: in-leash points pass through; strayed points are pulled back onto the leash edge; `pickAmbientLine` picks by rng / null when empty (wander.test) |
| TC-221 | U | ✅ | zones | Moonwell Grove satisfies every zone invariant (width/legend, walkable spawn, reciprocal village exit, double-wide gate, nature-topic enemies, reachable from the hub) (zones.test) |
| TC-222 | U | ✅ | quests | grove-moonwell: stationary guardian giver; offer → open grove chest → beat all three nature critters → complete grants the reward + done flag (quests.test) |
| TC-223 | U | ✅ | story | `GROVE_PANELS` is a non-empty entry cutscene (emoji + ≥20-char pages) (story.test) |
| TC-224 | M | ⬜ | world | non-boss enemies + flavor villagers wander near their spawn and freeze under overlays; bosses, Sages, shops, quest-givers and signposts stay put; walking into a wanderer still talks / battles |
| TC-225 | M | ⬜ | world | from Lumina Village's SW exit, the grove entry cutscene plays once; idle speech bubbles pop and fade over NPCs |
| TC-226 | M | ⬜ | world | stand still and let a wandering NPC walk into you: dialogue opens once and does NOT immediately re-open after closing (the NPC is pushed clear); wanderers never end up standing inside a wall/tree |
| TC-227 | U | ✅ | wander | `WANDER_TUNING` / `AMBIENT_TUNING` are sane: positive speeds under the player's 170, enemy leash ≥ NPC leash, positive bubble life, non-negative spans (wander.test) |
| TC-228 | M | ⬜ | world | idle speech bubbles render dark text on a light outlined pill, legible over dark-ground zones (Moonwell Grove / Clockwork Depths); pill + text rise, fade, and disappear together |
| TC-229 | U | ✅ | wander | `approachBlocked`: blocks a step that moves within minDist & closer; allows steps that stay outside min, that separate already-overlapping actors, and that ignore far actors; `ACTOR_RADIUS` positive + `WANDER_WALL_HALF*2 < 32` (wander.test) |
| TC-230 | M | ⬜ | world | wandering characters never overlap each other, stationary NPCs, the boss, or the Spire, and don't clip walls/trees; the player can still walk into NPCs to talk and enemies to battle (player/Ember are not avoided) |
| TC-231 | U | ✅ | topics | Wave 0.1: `TOPIC_REGISTRY` ids exactly equal `CRYSTAL_TOPIC_IDS` and `TOTAL_CRYSTALS === TOPIC_REGISTRY.length` — adding a crystal id without its registry entry fails (topics.test) |
| TC-232 | U | ✅ | topics | `EXTRA_TOPICS` ids exactly equal `EXTRA_TOPIC_IDS`; `ALL_TOPICS` has no duplicates and covers crystal + extra (topics.test) |
| TC-233 | U | ✅ | story | `EMBER_STAGE_AT` holds explicit spec values (whelp 2, dragon 4); TRIPWIRE fails if `TOTAL_CRYSTALS` moves so the stages are retuned deliberately, not silently derived (story.test) |
| TC-234 | U | ✅ | save | Wave 0.2: `runMigrations` walks a payload up a fake ladder stamping each version; starts mid-ladder for a v2 payload without rerunning the v1 step (save.test) |
| TC-235 | U | ✅ | save | Wave 0.2: missing version treated as v1; missing step stops the walk (normalizeSave defaults the rest); null/non-object passthrough; version ≥ target untouched — no downgrade (save.test) |
| TC-236 | U | ✅ | save | Wave 0.2: the real `MIGRATIONS` ladder is empty while `SAVE_VERSION` is 1, and a v1 payload round-trips `runMigrations` unchanged (save.test) |
| TC-237 | U | ✅ | zones | Wave 0.3: `ZONES` keys exactly equal `ZONE_IDS` (order included) and every `ZoneDef.id` matches its record key (zones.test) |
| TC-238 | U | ✅ | topics | Wave 0.4: shared `TOPIC_IDS` (edge-function whitelist) exactly equals the game's `ALL_TOPICS`; every topic has a >10-char persona line with no school words (test/grade/exam/homework) (topicPrompts.test) |
| TC-239 | U | ✅ | topics | Wave 0.4: `topicPromptBlock()` emits exactly one `- id: …` line per topic (topicPrompts.test) |
| TC-240 | M | ⬜ | edge fn | after redeploying generate-questions, all 7 topics still generate (spot-check one crystal + one extra topic); an unknown topic still 400s with the whitelist message |
| TC-241 | U | ✅ | enemies | Wave 0.5: declared behaviors are known archetypes; each archetype used by ≥1 enemy; bosses have none; `spawnEnemy` carries `behavior` (enemies.test) |
| TC-242 | U | ✅ | battleMath | Wave 0.5: `healerMends` only below half HP and alive; `healerRegen` is integer `HEALER_REGEN_RATE`×maxHp; biggest healer's regen < weakest style's landed hit — no unwinnable stall (battleMath.test) |
| TC-243 | M | ⬜ | battle | vs Relic Golem (shielded): banner announces the shield; 🛡️ shows by its name; the FIRST landed hit (attack, glancing blow, or offensive spell) deals 0 and shatters the shield with a message; subsequent hits damage normally |
| TC-244 | M | ⬜ | battle | vs Pixel Witch (trickster): banner announces it; the Hint Feather button never appears on attack/guard/spell/defend questions in that fight; feather count is not consumed and works again in the next battle |
| TC-245 | M | ⬜ | battle | vs Moon Moth (healer): banner announces it; once below half HP it mends +N (green float) at the end of each of its turns, never above half-triggered ceiling of max HP; a correctly-answered attack still visibly out-damages the mend |
| TC-246 | U | ✅ | save | TRIPWIRE: `MIGRATIONS` has a step for every version below `SAVE_VERSION` and no orphan steps at/above it — a bumped version with a missing step fails here, not silently at load (save.test) |
| TC-247 | U | ✅ | enemies | no `behavior:'healer'` enemy at max age can out-mend the weakest correctly-answered hit; derived from `ENEMY_DEFS` via `spawnEnemy` so retuning HP re-checks automatically (enemies.test) |
| TC-248 | U | ✅ | topics | `ENEMY_BEHAVIORS` const array is the single source for the `EnemyBehavior` union; enemies.test imports it rather than a private copy (enemies.test) |
| TC-249 | U | ✅ | topics | compile-time lock: `topicPrompts.ts` `_topicSetsMatch` proves `Topic ≡ TopicId`; a one-sided topic add fails `tsc`/`vite build`, not just vitest (build step) |
| TC-253 | U | ✅ | topics | the edge function's INLINE topic copy matches the canonical `_shared/topics.ts`: `topicPrompts.test.ts` reads `generate-questions/index.ts` via `?raw` and asserts every id + persona string is present (drift = fail) |
| TC-250 | M | ⬜ | battle | archetype callout banner appears only AFTER the question LoadingScreen clears (slow generation): enter a trickster/shielded/healer fight with a cold cache and confirm the banner is still shown once the battle UI renders |
| TC-251 | M | ⬜ | battle | cast an offensive spell as the first hit on a shielded enemy: the shield shatters, 0 damage, and the spell's charge is refunded (message says so) — a correct super-hard answer never costs more than a free glancing blow |
| TC-252 | M | ⬜ | battle | shatter a shielded enemy's shield, Flee, re-engage the same enemy: shield state resets correctly on the fresh instance (no phantom shield, no pre-shattered start) |

## 16-bit asset set (#71)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-254 | U | ✅ | sprites | every manifest sheet exists in `public/` and its PNG is exactly `frames × frameW` wide and `frameH` tall (sprites.test) |
| TC-255 | U | ✅ | sprites | every hero resolves world (idle+walk) and battle (idle+attack+hurt) art (sprites.test) |
| TC-256 | U | ✅ | sprites | every enemy def resolves world + battle art via `spawnEnemy` (`spriteId` defaults to the def id) (sprites.test) |
| TC-257 | U | ✅ | sprites | every NPC resolves world art via `npcSpriteId`; every Ember stage has world + battle art (sprites.test) |
| TC-258 | U | ✅ | tiles | every zone has a `TILESET_FRAMES`×32px tileset strip and a battle backdrop; props strip + 32×64 Spire tower sizes (tiles.test) |
| TC-259 | U | ✅ | tiles | `TILE_FRAME` indices stay inside the strip; `groundVariant` is deterministic and always a ground frame (tiles.test) |
| TC-260 | U | ✅ | audio | every `SFX_SOURCES` / `MUSIC_SOURCES` path points at a shipped file (audio.test) |
| TC-261 | M | ✅ | WorldCanvas | zones render from tilesets (ground/path/water/scenery/deco/exit), save crystal glows, chests + gates are prop sprites, Spire is the tower sprite (verified in headless Chromium: Verdara, Lumina Field, Crystal Spire, Starfall Coast) |
| TC-262 | M | ⬜ | WorldCanvas | open a chest → it swaps to the open-chest frame; answer a gate → both gate tiles vanish |
| TC-263 | M | ⬜ | WorldCanvas | wandering NPCs/enemies play their walk cycle and face their heading; idle when stopped |
| TC-264 | M | ✅ | BattleArena | battle shows the zone's pixel backdrop behind the combatants; enemy + hero sprites animate (verified in a harness) |
| TC-265 | M | ⬜ | audio | with Music + Sound on: title/overworld/battle/boss/spire/final-boss tracks loop; correct/wrong/attack/hit/gate/chest/levelup/victory/select SFX fire at sensible relative volumes |
| TC-267 | U | ✅ | facing | `facingFor`: dominant axis wins, diagonals → side, no movement keeps prior facing; `animFor` picks idle/walk per facing and falls back to side then `idle` (facing.test) |
| TC-268 | U | ✅ | sprites | every world sheet defines idle/walk for side, down and up (sprites.test) |
| TC-269 | M | ✅ | WorldCanvas | hero spawns facing down; walking down shows the front view, up shows the back view, left mirrors the side view; Ember follows with matching facing (verified in headless Chromium) |
| TC-270 | M | ⬜ | WorldCanvas | wandering NPCs/enemies switch to front/back views when their heading is mostly vertical |
| TC-266 | M | ⬜ | AvatarSelect | hero cards show the animated battle sprite; picking a hero plays `select` |

## Town + enterable buildings (#72)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-271 | U | ✅ | zones | every building is a closed `W` rect with exactly one facade `D` (not a corner) and only F/K/B/T/Z inside; building chars never appear outside a building (zones.test) |
| TC-272 | U | ✅ | zones | every door is reachable from the spawn and every indoor NPC is reachable or talkable across a counter (zones.test) |
| TC-273 | U | ✅ | zones | `buildingInside` = interior only, `buildingAt` includes walls; every map is ≥ one screen (zones.test) |
| TC-274 | U | ✅ | zones | `safeSpawn` keeps walkable saved positions and falls back to the zone spawn for walls / off-map / null (zones.test) |
| TC-275 | U | ✅ | camera | `camAxis` centres single-screen maps, follows on larger ones, clamps at both edges (camera.test) |
| TC-276 | U | ✅ | tiles | town + roof strips sized correctly; `roofFrame` picks nine-slice pieces per colour (tiles.test) |
| TC-277 | M | ✅ | WorldCanvas | outside a building the roof + name cover it (facade, door, sign visible); walking through the door fades the roof and shows the room (headless Chromium: Item Shop, Wick's House) |
| TC-278 | M | ✅ | WorldCanvas | bumping the Item Shop counter opens Shopkeep Clove's dialogue (headless Chromium) |
| TC-279 | M | ✅ | WorldCanvas | camera follows the hero around the 2×2 town and stops at the map edges |
| TC-280 | M | ⬜ | WorldScreen | full flow in the real app: enter each building, use shop/inn/library, walk back out (roof returns), leave by each of the 5 town exits and come back |
| TC-281 | M | ⬜ | save | a pre-#72 save standing in the old village loads at a walkable spot (not inside a wall) |

## Zone slide transition

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-282 | U | ✅ | transition | `exitSide` names the edge (north/south/east/west) and is null for interior cells; `slideFrom` gives the entry vector per side (transition.test) |
| TC-283 | U | ✅ | zones | every zone exit sits on a map edge, so every exit has a slide direction (zones.test) |
| TC-284 | M | ✅ | WorldCanvas | leaving west / north / into the town: old screen and new zone slide together, no black gap, snapshot removed after ~0.5s (headless Chromium) |
| TC-285 | M | ⬜ | WorldCanvas | holding a direction key through the slide doesn't move the hero until it settles, and doesn't instantly re-trigger the exit back |
| TC-286 | M | ⬜ | a11y | with OS "reduce motion" on, zone changes are an instant cut |

## Unique places, shops and items (#73)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-287 | U | ✅ | items | every shop item is sold in exactly one shop except `SHARED_STOCK`; every consumable is for sale somewhere; shop names distinct (items.test) |
| TC-299 | U | ✅ | items | Berry Potion has exactly two sellers — Maple's Trading Post + Tadpole's Tonics — at the same price; `ALL_SHOP_ITEMS` lists each item once (items.test) |
| TC-300 | M | ⬜ | shop | Tadpole's Tonics lists Berry Potion (🪙30) above Honey Elixir; buying one increments the potion count |
| TC-288 | U | ✅ | items | `SHOPS` keys == the set of merchant NPCs; `shopFor` null for non-merchants (items.test) |
| TC-289 | U | ✅ | save | an old `{potion, hint}` save normalizes with elixir/spark/ward = 0; new counts round-trip (items.test) |
| TC-290 | U | ✅ | zones | exactly one innkeeper and one librarian defined and placed; no NPC placed twice (zones.test) |
| TC-291 | U | ✅ | zones | every merchant / sage / innkeeper / librarian stands inside a building (zones.test) |
| TC-292 | U | ✅ | zones | each place uses one architecture style and no two places share one; building ids + names unique (zones.test) |
| TC-293 | U | ✅ | tiles | every style has a 16-frame town sheet; roof strip = 9 frames × colour (tiles.test) |
| TC-294 | M | ✅ | world | all 9 built-up places render their own style + roof colours; walking into Plus's Quill & Count clears the roof (headless Chromium) |
| TC-295 | M | ✅ | shop | Tadpole's Tonics and Clove's Curios show their own name + stock (headless Chromium, seeded save) |
| TC-296 | M | ⬜ | battle | 🎒 Items: Berry Potion heals 50, Honey Elixir heals to full, Spark Cell +2 ◆ (capped), Rainbow Ward blocks the next enemy hit; each spends the turn; disabled reasons show; button disabled with no battle items |
| TC-297 | M | ⬜ | world | from a pre-#73 save standing in Numbria/Verdara/Gearfall/Chromaria: loads at a walkable spot; chests/gates already opened stay opened |
| TC-298 | M | ⬜ | world | leave + re-enter each extended zone by every exit (moved exits land correctly, slide direction correct) |

## Spire floors (#74)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-301 | U | ✅ | spire | every floor has a unique theme and music; maps are 22×14 and legend-only; arrival tile walkable (spire.test) |
| TC-302 | U | ✅ | spire | climbing floors have exactly one `Q` seal per question, every seal + the stairs reachable on foot; the throne floor has no seals/stairs and Umbra is reachable (spire.test) |
| TC-303 | U | ✅ | spireStore | bumps register only while exploring and one at a time; broken seals can't be re-bumped; entering a floor resets seals (spireStore.test) |
| TC-304 | U | ✅ | tiles | a tileset per Spire theme + the Spire props strip exist at the right sizes (tiles.test) |
| TC-305 | M | ✅ | Spire | open the Spire with 4 crystals → intro → floor 1 map with HUD (seals 0/3, 4 candles) and candle-light darkness (headless Chromium, mocked questions) |
| TC-306 | M | ✅ | Spire | walking into a rune seal opens its question; answering breaks the seal (HUD updates) (headless Chromium) |
| TC-307 | M | ✅ | Spire | bumping sealed stairs explains how many runes remain; with all seals broken the stairs lead to the next floor; floors 1→5 all load (headless Chromium) |
| TC-308 | M | ✅ | Spire | a wrong answer snuffs a candle and the circle of light narrows (headless Chromium) |
| TC-309 | M | ✅ | Spire | on the throne floor, walking up the carpet to Umbra starts "Umbra's challenge 1/5" (headless Chromium) |
| TC-310 | M | ⬜ | audio | with Music on: each floor plays its own spooky loop; the Final Battle track starts only when Umbra's challenge begins |
| TC-311 | M | ⬜ | Spire | lose every candle mid-climb → cast back to Lumina Field healed; reopening the Spire starts a fresh climb from floor 1 |
| TC-312 | M | ⬜ | Spire | refresh mid-climb → you're back outside the Spire door (floor positions are never saved) |
| TC-313 | M | ✅ | Spire | a floor's question batch comes back short → "The Spire shudders: only N of M riddles…" with Try again; retry recovers and the hero can explore (headless Chromium, mocked short batch) |
| TC-314 | M | ✅ | Spire | the world Menu button is hidden during the climb; 🚪 Leave the Spire returns to the Spire door (world.exploring), Menu returns, and standing by the tower doesn't instantly reopen it (headless Chromium) |
| TC-315 | M | ✅ | Spire | a fast double-click on a story panel advances exactly one panel (headless Chromium) |

## Overworld Phase 0 — big-map renderer + exit fix (#75, #76)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-316 | U | ✅ | terrain | every zone and Spire floor yields one valid base frame per cell (zone tileset, water, or its building style's town sheet); overlays only on scenery / flowers / exits (terrain.test) |
| TC-317 | U | ✅ | terrain | paths and exits use the path tile (exits add the marker), water is marked animated, plain ground uses the deterministic speckle variant, a save crystal sits on plain ground (terrain.test) |
| TC-318 | U | ✅ | terrain | walls: tops above, facade windows on alternate tiles but never beside the door, the door frame; interiors draw in their building's own style (terrain.test) |
| TC-319 | U | ✅ | terrain | `visibleRange`: a one-screen zone sees the whole map; never leaves the map; covers every cell the viewport touches at fractional camera positions (terrain.test) |
| TC-320 | U | ✅ | terrain | the visible cell count stays within the viewport budget for maps from 22×14 up to 512×512 — draw cost never grows with the map (terrain.test) |
| TC-321 | U | ✅ | terrain | `waterFrame` starts on the first frame and flips every 1/fps seconds (terrain.test) |
| TC-322 | U | ✅ | zones | every edge exit in the world passes `edgeLinkProblem`: you land within 2 cells of the opposite edge, and the way back you'd take is on that edge; a failure lists every broken link with its full reason (#76 regression, zones.test — on the pre-fix map it lists all 4 Field/Village exits) |
| TC-323 | M | ✅ | world | all 18 zone screens + 5 Spire floors are pixel-identical to the old per-tile renderer outside animated tiles and character idle cycles (`bench/run-world-bench.cjs shots` + `diff`, headless Chromium) |
| TC-324 | M | ✅ | world | 160×112 map: 60 fps (was 3.2), 37 fps at 4× CPU throttle (was 0.5); Lumina Village 39 fps at 4× (was 10.5); load hitch 0.17 s (was 1.4 s) (`bench … fps`, headless Chromium, software GL) |
| TC-325 | M | ✅ | world | standing inside a building fades its roof; water animates over time; walking the big map scrolls with no gaps at the screen edges; no page errors (headless Chromium) |
| TC-326 | M | ⬜ | world | the fps bench on a real mid-range tablet / Chromebook (hardware GL) |
| TC-327 | M | ⬜ | world | in the real app: Field's bottom-left exit → arrive at the top of Lumina Village (slides south); the Village's top exit → arrive at the Field's bottom-left (slides north) |
| TC-328 | U | ✅ | transition | `edgeLinkProblem`: catches two zones each "north" of the other and a far-off landing; accepts two zones linked on two different edges; skips fading links (a town with several gates onto an overworld place icon); reports a missing way back (transition.test) |
| TC-329 | U | ✅ | camera | `worldView` grows the view when the camera zooms out; zoomed out on a 160×112 map the camera never shows past the edge and the drawn window covers the whole view (camera.test) |
| TC-330 | M | ✅ | world | with the camera forced to 2× zoom-out: the big map and Lumina Village draw edge to edge, the camera stops at the map edge, and the whole Village fits — vs. bare edges and an off-centre town under the old 1:1 assumption (headless Chromium, temporary patch) |

## Character portraits + Umbra (#79)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-331 | U | ✅ | CharacterPortrait | a fighter shows its battle sheet; a world-only NPC shows its world sheet facing the player (idleDown); an unknown id falls back to the emoji (CharacterPortrait.test) |
| TC-332 | U | ✅ | sprites | Umbra's world and battle frames are larger than every other character's (sprites.test) |
| TC-333 | M | ✅ | UI | dialogue box, Sage screen, HUD Ember, menu Ember + hero, and the battle name tag all show sprites, not emoji (headless Chromium render) |
| TC-334 | M | ✅ | Spire | on the throne floor, Umbra looms oversized above the message / challenge panel with a violet glow; smaller on screens under 720px tall |

## Village expansion: towns, side quests, secrets, items (#80)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-335 | U | ✅ | zones | all expanded maps keep the zone invariants: legend-only rows, closed buildings with one door, every door reachable, every indoor NPC talkable, one style per place, unique building names (zones.test) |
| TC-336 | U | ✅ | secrets | each of the five towns hides ≥3 secrets; ids unique; every reward is real; every secret is reachable from the spawn without opening a gate (step-on for walkable tiles, bump for solid) (secrets.test) |
| TC-337 | U | ✅ | secrets | every hidden passage 'H' joins two walkable sides; claiming a secret pays once and sets `secret:<id>`; a quest-item secret adds the item once; per-zone progress counts (secrets.test) |
| TC-338 | U | ✅ | quests | each town has exactly two side quests with distinct givers; every topic zone still has exactly one main quest; quest items taken back are obtainable (quests.test) |
| TC-339 | U | ✅ | quests | Mayor's Seal (secret → complete takes the seal, pays 40 coins + clover); Lost Lessons hint names the page still hidden; a secret found before the offer completes the quest at once; bakery deliveries go Wick → Sol in order; Widget's test needs both kills then the Professor (quests.test) |
| TC-340 | U | ✅ | items | five new consumables are each sold in exactly one shop; every new merchant runs a shop; older saves gain zeroed slots (items.test) |
| TC-341 | M | ✅ | world | the five expanded towns render in their own style with the new buildings, roofs and townsfolk (headless Chromium screenshots) |
| TC-342 | M | ✅ | secrets | walking right through the village hedge passage into the hidden garden pops "Secret found!" and adds 40 coins + a Lucky Clover; bumping the plaza fountain finds the Town Seal (headless Chromium) |
| TC-343 | M | ✅ | shop | bumping Mirror Hall's counter opens Glint's dialogue (headless Chromium) |
| TC-344 | M | ✅ | battle | Mirror Charm bounces the next enemy hit back; Focus Tea doubles the next Attack; Lucky Clover doubles the coins (victory panel shows 🍀) (headless Chromium, mocked questions) |
| TC-345 | M | ⬜ | battle | Sunseed Snack heals 30 HP + 1 ◆; Turbo Coil fills ◆; each is greyed out with a reason when it would do nothing |
| TC-346 | M | ⬜ | menu | the menu shows "✨ Secrets: n/3 found here · n/15 across Lumina" and tags side quests with their town |
| TC-347 | M | ⬜ | secrets | a twinkle ✦ blinks every few seconds over each unfound secret and disappears once it's found; indoor twinkles only show once the roof fades |

## Overworld Phase 1 — the Dawnreach vertical slice (#75, #77)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-348 | U | ✅ | zones | there is exactly one overworld, and it has places; every `P` tile is a place with an exit, named after the zone it leads to (zones.test) |
| TC-349 | U | ✅ | zones | on foot from the Village gate, every place on Dawnreach is reachable with the fog down except the Shrine; with the fog lifted the Shrine is reachable too (zones.test) |
| TC-350 | U | ✅ | zones | every gate from a place onto Dawnreach lands 1–2 cells from that place's own icon, on open ground connected to the rest of the map (zones.test) |
| TC-351 | U | ✅ | zones | `E` exits sit on a map edge and `P` entrances inside the map; every `E`/`P` tile has an exit entry that lands on a walkable tile; the overworld hosts roaming critters but never bosses (zones.test) |
| TC-352 | U | ✅ | zones | fog banks sit inside the map, cover walkable ground and are lifted by real flags; `fogAt` covers its rectangle until any one flag is set; `placeAt` finds the place on its tile; `ANY_CRYSTAL` lists every crystal flag (zones.test) |
| TC-353 | U | ✅ | transition | `transitionFor`: edge-joined screens slide; going into or out of the overworld fades; reduced motion always cuts (transition.test) |
| TC-354 | U | ✅ | audio | in the world, the music follows the zone kind: overworld/field → overworld theme, town → town, dungeon → cave, shrine → shrine (audio.test) |
| TC-355 | U | ✅ | terrain | sand is a base tile on the overworld sheet, mountains overlay the ground from the overworld sheet, a place tile draws plain ground; the overworld sheet has one frame per `OVERWORLD_FRAME` entry (terrain.test, tiles.test) |
| TC-356 | U | ✅ | world map | `whereOnMap`: on the overworld the hero's own tile; with no saved position the spawn; inside a place that place's icon; in Numbria the nearest place on the map (Lumina Field); every zone can be placed (worldMap.test) |
| TC-357 | M | ✅ | world | every existing zone screen + Spire floor (33 shots, incl. main's expanded towns) is pixel-identical to main outside animated tiles and idle cycles (`bench … shots` + `diff`, headless Chromium) |
| TC-358 | M | ✅ | world | walking onto the Village icon fades into the Village (arriving at its north gate, 21,1); holding ↑ for 1.8 s more stays in the Village (arrival lock); releasing and pressing ↑ again leaves by the north gate onto Dawnreach at (32,23), beside the icon (bench walk-through, headless Chromium) |
| TC-359 | M | ✅ | world | walking east into the fog bank stops the hero at its edge and reports a fog bump (`onFog`); with a crystal restored (`flags=crystal-math-restored`) the fog is gone and the same walk crosses it; walking onto the shrine icon enters the Shrine (bench walk-through, headless Chromium). The toast text itself is wired in `WorldScreen` (not on the bench) |
| TC-360 | M | ✅ | world | Dawnreach (12 screens) and the Shrine render with their place icons, names, the Spire tower, mountains, sand, sea and the drifting fog (headless Chromium screenshots) |
| TC-361 | M | ✅ | world | walking across Dawnreach: 40 fps (19 at 4× CPU throttle) — the same as the 160×112 stress map on the same machine (40.5 / 20.6), and the stress map matches main (40.9 / 21.5) and the Phase 0 commit (41.4 / 22.3), so Phase 1 adds no cost. (This container is slower than Phase 0's, which measured 60 / 37.) Headless Chromium, software GL |
| TC-362 | M | ✅ | menu | the world map panel shows Dawnreach with fog, place markers and a ⭐ where you are, captioned "You're out on Dawnreach" / "You're here: Lumina Village" (its name highlighted) / "You're here: Numbria (past Lumina Field)"; with a crystal restored the fog square is gone; no page errors (`WorldMapPanel` mounted on a temporary page, headless Chromium) |
| TC-363 | M | ⬜ | story | the first time you step onto Dawnreach (after the Grove's scene, if due) the 3-panel Dawnreach cutscene plays once and ends on "🗺️ Explore Dawnreach" |
| TC-364 | M | ⬜ | audio | with music on: the Village plays the town theme, Dawnreach the overworld theme, the Depths the cave theme, the Shrine the shrine theme |
| TC-365 | M | ✅ | bench | #77: `diff` exits 1 when one shot is altered (and 0 when all match); Vite's stderr reaches the terminal; the frame sampler is capped (headless Chromium + code review) |
| TC-366 | M | ✅ | world | the place fade reaches full black before the old screen is dropped, on a fast and a slow machine: at 4× CPU throttle the old fixed-timer fade dropped the snapshot at 11% black (peak 55%, the new zone popped in); the `transitionend`-driven fade drops it at 100% black, unthrottled (~0.6 s) and throttled (~1.1 s), in and out of the Village; edge slides unchanged (frame-by-frame overlay recording, headless Chromium) |
| TC-367 | U | ✅ | world map | every kind of place has its own emoji (`PLACE_EMOJI`); `mapCaption` reads "You're out on Dawnreach", "You're here: The Crystal Spire", "You're here: Shrine of First Light", "You're here: Numbria (past Lumina Field)" (worldMap.test) |
| TC-368 | M | ✅ | world map | each place shows its emoji on the map and beside its name; inside a place the ⭐ sits just above that place's emoji; "Fog — restore a crystal to clear it" shows while fog is left and goes once it lifts; the list emoji are `aria-hidden` (headless Chromium) |
| TC-369 | U | ✅ | toast | `toastMs`: "💎 Game saved!" stays 2.5–3 s, the fog hint ≥ 5 s, never over 8 s (toast.test) |
| TC-370 | M | ⬜ | toast | in the real app: bump the fog right after a save toast — the fog hint stays its full time (the save toast's timer no longer hides it) |
| TC-371 | U | ✅ | transition | `needsArrivalLock`: yes into/out of places, no between edge-joined screens (whatever the motion setting) (transition.test) |
| TC-372 | M | ✅ | world | reduced motion: holding ← across the Field → Numbria edge keeps walking on the new screen; holding ↑ onto the Village icon still doesn't walk straight back out. On the previous code the edge case stood still (headless Chromium, `reducedMotion: 'reduce'`) |
| TC-373 | M | ✅ | world | walk < 1.5 s, then pause (as the menu does): the saved position jumps to where the hero really is (40.5 → 45.5 tiles); on the previous code it stayed 5 tiles behind (headless Chromium, `__bench.pause`) |
| TC-374 | M | ✅ | menu | the menu's ✕ "Back to the world" (44×44) is visible without scrolling at 1024 px and 375 px wide; place names on Dawnreach are 11 px and don't collide around the Village, Grove and Spire (headless Chromium) |

## Rounded coasts, beaches and roads — edge blending (#75 item 3, #71b)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-375 | U | ✅ | terrain | blend classes stack water < sand < ground < path; building tiles never blend (terrain.test) |
| TC-376 | U | ✅ | terrain | a pond corner is one ready-made tile that follows the water animation; a road/grass corner is one static tile; a four-class corner draws the water/sand pair, then the grass and road shapes (terrain.test) |
| TC-377 | U | ✅ | terrain | nothing is drawn where four cells match, next to a building, or past the map edge; a cell whose four corners blend is hidden (base skipped) (terrain.test) |
| TC-378 | U | ✅ | tiles | every pair and shape has its own frame inside the sheet, and every zone has a 512×384 blend sheet; every zone's corners give valid frames; Spire floors never blend (terrain.test, tiles.test) |
| TC-379 | M | ✅ | world | all 46 zone screens + Spire floors before/after: coasts, ponds, the Village fountain and roads are rounded (foam on water, a darker rim on land), walls stay square, Spire floors pixel-identical (bench `shots` + `diff`, headless Chromium) |
| TC-380 | M | ✅ | world | frame rate (software GL, alternating runs, same machine): stress map unchanged; walking Dawnreach ~5% lower unthrottled, ~12% lower at 4× CPU throttle; the Phase 1 walk-through still passes |
| TC-381 | M | ⬜ | world | the same Dawnreach walk on a real tablet / Chromebook (hardware GL) keeps a smooth frame rate (with TC-326) |
| TC-382 | M | ✅ | world | with the blend sheets delayed 6 s (fresh browser context), Dawnreach's one-tile road shows with square edges until they arrive, then rounded — on the review's code it vanished (bare ground) for that time (headless Chromium) |
| TC-383 | U | ✅ | sprites | `blendSheetsFor`: a zone's own sheet plus each neighbour's, once each; none for Spire floors (worldSprites.test) |
| TC-384 | M | ✅ | sprites | first entry fetches only what's near: Dawnreach 9 blend sheets (itself + its 8 places), the Village 2 (itself + Dawnreach); walking out onto Dawnreach fetches the rest of its neighbours (headless Chromium, request log) |
| TC-385 | U | ✅ | tiles | `blendPairFrame` throws for a pair that isn't low → high (tiles.test) |
## Ember companion + battle SFX (#92)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-452 | U | ✅ | companion | Ember can't fight as an egg; Pair Attacks unlock hatchling → whelp → dragon (1/2/3); every cost fits `CHARGE_MAX` (companion.test) |
| TC-453 | U | ✅ | battleMath | `emberAttackDamage`: 0 for an egg, grows per stage, wrong answer is a non-zero glancing blow; `pairDamage` = (hero + Ember power) × multiplier and beats any solo damage spell of the same or lower cost (battleMath.test, companion.test) |
| TC-454 | U | ✅ | audio | every new SFX (impact, enemyAttack, spell, heal, guard, block, shatter, roar, pair) points at a shipped file (audio.test) |
| TC-455 | M | ✅ | battle | with Ember still an egg the 🐉 Ember command is disabled ("Still an egg…") (headless Chromium, seeded save) |
| TC-456 | M | ✅ | battle | hatchling: Ember → Ember Nip → correct answer → Ember lunges, enemy −18, charge +2 (+1 answer, +1 Ember bonus) (headless Chromium, mocked questions) |
| TC-457 | M | ✅ | battle | Pair Attacks are disabled below their cost; Twin Strike at 3◆ asks a super-hard question, both hero and Ember lunge, banner "⚔️ PAIR ATTACK — TWIN STRIKE!", enemy −77, charge −2 (headless Chromium) |
| TC-458 | M | ✅ | battle | a missed Pair Attack fizzles ("falls out of step… the charge is safe") and spends no charge (headless Chromium) |
| TC-459 | M | ✅ | battle | Ember's first hit on a shielded enemy (Relic Golem) shatters the shield for 0 damage and plays `shatter` (headless Chromium) |
| TC-460 | M | ✅ | audio | sound order in play (Howl.play spy): Attack → attack, impact · Ember → roar, impact · Pair → pair · Mend → spell, heal · Guard → guard · enemy turn → enemyAttack then block (0 dmg) or hit (headless Chromium) |
| TC-461 | M | ⬜ | audio | by ear with Sound on: new SFX sit at a comfortable level next to the old ones; the pair combo doesn't clip; a healer enemy's mend chime follows (not overlaps) the hit |
| TC-462 | M | ⬜ | battle | dragon-stage Ember: Dragon Tail, Blazing Comet and Dragon Duet all selectable at their cost; Dragon Duet vs a Fiend feels strong but not a guaranteed one-shot |

## Ember animations (#92 follow-up)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-463 | U | ✅ | choreography | every Pair Attack has a choreography moving both actors; every motion starts/ends at rest and heads toward the enemy; the blow lands within 60ms of the mover reaching the enemy; a volley's last fireball arrives exactly on the hit (choreography.test) |
| TC-464 | U | ✅ | choreography | `fitReach` rescales comet/duet dives to 85% of the measured gap, never overshoots on a narrow screen, and leaves lunges alone (choreography.test) |
| TC-465 | U | ✅ | sprites | hatchling/whelp/dragon battle sheets carry idle/attack/hurt/breath/cheer; the fireball FX sheet exists (choreography.test) |
| TC-466 | M | ✅ | battle | Ember faces the enemy (mirrored like the hero) (headless Chromium) |
| TC-467 | M | ✅ | battle | Ember Attack: wind-up → open-mouthed lunge; the enemy flinches + knocks back when the blow lands (headless Chromium) |
| TC-468 | M | ✅ | battle | Ember's Breath (dragon): Ember inhales and breathes, a 3-fireball volley crosses the arena, damage lands with the last fireball (headless Chromium) |
| TC-469 | M | ✅ | battle | Blazing Comet: Ember heaves, the hero arcs up wrapped in fire and crashes toward the enemy; Dragon Duet: hero + Ember rise and dive together behind a fireball volley (headless Chromium) |
| TC-470 | M | ✅ | battle | comet dive stops just short of the enemy at 390 / 900 / 1280px wide (closest gap 20 / 83 / 128px, measured per frame) |
| TC-471 | M | ✅ | battle | victory: a hatched Ember does its cheer hop; an egg wobbles — and a first win no longer hatches the egg on the victory panel (stage locked per fight) (headless Chromium) |
| TC-472 | M | ⬜ | battle | on a real phone: animations feel smooth, the fire trail/fireballs don't cover the question box, and nothing jitters |

## Battle round 3 — party, power moves, streaks, mercy (#93)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-473 | U | ✅ | battleTurn | `resolveHeroHit`: damage, defeat at 0, a shield absorbs the first landed hit (even glancing), a boss phase crossing is reported once and never on the killing blow |
| TC-474 | U | ✅ | battleTurn | `nextIntent`: never charges on the first enemy turn; charge → power → attack; regular enemies charge on a low roll, bosses every 3rd turn; every boss has a unique signature move name |
| TC-475 | U | ✅ | battleTurn | `resolveEnemyAttack`: power = 2×, Guard blocks even a power blow, a correct defend softens, mercy softens, healer mends below half, knockout reported |
| TC-476 | U | ✅ | battleTurn | streak bonus starts at 3 and caps at 5; mercy after 2 losses is only `{ levelDrop: 1 }`; first-win coin bonus only when kills = 0; bosses always drop an elixir, regular drops are real consumables or nothing |
| TC-477 | U | ✅ | companion | Ember always in the party, Pip/Wisp join on their quest's done flag (flags checked against `questDoneFlag`); every companion has a battle sheet, power and a Pair Attack; pair ids unique and within `CHARGE_MAX` |
| TC-478 | M | ✅ | battle | 🔄 Swap lists Ember / Pip / Wisp (locked ones show how to recruit); picking one swaps the sprite in and returns to the command menu — the turn is NOT spent (headless Chromium) |
| TC-479 | M | ✅ | battle | Pip's Slingshot (correct) → the next question (even the enemy's defend question) shows 3 options, one crossed out, with "Pip crossed out a wrong answer" (headless Chromium) |
| TC-480 | M | ✅ | battle | Wisp's Glimmer (correct) mends 20 HP (headless Chromium) |
| TC-481 | M | ✅ | battle | 3 correct in a row → "🔥 3 in a row!" + streak badge + chime; a wrong answer clears it (headless Chromium) |
| TC-482 | M | ✅ | battle | #70: after an enemy hit the store HP drops at once while the bar still shows the old value; tapping through and drinking a potion within 260ms heals from the real HP (headless Chromium) |
| TC-483 | M | ✅ | battle | boss: the 3rd enemy turn is "gathering power for Zero Crush" (charge SFX, glowing enemy, "💢 Zero Crush next!", Guard pulses); the next enemy turn unleashes it and a Guard blocks it completely (headless Chromium) |
| TC-484 | M | ✅ | battle | a Sage spell matching the enemy topic is tagged "✨ Super effective here!" in the Spellbook and its hit says "It's super effective!" (headless Chromium) |
| TC-485 | M | ✅ | battle | after 2 session losses to Count Bat: questions requested 1 level lower, the enemy's hits are NOT softened (same damage as without mercy), and a 💛 "questions will be a little easier" banner shows (headless Chromium) |
| TC-486 | M | ✅ | battle | first win over a Fiend: "First time beating…" + 1.5× coins and a Honey Elixir drop added to the bag; a repeat win has no bonus (headless Chromium) |
| TC-487 | M | ✅ | battle | with prefers-reduced-motion: Dragon Duet resolves with the hero never moving and no fireballs (headless Chromium, emulated media) |
| TC-488 | M | ⬜ | world | finish "Pip's Lucky Marble" / "The Darkened Moonwell" → the completion lines announce the new battle friend; the 📜 menu lists them under "Battle friends" |
| TC-489 | M | ⬜ | battle | a wrong answer shows "✅ The answer is: …" and the explanation under "Here's why:" in an amber box |
| TC-490 | M | ⬜ | audio | by ear: swap / charge / streak SFX feel right next to the existing set |

## Companion persistence + mercy rework (#93 follow-up)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-491 | U | ✅ | save | `normalizeSave` keeps `companionId: 'pip'`; a save without it, or with an unknown id, gets Ember (save.test) |
| TC-492 | M | ✅ | battle | 🔄 Swap writes the pick into the save; a battle started from that save (JSON round-trip + normalize) opens with Pip (headless Chromium) |
| TC-494 | M | ✅ | battle | Wisp's Glimmer lands the killing blow after the hero took damage: HP 92 → 112 and the saved HP after victory is 112, not 92 (headless Chromium) |
| TC-495 | M | ✅ | battle | leaving the arena before an attack lands (unmount within 260ms) plays no impact sound and logs no errors (headless Chromium) |
| TC-493 | M | ⬜ | battle | real reload: swap to Wisp, refresh the page, walk into a battle → Wisp is fighting; lose twice, refresh → no mercy banner (fresh start) |

## Battle UX on phones (#94)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-496 | M | ✅ | battle | at 360×640, 390×667, 390×844 and 900×760 the whole command menu is on screen (headless Chromium) |
| TC-497 | M | ✅ | battle | a 3-line question: all four answers are on screen before answering, and after answering (with the explanation) Go! is on screen — at all four sizes (headless Chromium) |
| TC-498 | M | ✅ | battle | answer options, the Hint Feather button and ← Back are ≥ 44px tall (headless Chromium) |
| TC-499 | M | ✅ | battle | the companion / spell menus fit or scroll inside the panel with ← Back visible; charge moves you can't afford say "Need N more ◆" (headless Chromium) |
| TC-500 | M | ✅ | battle | status panels keep each name on one line ("The Null Fi… Lv 5"); nothing slides the arena sideways (overflow: clip) (headless Chromium) |
| TC-501 | M | ⬜ | battle | on a real phone (iOS Safari + Android Chrome): no scrolling needed to answer and continue; tap targets feel comfortable; hint text readable in sunlight |

## Timed defend questions (#95)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-502 | U | ✅ | battleTurn | `defendTimeMs`: a flat 15s for every defend question; mercy adds 5s |
| TC-503 | M | ✅ | battle | a defend question shows "⏳ Ns" + a bar that counts down; attack questions show no countdown (headless Chromium, fake clock) |
| TC-504 | M | ✅ | battle | letting it run out: three ticks in the last 3s, then "⏰ Time's up! … lands a hit!", HP drops, wrong + hit sounds (headless Chromium) |
| TC-505 | M | ✅ | battle | picking an answer freezes it on "✓ In time!"; waiting 40s more never times out (headless Chromium) |
| TC-506 | M | ✅ | battle | the countdown pauses while the page is hidden (10s hidden → no time lost) (headless Chromium) |
| TC-507 | M | ✅ | battle | 360×640: countdown and all four answers on screen (headless Chromium) |
| TC-508 | M | ⬜ | battle | with a Guard up, letting the clock run out still blocks the blow completely; the timed-out question appears in the Library |
| TC-509 | M | ⬜ | battle | playtest: does the clock feel fair for a young reader on a long word problem? |

## Growth rule + countdown by age + timer setting (#96)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-510 | — | ❌ | growth | *(removed by #97 — XP no longer scales difficulty)* |
| TC-511 | — | ❌ | enemies | *(replaced by TC-519)* |
| TC-512 | U | ✅ | battleTurn | `defendTimeMs(age)`: younger → more time; 5–8 year-olds always > 15s; clamped 10–25s; mercy +5s (level no longer affects it) |
| TC-513 | U | ✅ | save | `defendTimer` defaults on (new and older saves); only an explicit `false` turns it off (save.test) |
| TC-514 | M | ✅ | battle | countdown starts at 24s (age 6), 19s (age 9), 15s (age 12) (headless Chromium; the Lv-16 part is superseded by #97) |
| TC-515 | M | ✅ | battle | with the timer off: no countdown, and 60s later the defend question is still waiting (headless Chromium) |
| TC-516 | M | ✅ | menu | 📜 Menu → ⚔️ Battle → Defend timer toggles On ↔ Off ("Take as long as you need") and writes the save (headless Chromium) |
| TC-517 | M | ⬜ | world | real account: turn the timer off, reload on another device → still off; level up past Lv 5, re-enter a zone → enemies one level higher |

## Question level + speed trigger (#97)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-518 | U | ✅ | battleTurn | `fastAnswerMs` = half the age countdown; 5 quick correct in a row → boost and the run restarts; slow / wrong / hinted (Infinity) resets; never more than +2 per battle; `skillAfterBattle` keeps the boost and never lowers |
| TC-519 | U | ✅ | enemies | a player new to a topic meets the age baseline; a math level of 7 raises a math enemy (and its HP); a level in another topic doesn't carry over (enemies.test) |
| TC-520 | M | ✅ | battle | age 9: 5 correct answers at 3s each → "⚡ So quick! … level 4 → 5", ⚡+1 by the enemy level, a level-5 pool is fetched and the following questions are level 5 (headless Chromium, fake clock) |
| TC-521 | M | ✅ | battle | winning that battle saves the math question level above where it started (4 → 6) (headless Chromium) |
| TC-522 | M | ✅ | battle | 6 correct answers at 12s each (slower than 9.5s) → no raise; 4 quick + 1 with a Hint Feather → no raise (headless Chromium) |
| TC-523 | M | ✅ | battle | 9000 XP meets the same enemy level as 0 XP; a math level of 7 → Count Bat Lv 7 and level-7 battle questions (headless Chromium) |
| TC-524 | M | ⬜ | battle | playtest: does "quick" (half the countdown) feel right for 6-, 9- and 12-year-olds? |
| TC-525 | U | ✅ | battleTurn | `skillAfterBattle` with no ramp answers (Flee) keeps the speed boost, and changes nothing without one |
| TC-526 | M | ✅ | battle | the harder pool has ONE question: after the boost it's asked 4 times in a row and every time can be answered and continued (no stuck card) (headless Chromium, #98) |
| TC-527 | M | ✅ | battle | the harder-pool fetch fails → one banner "Your level goes up to 5 after this battle", no ⚡ badge, questions continue at level 4 (headless Chromium) |
| TC-528 | M | ✅ | battle | 5 quick correct then Flee → math level saved 4 → 5; Flee with no boost saves nothing (headless Chromium) |
| TC-529 | M | ✅ | battle | with Pip: Slingshot (quick, correct) → the next question has one answer crossed out and doesn't count toward the run; strike + peeked + 4 quick = no raise, one more quick answer = raise (headless Chromium) |

## Battle port onto main's split arena (#99)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-530 | U | ✅ | battleTurn | a charged `power` blow through `resolveEnemyTurn` hits POWER_MULTIPLIER×; a guard still blocks it; a Mirror Charm bounces the full power blow |
| TC-531 | U | ✅ | battleTurn | the combined rule suite: main's resolvers (hits, shields, enrage, enemy turn, spells, items, buffs, store #70) + this branch's intents, streaks, mercy, rewards, countdown and speed trigger — 49 tests |
| TC-532 | C | ✅ | battle | main's arena smoke tests pass on the ported arena: Attack fills charge; a potion right after an enemy hit keeps both, and no timer moves HP afterwards (#70) |
| TC-533 | M | ✅ | battle | headless Chromium on the ported arena: 23 round-3 checks (swap keeps the turn, Pip's peek, streak, Wisp mend, store-first HP + fast potion, super effective, power-move telegraph + Guard block, mercy, first-win + drop, reduced motion) |
| TC-534 | M | ✅ | battle | headless Chromium: 10 item checks (Mirror bounce / vs shield / finishing bounce, Focus Tea ×2, Lucky Clover coins, Sunseed Snack) + 15 speed-trigger checks + 14 defend-timer checks, all on the ported arena |
| TC-535 | M | ⬜ | battle | playtest on a real phone: a full fight with Ember (egg → hatchling), a Pair Attack, a swap to Pip, a Mirror Charm and a timed defend — nothing missing vs before the port |

## Maps painted in Tiled (#75 item 5)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-386 | U | ✅ | tiled | the legend tileset has exactly one tile per map character (LEGEND_CHARS); a tile with no one-letter `char`, or a character on two tiles, is rejected (tiled.test) |
| TC-387 | U | ✅ | tiled | `tiledRows` turns a Tiled map back into the same rows; Dawnreach loads from its `.tmj` as 64×48 and is what every zone test checks (tiled.test, zones.test) |
| TC-388 | U | ✅ | tiled | a map the game can't read fails with where and why: an empty cell, a flipped tile, a tile not in the legend, a compressed layer, no `terrain` layer, a second tileset, an infinite map, a short layer, isometric (tiled.test) |
| TC-389 | M | ✅ | tools | Dawnreach's 48 rows → `.tmj` → rows round-trip identical; `pytiled_parser` (an independent Tiled reader) reads the map and tileset with the right size, layer, tileset and `char` properties |
| TC-390 | M | ✅ | tools | `tiled.py legend` regenerates byte-identical files, and refuses a reorder that would change an existing tile's character |
| TC-391 | M | ✅ | world | every zone screen is unchanged after the move to Tiled, and the dev server loads the `.tmj` in the browser (bench `shots` + `diff`, headless Chromium: the only differing pixels — ≤28 per coast screen, Starfall Coast included — are animated water/foam in shoreline corner tiles) |
| TC-393 | M | ✅ | bench | the bench masks shoreline corner tiles (they animate water half a tile off the water cells) and drifting fog banks, so two shot sets of the same code `diff` as IDENTICAL (exit 0) instead of "DIFFERENT" on coasts and near fog — verified on all 46 screens |
| TC-392 | M | ⬜ | tools | open `dawnreach.tmj` in the Tiled app: the legend shows the game's art, painting a tile and saving keeps the format the game reads (`npm test` passes) |

## Wayfinding: the 🚩, signposts, "where to next?" (#75 item 6)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-394 | U | ✅ | wayfinding | the next goal follows the story: Numbria's crystal first; then a crystal whose key you hold (before a key you'd still have to win); else the warden of the first locked crystal; the Spire at four crystals; "Explore Lumina" after it. Walked from a fresh save it takes 9 goals, each doable right then, no repeats, and every goal is reachable from every zone (wayfinding.test) |
| TC-395 | U | ✅ | wayfinding | directions: 8-way compass (none within a tile); fewest-zones route; from the Field "Take the west path to Numbria."; from the Village "Go north to Lumina Field, then take the west path to Numbria."; on the overworld measured from the hero's tile ("step into" when beside it); "It's right here in Numbria!" when there; a sentence for every story goal from every zone (wayfinding.test) |
| TC-396 | U | ✅ | wayfinding | a signpost names every place once, by direction, clockwise from north, nearest first, and leaves out a place right beside it; each signpost stands beside a crossroads, off the road; Elder Lumen, Grandmother Wick and Scout Tamsin end on "Where to next?" with the route from where they stand; after the Spire they just cheer you on (wayfinding.test) |
| TC-397 | M | ✅ | menu | world map at five story stages: 🚩 on the goal's place (Lumina Field for Numbria, the Woods for the Verdant Key, the Spire), "🚩 Next: …" and the route under the ⭐ caption, 🚩 beside the place in the list, the ⭐ stepping aside when both share a place; a 🎉 line and no flag after the Spire; fits at 390 px; no page errors (headless Chromium) |
| TC-398 | M | ✅ | dialogue | Elder Lumen's last line is "Where to next? The Null Fiend hoards the Crystal of Numbers. Take the west path to Numbria."; after the first crystal Grandmother Wick sends you west to the Whispering Woods; the west signpost reads six arrow lines, then "🚩 Next: … Go north-east to Lumina Field, then take the west path to Numbria." (headless Chromium) |
| TC-399 | M | ✅ | world | both signposts are drawn at their crossroads (pixel sign, "Signpost" label, off the road), and walking into each opens its own conversation (bench `__bench.state().talks`, headless Chromium) |
| TC-400 | M | ⬜ | world | in the real app: talk to a signpost and to Elder Lumen, open the menu map, then restore Numbria's crystal and check the 🚩 and the lines move on to the Whispering Woods |

## Battle tech-debt pass (#87)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-416 | U | ✅ | battleTurn | a correct answer fills one ◆, capped at `CHARGE_MAX`; a wrong one leaves charge alone (battleTurn.test) |
| TC-417 | U | ✅ | battleTurn | hero hit: deals damage, floors enemy HP at 0 and reports defeat; a shield absorbs the first landed hit then is gone; a shield-absorbed spell refunds its charge (battleTurn.test) |
| TC-418 | U | ✅ | battleTurn | boss enrage phases 1 and 2 are each announced exactly once; regular enemies never announce (battleTurn.test) |
| TC-419 | U | ✅ | battleTurn | enemy turn: a standing guard blocks fully and is spent; a correct defend softens; HP floors at 0 → hero down; a hurt healer mends, a healthy one doesn't; boss damage uses the current phase (battleTurn.test) |
| TC-420 | U | ✅ | battleTurn | spells: a miss fizzles and keeps charge; Mend heals (capped); Aegis raises the guard; offensive spells spend their cost (battleTurn.test) |
| TC-421 | U | ✅ | battleTurn | items: blocked reasons (none left / HP full / charge full / already warded); potion, elixir, spark and ward effects (battleTurn.test) |
| TC-422 | U | ✅ | battleStore | `start()` resets combat and derives the shield from the enemy archetype, so shield state never leaks between fights (battleTurn.test) |
| TC-423 | C | ✅ | BattleArena | smoke: Attack → correct answer → Go! shows "strikes true", lowers enemy HP and fills one ◆ (BattleArena.test) |
| TC-424 | M | ⬜ | BattleArena | play a full fight on a phone: lunges, damage numbers, SFX, enrage banner and victory panel look the same as before the refactor |

## Critical fixes (#88)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-425 | U | ✅ | quota SQL | 3 calls/min pass and the 4th is refused; a player over the daily fresh budget gets 0; the global budget caps a fresh player; budgets reset after a day (supabase/ci/quota.test.sql) |
| TC-426 | U | ✅ | quota SQL | anon and authenticated cannot EXECUTE `begin_question_request`; service_role can (quota.test.sql) |
| TC-427 | U | ✅ | migrations | every migration 0001→0009 applies in order to a fresh Postgres + the Supabase stub (CI migrations job) |
| TC-428 | U | ✅ | edge function | `deno check` passes for generate-questions (CI edge-function job) |
| TC-429 | M | ⬜ | edge function | after deploy: a request with no Authorization (or only the anon key) → 401 "Please sign in to play." |
| TC-430 | M | ⬜ | edge function | after deploy: 21 rapid calls from one player → the 21st returns 429 and the game shows the retry screen with the "short rest" message |
| TC-431 | M | ⬜ | edge function | with `FRESH_PER_PLAYER_PER_DAY=0`: a battle still loads (served from the cache) and `question_requests.fresh_count` stays 0 |
| TC-432 | U | ✅ | auth | `isRecoveryUrl` spots `type=recovery` in the hash or query and ignores other links (PasswordReset.test) |
| TC-433 | C | ✅ | AuthPage | Forgot password hides the password field, calls `resetPasswordForEmail` with this page as the redirect, and shows a neutral notice; errors are shown (PasswordReset.test) |
| TC-434 | C | ✅ | ResetPasswordPage | too-short / mismatched passwords are rejected without a server call; success saves and leaves recovery mode; a server error keeps recovery mode (PasswordReset.test) |
| TC-436 | U | ✅ | migrations | `apply_all_migrations.sql` is regenerated from `supabase/migrations/` and matches (CI `--check`) |
| TC-437 | U | ✅ | migrations | the bundle applies to a fresh DB, applies again without error, and records one row per migration (CI apply-twice job) |
| TC-438 | M | ✅ | migrations | on a drifted DB (old 0001 without the UPDATE policy, CLI history table with extra columns, existing player + question): the bundle restores the policy, adds columns, keeps data, records all 9 (local Postgres 16) |
| TC-439 | U | ✅ | migrations | a user created without (or with invalid) birth-date metadata does not fail sign-up and gets no trigger-made profile; valid metadata still seeds one (supabase/ci/access.test.sql) |
| TC-440 | U | ✅ | migrations | authenticated has select/insert/update on `profiles`; anon can't update it; only service_role can execute `increment_question_usage` (access.test.sql) |
| TC-441 | U | ✅ | db:bundle | the generator rejects a migration with BEGIN/COMMIT, CREATE TABLE/INDEX or ADD COLUMN without IF NOT EXISTS, CREATE FUNCTION without OR REPLACE, or CREATE POLICY/TRIGGER without a prior DROP IF EXISTS (verified by hand with throwaway files) |
| TC-435 | M | ⬜ | auth | end to end: request a reset email, open the link → "Choose a new password" → save → the game loads; sign out and sign in with the new password |

## Merge with main: village-expansion items in the refactored battle (#87, #80)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-442 | U | ✅ | battleTurn | Mirror Charm: blocks the hit, bounces the full hit back, is spent, and keeps a standing guard (battleTurn.test) |
| TC-443 | U | ✅ | battleTurn | a bounce onto a shielded foe shatters the shield instead of hurting it; a bounce can win the battle and a beaten healer doesn't mend; a bounce announces a boss enrage phase (battleTurn.test) |
| TC-444 | U | ✅ | battleTurn | Focus Tea multiplies one landed hit by `TEA_DAMAGE_MULT`, then is spent; it waits while the enemy's shield is up (battleTurn.test) |
| TC-445 | U | ✅ | battleTurn | Sunseed Snack heals `SNACK_HEAL` + 1 ◆; Turbo Coil fills ◆; Mirror/Tea/Clover set their flags; each new item has its "would do nothing" reason (battleTurn.test) |
| TC-446 | U | ✅ | battleStore | `start()` also resets the Mirror/Focus/Clover buffs, so they never carry into the next fight (battleTurn.test) |

## Training Grounds: all 7 topics, passed topics retired per session (#91)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-447 | U | ✅ | quizSessionStore | `markCompleted` adds a topic; is idempotent (never listed twice); accumulates distinct topics in order (quizSessionStore.test) |
| TC-448 | U | ✅ | quizSessionStore | `reset` clears the completed set so it cannot leak into the next session (quizSessionStore.test) |
| TC-449 | M | ⬜ | TopicSelect | the Training Grounds shows all 7 topics (4 crystal + nature/space/history), not just the crystal four |
| TC-450 | M | ⬜ | TopicSelect | passing a topic round (80%+) greys it out with a ✓ + "Completed" and makes it unclickable for the rest of the session; failing leaves it selectable |
| TC-451 | M | ⬜ | TopicSelect | sign out and back in (or reload) → every topic is selectable again (the completed set is ephemeral, cleared on sign-out via `useAuthInit`) |

## Fog banks: each crystal lifts its own fog, on screen (#75 item 7)

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-536 | U | ✅ | fog | every fog bank keeps its reward (a place or a chest) out of reach until one of its own flags lifts it, and in reach after; the Shrine and the Spire are the only places behind fog at the start (zones.test) |
| TC-537 | U | ✅ | fog | each crystal clears exactly one pocket of its own, with a chest whose question is on that crystal's topic (`chestTopicAt`); the hint names the crystal; every chest on a topic-less map has a topic from its bank (zones.test) |
| TC-538 | U | ✅ | fog | at every step of the story (wayfinding's next goal), the goal's entrance on Dawnreach is walkable with the fog lifted so far — no softlock (wayfinding.test) |
| TC-539 | U | ✅ | fog | `fogsToReveal`: none before a crystal; the math crystal → the math pocket, the shrine road and the Spire ring; a bank marked seen isn't shown again (zones.test) |
| TC-540 | U | ✅ | fog | `safeSpawn` with flags: a save inside the math pocket or inside the Spire fog starts at the zone spawn; once lifted it stays put; open ground always does (zones.test; and live on the bench) |
| TC-541 | U | ✅ | map | the world map marks each fogged bank with the crystal that clears it (🔢 🔬 ⚙️ 🎨, 💎 for any crystal), moved to the bank's top edge when a place icon is in its middle (worldMap.test) |
| TC-542 | M | ✅ | world | arriving with the math crystal restored: after a beat the camera glides to the Spire ring, the shrine road and the math pocket in turn (nearest first); each thins and rises away revealing what it hid; the camera glides back and the hero walks again (headless Chromium, filmed) |
| TC-543 | M | ✅ | world | with reduced motion the camera cuts to each bank and back instead of gliding; in a fresh browser the reveal waits until the map art has loaded (filmed) |
| TC-544 | M | ✅ | world | with no crystal, walking into the math pocket's fog stops the hero and shows its hint; the Spire tower rises above its fogged grounds; the menu map shows the crystal markers and the 💎 legend (headless Chromium) |
| TC-545 | M | ⬜ | world | in the real app: restore Numbria's crystal, see the new storybook panel, walk out onto Dawnreach and watch the three banks lift; open the math pocket's chest (a math question) |
| TC-546 | U | ✅ | fog | `fogPuffs` lays a bank out the same way every time, leaves no holes (every cell well inside a puff), mixes all three shapes, and has neighbours turning both ways (fog.test) |
| TC-547 | U | ✅ | fog | however the puffs drift, they never spill more than `FOG_OVERHANG` past the bank (fog.test) |
| TC-548 | U | ✅ | fog | `puffAt`: puffs drift over time and stay put with reduced motion; lifting moves them up and away and fades them to nothing (a fade only, with reduced motion); the puff sheet is 3 × 48 px (fog.test, tiles.test) |
| TC-549 | M | ✅ | world | the Spire ring and the pockets look like soft fog with round edges, the tower rising out of it; filmed a second apart, the puffs visibly shift around each other; a lift spreads them up and away (headless Chromium) |
| TC-550 | M | ✅ | world | frame rate in the foggiest view vs the tile fog (alternating runs, same machine, software GL): about 8% lower (38 → 35 fps); banks off screen are hidden and skipped. Recheck on a real device with TC-326 |
| TC-551 | U | ✅ | fog | `placesInside`: the Spire is inside its ring of fog, the shrine is beyond its own bank; `revealOpacity` stays 0 while the clouds start to thin, then rises smoothly to 1 (fog.test) |
| TC-552 | M | ✅ | world | with no crystal, the Spire tower and its name are hidden in the clouds; when the ring lifts, a faint tower appears, then a solid one, as the last puffs go; the camera glides back after (headless Chromium, filmed) |
| TC-553 | U | ✅ | story | the leaving-home panels (always before any crystal) say a ring of fog hides the Spire — not that it glitters or shows the way; Scout Tamsin calls the Spire a landmark only once its fog has lifted on screen (`fogSeenFlag('spire-fog')`), before that she says it's hidden (story.test) |
| TC-554 | M | ✅ | world | a fog reveal shows "Tap or press a key to skip ⏩" at the top while it plays; a key press, a click or a tap mid-reveal clears every bank left at once (all reported seen within ~50 ms), the hint goes, the camera is back on the hero, and the hero walks on the next key (headless Chromium, bench) |
| TC-555 | M | ✅ | world | a key or pointer already held down when a reveal starts does NOT skip it, nor does letting go; a fresh press then does; untouched, the reveal plays out in full (headless Chromium, bench) |
| TC-556 | M | ✅ | world | skipped as the camera reaches the Spire ring, the Spire stands whole with no fog left; reduced motion skips the same way (headless Chromium, bench) |
| TC-557 | M | ⬜ | world | in the real app: a fog lift plays the gate chime (not the level-up fanfare); with a screen reader on, the lift's toast ("The fog …") is read out, as are other toasts (fog hint, save) |
| TC-558 | U | ✅ | world map | `placeEmoji`: the Spire is ☁️ while its ring of fog is up and 🗼 once any crystal lifts it; every other place keeps its own emoji, the shrine included; ☁️ isn't any place's own emoji (worldMap.test) |
| TC-559 | M | ✅ | world map | menu map at 375 px: with no crystal, ☁️ sits in the Spire's fog (with the 💎 above it), "☁️ The Crystal Spire" in the list and a "☁️ = a place still hidden in the fog" legend line; with one crystal, 🗼 and no ☁️ legend (headless Chromium) |
| TC-560 | U | ✅ | world | home is Lumina Village (`HUB_ZONE`), safe, with the Lumina Library, Maple's Trading Post, Elder Lumen, the Librarian, Maple and Pip; no `lumina-field` zone; the home spawn is open ground away from the gates (zones.test) |
| TC-561 | U | ✅ | world | each crystal region is a place at its own corner of Dawnreach (four different corners) and leads only back onto Dawnreach; every gate onto Dawnreach lands beside its own icon (zones.test) |
| TC-562 | U | ✅ | world | on foot from the Village: every region reachable with no fog lifted; the shrine and the Spire sealed until their fog lifts (the shrine's valley walled off from the new canyon road); each pocket chest reachable only with its own crystal (zones.test) |
| TC-563 | U | ✅ | world | no overworld critter can wander to within a tile of any place's doorstep (leash + 1) (zones.test) |
| TC-564 | U | ✅ | save | v1 → v2: a Lumina Field save wakes in the Village (no position), everything else kept, `sageEquipped` gone; a Dawnreach position moves by (8, 6) tiles onto the same spot; the four pocket chests keep their opened state at their new ids; positions elsewhere untouched; an unknown zone drops its position (save.test) |
| TC-565 | U | ✅ | save | a save from a newer version is refused: `saveIsTooNew`; the store goes to 'outdated', loads nothing and writes nothing back (server or local copy); a v1 server save upgrades and is saved back as v2 (save.test, saveStore.test) |
| TC-566 | U | ✅ | wayfinding | from the Village the next goal reads "Go north-west to Numbria."; right outside its door, "Step into Numbria."; signposts list the four regions in their corner directions; Elder Lumen and Grandmother Wick point north-west; the walk-the-story test still finds every goal reachable (wayfinding.test) |
| TC-567 | U | ✅ | story | no NPC points the hero at Lumina Field; Elder Lumen's "All four crystals shine again" waits for the four-crystal ending (`ending-seen`), not the first crystal (story.test, npcs.ts) |
| TC-568 | M | ✅ | world | headless Chromium: each region's doorstep drawn with its icon, name and pocket; walking into and out of Numbria, Gearfall Canyon, Verdara and Chromaria lands beside the right icon each way; the Village's east gate leads out beside its icon; the Library and Trading Post interiors (roof fades, Librarian Sage, Maple behind the counter) |
| TC-569 | M | ✅ | world map | menu map at 375 px: the 80×60 continent, the four region emoji at the corners beside their crystal markers, 🚩 on Numbria with "Go north-west to Numbria.", 11 places listed (headless Chromium) |
| TC-570 | M | ⬜ | world | in the real app with an old v1 save standing on Lumina Field: it loads in the Village plaza; with a v1 save on Dawnreach: the hero is on the same spot of the bigger map |
| TC-571 | U | ✅ | world | no NPC is ever in two places at once: an NPC placed twice hands over on exactly one flag (`npcPresent`); Elder Lumen stands within 3 tiles of the home spawn, outdoors, until `met-elder`, then inside the Lumina Library; his first line sets `met-elder` (zones.test) |
| TC-572 | U | ✅ | wayfinding | `mentorTips`: a new hero hears the plan (four Fiends at the corners, start with the Null Fiend in Numbria to the north-west, no key) and the Berry Potion tip; after Numbria, the wardens and the Thicket Warden's Verdant Key; holding it, the Smog Fiend's gate in Verdara; two crystals in, the Rust Fiend's gate and the Clockwork Titan; all four, the Spire + rest at the Inn; after it, secrets and friends; never "go north…"-style steps (wayfinding.test) |
| TC-573 | U | ✅ | wayfinding | Elder Lumen is the mentor (not a guide; Wick and Tamsin are the guides): on the plaza his tips end with the invite to the Library; in the Library they don't (wayfinding.test) |
| TC-574 | M | ✅ | world | headless Chromium: a new hero on the plaza with Elder Lumen beside them; walking into him talks; once `met-elder` is set his plaza spot is empty at once (bumping it talks to no one); standing in the Library, he appears there live when the flag is set, beside the Librarian (labels apart), and can be talked to |
| TC-575 | M | ⬜ | world | in the real app with a new account: the intro, then Elder Lumen's welcome on the plaza ending with the Library invite; walk to the Library and hear the Numbria plan + potion tip; restore Numbria's crystal and hear the warden plan |
| TC-576 | U | ✅ | save | every v2 save carries the `save:v2` flag — a new save, a v1 save upgraded, a v2 save loaded (save.test) |
| TC-577 | U | ✅ | save | a stale v1 tab re-saving a migrated v2 save as "v1" (flags kept, version 1): the next load does NOT shift its Dawnreach position a second time; a real v1 save still shifts once (save.test) |
| TC-578 | U | ✅ | db | migration 0011: saving the same or a newer version works; an older `update` and an older `upsert` (`on conflict … do update`) are refused with `save_version_conflict` and the newer data is kept; a save with no version, a junk one or a number in a string counts as v1 and upgrades normally (supabase/ci/save_version.test.sql, CI on Postgres 16) |
| TC-579 | U | ✅ | saveStore | `flush` hit by `save_version_conflict`: status 'outdated', save dropped, later changes push nothing; any other server error keeps play going and only sets `remoteError` (saveStore.test) |
| TC-580 | C | ✅ | status screens | `ErrorScreen` says "Something went wrong" / "Try again" by default; with `title` / `emoji` / `retryLabel` it shows those instead — the outdated screen reads "Hazel Quest has been updated!" with a "🔄 Refresh" button (StatusScreens.test) |
| TC-581 | U | ✅ | story | Scout Tamsin names all four crystal lands with their corners in one line of ≤ 140 characters, separate from the Woods/Coast line (story.test) |
| TC-582 | M | ⬜ | save | after 0011 is applied in prod: open the game in two tabs, ship a version bump, play on in the new tab, then make the old tab save — it switches to "Hazel Quest has been updated!" and the new save survives a reload |
| TC-583 | U | ✅ | field spells | Return, Glow and Calm are each taught by their own keeper (role `keeper`) standing in their own shrine, a place on Dawnreach; every keeper teaches one; knowing a spell is the `spell:<id>` flag (fieldSpells.test) |
| TC-584 | U | ✅ | field spells | the Wayfarer's Shrine (Return) and the Shrine of Quiet Paws (Calm) are walkable from the start; the Shrine of First Light (Glow) only once a crystal lifts its fog (fieldSpells.test) |
| TC-585 | U | ✅ | Return | home always counts as visited; other towns once `visited:<zone>` is set, or (older saves) their crystal is restored; Return offers only visited towns, home first, never non-towns; lands home on the plaza and elsewhere just inside the front door; every landing is open ground with a way out onto Dawnreach without opening a gate (fieldSpells.test) |
| TC-586 | U | ✅ | dark places | the Echo Mine is the one dark place (a dungeon); its pitch dark covers walkable ground; its chest is unreachable until `lit:echo-mine`, reachable after; lit, every walkable cell is reachable; unlit, the door, spawn and Miner Mabel are in the light; `canGlow` only in an unlit dark place (zones.test, fieldSpells.test) |
| TC-587 | U | ✅ | wayfinding | after a crystal, Elder Lumen's tip names the first field spell you can learn at a shrine you can reach (Return → Glow → Calm), then the everyday tips; before any crystal the First Light shrine isn't offered; the signposts list the new places (wayfinding.test) |
| TC-588 | C | ✅ | shrine trial | a keeper's trial asks for 3 right answers on its topic; a miss brings another and goes to the Library; the spell is learned on the 3rd right answer (the explanation stays up until "Learn"); a used-up batch fetches another; a hero who knows the spell is told how to cast it (ShrineTrial.test) |
| TC-589 | C | ✅ | menu | ✨ Field spells: unlearned spells name the shrine that teaches them; Return lists visited towns with the current one greyed out and closes the menu to cast; Glow casts only in an unlit dark place ("Nothing dark to light here." / "lit already"); Calm waits until it wears off (FieldSpellsPanel.test) |
| TC-590 | M | ✅ | field spells | headless Chromium: the Wayfarer's Shrine trial at 375 px (dialogue → trial → 3 answers → learned, flag set); Return from the menu flies home → Numbria (fade, lands inside the door); the Echo Mine unlit (small light, black doorway, hint toast naming Old Wren, no Glow button), with Glow known (toast says tap Glow; one tap lights it, the dark fades, the hero walks up the tunnel); Calm from the menu (60 s pill, faded critters, no battle; the bench control run without Calm battles at once); into and out of each new place by its icon. **Review fixes (#102h):** the menu's ✨ Field spells sits right under the world map (desktop + 375 px); unlit, the Echo Mine outside the light circle is near-black (95%) so the pitch doorway no longer shows as a hard black box, while Miner Mabel's name and the chest still show faintly; bench: Calm (1.2 s) running out on top of a critter starts the battle ≥ 1.5 s later (3 runs: 1.52 / 1.53 / 2.46 s; before the fix 0 s in 2 of 3) |
| TC-591 | M | ⬜ | field spells | in the real app on a phone: learn all three spells, light the mine and open its chest, Return between two towns, walk the Dawnreach roads under Calm; Calm wears off with a toast after 60 s |
| TC-592 | U | ✅ | dungeons | every dungeon floor is a `dungeon` zone in one dungeon, the first a place on the overworld; stairs ('>' / '<') only on dungeon floors, each leading one floor on or back; each floor joins the next both ways, landing right beside the stairs back (dungeons.test) |
| TC-593 | U | ✅ | dungeons | from where you arrive on each floor the stairs on can be walked to with gates answered and no Glow; the boss stands on the deepest floor only and its key names that floor (dungeons.test) |
| TC-594 | U | ✅ | dungeons | floor labels B1/B2… down and Floor 1/2… up; HUD/map titles "Clockwork Depths · B2 — The Gear Halls"; a deep floor's entrance is the dungeon's first floor; the Spire's floors read "Floor 2 — The Overgrown Landing" (dungeons.test) |
| TC-595 | U | ✅ | zones | every 'E' / 'P' / stairs tile has an exit; the dark places are the Echo Mine (pitch dark until Glow) and the Gear Halls (dim, `dim` ≥ 150) — both underground; the Gear Halls' side hall shuts its chest away until lit (zones.test) |
| TC-596 | U | ✅ | wayfinding | the way to the Clockwork Titan reads "Go south-west to the Clockwork Depths, then take the stairs down two floors to the Titan's Forge." (a run of stairs the same way is one step); Elder Lumen: "…in the Titan's Forge, deep in the Clockwork Depths, to the south-west" (wayfinding.test) |
| TC-597 | M | ✅ | dungeons | headless Chromium: B1's vault stairs → B2 beside its stairs up, and back; B2's dark side hall blocks (pitch bump), lit it opens to its chest; B2's far end with the camera scrolled two screens down keeps the light on the hero; B2 → B3; the Titan fights with or without Calm; on a 375 px phone the HUD reads "B2 · The Gear Halls" and the map "You're here: Clockwork Depths · B2 — The Gear Halls" |
| TC-598 | M | ⬜ | dungeons | in the real app: answer B1's gatekeeper, walk all three floors to the Titan, win the Gearwright Key, open the forge hoard and the Gear Halls' side-hall chest (Glow), save at B3's crystal, reload mid-dungeon (wakes where saved) |
| TC-605 | U | ✅ | world map | a dungeon floor's caption reads "You're here: Clockwork Depths · B2 — The Gear Halls" with no "(past …)"; a zone merely sharing a prefix with the place still gets "(past …)" (worldMap.test) |

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
| TC-R8 | C | ✅ | #70 | enemy hit then an immediate potion (tapping through before the 260ms impact) keeps both the damage and the heal, and HP stays put after all pending timers fire (fake timers; BattleArena.test + battleTurn.test) |

---

## Notes
- Test runner: **Vitest** (`npm test`), jsdom environment, setup in
  `src/test/setup.ts`. Test files live next to their subject as `*.test.ts(x)`.
- 21 cases automated (30 `it` blocks); the rest are written but not yet
  implemented (⬜).
- When a case is automated, change its status to ✅.
