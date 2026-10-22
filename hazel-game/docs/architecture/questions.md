# Questions: generation, screening, review, cache and loading

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

Covers: access and budgets for `generate-questions`, the four screening layers and the model settings, rechecks and reports, the owner's review page and alerts, answer shuffling, how the quiz and battle load questions without waiting, and the question cache / seen window.

## Access, budgets and screening

- **Question-generator access (#88):** `generate-questions` requires a signed-in
  caller (401 otherwise) and calls `begin_question_request` (migration 0009):
  per-player calls/minute (429 over it) + per-player, per-family (migration
  0021, B9: the kid's grown-up; removing a kid deletes their requests at once
  except today's spend, which stays, unlinked, for a day so it still counts —
  `profiles_forget_requests`) and project-wide daily budgets of *fresh*
  Claude questions. Each call's allowance is **held** on its request row
  (`p_fresh_wanted`, the batch size) until the function writes what it really
  made — an error partway writes what Claude made before it — so calls in
  flight at once can't each spend the same budget. Over budget it serves the cache
  (seen questions as a last resort). **The kid's id is required** (400
  without it) and the quota check **fails closed**: if it errors, the call is
  served from the cache only, never from Claude (Act I launch review B9,
  #131). Limits: `QUOTA_DEFAULTS` in the function, overridable by secrets.
  **Only fixed text reaches the prompt** (B8): the whitelisted topic, the
  level (rounded, 1–10), the kid's age worked out in the function from their
  birth date (`ageFrom`, clamped 3–18; the caller's `age` is ignored) and at
  most one flavour line chosen by key (`flavor`, `QUESTION_FLAVORS`); the old
  free-text `context` is ignored. **Claude failing never reaches a kid** (B5):
  the client times out after 30 s with one retry (20 s before Haiku 5.5's
  thinking, #147), a reply that didn't stop at
  `end_turn` (cut off, refused) counts as a failure, and the batch is filled
  from the cache (unseen first, then seen); only with nothing to give does
  the function answer a friendly "try again" (503) or, when today's budget is
  spent, "come back tomorrow" (429). Raw errors go to the log, never to the
  reply. **The app never shows those (#153):** `fetchQuestions` fills
  whatever the server can't give — offline, a 503 or 429, a topic it doesn't
  know yet, a short batch — from the hand-written **starter questions**
  (`content/starterQuestions.ts`: every topic, three level bands, six each,
  screened like AI ones; ids `starter-`, never marked seen, no 🚩 Report
  (`FlagButton` shows nothing off the bank, `inQuestionBank`), and they never
  move the saved skill level — quiz ramp, battle ramp or speed trigger: six a
  band repeat, so knowing them isn't a level; a round or battle whose bank
  answers aren't most of its answers holds the level (`bankRamp`, `lib/age.ts`),
  and a speed boost's harder pool takes bank questions only; they pay no XP —
  the owner's call — anywhere: quiz, battle answers, gates, chests, shrines,
  the Spire, the Library; the win's and the Spire's own bonuses still pay).
- **Questions are screened for kids (B10, #133, #147):** four layers in the
  function, canonical in `_shared/questionScreen.ts` (an identical inline copy
  between `// --- screen:start` / `screen:end` markers, word-for-word checked
  by `questionScreen.test.ts`). **The model is Claude Haiku 5.5** (`MODEL`,
  in the block; #147): it thinks by default and thinking counts toward
  `max_tokens`, so each call leaves room (writer 16,000, checks 8,000 /
  4,000) and sets its effort (writer and blind check `medium`, explanation
  check `low`); it takes no `temperature` / `top_p` / `top_k` and no prefill,
  and a reply is read by block type (it opens with thinking blocks,
  `replyJson`). (1) `CONTENT_RULES` — ten numbered safety rules plus fact
  rules — in the writer's system prompt, which also pitches the level to the
  child's age (1–3 easy for this age … 9–10 for the strongest, up to two years
  ahead in ideas) and asks it to check its own work; every part of a question
  is held to them, wrong options and the explanation too. (2) `screenQuestion`
  on every fresh *and* saved question (four different non-empty options,
  length caps, no links / emails / phone numbers, a blocked-word list, and
  nothing pointing at an option by its place — "all of the above", "the
  answer is B", lettered options — since the options get shuffled; a letter
  that IS an option's text, like a music note, passes). (3) A **blind check**
  answers each fresh question without the answer and says whether it keeps
  the rules (`keepChecked`). (4) An **explanation check** reads each one with
  its right answer and explanation (`keepExplained`) — the blind check never
  sees the explanation, which would give the answer away. (3) and (4) run side
  by side (`checkFresh`); only questions both pass are served, and a failed or
  mismatched check keeps none (the cache fills in). The three prompts are the
  same for every child (the age goes in the user message) and carry
  `cache_control`, so they're cached (Haiku 5.5 caches from 512 tokens; Haiku
  4.5 needed 4,096, so the old marker did nothing). Each call logs its time
  and tokens (`logCall`). It asks for a third more questions than it needs to
  cover drops; secret `QUESTION_SECOND_CHECK=off` turns both checks off.
  **Each question is checked once** (migration 0018): the checks go through
  `runChecks` (shared, with a `CallModel` each caller makes from its own client,
  `modelCaller`), and a question that passes is marked `checked_version =
  RULES_VERSION` — new ones as they're saved, **the saved bank** by
  `supabase/scripts/recheck-questions.ts` (#147; Deno, run by the owner with
  the service-role key — dry run first, `--apply` to act), which skips anything
  already checked under the current version; failures go to `review` with the
  reason in `questions.review_note` (0017), which the queue lists among the
  reasons. Raise `RULES_VERSION` when the rules change and the next recheck
  covers the bank again. **A report checks it again:** after a report is saved
  the app asks the function (`action: 'check-report'`, not awaited); it claims
  the question (`claim_report_check`: only for a report this family made since
  the question's last check, at most `REPORT_CHECKS_PER_FAMILY_PER_DAY` = 20 a
  day) and runs `reportReview` — Claude Haiku, and if Haiku finds nothing, the
  stronger model (`ESCALATION_MODEL`, Claude Opus 5.5, higher effort, with the
  server-side refusal fallback). A problem, or a check that can't run, holds the
  question back (`review`); either way the note says what was found. A check
  never puts a question back. Reports no check covered (the tab closed, over the
  cap) are swept by the recheck script's `--reported` run. **The owner hears
  about it** (#147, `_shared/notify.ts`, inline in the function between
  `// --- notify:start` / `notify:end`, drift-checked by `notify.test.ts`): email
  (Resend: `RESEND_API_KEY` + `ALERT_EMAIL_TO`, optional `ALERT_EMAIL_FROM`),
  Slack (`ALERT_SLACK_WEBHOOK_URL`) and Discord (`ALERT_DISCORD_WEBHOOK_URL`) —
  every channel whose secrets are set. A report check that leaves a question
  held back sends `heldAlert` at once (`alertIfHeld`); `action: 'digest'`
  (needs the `x-digest-secret` header = `ALERT_DIGEST_SECRET`, run daily by a
  scheduled job — see Commands) sends `digestAlert`, everything waiting, and
  nothing when nothing is. Messages carry the question and report counts, never
  a child or a family, and link to `APP_URL/?review`. A channel that refuses is
  logged, never fails the check. **The owner decides in the app** (#147,
  migration 0019): a grown-up listed in `public.admins` (added in the SQL editor;
  nobody can read or write it through the API) sees 🛡️ Question review in 👪
  Grown-ups (`QuestionReviewPage`, `lib/review.ts`): what's waiting, held back
  first, with the answer, the reports in words and the checks' notes (🔎), and
  ✅ Release / ⭐ Approve / 🗑️ Retire (asks first) through `admin_review_queue` /
  `admin_review_question`, which refuse anyone else ("not an admin", 42501) and
  record who decided (`questions.reviewed_by`). The alert's link (`?review`,
  `familyStore.reviewRequested`) opens 👪 Grown-ups and, once it's unlocked,
  the review page. **Reports** (`FlagButton`,
  on every question screen through `QuestionCard`, "Not OK for kids" first)
  hide a question from the reporting family; for everyone it's held back only
  through `questions.status` (migration 0016: `active` / `review` / `retired`
  / `approved`): "not OK for kids" sends an active question to review at
  once, two families an approved one, any three families' reports an active
  one. Only active and approved questions are served, approved first
  (`pick_cached_questions`, as 0016 redefines it). The
  owner reviews with `select * from question_review_queue` and
  `select review_question(id, 'approved' | 'retired' | 'active')` (service
  role / SQL editor only).
- **Answer order is random (#121):** the model that writes questions favours
  one spot for the right answer (most often B), so `shuffleAnswers`
  (`lib/questions.ts`) shuffles every question's options as it arrives
  (cached rows too); a battle reshuffles each ask (a long battle repeats its
  9 questions) and the Library each retry. The edge function also shuffles
  fresh questions before caching them (`shuffleOptions`). Never rely on the
  order options come back in.

## Generation and loading

- **Question generation** is a Deno edge function in
  `supabase/functions/generate-questions/` — it calls the Claude API
  server-side (API key never reaches the browser). `lib/questions.ts`
  (`fetchQuestions`) invokes it from the client; the optional `flavor` arg
  (a `FlavorId` key — battle, spell, gate, chest, shrine, spire — never text,
  #131) adds adventure flavour to fresh generations (#37).
- Quiz and battle screens load **AI-generated questions** without waiting for
  the whole batch (#158, #163): `useBattleQuestions` (age + per-topic skill
  level) starts on saved questions — a look-ahead, or a saved-questions-only
  request, at most `QUICK_WAIT_MS` (`quickQuestions`), starter questions
  filling a thin, slow or down bank — and adds the rest as they arrive
  (`moreQuestions`, which may ask Claude). It never errors (a bug in the
  loading is logged, and starters fill in), so neither screen has an error
  state. The battle goes round its pool; **the Training Grounds quiz**
  (`useQuizRound`, `features/quiz/`) takes each of its 5 questions as the kid
  reaches it — the next bank question when one is in, else a starter
  (`nextRoundQuestion`), never one the round asked — and if nothing new has
  arrived it says "One moment…" in its card (not a full-screen loader; shown
  only after a beat, counted once the last question has slid out, and then
  for at least 0.4 s, `useCalmWait`) for at most
  `QUICK_WAIT_MS`, then asks a starter (`withSpareStarters`), so a round
  always finishes. Next moves on only from the question it belongs to
  (`advance(from)`), and a question sliding out is inert. The quiz runs
  `useBattleQuestions` with `carry`: questions it was handed but couldn't use
  (in after every slot was taken, or after the kid left) are carried to the
  kid's next round of the topic (`carryOver` / `takeCarried`, in memory, per
  kid, within ±2 levels, dropped after `HELD_FOR_MS`) and go first there
  (`quickQuestions`' `have`: with 3 it starts at once), each kept until 45
  min after the server handed it over (`noteHandedOver`), the oldest going
  at the cap; the round-end look-ahead (`warmNextRound`, at the new level)
  asks only for what they leave missing; and a round whose bank covered it
  (`covered`) asks instead, as it ends, for the next round's — a normal
  request at the new level, ~1 fresh (#30, `askFreshForNextRound`). Gates, chests and tale-stones, shrine trials, the Spire
  and a battle's speed boost still use `fetchQuestions` (one call, the whole
  batch, starters for whatever the server can't give).

## The question cache

- **Question cache:** generated questions are stored in a Supabase `questions`
  table (level-tagged, `times_asked` counter, the `age` they were written
  for). The edge function mixes cached questions with fresh ones; the cached
  ones come from `pick_cached_questions` (migration 0015, #134; 0017, #147):
  the whole ±2 level band at random, leaning to less-asked, only ones written
  for a child within a year of this one, either way (`AGE_SLACK`) — and one
  written for an older child only at or below this kid's level, since a level
  is pitched to the age it was written for (old rows have no age and stay
  in) — none flagged. Without 0017 the function retries the picker without
  the age window's lower edge (logged). **Seen = shown (#134):** the app tells the server what was on
  screen (`markSeen`, `lib/seen.ts`, from `QuestionCard` and `QuizRound`, as
  `mark_questions_seen`); what the function hands over is only held back for
  an hour (`question_views.shown = false`), so prefetches don't fill a kid's
  seen window — the last 100 distinct questions shown in that topic (read
  from their latest 1,000 shown views, so the cost doesn't grow with play).
  `prefetchQuestions` (`lib/questions.ts`) warms requests ahead of need (one
  warmed longer ago than `HELD_FOR_MS`, 45 min, isn't used: the server's hold
  may have lapsed). A zone's critters — and the next quiz round, warmed as a
  round ends (#163) — are warmed from the saved bank only (`cacheOnly`, #153:
  unseen saved questions, never a Claude call, maybe short or empty, and it
  holds nothing on the family budget — `p_fresh_wanted: 0`); the
  battle asks for whatever is still missing when it starts.
