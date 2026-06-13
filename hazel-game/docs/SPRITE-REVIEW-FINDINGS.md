# Sprite System — Review Findings Tracker

Findings from the adversarial code review of the pixel-art sprite system
(branch `feature/pixel-art-characters`). **Most only manifest once real sprite
assets land (Task 8)** — today everything no-ops to the emoji fallback. Track
and fix against this list.

Legend: `[ ]` open · `[x]` done · Sev = Critical / Important / Minor

---

## A. Fix now (real today, cheap, or prevents recurring pain)

- [ ] **A1 · Important · HMR re-init → black line.** `WorldCanvas.tsx:37` `sharedKaplay` is module-level; editing the file hot-reloads it, resets the guard to `null`, and `kaplay()` is called again over the live canvas → the black line seen during development.
  **Fix:** `if (import.meta.hot) import.meta.hot.dispose(() => { sharedKaplay = null; });`
- [ ] **A2 · Important · World "hop" is a silent no-op.** `WorldCanvas.tsx` player `k.add([...])` has no `k.scale()` component, so `player.scale = k.vec2(1, hop)` writes a dead property — the single-frame hop never renders.
  **Fix:** add `k.scale(1)` to both player `k.add([...])` calls (sprite + fallback branches).
- [ ] **A3 · Important · No runtime manifest validation.** `checkView` lives only in `sprites.test.ts`. A hand-authored entry with `fps:0`, `to >= frames`, missing `idle`, or `from > to` ships silently.
  **Fix:** export `validateSpriteView(view, label): string[]` from `sprites.ts`; run it over `SPRITES` at module load under `import.meta.env.DEV` (warn/throw). Have the test call it instead of re-implementing.
- [ ] **A4 · Important · `frameAt` edge cases.** `spriteAnim.ts:19-26`: negative `tMs` (possible on first rAF tick) returns an out-of-range frame; `from > to` oscillates; `fps:0` → `cycleMs` returns `Infinity`.
  **Fix:** clamp `step = Math.max(0, …)` (and/or `tMs = Math.max(0, tMs)`); add a DEV assert `from <= to && fps > 0`; guard `cycleMs` for `fps <= 0`.

## B. Fix when art lands (asset-dependent — bundle into Task 8)

- [ ] **B1 · Critical · Missing/404 PNG renders blank, not emoji.** Fallback is decided by manifest-entry presence, not actual load success. Battle (`SpriteSheet.tsx`) shows an empty box; world (`worldSprites.ts`) shows an *invisible* character (no sprite, no placeholder box, no emoji).
  **Fix (battle):** preflight `new Image()` with `onerror` → render emoji; track `sheetOk` state. **Fix (world):** check the sprite actually loaded (KaPlay `onLoad`/load-error) before suppressing the placeholder box / taking the sprite branch.
- [ ] **B2 · Critical · `play('idle')` / `play('walk')` throws if the anim is missing.** KaPlay `play()` throws `Anim not found` → crashes the scene build (`worldSprites.ts` / `WorldCanvas.tsx` hero) or battle.
  **Fix:** guard `'idle' in view.anims` before `play`; skip-with-warn. Covered by A3's validation. Wrap loop `play(want)` in try/catch → fallback to idle.
- [ ] **B3 · Important · Deferred `play()` can fire on a destroyed object.** KaPlay queues `play` until the sheet loads; a fast zone change (`destroyAll('*')`) can fire it on a destroyed obj.
  **Fix:** `k.onLoad(() => { if (obj.exists()) obj.play('idle'); })` instead of calling `play` immediately.
- [ ] **B4 · Important · Attack/hurt timing hardcoded 520ms vs clip length.** `BattleArena.tsx` clears `enemyActing`/`heroActing` after a fixed 520ms; short clips freeze on the last frame, long clips get cut mid-swing.
  **Fix:** add an `onAnimEnd` callback to `SpriteSheet` (fired when a non-looping clip ends); clear the acting flag from that instead of the timer.
- [ ] **B5 · Important · Emoji↔sprite size mismatch & overflow.** Emoji is sized by `text-8xl`; the sprite div is sized by `frameW × scale` → layout reflows when art lands; large `scale` can overflow the HUD (no `max-height`). Ember `EMBER_MAP_SIZE` only drives text size, not sprite scale.
  **Fix:** size the emoji span consistently with the sprite; add `max-height`/`overflow` guards on the combatant containers; drive Ember world size via `k.scale()`.
- [ ] **B6 · Minor · `worldFace` `size` param ignored for sprites.** Sprite footprint comes from `frameW/frameH`, not `size`. Enemy/NPC `size` is silently dropped.
  **Fix:** comment it; drive sprite footprint via `k.scale()` (e.g. target px / frameW) once assets land.
- [ ] **B7 · Minor · Ember/Lv-label don't follow the sprite bob.** Enemy Lv label is a sibling, not a child of `face`, so it doesn't bob.
  **Fix:** make the Lv label a child via `face.add([...])`.

## C. Polish / hardening

- [ ] **C1 · Minor · `resolveSprite` emoji not guaranteed non-empty.** `sprites.ts:41` `def.emoji || fallbackEmoji` + call sites using `?? '❓'` let `''` through.
  **Fix:** add a final `|| '❓'`; change call-site `??` to `||`. Pick a friendlier sentinel than `❓`.
- [ ] **C2 · Minor · `flipX`/`scale` structural cast on the fallback branch is a "lie".** The rect/emoji player is cast to `HeroActor` (has `play`/`flipX`/`scale`) though it lacks those comps. Guarded by `if (heroView)` so no runtime bug, but fragile.
  **Fix:** cast the fallback branch to `WorldActor` only; reserve `HeroActor` for the sprite branch.
- [ ] **C3 · Minor · Hop scale can be left non-1 for one frame** when an overlay opens on the same frame the player stops (`pausedRef` early-return skips the reset).
  **Fix:** reset `player.scale = k.vec2(1,1)` before the paused early-return.
- [ ] **C4 · Minor · Accessibility.** `SpriteSheet` `aria-label={emoji}` reads `❓` as "question mark"; consider an optional semantic `label` prop.
- [ ] **C5 · Minor · Test gaps.** `resolveSprite`'s known-id path is uncovered (SPRITES empty); `worldFace`/`loadWorldSprites` untested; `frameAt` negative-tMs / `loop:false` boundary / `bgPosX` negative-index / `cycleMs(fps=0)` untested.
  **Fix:** add tests (temporarily mutate `SPRITES` for the known-id path; mock KaPlay for worldFace).

---

## Notes
- Lifecycle was verified intact: `loadWorldSprites(k)` is inside the one-time `if (!sharedKaplay)` init branch; no path calls `kaplay()` twice. (A1 is the HMR-only caveat.)
- Source of findings: 3-way adversarial review, 2026-06-13.
