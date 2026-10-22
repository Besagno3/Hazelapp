# Hazelapp

Home of **Hazel Quest**, an educational JRPG for kids. The app, its tests and
its docs live in `hazel-game/` — start with `hazel-game/CLAUDE.md` (loaded
on its own once you touch anything under `hazel-game/`), then the map in it.

- Run every `npm` command from `hazel-game/`.
- Path-scoped rules for each area are in `.claude/rules/` (globs are relative
  to this repo root, so start Claude Code here).
- `.githooks/pre-commit` enforces the doc ritual: `git config core.hooksPath .githooks` once per clone.
