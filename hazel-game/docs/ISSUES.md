# Issues Log

Running log of bugs, shortcuts, and things to revisit. **Update before every
commit** — if you added a workaround or noticed something off, log it here.

Status: 🔴 open · 🟡 in progress · 🟢 resolved

| ID  | Status | Severity | Summary |
|-----|--------|----------|---------|
| #1  | 🔴 | High   | Auth is cosmetic — game state not gated on a real session |
| #2  | 🔴 | High   | `PASS_THRESHOLD` (0.82) vs 5 questions requires a perfect score |
| #3  | 🔴 | High   | App crashes on boot if Supabase env vars are missing |
| #4  | 🔴 | Med    | Test infrastructure (Vitest) installed but not wired |
| #5  | 🔴 | Med    | `vite-plugin-pwa` installed but not configured |
| #6  | 🔴 | Med    | Sign-up proceeds even when email confirmation is pending |
| #7  | 🔴 | Med    | Quiz/battle questions are hardcoded, not from Supabase |
| #8  | 🔴 | Low    | Battle damage and avatar HP do not persist between battles |
| #9  | 🔴 | Low    | Dead code: `'result'` battle phase, `NPC.questions`, `reset()` unused |
| #10 | 🔴 | Low    | Two React Vite plugins installed (`-react` and `-react-swc`) |
| #11 | 🔴 | Med    | Migrate game flow to xstate once guarded transitions multiply |

---

## Details

### #1 — Auth is cosmetic 🔴 High
`authStore` is never populated. Nothing calls `supabase.auth.getSession()` or
`onAuthStateChange()`. `AuthPage` just sets `phase = 'topic-select'` on success,
and `gameStore` persists `phase` to localStorage — so after one login, reloads
skip auth entirely with no valid session. **Fix:** drive an auth gate from a
real session listener; don't persist past `auth` without one.

### #2 — Pass threshold math 🔴 High
`PASS_THRESHOLD = 0.82` with `QUESTIONS_PER_ROUND = 5`: 4/5 = 0.80 < 0.82, so a
player must score 5/5 to pass. The UI advertises "82%+". **Fix:** decide the
intended pass bar (e.g. 0.8 = 4/5) and align copy + constant.

### #3 — Boots crash without env 🔴 High
`src/lib/supabase.ts` calls `createClient(url, key)` with values from
`import.meta.env`. No `.env` exists (only `.env.example`). **Fix:** create
`.env`, and/or guard with a clear error message.

### #4 — Tests not wired 🔴 Med
Vitest, Testing Library, jsdom are in `devDependencies`, but: no `test` script
in `package.json`, no `test` block in `vite.config.ts`, no jest-dom setup file.
**Fix:** add config + setup file + `npm test` script.

### #5 — PWA not configured 🔴 Med
`vite-plugin-pwa` is installed but `vite.config.ts` only registers the React
plugin. No manifest, no service worker. **Fix:** wire the plugin or drop the dep.

### #6 — Sign-up confirmation 🔴 Med
`AuthPage` advances to `topic-select` whenever `signUp` returns no error, but
Supabase may return a null session pending email confirmation. **Fix:** check
for a session / handle the confirmation flow.

### #7 — Hardcoded questions 🔴 Med
`QuizRound.tsx` and `BattleArena.tsx` contain `SAMPLE_QUESTIONS` /
`BATTLE_QUESTIONS` literals. `NPC.questions` is always `[]`. **Fix:** move
questions to Supabase (or a chosen content source) once the data model is set.

### #8 — Battle state not persisted 🔴 Low
`WorldMap` passes `avatar.hp` (always full) into each battle; damage taken is
never written back to the avatar. Every battle starts fresh. Confirm whether
this is intended.

### #9 — Dead code 🔴 Low
- `type Phase` in `BattleArena` includes `'result'`, never used (win/lose jumps
  straight to WorldMap with no result screen).
- `NPC.questions` field unused.
- `gameStore.reset()` defined but no UI calls it (no logout/restart).

### #10 — Duplicate React plugin 🔴 Low
Both `@vitejs/plugin-react` and `@vitejs/plugin-react-swc` are dependencies.
`vite.config.ts` uses `-swc`. Remove the unused one.

### #11 — Migrate game flow to xstate 🔴 Med
**Decision:** routing stays phase-based now; react-router is rejected for the
game flow (URLs / browser-back are a liability for a guided kids' game).
The flow is genuinely a state machine and already strains — e.g. `App.tsx`:
`if (progress.worldUnlocked && !avatar) return <AvatarSelect />` is a guarded
transition leaking into render logic. **Trigger to act:** when the 2nd–3rd
guarded transition appears (lives, level progression, save/resume, battle
result screen). At that point move the flow into an xstate machine (`xstate` +
`@xstate/react` are already installed) and keep Zustand for data only.
