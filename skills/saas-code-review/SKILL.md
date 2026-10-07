---
name: saas-code-review
description: Review the most recently provided SaaS code (React, TypeScript, Supabase, NestJS) for bugs, missing edge cases, type-safety holes, and security gaps, then propose fixes as approved diffs. Use this whenever the user asks to "review", "check", "audit", "sanity-check", "find bugs in", or "harden" any React component, hook, TypeScript module, Supabase query/RLS policy, or NestJS code — even if they don't say the word "review". Also trigger after generating such code when the user says "now look it over" or "what did I miss". This skill is for web app / Supabase code specifically; for Dynamics 365 / Dataverse / plugin code use the d365-code-review skill instead.
---

# SaaS Code Review (React / TypeScript / Supabase)

Catch the bugs that generic review misses by checking against where web app code actually breaks — stale closures, async race conditions, type-safety holes that hide nulls, and the big one for Supabase apps: data exposed because RLS or a key is wrong. Then fix under the user's control, one approved diff at a time.

The highest-value findings in this stack are usually **security** (a client-side query trusting nonexistent RLS, a service key in a `VITE_` var) and **async correctness** (effects that race or leak). Prioritize accordingly.

## Workflow

Run these in order. Don't skip the context step — a "missing edge case" finding is only credible once you know what the code is contracted to do.

### 1. Locate the target code

Default target is the **most recent code in the conversation** — the last code block, or the file most recently created or edited. State in one line what you're reviewing. If it spans several files or it's unclear which artifact is meant, say which you picked and why, or ask. Never review the wrong thing silently.

### 2. Gather context before judging

Establish:
- **The contract**: what renders/calls this, what props/params it takes, what it returns or mutates.
- **The data layer**: for any Supabase call, what table, is it client-side or server-side, and what is it trusting for access control.
- **The blast radius**: if a fix would touch shared code (a hook, a context, a type used elsewhere), identify dependents now so you can flag regression risk later.

If context isn't available, note what you're assuming rather than guessing silently.

### 3. Review across the dimensions below

Walk the relevant checklist. Note every real issue with a location and a concrete failure scenario ("if the component unmounts before the fetch resolves, line 30 sets state on an unmounted component and the response can also land out of order").

### 4. Self-review pass — once, then stop

Re-read your findings as a skeptic before showing them. Drop or downgrade style preferences, things already handled elsewhere, and guesses about intent. Aim for a short list of things that are actually wrong, not a wall of nitpicks. Do this **once** — don't loop, don't start rewriting working code.

### 5. Report findings (ranked)

Use the output format below. Lead with the worst. Tag every finding with severity and confidence.

### 6. Propose fixes as diffs — one at a time, await approval

**Never apply a fix automatically.** For each issue the user wants addressed, present a diff plus a one-to-two-sentence rationale, then stop and wait for explicit approval before applying. Work in severity order. When a fix reaches beyond the snippet into shared code, say so plainly — that's where regressions hide.

### 7. Verify after fixing

After approved fixes, confirm nothing broke: run the type checker (`tsc --noEmit`) and any existing lint/tests if available; otherwise re-read the changed code against the checklist. Be explicit that runtime behavior (a real render, a real query against the database) is still the user's verification step. **Security fixes in particular** (RLS, key exposure) must be confirmed against the actual Supabase project, not just the code.

## Severity and confidence

