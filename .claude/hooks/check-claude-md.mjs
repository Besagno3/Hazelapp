#!/usr/bin/env node
// Keeps hazel-game/CLAUDE.md small enough to be followed.
//
//   Target 150 lines · warns at 180 · fails at 200 (Claude Code's documented guidance: under 200).
//   Also refuses a Feature Log entry (a dated "### YYYY-MM-DD" heading) in CLAUDE.md — those go in
//   hazel-game/docs/feature-log/<YYYY-MM>.md.
//
// Three ways in, one check:
//   node .claude/hooks/check-claude-md.mjs        CLI report (pre-commit hook, CI): exit 1 at the cap
//   … --staged                                    check the copy in git's index instead of the working tree
//   … --hook session-start                        Claude Code SessionStart hook: prints a warning as context
//   … --hook post-tool-use                        Claude Code PostToolUse hook (Edit|Write|Bash): reads the hook's JSON
//                                                 on stdin and, after an Edit/Write of a CLAUDE.md or a Bash command
//                                                 that names one (sed, a heredoc, cp…), hands Claude the warning as
//                                                 additionalContext
// No dependencies. Node 20+.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET = 150;
export const WARN = 180;
export const CAP = 200;

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = join(repoDir, 'hazel-game', 'CLAUDE.md');
const ROOT = join(repoDir, 'CLAUDE.md');
const RULES = join(repoDir, '.claude', 'rules');

/** Lines the way `wc -l` counts them (newlines). */
export function countLines(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** A rule without a `paths:` frontmatter field loads every session, like CLAUDE.md. */
function unconditionalRuleLines() {
  if (!existsSync(RULES)) return { lines: 0, files: [] };
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.md')) files.push(p);
    }
  };
  walk(RULES);
  let lines = 0;
  const always = [];
  for (const f of files) {
    const text = read(f);
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const scoped = fm && /^\s*paths\s*:/m.test(fm[1]);
    if (!scoped) {
      always.push(f.slice(repoDir.length + 1));
      lines += countLines(text);
    }
  }
  return { lines, files: always };
}

/** The staged copy of hazel-game/CLAUDE.md, or null when git has none (or isn't there). */
function stagedMain() {
  try {
    return execFileSync('git', ['show', ':hazel-game/CLAUDE.md'], { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export function check({ staged = false } = {}) {
  const main = (staged ? stagedMain() : null) ?? read(MAIN);
  const mainLines = countLines(main);
  const rootLines = countLines(read(ROOT));
  const rules = unconditionalRuleLines();
  const always = mainLines + rootLines + rules.lines;
  const logEntries = main.split('\n').filter((l) => /^### \d{4}-\d{2}-\d{2}/.test(l)).length;
  const problems = [];
  if (logEntries) {
    problems.push(
      `hazel-game/CLAUDE.md holds ${logEntries} Feature Log entr${logEntries === 1 ? 'y' : 'ies'} ` +
        `(a "### YYYY-MM-DD" heading). Entries go in hazel-game/docs/feature-log/<YYYY-MM>.md ` +
        `(see docs/feature-log/README.md) — move it there.`,
    );
  }
  const level = mainLines >= CAP || problems.length ? 'fail' : mainLines >= WARN ? 'warn' : 'ok';
  return { mainLines, rootLines, rules, always, level, problems };
}

export function summary(r) {
  return (
    `hazel-game/CLAUDE.md: ${r.mainLines} lines (target ${TARGET}, warns at ${WARN}, fails at ${CAP}). ` +
    `Loaded every session: ${r.mainLines} + ${r.rootLines} (root CLAUDE.md) + ${r.rules.lines} ` +
    `(rules without paths${r.rules.files.length ? ': ' + r.rules.files.join(', ') : ''}) = ${r.always} lines.`
  );
}

export function recommendation(r) {
  const over = Math.max(0, r.mainLines - TARGET);
  return [
    `How to get hazel-game/CLAUDE.md back to ~${TARGET} lines (it is ${r.mainLines}; ${over} over target):`,
    `  1. Any paragraph that explains HOW a system works → hazel-game/docs/architecture/<area>.md (verbatim),`,
    `     leaving a one-line pointer in the "Read before you change it" table.`,
    `  2. Any rule that only matters for some files → a paths:-scoped file in .claude/rules/ (it then loads`,
    `     only when a matching file is read or edited).`,
    `  3. Any multi-step procedure → hazel-game/docs/OPERATIONS.md, or a skill in .claude/skills/<name>/SKILL.md.`,
    `  4. Anything Claude can learn by reading the code, or that another docs file already says → delete it.`,
    `  5. For every remaining line ask: would removing it cause a mistake? If not, cut it.`,
    `  Then run: node .claude/hooks/check-claude-md.mjs`,
  ].join('\n');
}

function warningText(r) {
  const lines = [];
  if (r.mainLines >= CAP) {
    lines.push(`⛔ hazel-game/CLAUDE.md is ${r.mainLines} lines — at or over the ${CAP}-line cap. The pre-commit hook and CI refuse it.`);
  } else if (r.mainLines >= WARN) {
    lines.push(`⚠️ hazel-game/CLAUDE.md is ${r.mainLines} lines — past the ${WARN}-line warning (cap ${CAP}).`);
  }
  for (const p of r.problems) lines.push(`⛔ ${p}`);
  lines.push(summary(r));
  lines.push(recommendation(r));
  return lines.join('\n');
}

const args = process.argv.slice(2);
const hook = args.includes('--hook') ? args[args.indexOf('--hook') + 1] : null;
const TELL = 'Tell the owner this at the start of your next reply and offer to make the trim.';

if (process.argv[1] && basename(process.argv[1]) === 'check-claude-md.mjs') {
  const r = check({ staged: args.includes('--staged') });
  if (hook === 'session-start') {
    // stdout becomes context Claude sees. Say nothing while all is well.
    if (r.level !== 'ok') process.stdout.write(`[check-claude-md] ${warningText(r)}\n${TELL}\n`);
    process.exit(0);
  } else if (hook === 'post-tool-use') {
    let touched = false;
    try {
      const input = JSON.parse(readFileSync(0, 'utf8'))?.tool_input ?? {};
      // Edit / Write name the file; a Bash edit (sed, a heredoc, cp, mv…) names it in the command.
      touched = basename(input.file_path ?? '') === 'CLAUDE.md' || /CLAUDE\.md/.test(input.command ?? '');
    } catch {
      /* no stdin, or not JSON */
    }
    if (touched && r.level !== 'ok') {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: `[check-claude-md] ${warningText(r)}\n${TELL}`,
          },
        }),
      );
    }
    process.exit(0);
  } else {
    const ci = !!process.env.GITHUB_ACTIONS;
    if (r.level === 'ok') {
      console.log(`✓ ${summary(r)}`);
      process.exit(0);
    }
    if (r.level === 'warn') {
      console.log(warningText(r));
      if (ci) console.log(`::warning file=hazel-game/CLAUDE.md::CLAUDE.md is ${r.mainLines} lines (warns at ${WARN}, fails at ${CAP}). Trim it — see the job log.`);
      process.exit(0);
    }
    console.error(warningText(r));
    if (ci) console.log(`::error file=hazel-game/CLAUDE.md::CLAUDE.md is ${r.mainLines} lines or holds a Feature Log entry (cap ${CAP}). See the job log.`);
    process.exit(1);
  }
}
