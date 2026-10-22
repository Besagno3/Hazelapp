# Conventions (full text)

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

- TypeScript: **`strict` is on** (both tsconfigs, since 2026-10-19 — ISSUES
  #111), with `noUnusedLocals`/`noUnusedParameters`. A guard's narrowing
  doesn't reach inner functions declared after it: copy the value into its
  own non-null `const` (`WorldCanvas`'s scene effect does) rather than
  sprinkling `!`.
- Tailwind utility classes inline; use the `cn()` helper (`src/lib/utils.ts`)
  for conditional class merging. **Width / height breakpoints:** the `touch` /
  `touch-wide` screens in `tailwind.config.js` are objects, and that turns
  Tailwind's `min-[…]:` / `max-[…]:` (and `max-sm:` etc.) variants off — they
  make no CSS. Write them as `[@media(max-width:359px)]:…` (#164).
- Password fields use `PasswordInput` (`src/components/`, the 👁️ show /
  🙈 hide button, #123) — not a bare `<input type="password">`.
- Game tuning constants: quiz gate in `src/lib/utils.ts` (`PASS_THRESHOLD`,
  `ROUNDS_TO_UNLOCK`); battle math in `src/lib/battleMath.ts`; economy in
  `src/content/items.ts`.
- Shared types live in `src/types/index.ts` — **except** unions derived from a
  content registry, which live beside that registry so the ids stay the single
  source of truth (`ZoneId` from `ZONE_IDS` in `content/zones.ts`, `TopicId`
  from `TOPIC_PROMPTS` in `supabase/functions/_shared/topics.ts`), and are
  re-exported through `types/index.ts` / `content/topicPrompts.ts`. Prefer this
  registry-derived pattern over hand-written unions for any new id set.
- **Edge functions must stay single-file.** `generate-questions/index.ts` keeps
  its topic table inline rather than importing `../_shared/topics.ts` — a
  sibling import fails to bundle on dashboard/API deploys (#67). The `_shared`
  copy is canonical for the app; `topicPrompts.test.ts` (`?raw`) fails if the
  function's inline copy drifts from it. The question flavours work the same
  way (`_shared/flavors.ts`, `questionFlavors.test.ts`, #131), and so does the
  kids' screen (`_shared/questionScreen.ts`, `questionScreen.test.ts`, #133)
  and closing an account (`_shared/closeAccount.ts`, `closeAccount.test.ts`,
  #124b).

---

