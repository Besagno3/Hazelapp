# Auth, family, 👪 Grown-ups and 📈 Progress

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

Covers: sign-in, the family (kids as profiles), PINs and their limits, the database-held 👪 Grown-ups window and the password wait, the login's email / password changes, each kid's 📈 Progress page and the days they played, closing an account, and password reset.

## Auth and the family

- **Auth gates the app.** `App.tsx` calls `useAuthInit()` (loads the Supabase
  session + subscribes to auth changes). No valid session → only `AuthPage` is
  reachable.
- **A login is a grown-up's; kids are profiles (#124).** Signing in loads the
  family (`familyStore`: consent + kids). Before the game, `familyScreen()`
  picks, in order: consent (`ConsentPage`) → 👪 Grown-ups if open
  (`GrownUpsArea`, behind the grown-up's own PIN if set, or their password —
  `GrownUpsGate`: add / change / remove kids, each kid's 📈 Progress (#29),
  set the grown-up PIN, change
  the login's email or password (`AccountChange`, #124d), the privacy notice,
  Sign out, **Close account** — `CloseAccount`, the `delete-account` edge
  function, password + DELETE, #124b) → the first kid (`FirstKidPage`) → any kid without a PIN
  (`KidSetupPage`) → "Who's playing?" (`WhoIsPlaying`: a kid's tile, then
  their 4-digit PIN on `PinPad`). **PINs are hashed in the database**
  (migration 0014: `kid_pins` / `parent_pins`, readable by no client; set and
  checked only by `set_/check_kid_pin`, `set_/check_parent_pin` — and
  **limited** (migration 0022, #124c): `try_kid_pin` / `try_parent_pin` count
  wrong tries; 5 in a row lock the PIN for 1, 5, 15, then 60 minutes; the
  right PIN, a new PIN or a day without a wrong try starts over; `PinPad`
  says it in words with no time and counts the wait down (the one place the
  time is said), and while it holds a lock asks the database again
  (`pin_lock_status`: before showing a remembered lock, when the tab comes
  back, every 15 s and on a tap, at most every 3 s), so a PIN typed again on
  another device opens it; 👪 Grown-ups marks a locked kid by name and says
  when a Save unlocked them, `lib/pinLock.ts`); the app only sees
  `has_pin`. **👪 Grown-ups is enforced by the database (#167, migration
  0024):** opening it — the right grown-up PIN (`try_parent_pin`, while
  this sign-in is live: a right PIN on one that has ended opens nothing and
  says `signed_out`), or the password checked on `passwordCheckClient()` (a
  new throwaway client for each check), whose fresh token calls
  `unlock_grown_ups(<the device's session id>)` (`openGrownUpsWith`,
  `lib/grownUps.ts`) — opens a **15-minute** window on that one sign-in
  (`grown_up_unlocks`, keyed by login + session, readable by no client).
  Only a real check may name a sign-in (`grown_up_check_refusal(p_target)`,
  an allow-list the server enforces — review round 2): the device asks for
  the check first (`askForPasswordCheck` → `ask_grown_up_check`, which
  stamps `grown_up_sessions.asked_at` on the device's own sign-in and marks
  it a device), and a check is a password sign-in under a minute old, made
  after that ask (2 s clock slack), within a minute of it, never a device's,
  naming a different live sign-in — so the device's own older sign-in can
  never pass; a check opens one sign-in only (the app also notes each
  sign-in it runs on, `noteDeviceSession` → `note_device_session`). Every
  grown-up action needs it
  (`grown_ups_unlocked()`): adding or removing a player and changing
  anything about them but their play (the `profiles_grown_up_gate` trigger
  compares every column not on `profiles_kid_play_columns()`, so a new
  column is a grown-up one until it's listed — `grown_ups_gate.test.sql`
  fails until it's classified — plus the insert policy), `set_kid_pin`,
  `set_parent_pin`, `record_consent`, the admin review functions and
  `delete_family`; each refuses with SQLSTATE HQ001 `grown_ups_locked`
  (`grownUpsLocked`, `lib/grownUpsGate.ts`). The kid's own play — saves, the
  XP / level / streak / power-up columns, 🚩 reports, seen questions, their
  PIN — never needs it. A sign-in may open itself only while the family is
  still being set up and only in the minute after it signed in (a password,
  or an email link — `openForFirstRun` from `familyStore.load`), so the
  first run needs no gate; a named session must be one of the login's live
  ones (`auth.sessions`). An unlock refused says why (SQLSTATE HQ002,
  `unlockRefusal`): `no_session` — this device's sign-in has ended (a
  password change elsewhere), said with one "Sign in again" and the same
  words wherever it shows (`DEVICE_SIGNED_OUT_WHY` /
  `DEVICE_SIGNED_OUT_MESSAGE`; a right PIN on it throws
  `DeviceSignedOutError`); `password_changed` — below; `reauth_required`.
  **The password (#167 review rounds 1–2):** a deferred constraint trigger on
  `auth.users` notes every password change as its transaction commits
  (`grown_up_password_changes`, after GoTrue has signed the other sessions
  out); one the app announced first is fine, any other means no password
  opens 👪 or closes the account for 24 hours (`password_changed`, its
  DETAIL the end time; the grown-up PIN still opens 👪, and a new password
  set from a reset link ends the wait). The announcement
  (`allow_password_change(p_session)`) is for one sign-in, one change,
  within a minute, and dropped when the app's save fails
  (`dropPasswordChange` → `drop_password_change`): on Change password, the
  password check names the device's sign-in, and needs a recorded check that
  opened 👪 on it; on the reset page, the reset link's own sign-in
  (`grown_up_reset_sign_in`: the reset email sent and opened —
  `recovery_sent_at` set, `recovery_token` emptied — and an email-link `amr`
  entry (`otp` in the implicit flow, `recovery` / `magiclink` in PKCE) from
  that email, under an hour old, made within a minute of the session, with
  no password change since). A change made by any other sign-in, or one
  that's gone by the commit, counts as unannounced. In the wait the gate
  hides the box and "Open": a calm amber note says until when (`whenWords`:
  today / tomorrow / a weekday at …), and the main button is "Use my
  grown-up PIN" (with "Didn't change it? Reset it now" beside it) or, with
  no PIN, "Email me a reset link" — once the email is on its way the box
  comes back for the new password (`passwordWaitMessage(until, {
  hasParentPin, doing })`, `waitLead`). Leaving the
  grown-up screens for the kids' shuts it (`useLockOnLeave` →
  `lock_grown_ups`, which drops this sign-in's unused password allowance; a
  grown-up's Sign out first too, `signOutGrownUp`, from `SignOutButton`,
  which says "Signing out…" and waits with `aria-disabled`). A refusal
  mid-action asks again over the page (`asGrownUp` in `store/grownUpsStore`
  → `RelockDialog`), the page and what was typed kept, and the same step
  runs again once open. Its words follow where it is (`inArea`: "👪
  Grown-ups locked again" only in 👪 Grown-ups, "👪 Just checking it's a
  grown-up" on a setup screen; one line under the title, `relockLead`); on a
  short screen the PIN pad's ways out sit beside the pad (`PinPad`
  `beside`); Escape puts focus back on the button pressed (`ModalLayer`
  `restoreFocusOnEscape`); "Not now" says nothing changed in words for the
  screen (`grownUpsLockedMessage` — on a setup screen it asks for a
  grown-up; `GROWN_UPS_LOCKED_MESSAGE` when nothing says where). Back on 👪
  Grown-ups' list once the 15 minutes have run out, it shows the gate again
  (`grownUpsStore.openedAt`), saying why (`LAPSED_NOTE`, in its subtitle and
  read out). Changing the login's email or password asks
  for the current password too, then calls `updateUser` on the device's own
  client, a new password with `current_password` (`lib/accountChange.ts`); an
  email-change link that comes back says what's left on "Who's playing?"
  (`emailLinkNoticeFrom`, `features/auth/linkError.ts`, read as the page
  loads). GoTrue's own user update can't be held to the window (#168): the
  project's auth settings and the database's password wait stand in
  (Commands). Picking a kid (`choose`) loads *their* profile and
  save, keyed by the kid's id; the kid playing in a tab survives a reload
  (sessionStorage). In the game, **Switch player** (`SwitchPlayerButton`, two
  taps in the world's top bar) replaces Sign out. The active kid's id goes to
  the question function (`profileId`) — **the question budget is per kid**
  (a family has at most 8), inside a **daily cap the family's kids share**
  (migration 0021, #152) — and on flags. The privacy notice and the tile
  pictures live in `content/family.ts` (the notice is a **draft** until a
  lawyer reviews it — `PRIVACY_IS_DRAFT`).
- **👪 Grown-ups → 📈 Progress (#29, `features/family/ProgressPage.tsx`,
  `lib/progress.ts`):** a "📈 Progress" button on each kid's row opens their
  page, lazy-loaded (`React.lazy` in `GrownUpsArea`, so the game's first load
  doesn't carry it); a toggle per kid at the top (`aria-pressed`). The family
  is read once, three reads whatever its size (`fetchFamilyProgress`):
  `profiles` progress columns only (`PROGRESS_COLUMNS` — never the birth date;
  the kid's age only picks a topic's starting level, and PINs are unreadable
  anyway), `saves` (normalized), and the last week of `play_days`. Reading is
  not a grown-up action (no `asGrownUp`, no 👪 window needed — RLS keeps it to
  the family's own kids), but the page is only reachable through the gate and
  goes back to it when the 15 minutes run out, like the list. The page opens
  on an h2 with the kid's name and a few lines **at a glance** (`glance`:
  days played this week ("Not sure which days they played" when their
  device's date is set ahead, like the tiles — review round 3), the topics
  that climbed since their noted start (`climbedText`: "Most progress" only
  when every measured topic has a noted start and there are two or more —
  `Glance.ranked`; otherwise "Up since they started: Maps & Places (level 4
  → 5)", none crowned, round 3), what to practise together grouped by why
  with every topic named once (`practiseText`: below where it started, or
  `SEVERAL_MISSED` questions of one topic waiting at the Library, a topic
  with both said once with both; "nothing stands out" only when both the
  levels and the Library were read) and how many questions wait), then h3 sections
  (emoji `aria-hidden`); switching kids is said in the page's status region.
  Pure shaping in `lib/progress.ts`: `levelSummary` (the **player level**, so
  named, as the hero number, with one line saying it grows with XP and never
  makes questions harder), `streakSummary` (0 once a day was missed — the
  saved number waits for the next game; "7 days ago" once a week has passed;
  a day ahead of this device's today — the kid's device a time zone ahead —
  counts as today; further ahead is a clock set wrong, "Not sure",
  `clockAhead`, review round 2), `dayWords`, `recentDays` (played where the
  database noted the day or it's the last day played, plus the days a live
  streak proves — review round 2 — drawn and read "played" like any other,
  one mark, no key (round 3); nothing else guessed),
  `topicLevels` / `topicMeaning` (each topic "Math: level 6 of 10" read
  against **where that topic really started** — the save's `topicStarts`,
  noted by `profileStore.setSkillLevel` the first time a topic's level is
  saved (`ageToStartLevel` of the age then, and that age): "Up 2 from level
  1, where they started at age 6", "Below level 4, where they started at age
  9 — a good one to practise together", plus the writer's top bands, a
  stretch / the strongest; never against where a player of the kid's age
  *today* would start — a birthday moves that (#29 review round 2). The
  section opens with two short sentences (round 3: no history of the game;
  "Young players start low on purpose" for a kid starting below level 4),
  then its groups, each under a small heading: "Since they started" (when
  two or more share one start it's said once — "All 5 started at level 1,
  when Ada was 6." — and the rows shorten to "Up 2 since they started",
  `sharedStart`), "Levels now" for topics saved before starts were noted (no
  above / below claim, only the top bands; "Where these began wasn't
  recorded.", and when one sits under today's start, that one first played
  younger may have started lower — so a bare 2 never reads as a step back
  from the box below, round 3); nothing claims a level went down: no history
  is kept; topics no round has moved grouped in one "Not moved yet" box at
  the start for their age now, with no bar — a grey bar there outgrew the
  bars a long-time player earned), `storySummary` (the act by
  `act2/3/4-seen` as "Act II" only — the game names no acts; a crystal by
  name once restored, once their own 🚩 names it, or, Act I's four, once the
  opening story has; any other "a crystal they haven't found yet"; "4
  crystals restored so far — 1 more to find in the part of the story they've
  reached"; the Spire once Act I's crystals are back, their own 🚩 goal,
  trophies via `badgeInfo` — `content/badges.ts`, shared with the menu's
  shelf; unknown ids left out), `missedQuestions` ("Questions to practise":
  the Library queue newest first, and that the kid tries them again at the
  Library: question, right answer, what they picked or that time ran out,
  why, the topic's name — no ids; junk entries left out), `typingSummary`,
  `hasPlayed` (else "… hasn't played yet. Pick … on "Who's playing?" to
  start."). A part of the account that was never saved (no profile row, no
  save) says so once under the kid's name, and the sections it would fill are
  left out — never level 1, 0 of 3 rounds or nothing waiting. Every
  number in one format (`toLocaleString('en')`). Loading says so in a status
  region; errors use `plainErrorOr` (with "Sign in again" when the sign-in
  ran out) and log `errorMessage`; "Try again" waits in place with
  `aria-disabled` and, once loaded, the kid's heading takes the focus; no
  `play_days` table (0025 not applied) just leaves the week out. **A file
  that doesn't load** (offline, or a deploy replaced it): the page sits in a
  `LazyBoundary` (`components/`) and says "The progress page didn't load. Try
  again." on its own card (the loading card is as wide as the page) — the
  rest of 👪 Grown-ups keeps working (`retryableLazy` / `useLazyRetry`,
  `lib/lazyRetry.ts`; the world's lazy screen does the same in `App`,
  `LazyFailedScreen`); Back clears the area's live region, and Back while
  Try again waits drops its answer — no reload under the list later (round
  3). When Try again must reload the game, it leaves a note first
  (`noteReloadFor`, sessionStorage, with its time), and "Who's playing?"
  says "The page had to reload. Open 👪 Grown-ups again to carry on." once,
  focused, within two minutes (`takeReloadNote`, `RELOAD_NOTE_MS`,
  `PROGRESS_RELOADED_NOTE`, review rounds 2–3). **A bug in the page** (not a
  file that didn't load) shows its own card, `ProgressCrashed`: "Something
  went wrong showing progress. The rest of 👪 Grown-ups still works.", the
  error under "Details for grown-ups" (`components/ErrorDetails`) and Back —
  👪 stays open (`LazyBoundary`'s `crashed`, round 3; the world keeps the
  game's crash screen). Bars are plain HTML/CSS: blue `#2a78d6` on its `#cde2fb` track
  for measured values and played days,
  the de-emphasis grey `#898781` for crystals not yet restored — validated with the dataviz palette script on
  the card's white; every bar carries its value in words beside it
  (`aria-hidden` bars), the week is an ordered list read day by day.
  **Days played (#29, migration 0025, `lib/playDays.ts`):** when a kid plays
  on a new day — a round, a battle, **any XP earned** (`profileStore.addXp`
  runs `recordActivity`, so typing, the Library, shrines and the Scriptorium
  count, and the streak and "last played" agree with the week), or
  **finished typing practice** whatever it pays (a lesson, a cleared one
  replayed; a 🍂 Falling Leaves round with a leaf caught; a Scriptorium page —
  each calls `recordActivity`, review round 2) — that day
  (their device's own `YYYY-MM-DD`) is kept on the device
  (`hazel-play-days-<kid>`, at most 8; in memory when storage can't be
  written) and sent to `note_play_days(kid, days)` — security definer, run in
  UTC whatever time zone a request asks for, the family's own kid only (42501
  "not your player"), only adding days from 7 back to 1 ahead of the server's
  date, at most 31 a call, and deleting **every** kid's days older than 14
  (any family's note — at most 1,000 of the oldest a call, by the index on
  `day`, so no note risks the API's statement timeout, review round 2; rows
  another note is deleting are skipped, `skip locked`) — and leaves the
  device once sent. **The streak (#28) follows the same days:** `recordActivity`
  is the one path, so a day spent only on typing, the Library or a shrine
  keeps the 🔥 streak going too — intended (the lead, 2026-10-21). A failed send
  backs off: no such function (0025 not applied) → nothing more this session;
  offline → again on the `online` event or after `RETRY_OFFLINE_MS` (10 min);
  any other refusal → the next new day or profile load (`flushPlayDays(kid,
  { now })`). `play_days` (profile, day) is readable by the family for the
  last two weeks only (RLS) and writable by no client; removing a kid or
  closing the account deletes it (cascade). Kids have no login, so "the kid's
  own session" is the family's sign-in playing as them, as with saves.

## Closing an account

- **Closing an account (#124b):** the app signs in again with the typed
  password (`signInWithPassword` from the grown-up's own browser, so Supabase's
  sign-in limit counts that device — never one shared limit for every family,
  #124b review — on `passwordCheckClient()` in `lib/supabase.ts`, a new
  client for each check that keeps nothing: memory only, never refreshed, its
  own storage key, no other tab told; signed out again unless the close went
  through; the 👪 gate checks the password on one too, #124b review round 2),
  then calls `delete-account`
  (single file; `_shared/closeAccount.ts` canonical, drift-checked by
  `closeAccount.test.ts`) with that fresh token and `{confirm: 'DELETE',
  session: <the device's session id>}` — never the password; the password
  just typed opens 👪 Grown-ups on that session first (#167). A device whose
  sign-in can't be read or has ended (`no_session`) can't be opened by any
  PIN or password, so that's said at once with "Sign in again"
  (`device_signed_out`), never by asking for the gate again. The function checks the token (`auth.getUser`), the
  confirm word and that the token's `amr` claim says "password" within a
  minute (`signedInFreshly`; bare-string `amr` must name a password and then
  `last_sign_in_at` must be just now; no `amr` at all is refused and logged
  loudly; never `iat`), runs
  `delete_family(p_parent, p_session, p_caller)` (migrations 0023 + 0024,
  service role only — deletes nothing unless 👪 Grown-ups is open on the
  session named (403 `grown_ups_locked`) and the token's own sign-in
  (`p_caller`, its `session_id`) is the password check the database recorded
  opening it (a `grown_up_sessions` row kind `check`, target that session —
  HQ002 → 403 `reauth_required`), and never during the password wait
  (HQ002 `password_changed` → 403 `password_changed` with `until`, which the
  app says calmly in amber, as Change password does — `passwordWaitDb`;
  the app's own pre-close unlock says it first); the whole family in one
  transaction; today's spent question budget stays without a name, #152; on
  a database without 0024 the function refuses, 503 `database_out_of_date`,
  rather than deleting the login alone) and
  `auth.admin.deleteUser`; refusals are JSON `{error, detail}` codes the app
  words itself (`lib/closeAccount.ts`), each true however it came about: a lost
  reply is `outcome_unknown` ("we can't tell — safe to repeat"), a login
  already gone is `already_closed` (done), and "Nothing was deleted" only when
  that try deleted nothing. After `login_not_deleted`, leaving the page
  reloads the family (the privacy notice comes first again). Signing out
  afterwards never waits on the server (`signOutHere`, `familyStore`): when
  supabase-js keeps the session because `/logout` failed, the stored session
  is dropped (`forgetStoredSession`) and the sign-out asked again. The minute
  after a grown-up really signs in on the family device (that stored session
  is a fresh password sign-in too) can no longer close the account: a check
  must be a sign-in made after the device asked for it, so the device's own
  earlier sign-in never is one, only the recorded check can close, the
  session named must have 👪 Grown-ups open, and a sign-in can't open itself
  once the family is set up (#167, review rounds 1–2). Deploy:
  `supabase functions deploy delete-account` right after applying 0024 (no
  secrets beyond the injected `SUPABASE_*`).

## Password reset

- **Password reset (#88):** `AuthPage` "Forgot password?" →
  `resetPasswordForEmail` (redirects back to the app). A recovery link sets
  `authStore.passwordRecovery` (PASSWORD_RECOVERY event or `type=recovery` in
  the URL), and `App` shows `ResetPasswordPage` before the game; before
  saving, it tells the database the change comes from a reset link
  (`allowPasswordChange`, allowed only for the reset link's own sign-in —
  `grown_up_reset_sign_in`), which ends any 24-hour password wait (#167 review
  rounds 1–2; best effort — without it the new password saves but waits; a
  save that fails drops the announcement, `dropPasswordChange`). An
  email link that comes back with an error (`otp_expired`) is said on the
  sign-in page (`linkError.ts`) and dropped from the address, and so is the
  first of an email change's two links tapped while signed out ("Nearly
  done!"); once a reset link has run out, the reset page's main button is
  "Back to sign in" (#159).
