#!/usr/bin/env node
//
// Vercel "Ignored Build Step" (vercel.json → ignoreCommand). Vercel runs this
// before every deployment: exit 0 = SKIP the build, exit 1 = BUILD.
//
// Production always builds. A preview builds only when its branch has an open,
// non-draft PR — the same rule as the GitHub Actions draft gate, so pushes
// while a PR is a draft, or to a branch with no PR yet, cost no build minutes.
// Marking a PR ready doesn't push, so its first preview builds on the next push.
//
// Needs no secret on a public repo. On a private repo, set GITHUB_PR_READ_TOKEN
// in Vercel (Preview env): a fine-grained token with Pull requests: read on this
// repo. Any lookup failure FAILS OPEN (builds), so a missing or expired token
// just means previews build as before — never a silently skipped one.

const SKIP = 0;
const BUILD = 1;

const {
  VERCEL_ENV,
  VERCEL_GIT_REPO_OWNER: owner,
  VERCEL_GIT_REPO_SLUG: repo,
  VERCEL_GIT_COMMIT_REF: branch,
  GITHUB_PR_READ_TOKEN: token,
} = process.env;

function done(code, why) {
  console.log(`${code === SKIP ? "Skipping" : "Building"}: ${why}`);
  process.exit(code);
}

if (VERCEL_ENV === "production") done(BUILD, "production deployment");
if (!owner || !repo || !branch) done(BUILD, "no git metadata to look up the PR");

const url =
  `https://api.github.com/repos/${owner}/${repo}/pulls` +
  `?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`;

let prs;
try {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) done(BUILD, `PR lookup failed (HTTP ${res.status}) — failing open`);
  prs = await res.json();
} catch (err) {
  done(BUILD, `PR lookup failed (${err.message}) — failing open`);
}

if (!Array.isArray(prs) || prs.length === 0) done(SKIP, `no open PR for ${branch}`);

const ready = prs.find((pr) => !pr.draft);
if (ready) done(BUILD, `PR #${ready.number} is ready for review`);
done(SKIP, `PR #${prs[0].number} is a draft`);
