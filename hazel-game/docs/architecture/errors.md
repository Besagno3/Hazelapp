# Error handling

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

- Use `errorMessage(err)` (`src/lib/errors.ts`) for logs and diagnostics —
  never a hardcoded "something went wrong". On a kid's or grown-up's screen
  show `friendlyMessage(err)` — or `authErrorMessage(err)` for Supabase auth —
  and log `errorMessage` beside it (#130 S6). Pass the screen so the words
  name its own controls — `authErrorMessage(err, { where: 'gate' | 'sign-up'
  | 'reset' … })`; `authRetryAfter` / `isExpiredLink` sit beside it. Some
  screen that still shows `errorMessage` is a bug (#130 S6).
  `where` is `'sign-in' | 'sign-up' | 'gate' | 'reset' | 'forgot' | 'resend' |
  'link' | 'change-email' | 'change-password'` (👪 Grown-ups' login forms,
  #124d): an unmapped error says what didn't happen there; a wrong password
  points at "Forgot it?" where it is ("below" on the gate, "under the
  password box" on the change forms, which also word GoTrue's
  `current_password_mismatch`); a dead sign-in
  (JWT / refresh token / session) is `SIGNED_OUT_MESSAGE`; a non-JSON error
  page (`AuthUnknownError`) or a 5xx is `TROUBLE_MESSAGE`. Mail buttons count a
  refusal's wait down with `useRetryWait` (`features/auth/`); live error lines
  use `useLiveMessage` (keyed, so a repeat is read out); buttons wait with
  `aria-disabled`, never `disabled`, so the keyboard keeps its place (#159).
  Where a screen's questions didn't come, `questionErrorMessage(err, { what,
  retry })` (a kid offline is asked to fetch a grown-up to check the
  internet); family screens use `plainErrorOr(err, fallback)`
  (`lib/familyErrors.ts`; 👪 Grown-ups locked and "Not now" is
  `grownUpsLockedMessage({ inArea, hasParentPin })` — "locked again" only in
  👪 Grown-ups; on a setup screen "Nothing changed — this step needs a
  grown-up's password (or grown-up PIN). Not a grown-up? Please fetch one." —
  or `GROWN_UPS_LOCKED_MESSAGE` when nothing says where, #167; this device's
  sign-in ended is `DEVICE_SIGNED_OUT_MESSAGE` with "Sign in again" (a right
  PIN on it throws `DeviceSignedOutError`, which `plainErrorOr` words the
  same), and the 24-hour password wait is `passwordWaitMessage(until, {
  hasParentPin, doing: 'open' | 'change' | 'close' })` — calm news in an
  amber box, never red, with what works now). Words that say "sign in again" come with the
  button that does it: `App`'s family error, both PIN pads (a kid's reads
  "Grown-ups: sign in again"), KidForm, Remove and the grown-up PIN form offer
  "Sign in again" (`SignInAgainButton` → `signInAgain` in `familyStore`, a
  sign-out on this device that never waits on the server, `signOutHere`) when
  the sign-in ran out (`sessionGone`, `sessionRanOut`). No screen shows `errorMessage` now — the crash
  screen's folded details and the menu's cloud-save `title`s are on purpose
  (#130 S6).
- For `supabase.functions.invoke` failures, use `resolveErrorMessage` (async)
  so the edge function's real `{error, detail}` body surfaces.
- `ErrorBoundary` (`src/components/`) catches uncaught render errors and
  shows a friendly crash screen, the real error folded under "Details for
  grown-ups".
- A lazy-loaded page sits in a `LazyBoundary` (`src/components/`), so a file
  that doesn't load stays on that page (#29 review round 1): its own words
  and "Try again" (`retryableLazy` / `useLazyRetry`, `lib/lazyRetry.ts`),
  which loads the file afresh, reloads the page when our server answers
  with our own page (`serverAnswers`: OK, this site, `text/html`, the game's
  title and root read loosely by `isGamePage` — a test reads the real
  `index.html` — within `SERVER_ANSWER_MS` (8 s); a wifi sign-in page or a
  5xx isn't us; a new version replaced the file, or the browser kept the
  failure — Chrome does for a module; `beforeReload` can leave a note for
  after), and when it doesn't, says the connection's words instead (a reload
  would lose the game); once its card is gone the answer is dropped (round
  3). It catches **only** a file that didn't load (`isChunkLoadError`: the
  browsers' dynamic-import words — Safari's "not a valid JavaScript MIME
  type" too — Vite's preload, `ChunkLoadError`); any other error in the page
  goes on to `ErrorBoundary` with its details (#29 review round 2) — unless
  the page gives `crashed`, its own card for it (📈 Progress does, round 3:
  `ProgressCrashed`, `components/ErrorDetails`).
  📈 Progress and the world use it. `ErrorScreen` and the crash screen move
  the focus to their title as they appear, and `ErrorScreen`'s message is a
  live region (review round 2).

