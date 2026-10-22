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
  real start in the save the first time its level is saved (`topicStarts`).
  **A row that couldn't be read is never written over (#29 review round 3,
  #61's class):** after a failed read the profile is this device's copy, or
  a made-up start (level 1, no topics), and `unread` is set: play goes on in
  memory, but nothing goes to the row and no topic start is noted (a made-up
  profile never becomes the device's copy either); the next change after
  `RETRY_READ_MS` (15 s) reads it again (`retryRead`) and takes it up — the
  row as the copy the device had would have merged it, plus the XP earned
  since and today played; levels and power-ups moved since count only from
  a real copy — then writes the result. A read that answers after the kid
  changed (or the game was put away) is dropped (`readGen`).

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
