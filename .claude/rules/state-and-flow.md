---
paths:
  - hazel-game/src/store/**
  - hazel-game/src/machines/**
  - hazel-game/src/App*.tsx
  - hazel-game/src/main.tsx
  - hazel-game/src/types/**
  - hazel-game/src/test/saveFixtures.ts
  - hazel-game/src/lib/save*
  - hazel-game/src/lib/saveKeepalive*
  - hazel-game/src/lib/level*
  - hazel-game/src/lib/age*
  - hazel-game/src/lib/settings*
---
# Game flow, stores and saves — read `hazel-game/docs/architecture/state-and-flow.md` before changing these files

Non-negotiables:

- The xstate machine owns *where the player is*; Zustand stores own *what they have*. No react-router for the game flow.
- `saveStore` writes through: localStorage at once (`hazel-save-<userId>`), Supabase on a 2 s debounce, `flush()` on save crystals and Switch player, `flushOnHide` when the tab hides. An additive field needs no version bump; a shape change is a `MIGRATIONS` step and a `SAVE_VERSION` bump (now 4), and an older tab refuses a newer save (`saveIsTooNew`, `OutdatedScreen`).
- Which copy wins (#151): every change adds one to `revision`; loading keeps the higher copy; the server refuses a copy that isn't newer (`save_version_conflict` / `save_revision_conflict`) and the refused tab stops (`'outdated'`). Never load or overwrite a save from a newer version.
- `battleStore` is never persisted. `profileStore`: `recordActivity` is the one way a day counts as played; `setSkillLevel` notes a topic's real start on the profile (`skill_starts`, migration 0026 — the database keeps the first and works its age out from the day noted and the birth date) and in the save (`topicStarts`); never write over a row that wasn't read (`unread`, `retryRead`, the steps kept in `UnreadSteps`).
- Difficulty is the per-topic skill level (`nextSkillLevel`, `lib/age.ts`), never XP. Level n takes `xpForLevel(n)` = 100 + 25×(n−1); retuning never lowers anyone's level. The Training Grounds' opening rounds pay no XP (#122).
- Shared types live in `src/types/index.ts` — except unions derived from a content registry, which live beside the registry and are re-exported.
