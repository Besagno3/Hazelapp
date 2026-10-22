# Feature Log

The running record of what changed, newest first, one entry per commit (or
per logical change). It lived in `CLAUDE.md` until 2026-10-22, when it made up
7,500 of that file's 9,000 lines; now it is one file per month, read only when
someone needs it.

## Files

`YYYY-MM.md` — the entries whose date falls in that month, in the order they
were written (newest first). The split kept every entry word for word.

## Adding an entry

Part of the pre-commit ritual: `.githooks/pre-commit` requires one of these
month files staged with any change under `hazel-game/src/`.

1. Open this month's file, `YYYY-MM.md`. If it doesn't exist yet, create it
   with the header below.
2. Put the entry at the top, right under the header:

   ```markdown
   ### YYYY-MM-DD — What changed, in a line (#issue)
   What and why; the files or names that matter; what was tested (tests, lint,
   `tsc -b`, the stubbed app at which sizes); what was left, with its ISSUES number.
   ```

3. Never add an entry to `CLAUDE.md`: `.claude/hooks/check-claude-md.mjs`
   refuses a dated `###` heading there.

Header for a new month's file:

```markdown
# Feature Log — YYYY-MM

Newest first. One entry per commit (or per logical change). Index and how to add an entry: `README.md` in this folder.

```

## Reading it

`head -80 docs/feature-log/<month>.md` for what's newest;
`grep -n '^### ' docs/feature-log/*.md | grep '#163'` for an issue's entries.
A busy month runs to thousands of lines — read the entries you need, not the
file.
