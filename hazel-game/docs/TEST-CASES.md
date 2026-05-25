# Test Cases

Test cases for current and planned behavior. **Update before every commit** —
write cases for whatever you just built.

Status: ⬜ not written · 🟦 written, not passing · ✅ automated & passing
Type: U = unit · C = component · E = end-to-end · M = manual

Run the suite with `npm test` (`npm run test:watch` / `test:ui` while developing).

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-01 | U | ✅ | utils | `calcAttackDamage(3,3,30)` returns 30 (all correct) |
| TC-02 | U | ✅ | utils | `calcAttackDamage(0,3,30)` returns 0 (none correct) |
| TC-03 | U | ✅ | utils | `calcAttackDamage` rounds partial results (e.g. 2/3) |
| TC-04 | U | ✅ | utils | `cn()` merges + dedupes conflicting Tailwind classes |
| TC-05 | U | ✅ | gameStore | `setTopic` updates `progress.currentTopic` |
| TC-06 | U | ✅ | gameStore | `completeRound` appends round to `completedRounds` |
| TC-07 | U | ✅ | gameStore | world unlocks after `ROUNDS_TO_UNLOCK` passed rounds |
| TC-08 | U | ✅ | gameStore | failed rounds do NOT count toward unlock |
| TC-09 | U | ✅ | gameStore | `startBattle` sets phase `battle` and NPC HP |
| TC-10 | U | ✅ | gameStore | `endBattle` records result and returns to `world` |
| TC-11 | U | ✅ | gameStore | `reset` restores all defaults |
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
| TC-60 | U | ✅ | npc | `generateNpcs` produces the requested count |
| TC-61 | U | ✅ | npc | generated NPCs have valid level (1-10), topic, and HP |
| TC-62 | U | ✅ | npc | NPC level scales up with player age |
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
| TC-111 | M | ⬜ | WorldMap | arrow keys / WASD move the player; bumping an NPC starts a battle |
| TC-112 | M | ⬜ | WorldMap | KaPlay chunk is lazy-loaded (`/dist/assets/WorldMap-*.js`) |

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
