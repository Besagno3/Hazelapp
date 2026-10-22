# Game flow, stores, saves and progression

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

Covers: the xstate game-flow machine, the feature folders, `saveStore` (write-through, versions, revisions, which copy wins), `battleStore`, `authStore` / `profileStore` (and the never-write-over-an-unread-row rule), and the two progression systems.

## Routing and folders

- **Routing is the game-flow machine** (`src/machines/gameFlow.ts`, xstate v5):
  `boot → topicSelect ⇄ quiz → avatarSelect → world ⇄ battle`, with world
  substates `exploring / dialogue / service / path / menu` driving DOM
  overlays. App sends `READY` once session + save are loaded; sign-out sends
  `RESET`. Guards (world unlock, avatar chosen) read the save store. The
  machine owns *where the player is*; Zustand stores own *what they have*.
- **Feature folders** under `src/features/`: `auth`, `family`, `quiz`, `battle`, `world`.

## Stores

- **`saveStore`** (`src/store/saveStore.ts`, #12): the per-player save file —
  zone, position, HP, coins, items, badges, sages, story flags, opened chests,
  quiz progress, Library queue, the active battle companion, the defend-timer
  setting, the last inn rested at (`lastRest`, #75 item 11 — additive, so no
  version bump; null = home), where Marlow's boat is moored (`boat`, #75 item
  14; `normalizeSave` keeps a mooring only on open sea) and how the hero is
  getting about (`vehicle`: `foot` / `boat` / `ember`, #75 item 15b — save v3
  replaced the boat's `aboard`; sailing only afloat with a boat, flying only
  over an overworld map once Ember can fly). Write-through: localStorage immediately
  (keyed `hazel-save-<userId>`), Supabase `saves` table on a 2s debounce;
  `flush()` on save crystals / Switch player (it skips a copy the server
  already has, `syncedRevision`); a tab that is hidden or closed pushes what's
  left at once (`flushOnHide` on `visibilitychange` / `pagehide`, a
  `keepalive` fetch, `lib/saveKeepalive.ts` — best effort on a closing page;
  with no session, a token expired or about to be, or over 60 KiB it goes the
  normal way, and a hide push that fails without a refusal re-arms the
  debounce).
  Supabase errors degrade to local-only play. Pure logic in `lib/save.ts`
  (normalize / legacy migration / the `MIGRATIONS` ladder — **`SAVE_VERSION`
  4** since #29 review round 3 — an empty step, a guard: a tab on a v3 build
  would drop `topicStarts` and save over them, so to it a v4 save is too new;
  3 since #75 item 15b). **Which copy wins (#151):** every change adds one
  to the save's `revision` (additive; none = 0, `revisionOf`); loading keeps
  the higher of this device's copy and the server's (a tie, or neither with a
  revision, goes to the server's) and pushes a newer local copy. The server
  refuses a copy that isn't newer than the one it holds — a lower or missing
  revision, or the same revision with other data (migration 0020, extending
  0011's trigger; same error `save_version_conflict`, detail
  `save_revision_conflict`). A refused tab stops (`'outdated'`,
  `outdatedReason` `'elsewhere'`, "Your adventure moved on!") and marks its
  local copy revision 0 so the refresh loads the server's; a tab also stops
  when another tab on this browser saves a newer copy (`storage`) or the
  server has one when it comes back into view (`checkForNewer`) —
  `watchPageForSaves`, wired in `App`. Between two copies that both moved on,
  the one with more changes wins. A save from a *newer* version is never
  loaded or overwritten: loads check `saveIsTooNew` (both copies), and the
  server refuses any write that lowers a save's version (migration 0011's
  trigger → `save_version_conflict`, which `flush` catches). Either way status
  goes `'outdated'` (`outdatedReason` `'update'`) and `App` asks for a refresh
  (`OutdatedScreen`).
  Every v2+ save carries the `save:v2` flag (`SAVE_V2_FLAG`) so the v1 → v2
  step never moves a position twice.
- **`battleStore`** holds the ephemeral battle session (enemy, HP, defeated
  instance ids, losses per enemy kind + tier for mercy (`lossKey`), the danger
  tiers already explained) — deliberately not persisted, so a reload is a
  fresh start for mercy.
- **`authStore`** holds the Supabase user/session; **`profileStore`** holds the
  `profiles` row (birth date, skill levels, xp, saved level, power-ups, streak).
  `recordActivity` is the one way a day counts as played (the streak, last
  played, 📈 Progress's week — #28, #29); `setSkillLevel` notes a topic's
  real start the first time its level is saved, on the profile
  (`skill_starts`, written with the level; a database without the column —
  PostgREST 42703 / PGRST204 — is read and written without it for
  `STARTS_RECHECK_MS`, 10 min, and asked again on every load, #89 review
  round 2) and in the save (`topicStarts`); on load, starts in the save the
  profile lacks are carried onto it (one write, once the save is loaded;
  `mergeProfiles` keeps the union, the server's on a clash); `noteAnswer`
  counts a bank question's final pick for today (#173). The database keeps
  each topic's first start (`profiles_keep_skill_starts`, 0026) and its age
  is the kid's (#183, the lead's calls): a start carries the day it was
  noted (`TopicStart.on`, the device's `YYYY-MM-DD`, set by `setSkillLevel`
  and kept by `normalizeSave`, `skillStartsFrom` and `mergeProfiles`), and
  the trigger works its age out from that day and the row's birth date
  (0026's `kid_age_on`, as `calcAge` does — `age.test` checks `calcAge`
  against the table the SQL test checks `kid_age_on` with; within 3–18) —
  as it arrives, from whichever device or save or unread take-up, whatever
  age it was sent with, and again on a grown-up's birth-date correction. So
  **exact:** every start this app notes, year or month corrected, however
  late it reaches the row. **Approximate:** a start without `on` (only from
  a save written by an app from before it): kept as sent, and a correction
  moves it by the change in the kid's age today — exact for the year (unless
  capped at 3 or 18), maybe a year off for a month; and the save's own
  `topicStarts` copy is never moved (📈 reads the profile's first). An `on`
  that isn't a real day from 2020 to a day after the server's is dropped
  alone (`topic_start_day`). A level never moves — the level they really
  started at stays true. Levels are never reset: the family's devices keep
  cached copies that merge levels by the higher and starts by union, so a
  reset on the server would be undone by the next device that loads. A
  grown-up's Save in 👪 sends the birth date only where the form changed it
  (`familyStore.updateKid`, #183 review), so a device with an older kid list
  never puts back another device's correction. Each read of the row is
  timed whole — the fetch and the session supabase-js waits for first (a
  token refresh after the tab slept), a race, not only the fetch's abort
  signal — and one still out after `READ_TIMEOUT_MS` (10 s) ends as a failed
  read; each failure gives the next read twice as long, up to
  `READ_TIMEOUT_MAX_MS` (30 s), back to 10 s on a read, a load or a clear
  (#184 and its review: a captive portal or a half-open connection held a
  kid's retries for minutes; a slow link that does answer gets its row).
  **A row that couldn't be read is never written over (#29 review round 3,
  #61's class):** after a failed read the profile is this device's copy, or
  a made-up start (level 1, no topics), and `unread` is set: play goes on in
  memory, but nothing goes to the row and no topic start is noted (a made-up
  profile never becomes the device's copy either); it is read again on a
  timer — after `RETRY_READ_MS` (15 s), then twice as long after each read
  that fails, up to `RETRY_READ_MAX_MS` (5 min), back to 15 s on a read, a
  load or a clear (#89 review round 1) — the moment the device is back
  online, and on the next change after that long (`retryRead`, #176; one
  read at a time per load, `readingGen`, so one still out for the last kid
  never holds up the next kid's), and taken up — the row as the copy the device had
  would have merged it, plus the XP earned since and today played; each
  topic's level moved since goes on as a step from the real level (1–10), a
  topic the row has no level for keeps the level played to and gets the
  start it was played from; power-ups count only from a real copy — then
  the result is written (`takeUp`). The steps — and the XP earned meanwhile
  (#180 review) — are kept beside the copy (`hazel-profile-steps-<kid>`,
  `lib/profile`'s `UnreadSteps`, #180), so a reload — or Switch player —
  before the row is read keeps a step down and the XP too (the copy alone,
  merged by the higher, lost them): the copy is taken back to where it stood
  (`withoutSteps`) and they go on from the row's once it's read. Every tab
  of the kid on the device adds to what's kept (`addUnreadStep`,
  `addUnreadXp`), and the first to read the row takes it all
  (`takeUnreadSteps`, inside `withStepsLock`: the Web Locks API's lock per
  kid where the browser has it, else read-and-remove in one synchronous
  step — best effort), so a step goes on once: a tab that finds its steps
  taken takes each topic it stepped from the copy that tab left (its own
  read may predate that write). A tab without a copy (a made-up start), or
  whose storage can't be written (`unread.unstored`), puts on its own.
  Another tab's step on a topic this tab never stepped meets "the higher
  wins", as another device's does. Cleared once taken, and with the copy
  (`forgetLocalProfile`: removing the kid, closing the account — a plain
  sign-out keeps both). No level is noted for today while unread. A read that answers after the kid
  changed (or the game was put away) is dropped (`readGen`). Removing the
  kid who's playing in 👪 puts their game away too (`removeKid`, #89 review
  round 1).

## Progression

- Two progression systems: (1) per-topic **skill ramp** — `nextSkillLevel`
  (`lib/age.ts`) tunes quiz difficulty after each quiz round, persisted via
  `profileStore.setSkillLevel`; (2) overall **player level** — saved in
  `profiles.level` with the XP earned toward the next one in `profiles.level_xp`
  (migration 0012; `xp` stays the lifetime total), earned from correct answers
  + NPC defeats. Level n takes `xpForLevel(n)` = 100 + 25×(n−1) XP
  (`lib/level.ts`). Retuning the curve never lowers anyone's level — only how
  far the next one is. Read it with `levelState(profile)` (a profile cached
  before levels were saved falls back to the old flat-100 curve).
