# Project skills

Drop a skill in here and Claude Code will auto-discover it for this project.

## Layout

Each skill is its **own subfolder** containing a `SKILL.md`:

```
.claude/skills/
  my-skill/
    SKILL.md          ← required
    reference.md      ← optional supporting files
    scripts/…         ← optional
```

## SKILL.md format

A markdown file with YAML frontmatter:

```markdown
---
name: my-skill
description: One line that tells Claude WHEN to use this skill. Be specific — this is what Claude matches against to decide whether to invoke it.
---

# My Skill

Instructions for Claude go here: steps, conventions, examples, checklists.
Reference other files in this folder by relative path when needed.
```

- **`name`** — kebab-case, matches the folder name.
- **`description`** — the trigger. Lead with when to use it (e.g. "Use when…").

## Using it

Once a `SKILL.md` is in place, invoke it by name (e.g. `/my-skill`) or just
describe the task — Claude matches the description and runs the skill.
After adding or editing a skill, start a fresh session so it's picked up.
