---
paths:
  - hazel-game/supabase/functions/**
  - hazel-game/supabase/scripts/**
  - hazel-game/src/lib/{questions,seen,funFacts}.ts
  - hazel-game/src/features/quiz/**
  - hazel-game/src/hooks/**
  - hazel-game/src/content/{starterQuestions,topicPrompts,topics}.ts
  - hazel-game/src/components/{QuestionCard,FlagButton}.tsx
---
# Questions — read `hazel-game/docs/architecture/questions.md` before changing these files

Kids' safety and the Claude budget live here. Non-negotiables:

- Edge functions stay single-file (#67): `_shared/*.ts` is canonical and a test fails when the inline copy drifts (`topicPrompts`, `questionFlavors`, `questionScreen`, `closeAccount`, `notify`). CI runs `deno check` on both functions and the recheck script. Redeploy `generate-questions` after a topic change.
- Only fixed text reaches the prompt (B8): the whitelisted topic, the rounded level, the age worked out server-side from the birth date, at most one flavour chosen by key. The kid's id is required; the quota check fails closed (cache only); each call's allowance is held on its request row.
- Claude failing never reaches a kid (B5): the cache fills in, then the app's starter questions (`content/starterQuestions.ts`), which never move a skill level or pay XP and carry no 🚩. The quiz and battle screens have no error state.
- Four screening layers, canonical in `_shared/questionScreen.ts`; every question is checked once (`checked_version = RULES_VERSION` — raise `RULES_VERSION` when the rules change and run the recheck, `docs/OPERATIONS.md`). A report re-checks the question; a problem holds it back; the owner is told (`_shared/notify.ts`) and decides in 🛡️ Question review.
- The model is Claude Haiku 5.5 with thinking on (room left in `max_tokens`, no `temperature` / prefill, replies read by block type); escalation to Claude Opus 5.5 for reports. Prompts are identical for every child and carry `cache_control`.
- Never rely on the order options come back in: `shuffleAnswers` in the app, `shuffleOptions` before caching (#121).
- Seen = shown (`markSeen`); prefetches take saved questions only (`cacheOnly`, `p_fresh_wanted: 0`) and a warmed request older than `HELD_FOR_MS` (45 min) isn't used. The quiz takes each question as the kid reaches it (`useQuizRound`, `QUICK_WAIT_MS`, carry-over within ±2 levels).
