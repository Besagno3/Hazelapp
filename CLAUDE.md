# Hazelapp

Home of **Hazel Quest**, an educational JRPG for kids. The app, its tests and
its docs live in `hazel-game/`. **Read `hazel-game/CLAUDE.md` before any
task** — it is the project's real entry point (Claude Code also loads it on
its own once you touch a file under `hazel-game/`), and its map says which
`docs/` file to read for each area.

- Run every `npm` command from `hazel-game/`.
- Path-scoped rules for each area are in `.claude/rules/` and the CLAUDE.md
  size check in `.claude/hooks/` (globs and `$CLAUDE_PROJECT_DIR` are relative
  to this repo root, so start Claude Code here).
- `.githooks/pre-commit` enforces the doc ritual: `git config core.hooksPath .githooks` once per clone.