- **Severity** — Critical (data exposure/leak, auth bypass, data loss, crash, silent wrong result) · High (fails on a common path) · Medium (uncommon but real path) · Low (nit, style, micro-perf).
- **Confidence** — High (you can name the exact trigger) · Low (depends on context you can't see — render it as an open question, not a fix).

## Output format

```
## SaaS Code Review: <target>
Reviewing: <file/snippet> · Context: <what else you pulled in>

### Summary
<N findings: X critical, Y high, ...> — one-line headline of the most important thing.

### Findings
For each, in severity order:
**[SEVERITY · confidence] <short title>**  (location)
- What breaks: <concrete failure>
- When: <triggering condition>
- Fix approach: <one line — the diff comes later, on approval>

### Assumptions made
- <intent / context you assumed>

### Open questions
- <low-confidence items needing the user's knowledge before any fix>
```

After the report, ask which findings to fix, then proceed to step 6 (one diff at a time).

---

## Review checklist

### Security and data layer (check first — highest stakes)

**Supabase RLS**
- Any client-side query (using the anon key) is only as safe as the table's **Row Level Security**. If RLS is missing or permissive, the data is effectively public regardless of what the UI shows. Flag every client-side table access whose protection you can't confirm — this is the #1 real vulnerability in this stack.
- **Multi-tenant isolation** must be enforced by RLS (`tenant_id`/`org_id` policies), not just by a `.eq('tenant_id', ...)` in the client query. A client filter is trivially bypassable; only the policy is real.

**Key and secret exposure**
- Anything prefixed `VITE_` (or `NEXT_PUBLIC_`) is **bundled into the browser** and visible to anyone. The Supabase `service_role` key must never appear there or anywhere client-side — it bypasses RLS entirely. Only the `anon` key belongs in the client.
- No secrets, tokens, or credentials hardcoded or shipped in the client bundle.

**Authorization vs authentication**
- Being logged in ≠ being allowed. Check that mutations and sensitive reads verify the user is permitted to act on *that* resource (server-side or via RLS), not merely that a session exists.
- Input validation on anything reaching the database or an edge/server function (e.g. zod schema) — don't trust client input.
- Raw SQL / `rpc` calls parameterized, not string-built. `dangerouslySetInnerHTML` only on sanitized content.

### React correctness

**Effects and async**
- `useEffect` dependency arrays: missing deps cause stale closures; over-broad deps cause loops. Verify each.
- **Cleanup**: subscriptions, timers, and realtime channels must be torn down in the effect's return. Leaks and "setState on unmounted component" come from missing cleanup.
- **Async race conditions**: an effect that fetches and then `setState` can (a) set state after unmount and (b) land **out of order** when inputs change quickly. Use an `AbortController` or an `ignore`/`isCurrent` flag so only the latest result wins.

**State and rendering**
- Async UI handles all of loading / error / empty / success — not just the happy path. A component that only renders `data` will crash or flash on the others.
- Derived data computed during render, not duplicated into state and kept in sync by hand.
- List `key` props are stable and unique (not array index when items reorder).
- `useMemo`/`useCallback` dependency arrays correct where they guard expensive work or referential identity.
- Controlled inputs stay controlled (no undefined→defined value flip).
- Consider an error boundary around subtrees that can throw.

### TypeScript safety

- Hunt `any` (explicit or implicit), unsafe `as` casts, and non-null assertions (`!`) — each is a place a runtime null/undefined can slip through the type system.
- Optional/nullable values actually handled (`?.`, `??`, guards) before use.
- Discriminated unions handled exhaustively (a `default`/`never` check so a new variant is a compile error, not a silent fallthrough).
- Function signatures honest about what can be null/undefined or throw.

### Data fetching and Supabase usage

- **Every** Supabase call destructures and checks `error` — `{ data, error }`. Ignoring `error` and using `data` (which is null on failure) is a common silent crash.
- `.select('*')` replaced with explicit columns where it matters; watch N+1 patterns (a query per list item).
- Pagination/`range()` for result sets that can exceed the default row cap.
- Auth session: token refresh and `onAuthStateChange` handled; expired-session path doesn't leave the UI in a broken state.
- Optimistic updates roll back on error.
- Storage bucket access governed by policies, not assumed.

### NestJS / backend (if present)

- DTO validation (class-validator / zod) on every endpoint; no unvalidated body/query/params.
- Guards/auth on protected routes; authorization checks per resource.
- Errors mapped to proper status codes; no internal details or stack traces leaked to clients.
- Idempotency for mutations that could be retried; transactions where multi-step writes must be atomic.
- No secrets in code; config via env/secret manager.

### Cross-cutting

- Failure modes: network error, timeout, partial failure, empty result — each handled.
- Idempotency for user-triggered mutations (double-click submit, retries).
- Logging/observability on paths that can fail (without logging secrets or PII).
