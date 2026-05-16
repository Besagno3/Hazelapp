# Test Cases

Test cases for current and planned behavior. **Update before every commit** —
write cases for whatever you just built, even before the test runner exists.

Status: ⬜ not written · 🟦 written, not passing · ✅ automated & passing
Type: U = unit · C = component · E = end-to-end · M = manual

| ID    | Type | Status | Feature | Case |
|-------|------|--------|---------|------|
| TC-01 | U | ⬜ | utils | `calcAttackDamage(3,3,30)` returns 30 (all correct) |
| TC-02 | U | ⬜ | utils | `calcAttackDamage(0,3,30)` returns 0 (none correct) |
| TC-03 | U | ⬜ | utils | `calcAttackDamage` rounds partial results (e.g. 2/3) |
| TC-04 | U | ⬜ | utils | `cn()` merges + dedupes conflicting Tailwind classes |
| TC-05 | U | ⬜ | gameStore | `setTopic` updates `progress.currentTopic` |
| TC-06 | U | ⬜ | gameStore | `completeRound` appends round to `completedRounds` |
| TC-07 | U | ⬜ | gameStore | world unlocks after `ROUNDS_TO_UNLOCK` passed rounds |
| TC-08 | U | ⬜ | gameStore | failed rounds do NOT count toward unlock |
| TC-09 | U | ⬜ | gameStore | `startBattle` sets phase `battle` and NPC HP |
| TC-10 | U | ⬜ | gameStore | `endBattle` records result and returns to `world` |
| TC-11 | U | ⬜ | gameStore | `reset` restores all defaults |
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

## Regression cases (tied to ISSUES.md)

| ID    | Type | Status | Issue | Case |
|-------|------|--------|-------|------|
| TC-R1 | E | ⬜ | #1 | reload without a valid session returns to the Auth screen |
| TC-R2 | U | ⬜ | #2 | 4/5 correct passes a round at the intended threshold |
| TC-R3 | U | ⬜ | #3 | missing Supabase env produces a clear error, not a crash |
| TC-R4 | C | ⬜ | #6 | sign-up pending confirmation does NOT enter the game |

---

## Notes
- No test runner is configured yet (ISSUES.md #4). Until then, `Type: M` cases
  should be verified manually and noted in the commit message.
- When a case is automated, change its status and link the test file.
