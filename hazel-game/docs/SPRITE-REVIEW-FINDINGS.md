# Sprite System — Review Findings Tracker

Findings from the adversarial code review of the pixel-art sprite system
(branch `feature/pixel-art-characters`). The art has landed since (the
generated 16-bit set, #71: every hero, enemy, NPC and Ember stage has its
sheets), so these are real now. Track and fix against this list.

Legend: `[ ]` open · `[x]` done · `[~]` moot or covered (why below) · Sev = Critical / Important / Minor

**Status (2026-10-19, ISSUES #49):** A1, A4, B1 (the world's half), B3 and C5
fixed; A2 and C3 moot; A3, B2 and C1 covered by `sprites.test.ts`. Line numbers
refreshed where cheap. Still open: B1's battle half (`SpriteSheet`), B4–B7, C2,
C4, C6, C7.

---

## A. Fix now (real today, cheap, or prevents recurring pain)

- [x] **A1 · Important · HMR re-init → black line.** `WorldCanvas.tsx:233` `sharedKaplay` is module-level; editing the file (or any module it imports — a zone, `lib/fog.ts`) hot-reloads it, resets the guard to `null`, and `kaplay()` is called again over the live canvas → the black line seen during development (and "KAPLAY already initialized" in the console; seen on the `bench … hud` run while other files changed).
  **Fix:** ~~`dispose(() => { sharedKaplay = null; })`~~ (the new module already starts at `null`, so that wouldn't help) — the instance is handed across reloads: `dispose((data) => { data.sharedKaplay = sharedKaplay })`, and the module starts from `import.meta.hot?.data.sharedKaplay`. **Done 2026-10-19:** checked in the dev server — touching `lib/fog.ts` hot-updates `WorldCanvas.tsx`, one canvas, still drawing, no warning. (No unit test: Vitest has no `import.meta.hot`.)
- [~] **A2 · Important · World "hop" is a silent no-op.** `WorldCanvas.tsx` player `k.add([...])` has no `k.scale()` component, so `player.scale = k.vec2(1, hop)` writes a dead property — the single-frame hop never renders.
  **Fix:** add `k.scale(1)` to both player `k.add([...])` calls (sprite + fallback branches).
  **Moot (2026-10-19):** the hop only runs for a hero sheet with no `walk` anim (`WorldCanvas.tsx:2623`), and every hero has one (`sprites.test.ts` "every hero has world (idle+walk)…"); a hero with no sheet is the rect token, where `heroView` is null and the hop code isn't reached. Add the `k.scale` if hand-sourced single-frame hero art ever lands.
- [~] **A3 · Important · No runtime manifest validation.** `checkView` lives only in `sprites.test.ts`. A hand-authored entry with `fps:0`, `to >= frames`, missing `idle`, or `from > to` ships silently.
  **Fix:** export `validateSpriteView(view, label): string[]` from `sprites.ts`; run it over `SPRITES` at module load under `import.meta.env.DEV` (warn/throw). Have the test call it instead of re-implementing.
  **Covered (2026-10-19):** `SPRITES` is the generated manifest (plus any override in `sprites.ts`), and `checkView` (`sprites.test.ts:5`) checks every entry's world and battle views — `idle`, `from ≥ 0`, `to ≥ from`, `to < frames`, `fps > 0` — and each sheet's PNG is exactly `frames × frameW` wide; a bad entry fails CI, so nothing ships silently. A runtime check would only repeat it.
- [x] **A4 · Important · `frameAt` edge cases.** `spriteAnim.ts:24` / `:40`: negative `tMs` (possible on first rAF tick) returns an out-of-range frame; `from > to` oscillates; `fps:0` → `cycleMs` returns `Infinity`.
  **Fix:** clamp `step = Math.max(0, …)` (and/or `tMs = Math.max(0, tMs)`); add a DEV assert `from <= to && fps > 0`; guard `cycleMs` for `fps <= 0`.
  **Done 2026-10-19:** `step` is clamped at 0 (a negative time shows the first frame — it showed `from - 1` with `loop: false`), `fps ≤ 0` holds the first frame, and `cycleMs` is 0 for it (`spriteAnim.test.ts`). No DEV assert: `from ≤ to` and `fps > 0` are A3's `checkView`.

## B. Fix when art lands (asset-dependent — bundle into Task 8)

- [ ] **B1 · Critical · Missing/404 PNG renders blank, not emoji.** Fallback is decided by manifest-entry presence, not actual load success. Battle (`SpriteSheet.tsx`) shows an empty box; world (`worldSprites.ts`) shows an *invisible* character (no sprite, no placeholder box, no emoji).
  **Fix (battle):** preflight `new Image()` with `onerror` → render emoji; track `sheetOk` state. **Fix (world):** check the sprite actually loaded (KaPlay `onLoad`/load-error) before suppressing the placeholder box / taking the sprite branch.
  **World half done 2026-10-19:** `worldFace` (`worldSprites.ts:224`) takes the emoji branch for a sheet that already failed (`sheetFailed`), and `whenSheetLoads` (`:196`) draws the emoji on a sprite whose sheet fails while loading; the hero (`WorldCanvas.tsx`) does the same (`worldSprites.test.ts`, a stand-in KaPlay). **Battle half open:** `SpriteSheet.tsx` is in `features/battle/`.
- [~] **B2 · Critical · `play('idle')` / `play('walk')` throws if the anim is missing.** KaPlay `play()` throws `Anim not found` → crashes the scene build (`worldSprites.ts` / `WorldCanvas.tsx` hero) or battle.
  **Fix:** guard `'idle' in view.anims` before `play`; skip-with-warn. Covered by A3's validation. Wrap loop `play(want)` in try/catch → fallback to idle.
  **Covered (2026-10-19):** `checkView` requires `idle` on every view, `sprites.test.ts` requires all six facing anims (`idle`/`walk`, `…Down`, `…Up`) on every world sheet, `animFor` (`lib/facing.ts`) falls back to the side names and then `idle`, and `SpriteSheet` falls back to `idle` for an unknown name.
- [x] **B3 · Important · Deferred `play()` can fire on a destroyed object.** KaPlay queues `play` until the sheet loads; a fast zone change (`destroyAll('*')`) can fire it on a destroyed obj.
  **Fix:** `k.onLoad(() => { if (obj.exists()) obj.play('idle'); })` instead of calling `play` immediately.
  **Done 2026-10-19:** `whenSheetLoads` waits on the sheet's own asset (`getSprite(key).onLoad`, not the global `onLoad`) and plays only `if (obj.exists())`; a loaded sheet plays at once. Used by `worldFace` and the hero (which plays the anim it wants by then, not a stale idle). Tested with a stand-in KaPlay.
- [ ] **B4 · Important · Attack/hurt timing hardcoded 520ms vs clip length.** `BattleArena.tsx` clears `enemyActing`/`heroActing` after a fixed 520ms; short clips freeze on the last frame, long clips get cut mid-swing.
  **Fix:** add an `onAnimEnd` callback to `SpriteSheet` (fired when a non-looping clip ends); clear the acting flag from that instead of the timer.
- [ ] **B5 · Important · Emoji↔sprite size mismatch & overflow.** Emoji is sized by `text-8xl`; the sprite div is sized by `frameW × scale` → layout reflows when art lands; large `scale` can overflow the HUD (no `max-height`). Ember `EMBER_MAP_SIZE` only drives text size, not sprite scale.
  **Fix:** size the emoji span consistently with the sprite; add `max-height`/`overflow` guards on the combatant containers; drive Ember world size via `k.scale()`.
- [ ] **B6 · Minor · `worldFace` `size` param ignored for sprites.** Sprite footprint comes from `frameW/frameH`, not `size`. Enemy/NPC `size` is silently dropped.
  **Fix:** comment it; drive sprite footprint via `k.scale()` (e.g. target px / frameW) once assets land.
- [ ] **B7 · Minor · Ember/Lv-label don't follow the sprite bob.** Enemy Lv label is a sibling, not a child of `face`, so it doesn't bob.
  **Fix:** make the Lv label a child via `face.add([...])`.

## C. Polish / hardening

- [~] **C1 · Minor · `resolveSprite` emoji not guaranteed non-empty.** `sprites.ts:46` `def.emoji || fallbackEmoji` + call sites using `?? '❓'` let `''` through.
  **Fix:** add a final `|| '❓'`; change call-site `??` to `||`. Pick a friendlier sentinel than `❓`.
  **Covered (2026-10-19):** `sprites.test.ts` checks every manifest entry has an emoji, and that every avatar, enemy def and Ember stage resolves to a non-empty one; the `?? '❓'` in `BattleArena.tsx` only covers a missing enemy/avatar.
- [ ] **C2 · Minor · `flipX`/`scale` structural cast on the fallback branch is a "lie".** The rect/emoji player is cast to `HeroActor` (has `play`/`flipX`/`scale`) though it lacks those comps. Guarded by `if (heroView)` so no runtime bug, but fragile.
  **Fix:** cast the fallback branch to `WorldActor` only; reserve `HeroActor` for the sprite branch.
- [~] **C3 · Minor · Hop scale can be left non-1 for one frame** when an overlay opens on the same frame the player stops (`pausedRef` early-return skips the reset).
  **Fix:** reset `player.scale = k.vec2(1,1)` before the paused early-return.
  **Moot (2026-10-19):** the hop never runs (A2).
- [ ] **C4 · Minor · Accessibility.** `SpriteSheet` `aria-label={emoji}` reads `❓` as "question mark"; consider an optional semantic `label` prop.
- [x] **C5 · Minor · Test gaps.** `resolveSprite`'s known-id path is uncovered (SPRITES empty); `worldFace`/`loadWorldSprites` untested; `frameAt` negative-tMs / `loop:false` boundary / `bgPosX` negative-index / `cycleMs(fps=0)` untested.
  **Fix:** add tests (temporarily mutate `SPRITES` for the known-id path; mock KaPlay for worldFace).
  **Done 2026-10-19:** `SPRITES` is full now and `sprites.test.ts` resolves every hero, enemy, NPC and Ember stage through it; `frameAt` (negative time, the `loop: false` boundary, `fps` 0) and `cycleMs(fps 0)` in `spriteAnim.test.ts`; `worldFace` with a stand-in KaPlay (loaded / failed / loading / destroyed) in `worldSprites.test.ts`. Left: `loadWorldSprites` (only `loadSprite` calls — the sheets themselves are checked in `sprites.test.ts`); `bgPosX` never gets a negative frame now that `frameAt` can't return one.
- [ ] **C6 · Minor · `SpriteSheet` assumes a stable `view` reference.** The rAF effect deps include `view`; safe today because `resolveSprite` returns the stable manifest object, but any future wrapper that reconstructs the `SpriteView` per render would restart the animation every render.
  **Fix:** document the stable-reference assumption (or `useMemo` the view at the call site if it ever becomes dynamic).
- [ ] **C7 · Trivial · `spawnEnemy` lists fields explicitly (no spread).** Correct today, but a new `EnemyDef` field that should reach `BattleEnemy` must be added manually. **Fix:** add a comment; no code change needed.

---

## Notes
- Lifecycle was verified intact: `loadWorldSprites(k)` is inside the one-time `if (!sharedKaplay)` init branch; no path calls `kaplay()` twice. (A1 was the HMR-only caveat; fixed.)
- Source of findings: 3-way adversarial review, 2026-06-13.
