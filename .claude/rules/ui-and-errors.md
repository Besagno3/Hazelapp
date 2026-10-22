---
paths:
  - hazel-game/src/components/**
  - hazel-game/src/hooks/useInertOutside*
  - hazel-game/src/index.css
  - hazel-game/src/App.css
  - hazel-game/tailwind.config.js
  - hazel-game/src/test/setup.ts
  - hazel-game/src/lib/errors*
  - hazel-game/src/lib/familyErrors*
  - hazel-game/src/lib/lazyRetry*
  - hazel-game/src/lib/modalLayers*
  - hazel-game/src/lib/toast*
  - hazel-game/src/lib/utils*
---
# Shared UI and errors — read `hazel-game/docs/architecture/errors.md` before changing these files

Non-negotiables:

- Logs use `errorMessage(err)`; screens use `friendlyMessage` / `authErrorMessage(err, { where })` / `questionErrorMessage` / `plainErrorOr`; `resolveErrorMessage` for `functions.invoke` so the edge function's `{error, detail}` surfaces. A screen that shows raw `errorMessage` is a bug (#130 S6) — the crash screen's folded details are the exception.
- Buttons wait with `aria-disabled`, never `disabled` (the keyboard keeps its place); live error lines use `useLiveMessage` (keyed, so a repeat is read out); mail buttons count a refusal down with `useRetryWait`; "sign in again" words come with the `SignInAgainButton`.
- `ErrorBoundary` catches render errors (details under "Details for grown-ups"). `LazyBoundary` catches **only** a file that didn't load (`isChunkLoadError`) and rethrows the rest; `retryableLazy` / `useLazyRetry` reload only when our own page answers (`serverAnswers`). `ErrorScreen` and the crash screen move focus to their title.
- Every overlay is a `ModalLayer` (`role="dialog"`, `aria-modal`, outside `inert` via `useInertOutside`, focus moved in and back out, `onEscape`); nothing else sets `inert`. New overlays go in one too.
- Password fields use `PasswordInput`. Tailwind's `min-[…]:` / `max-[…]:` / `max-sm:` make no CSS here (the `touch` screens are objects) — write `[@media(max-width:359px)]:…` (#164). Merge classes with `cn()`.
- Bars and meters follow the dataviz method (plain HTML/CSS, one sequential hue plus the de-emphasis grey, every value in words beside its bar, `aria-hidden` bars).
