---
paths:
  - hazel-game/src/features/auth/**
  - hazel-game/src/features/family/**
  - hazel-game/supabase/functions/delete-account/**
  - hazel-game/supabase/functions/_shared/closeAccount.ts
  - hazel-game/src/test/grownUps.ts
  - hazel-game/src/test/progressFixtures.ts
  - hazel-game/src/store/authStore*
  - hazel-game/src/store/familyStore*
  - hazel-game/src/store/grownUpsStore*
  - hazel-game/src/store/profileStore*
  - hazel-game/src/lib/grownUps*
  - hazel-game/src/lib/grownUpsGate*
  - hazel-game/src/lib/pinLock*
  - hazel-game/src/lib/accountChange*
  - hazel-game/src/lib/closeAccount*
  - hazel-game/src/lib/progress*
  - hazel-game/src/lib/playDays*
  - hazel-game/src/lib/familyErrors*
  - hazel-game/src/lib/supabase*
  - hazel-game/src/lib/signupLink*
  - hazel-game/src/lib/review*
  - hazel-game/src/lib/streak*
  - hazel-game/src/lib/profile*
  - hazel-game/src/lib/activeMinutes*
  - hazel-game/src/content/family*
---
# Auth, the family and 👪 Grown-ups — read `hazel-game/docs/architecture/auth-and-family.md` before changing these files

Security-sensitive: a mistake here lets a kid act as a grown-up or leaks a family's data. Non-negotiables:

- A login is a grown-up's; kids are profiles (#124). PINs are hashed and rate-limited in the database (`try_kid_pin` / `try_parent_pin`, migrations 0014 + 0022); the app only ever sees `has_pin`.
- 👪 Grown-ups is enforced by the database (#167, migration 0024): a 15-minute window per sign-in opened only by a real check (`openGrownUpsWith`). Every grown-up action goes through `asGrownUp` (`grownUpsStore` → `RelockDialog`), which re-asks on HQ001 `grown_ups_locked` and runs the step again. Unlock refusals are HQ002 (`no_session`, `password_changed`, `reauth_required`) and each is worded (`unlockRefusal`).
- A new `profiles` column is a grown-up column until it's listed in `profiles_kid_play_columns()` — `supabase/ci/grown_ups_gate.test.sql` fails until it's classified.
- Password checks run on `passwordCheckClient()` (a throwaway client per check), never the device's client; the typed password never goes to an edge function (`delete-account` gets a fresh token + `DELETE` + the session id).
- A password change is announced first (`allowPasswordChange`; dropped on a failed save) or the database starts a 24-hour wait; a reset link's own sign-in ends it. Leaving the grown-up screens locks (`useLockOnLeave`); Sign out never waits on the server (`signOutHere`).
- 📈 Progress reads `PROGRESS_COLUMNS` only (never the birth date), shows only what the database stores, shapes it in pure `lib/progress.ts`, and sits in a `LazyBoundary`. `recordActivity` is the one way a day counts as played (the streak, last played, `play_days`); a day's play — XP, active minutes (`lib/activeMinutes.ts`), answers per topic — is kept on the device and sent with the day as this browser's part (`note_device_play`, migration 0027 — the day is the sum of its devices' parts; `note_play_history` while 0027 is missing), only once the day counts as played.
- Never write a profile row that wasn't read (`unread`, `retryRead`, #29 round 3). The question budget is per kid inside a family daily cap (#152).
- Words: `plainErrorOr`, `grownUpsLockedMessage({ inArea, hasParentPin })`, `DEVICE_SIGNED_OUT_MESSAGE` with a "Sign in again" button, `passwordWaitMessage` (calm, amber, never red), `authErrorMessage(err, { where })`. The privacy notice is a draft (`PRIVACY_IS_DRAFT`).
- Deploy order for 0024 + `delete-account`, and the auth settings the app relies on: `docs/OPERATIONS.md`.
