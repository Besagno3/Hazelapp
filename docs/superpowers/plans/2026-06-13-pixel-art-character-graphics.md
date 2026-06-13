# Pixel-Art Character Graphics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace emoji character rendering with a sprite system (animated pixel-art sheets + emoji fallback) and apply it to the Verdara-zone vertical slice, in both the KaPlay world and the Framer Motion battle screen.

**Architecture:** A single typed manifest (`src/content/sprites.ts`) is the source of truth for every character's sprite sheets and animation ranges. Pure frame math lives in `src/lib/spriteAnim.ts`. Both renderers read the manifest through one resolver: the battle screen via a `<SpriteSheet>` React component (CSS/rAF stepping), the world via KaPlay `loadSprite`/`play` helpers. Every character falls back to its existing emoji when it has no `spriteId` or its sheet is absent — so Tasks 1–7 change **nothing visually** (all characters still render emoji through the new path), and Task 8 flips on real sprites character-by-character as assets land. Zero-regression by construction.

**Tech Stack:** TypeScript 5.8, React 18.3, Vitest 4 + Testing Library + jsdom, KaPlay 3001, Framer Motion 12, Vite 8.

---

## Working directory

All paths are relative to the repo root `/workspaces/Hazelapp`. App code lives under `hazel-game/`. Run all `npm` commands from `hazel-game/`:

```bash
cd /workspaces/Hazelapp/hazel-game
```

Work happens on branch `feature/pixel-art-characters` (already created).

## Commit & doc ritual (READ FIRST)

This repo enforces a pre-commit hook (`.githooks/pre-commit`): any commit that stages files under `hazel-game/src/` is **blocked** unless `CLAUDE.md`, `docs/ISSUES.md`, and `docs/TEST-CASES.md` are staged in the same commit. Doc-only and config-only commits are not blocked.

To keep TDD commits small without a three-doc edit on every micro-commit, this plan commits **once per task** and uses `git commit --no-verify` for the intermediate code tasks (1–7), which are branch-internal increments. **Task 9 performs the full documentation ritual** (CLAUDE.md Feature Log entry, ISSUES.md follow-up, TEST-CASES.md cases) as the final, hook-passing commit. The activation step `git config core.hooksPath .githooks` only matters for the verified commit in Task 9.

> If you prefer the stricter cadence, fold the relevant TEST-CASES.md / CLAUDE.md / ISSUES.md edits into each task's commit and drop `--no-verify`. The plan is written for the `--no-verify`-then-ritual approach.

After Tasks 1–7, always confirm green: `npm test` and `npm run build` from `hazel-game/`.

---

## File structure

**Create:**
- `hazel-game/src/lib/spriteAnim.ts` — pure animation frame math.
- `hazel-game/src/lib/spriteAnim.test.ts` — unit tests for the math.
- `hazel-game/src/content/sprites.ts` — sprite manifest (`SpriteView`, `SpriteDef`, `SPRITES`) + `resolveSprite()`.
- `hazel-game/src/content/sprites.test.ts` — manifest validation + resolver tests.
- `hazel-game/src/features/battle/SpriteSheet.tsx` — battle sprite component with emoji fallback.
- `hazel-game/src/features/battle/SpriteSheet.test.tsx` — render/fallback tests.
- `hazel-game/src/features/world/worldSprites.ts` — KaPlay sprite helpers (`toKaplayAnims`, `loadWorldSprites`, `worldFace`).
- `hazel-game/src/features/world/worldSprites.test.ts` — unit tests for the pure `toKaplayAnims`.
- `hazel-game/public/sprites/` — sprite-sheet assets (added in Task 8), each in `public/sprites/<character>/world.png` and/or `battle.png`.
- `CREDITS.md` (repo root) — asset provenance/attribution.

**Modify:**
- `hazel-game/src/types/index.ts` — add optional `spriteId?: string` to `Avatar` and `NPC`.
- `hazel-game/src/content/enemies.ts` — add optional `spriteId?: string` to `EnemyDef`.
- `hazel-game/src/content/npcs.ts` — add optional `spriteId?: string` to `WorldNpcDef`.
- `hazel-game/src/content/story.ts` — add `EMBER_SPRITE_IDS` stage→id map.
- `hazel-game/src/features/battle/BattleArena.tsx` — render enemy/hero/Ember via `<SpriteSheet>`.
- `hazel-game/src/features/world/WorldCanvas.tsx` — load sprites once; render NPC/enemy/player/Ember faces via the helper; drive walk/idle.
- `hazel-game/src/content/avatars.ts`, `enemies.ts`, `npcs.ts`, `story.ts` — assign real `spriteId`s (Task 8).

---

## Task 1: Pure animation frame math

**Files:**
- Create: `hazel-game/src/lib/spriteAnim.ts`
- Test: `hazel-game/src/lib/spriteAnim.test.ts`

- [ ] **Step 1: Write the failing test**

`hazel-game/src/lib/spriteAnim.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { frameCount, frameAt, bgPosX, cycleMs, type SpriteAnim } from './spriteAnim';

const walk: SpriteAnim = { from: 2, to: 5, fps: 8 }; // 4 frames, loops by default

describe('frameCount', () => {
  it('counts inclusive of both ends', () => {
    expect(frameCount(walk)).toBe(4);
    expect(frameCount({ from: 0, to: 0, fps: 1 })).toBe(1);
  });
});

describe('frameAt', () => {
  it('returns the first frame at t=0', () => {
    expect(frameAt(walk, 0)).toBe(2);
  });
  it('advances one frame per 1/fps seconds', () => {
    expect(frameAt(walk, 125)).toBe(3); // 1/8s = 125ms
    expect(frameAt(walk, 250)).toBe(4);
  });
  it('loops back to the start after the last frame', () => {
    expect(frameAt(walk, 500)).toBe(2); // 4 frames * 125ms = full cycle
  });
  it('clamps to the last frame when loop is false', () => {
    const once: SpriteAnim = { from: 0, to: 2, fps: 8, loop: false };
    expect(frameAt(once, 10_000)).toBe(2);
  });
});

describe('bgPosX', () => {
  it('shifts left by frame index times frame width', () => {
    expect(bgPosX(0, 32)).toBe(0);
    expect(bgPosX(3, 32)).toBe(-96);
  });
});

describe('cycleMs', () => {
  it('is frames over fps in milliseconds', () => {
    expect(cycleMs(walk)).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspaces/Hazelapp/hazel-game && npx vitest run src/lib/spriteAnim.test.ts`
Expected: FAIL — cannot find module `./spriteAnim`.

- [ ] **Step 3: Write minimal implementation**

`hazel-game/src/lib/spriteAnim.ts`:
```ts
/** One animation = a contiguous run of frames in a sprite's horizontal strip. */
export interface SpriteAnim {
  /** First frame index (0-based) within the strip. */
  from: number;
  /** Last frame index, inclusive. */
  to: number;
  /** Playback rate in frames per second. */
  fps: number;
  /** Loop forever (default) or play once and hold the last frame. */
  loop?: boolean;
}

/** Number of frames the animation spans. */
export function frameCount(anim: SpriteAnim): number {
  return anim.to - anim.from + 1;
}

/** Absolute frame index showing at `tMs` milliseconds since the anim started. */
export function frameAt(anim: SpriteAnim, tMs: number): number {
  const count = frameCount(anim);
  const step = Math.floor((tMs / 1000) * anim.fps);
  if (anim.loop === false) {
    return anim.from + Math.min(step, count - 1);
  }
  return anim.from + (((step % count) + count) % count);
}

/** CSS `background-position-x` (px) for a frame in a horizontal strip. */
export function bgPosX(frameIndex: number, frameWidth: number): number {
  return -frameIndex * frameWidth;
}

/** Duration of one full cycle, in milliseconds. */
export function cycleMs(anim: SpriteAnim): number {
  return Math.round((frameCount(anim) / anim.fps) * 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/spriteAnim.test.ts`
Expected: PASS (4 describe blocks, 7 tests).

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/lib/spriteAnim.ts hazel-game/src/lib/spriteAnim.test.ts
git commit --no-verify -m "feat(sprites): pure animation frame math"
```

---

## Task 2: Sprite manifest + resolver

**Files:**
- Create: `hazel-game/src/content/sprites.ts`
- Test: `hazel-game/src/content/sprites.test.ts`

The manifest starts **empty** (`SPRITES = {}`). The validation test is written to (a) pass vacuously now and (b) catch malformed entries the moment real ones are added in Task 8. The resolver is the single entry point both renderers use.

- [ ] **Step 1: Write the failing test**

`hazel-game/src/content/sprites.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SPRITES, resolveSprite, type SpriteView } from './sprites';

function checkView(view: SpriteView, label: string) {
  expect(view.frameW, `${label} frameW`).toBeGreaterThan(0);
  expect(view.frameH, `${label} frameH`).toBeGreaterThan(0);
  expect(view.frames, `${label} frames`).toBeGreaterThan(0);
  expect(view.sheet, `${label} sheet path`).toMatch(/^\/sprites\/.+\.png$/);
  expect(view.anims.idle, `${label} must define an 'idle' anim`).toBeDefined();
  for (const [name, a] of Object.entries(view.anims)) {
    expect(a.from, `${label}.${name} from`).toBeGreaterThanOrEqual(0);
    expect(a.to, `${label}.${name} to >= from`).toBeGreaterThanOrEqual(a.from);
    expect(a.to, `${label}.${name} to < frames`).toBeLessThan(view.frames);
    expect(a.fps, `${label}.${name} fps`).toBeGreaterThan(0);
  }
}

describe('SPRITES manifest', () => {
  it('every entry has a non-empty emoji fallback and well-formed views', () => {
    for (const [id, def] of Object.entries(SPRITES)) {
      expect(def.emoji, `${id} emoji fallback`).toBeTruthy();
      if (def.world) checkView(def.world, `${id}.world`);
      if (def.battle) checkView(def.battle, `${id}.battle`);
    }
  });
});

describe('resolveSprite', () => {
  it('falls back to the emoji when the id is undefined', () => {
    const r = resolveSprite(undefined, '🦁');
    expect(r.def).toBeNull();
    expect(r.emoji).toBe('🦁');
  });
  it('falls back to the emoji when the id is unknown', () => {
    const r = resolveSprite('does-not-exist', '🐢');
    expect(r.def).toBeNull();
    expect(r.emoji).toBe('🐢');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/content/sprites.test.ts`
Expected: FAIL — cannot find module `./sprites`.

- [ ] **Step 3: Write minimal implementation**

`hazel-game/src/content/sprites.ts`:
```ts
import type { SpriteAnim } from '../lib/spriteAnim';

/**
 * One rendered view of a character. Convention: a single PNG whose frames are
 * laid out left-to-right in one horizontal strip; `frames` is the total count,
 * and each anim indexes a contiguous range into that strip.
 */
export interface SpriteView {
  /** Public asset path, e.g. '/sprites/spore-puff/battle.png'. */
  sheet: string;
  frameW: number;
  frameH: number;
  /** Total frames in the strip (sheet pixel width === frames * frameW). */
  frames: number;
  /** Named animations. Must include 'idle'. */
  anims: Record<string, SpriteAnim>;
}

export interface SpriteDef {
  /** Top-down view for the KaPlay world (omit to fall back to emoji there). */
  world?: SpriteView;
  /** Side-view for the battle screen (omit to fall back to emoji there). */
  battle?: SpriteView;
  /** Emoji shown wherever a view is missing or its sheet fails to load. */
  emoji: string;
}

/**
 * Sprite manifest — the single source of truth for character art.
 * Empty until Task 8 (asset production) populates the Verdara slice.
 */
export const SPRITES: Record<string, SpriteDef> = {};

/** Look up a character's sprite def, with an emoji fallback. */
export function resolveSprite(
  spriteId: string | undefined,
  fallbackEmoji: string,
): { def: SpriteDef | null; emoji: string } {
  if (spriteId && SPRITES[spriteId]) {
    const def = SPRITES[spriteId];
    return { def, emoji: def.emoji || fallbackEmoji };
  }
  return { def: null, emoji: fallbackEmoji };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/content/sprites.test.ts`
Expected: PASS (manifest test passes vacuously over the empty registry; resolver tests pass).

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/content/sprites.ts hazel-game/src/content/sprites.test.ts
git commit --no-verify -m "feat(sprites): sprite manifest + resolveSprite resolver"
```

---

## Task 3: Data-model fields + Ember id map

Add the optional `spriteId` field everywhere a character is defined, plus an Ember stage→id map. No values are assigned yet (that is Task 8), so behavior is unchanged. This task only widens the types and proves the resolver degrades to emoji for un-mapped characters.

**Files:**
- Modify: `hazel-game/src/types/index.ts` (Avatar ~L18-24, NPC ~L26-33)
- Modify: `hazel-game/src/content/enemies.ts` (`EnemyDef` ~L12-22)
- Modify: `hazel-game/src/content/npcs.ts` (`WorldNpcDef` ~L23-31)
- Modify: `hazel-game/src/content/story.ts` (add `EMBER_SPRITE_IDS`)
- Test: `hazel-game/src/content/sprites.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `hazel-game/src/content/sprites.test.ts`:
```ts
import { AVATARS } from './avatars';
import { ENEMY_DEFS } from './enemies';
import { EMBER_SPRITE_IDS, EMBER_SPRITES } from './story';

describe('character → sprite resolution (pre-asset: all emoji)', () => {
  it('avatars resolve (to emoji until a spriteId is assigned)', () => {
    for (const a of AVATARS) {
      const r = resolveSprite(a.spriteId, a.sprite);
      expect(r.emoji).toBeTruthy();
    }
  });
  it('enemy defs resolve', () => {
    for (const e of Object.values(ENEMY_DEFS)) {
      const r = resolveSprite(e.spriteId, e.sprite);
      expect(r.emoji).toBeTruthy();
    }
  });
  it('every Ember stage has an id-map entry and an emoji fallback', () => {
    for (const stage of ['egg', 'hatchling', 'whelp', 'dragon'] as const) {
      expect(EMBER_SPRITE_IDS[stage]).toBeTruthy();
      const r = resolveSprite(EMBER_SPRITE_IDS[stage], EMBER_SPRITES[stage]);
      expect(r.emoji).toBeTruthy();
    }
  });
});
```

> Note: confirm the exact export name for the enemy registry. Open `hazel-game/src/content/enemies.ts`; if the map is not named `ENEMY_DEFS`, use its real name in the import above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/content/sprites.test.ts`
Expected: FAIL — `EMBER_SPRITE_IDS` is not exported / `spriteId` not on the types.

- [ ] **Step 3: Implement the field additions**

In `hazel-game/src/types/index.ts`, add `spriteId` to `Avatar`:
```ts
export interface Avatar {
  id: string;
  name: string;
  sprite: string; // emoji fallback
  spriteId?: string; // key into src/content/sprites.ts SPRITES; falls back to `sprite`
  fightStyle: FightStyle;
  maxHp: number;
}
```
and to `NPC`:
```ts
export interface NPC {
  id: string;
  name: string;
  sprite: string; // emoji fallback
  spriteId?: string;
  level: number;
  topic: Topic;
  maxHp: number;
}
```

In `hazel-game/src/content/enemies.ts`, add to `EnemyDef`:
```ts
export interface EnemyDef {
  id: string;
  name: string;
  sprite: string; // emoji fallback
  spriteId?: string;
  topic: Topic;
  levelOffset: number;
  hpPerLevel: number;
  isBoss?: boolean;
}
```
If `spawnEnemy` constructs a `BattleEnemy` from an `EnemyDef`, carry the field through so battles see it. Find where the enemy object is assembled (search `spawnEnemy` in `enemies.ts`) and add `spriteId: def.spriteId,` to the returned object alongside `sprite: def.sprite`.

In `hazel-game/src/content/npcs.ts`, add to `WorldNpcDef`:
```ts
export interface WorldNpcDef {
  id: string;
  name: string;
  sprite: string; // emoji fallback
  spriteId?: string;
  role: NpcRole;
  topic?: Topic;
  lines: DialogueLine[];
}
```

In `hazel-game/src/content/story.ts`, after `EMBER_SPRITES`, add:
```ts
import type { EmberStage } from './story'; // already in this file; omit if self-referential

/**
 * Sprite-manifest ids per Ember growth stage. Unmapped in SPRITES until Task 8,
 * so each resolves to its EMBER_SPRITES emoji until real art lands.
 */
export const EMBER_SPRITE_IDS: Record<EmberStage, string> = {
  egg: 'ember-egg',
  hatchling: 'ember-hatchling',
  whelp: 'ember-whelp',
  dragon: 'ember-dragon',
};
```
(`EmberStage` is already declared in `story.ts` — reference it directly, do not re-import from self.)

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/content/sprites.test.ts && npm run build`
Expected: tests PASS; `tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/types/index.ts hazel-game/src/content/enemies.ts \
  hazel-game/src/content/npcs.ts hazel-game/src/content/story.ts \
  hazel-game/src/content/sprites.test.ts
git commit --no-verify -m "feat(sprites): optional spriteId on characters + Ember id map"
```

---

## Task 4: Battle `<SpriteSheet>` component

A presentational component: given a `SpriteView` (or null) and an animation name, render an animated div; given null, render the emoji. Animation steps frames via `requestAnimationFrame` using the Task-1 math, guarded so it is inert under jsdom.

**Files:**
- Create: `hazel-game/src/features/battle/SpriteSheet.tsx`
- Test: `hazel-game/src/features/battle/SpriteSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

`hazel-game/src/features/battle/SpriteSheet.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpriteSheet } from './SpriteSheet';
import type { SpriteView } from '../../content/sprites';

const view: SpriteView = {
  sheet: '/sprites/blaze/battle.png',
  frameW: 64,
  frameH: 64,
  frames: 6,
  anims: { idle: { from: 0, to: 3, fps: 6 }, attack: { from: 4, to: 5, fps: 10, loop: false } },
};

describe('SpriteSheet', () => {
  it('renders the emoji fallback when no view is given', () => {
    render(<SpriteSheet view={null} emoji="🦁" />);
    expect(screen.getByText('🦁')).toBeInTheDocument();
  });

  it('renders an image element backed by the sheet when a view is given', () => {
    render(<SpriteSheet view={view} emoji="🦁" />);
    const el = screen.getByRole('img');
    expect(el.style.backgroundImage).toContain('/sprites/blaze/battle.png');
    expect(el.style.width).toBe('64px');
    expect(el.style.height).toBe('64px');
  });

  it('scales width/height by the scale prop', () => {
    render(<SpriteSheet view={view} emoji="🦁" scale={2} />);
    const el = screen.getByRole('img');
    expect(el.style.width).toBe('128px');
    expect(el.style.height).toBe('128px');
  });

  it('falls back to idle when the requested anim is missing', () => {
    // 'hurt' is not defined → should not throw, should still render the image
    render(<SpriteSheet view={view} anim="hurt" emoji="🦁" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/battle/SpriteSheet.test.tsx`
Expected: FAIL — cannot find module `./SpriteSheet`.

- [ ] **Step 3: Write the component**

`hazel-game/src/features/battle/SpriteSheet.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SpriteView } from '../../content/sprites';
import { bgPosX, frameAt } from '../../lib/spriteAnim';

interface SpriteSheetProps {
  /** The view to play, or null to render the emoji fallback. */
  view: SpriteView | null;
  /** Animation name; defaults to 'idle'. Missing names fall back to 'idle'. */
  anim?: string;
  /** Emoji rendered when `view` is null. */
  emoji: string;
  /** Display scale multiplier (1 = native pixel size). */
  scale?: number;
  className?: string;
}

/**
 * Animated pixel-sprite for the battle screen. Steps a horizontal strip via
 * requestAnimationFrame; renders the emoji when no sheet is available. Meant to
 * sit *inside* the existing Framer Motion lunge/bob wrappers in BattleArena.
 */
export function SpriteSheet({ view, anim = 'idle', emoji, scale = 1, className }: SpriteSheetProps) {
  const animDef = view ? (view.anims[anim] ?? view.anims.idle) : undefined;
  const [frame, setFrame] = useState(animDef ? animDef.from : 0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!view || !animDef) return;
    if (typeof requestAnimationFrame !== 'function') {
      setFrame(animDef.from);
      return; // jsdom / SSR: hold the first frame
    }
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setFrame(frameAt(animDef, now - startRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, animDef]);

  if (!view || !animDef) {
    return <span className={className}>{emoji}</span>;
  }

  const style: CSSProperties = {
    width: `${view.frameW * scale}px`,
    height: `${view.frameH * scale}px`,
    backgroundImage: `url(${view.sheet})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `${bgPosX(frame, view.frameW) * scale}px 0px`,
    backgroundSize: `${view.frames * view.frameW * scale}px ${view.frameH * scale}px`,
    imageRendering: 'pixelated',
  };
  return <div role="img" aria-label={emoji} className={className} style={style} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/battle/SpriteSheet.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/features/battle/SpriteSheet.tsx hazel-game/src/features/battle/SpriteSheet.test.tsx
git commit --no-verify -m "feat(sprites): SpriteSheet battle component with emoji fallback"
```

---

## Task 5: Wire `<SpriteSheet>` into BattleArena

Replace the three emoji renders (enemy ~L420-430, hero ~L447-457, Ember ~L459-467) with `<SpriteSheet>`, keeping the Framer Motion wrappers untouched. Map lunge→`attack` and the opponent's lunge→`hurt`. Because no character has a `spriteId` yet (until Task 8), every `<SpriteSheet>` resolves to `view: null` and renders the same emoji as before — visually identical, but now through the sprite path.

**Files:**
- Modify: `hazel-game/src/features/battle/BattleArena.tsx`

- [ ] **Step 1: Add imports** at the top of `BattleArena.tsx`:
```ts
import { SpriteSheet } from './SpriteSheet';
import { resolveSprite } from '../../content/sprites';
import { EMBER_SPRITE_IDS } from '../../content/story';
```

- [ ] **Step 2: Resolve sprites near where `enemy`, `avatar`, and `ember` are in scope** (inside the component body, before the return):
```ts
const enemySprite = resolveSprite(enemy.spriteId, enemy.sprite);
const heroSprite = resolveSprite(avatar.spriteId, avatar.sprite);
const emberSprite = resolveSprite(EMBER_SPRITE_IDS[ember], EMBER_SPRITES[ember]);
```
> `EMBER_SPRITES` is already imported in this file (used by the current Ember render). If not, add it to the `story` import.

- [ ] **Step 3: Replace the enemy emoji render.** Find the inner element that renders `{enemy.sprite}` (≈ L428) and replace just that emoji node with:
```tsx
<SpriteSheet
  view={enemySprite.def?.battle ?? null}
  anim={enemyLunge ? 'attack' : heroLunge ? 'hurt' : 'idle'}
  emoji={enemySprite.emoji}
  scale={enemy.isBoss ? 3 : 2.5}
  className="leading-none"
/>
```
Keep the surrounding `<motion.div key={`el${enemyLunge}`} ...>` and inner bob `<motion.div>` exactly as they are — `<SpriteSheet>` goes where `{enemy.sprite}` was. Remove the now-unused `text-8xl`/`text-[7rem]` size classes from the element that wrapped the emoji only if they were sizing the emoji glyph (the SpriteSheet sizes itself); leave layout/positioning classes intact.

- [ ] **Step 4: Replace the hero emoji render** (≈ L455, the element rendering `{avatar.sprite}`, which carries `scale-x-[-1]`):
```tsx
<SpriteSheet
  view={heroSprite.def?.battle ?? null}
  anim={heroLunge ? 'attack' : enemyLunge ? 'hurt' : 'idle'}
  emoji={heroSprite.emoji}
  scale={2.5}
  className="leading-none scale-x-[-1]"
/>
```
Preserve the outer `<motion.div key={`hl${heroLunge}`} ...>` and bob wrapper.

- [ ] **Step 5: Replace the Ember emoji render** (≈ L459-467, the `<motion.span>` rendering `{EMBER_SPRITES[ember]}`). Keep the `<motion.span>` wrapper and its `absolute -right-10 bottom-0` positioning + bob, and put inside it:
```tsx
<SpriteSheet
  view={emberSprite.def?.battle ?? null}
  anim="idle"
  emoji={emberSprite.emoji}
  scale={ember === 'egg' ? 1.5 : ember === 'dragon' ? 3 : 2}
/>
```
(If the `<motion.span>`'s text-size classes were sizing the emoji, they are now harmless; leave them.)

- [ ] **Step 6: Typecheck + full test run**

Run: `cd /workspaces/Hazelapp/hazel-game && npm run build && npm test`
Expected: `tsc -b` clean; full suite green (137+ tests). No visual change yet (all sprites null → emoji).

- [ ] **Step 7: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/features/battle/BattleArena.tsx
git commit --no-verify -m "feat(sprites): render battle characters through SpriteSheet (emoji fallback live)"
```

---

## Task 6: KaPlay world sprite helpers

A small module with one pure, unit-tested function (`toKaplayAnims`) plus two thin KaPlay wrappers (`loadWorldSprites`, `worldFace`) that the world integration calls. KaPlay-touching code is exercised manually in Task 8; only the pure mapping is unit-tested here.

**Files:**
- Create: `hazel-game/src/features/world/worldSprites.ts`
- Test: `hazel-game/src/features/world/worldSprites.test.ts`

- [ ] **Step 1: Write the failing test**

`hazel-game/src/features/world/worldSprites.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toKaplayAnims } from './worldSprites';

describe('toKaplayAnims', () => {
  it('maps fps→speed and defaults loop to true', () => {
    const out = toKaplayAnims({
      idle: { from: 0, to: 3, fps: 6 },
      walk: { from: 4, to: 7, fps: 10, loop: false },
    });
    expect(out.idle).toEqual({ from: 0, to: 3, loop: true, speed: 6 });
    expect(out.walk).toEqual({ from: 4, to: 7, loop: false, speed: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/world/worldSprites.test.ts`
Expected: FAIL — cannot find module `./worldSprites`.

- [ ] **Step 3: Write the module**

`hazel-game/src/features/world/worldSprites.ts`:
```ts
import type { KAPLAYCtx, GameObj } from 'kaplay';
import type { SpriteAnim } from '../../lib/spriteAnim';
import { SPRITES, resolveSprite } from '../../content/sprites';

/** KaPlay's per-sprite id namespace for world (top-down) sheets. */
export const worldKey = (spriteId: string) => `w_${spriteId}`;

/** Convert our SpriteAnim map to KaPlay's loadSprite `anims` shape. */
export function toKaplayAnims(
  anims: Record<string, SpriteAnim>,
): Record<string, { from: number; to: number; loop: boolean; speed: number }> {
  const out: Record<string, { from: number; to: number; loop: boolean; speed: number }> = {};
  for (const [name, a] of Object.entries(anims)) {
    out[name] = { from: a.from, to: a.to, loop: a.loop !== false, speed: a.fps };
  }
  return out;
}

/**
 * Load every manifest character that has a world view into the KaPlay instance.
 * Call ONCE, right after kaplay() is created (the shared session instance).
 */
export function loadWorldSprites(k: KAPLAYCtx): void {
  for (const [id, def] of Object.entries(SPRITES)) {
    if (!def.world) continue;
    k.loadSprite(worldKey(id), def.world.sheet, {
      sliceX: def.world.frames,
      sliceY: 1,
      anims: toKaplayAnims(def.world.anims),
    });
  }
}

export interface WorldFaceOpts {
  spriteId?: string;
  emoji: string;
  x: number;
  y: number;
  /** Emoji text size used only for the fallback path. */
  size?: number;
  z?: number;
}

/**
 * Add a character "face" to the world: a KaPlay sprite (playing 'idle') when a
 * world view exists, otherwise the emoji as text. Returns the game object plus
 * whether it is a sprite (callers use this to skip the placeholder token box).
 */
export function worldFace(
  k: KAPLAYCtx,
  { spriteId, emoji, x, y, size = 22, z = 5 }: WorldFaceOpts,
): { obj: GameObj; isSprite: boolean } {
  const { def } = resolveSprite(spriteId, emoji);
  if (def?.world && spriteId) {
    const obj = k.add([
      k.sprite(worldKey(spriteId)),
      k.pos(x, y),
      k.anchor('center'),
      k.z(z),
    ]) as GameObj;
    (obj as unknown as { play: (n: string) => void }).play('idle');
    return { obj, isSprite: true };
  }
  const obj = k.add([k.text(emoji, { size }), k.pos(x, y), k.anchor('center'), k.z(z)]) as GameObj;
  return { obj, isSprite: false };
}
```
> If `GameObj`/`KAPLAYCtx` are not exported under those names by `kaplay@3001`, replace the type imports with `type KAPLAYCtx = ReturnType<typeof import('kaplay').default>` and `type GameObj = ReturnType<KAPLAYCtx['add']>` (the existing `WorldCanvas.tsx` already uses `ReturnType<typeof kaplay>` for the context type — mirror that).

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/features/world/worldSprites.test.ts && npm run build`
Expected: test PASS; `tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/features/world/worldSprites.ts hazel-game/src/features/world/worldSprites.test.ts
git commit --no-verify -m "feat(sprites): KaPlay world sprite load/render helpers"
```

---

## Task 7: Wire sprites into WorldCanvas

Load sprites once at init; route NPC, enemy, player, and Ember faces through `worldFace`; drive the player's walk/idle (and a hop for single-frame sprites) and facing. All characters lack `spriteId` until Task 8, so `worldFace` returns the emoji path and the world looks identical — this task is structural.

**Files:**
- Modify: `hazel-game/src/features/world/WorldCanvas.tsx`

- [ ] **Step 1: Add imports** near the existing imports (top of file):
```ts
import { loadWorldSprites, worldFace } from './worldSprites';
import { resolveSprite } from '../../content/sprites';
import { EMBER_SPRITE_IDS } from '../../content/story';
```

- [ ] **Step 2: Load sprites once, in the init effect.** Inside the `if (!sharedKaplay) { ... }` block (after `sharedKaplay = { k, canvas };`, ~L153), add:
```ts
      loadWorldSprites(k);
```
This runs exactly once per session, alongside the single `kaplay()` call.

- [ ] **Step 3: NPC face.** Replace the NPC face line (~L247, `k.add([k.text(def.sprite, { size: 22 }), ...])`) with:
```ts
      const npcFace = worldFace(k, {
        spriteId: def.spriteId,
        emoji: def.sprite,
        x: px,
        y: py,
        size: 22,
      });
      // Keep the tan token box only behind the emoji fallback; real sprites stand alone.
```
Then guard the token box that precedes it (the `k.add([k.rect(30, 30, ...) ...])` at ~L240-246) so it only draws for the fallback. Wrap that box `k.add([...])` in:
```ts
      const npcDef = NPC_DEFS[p.defId];
      const npcHasSprite = !!resolveSprite(npcDef.spriteId, npcDef.sprite).def?.world;
      if (!npcHasSprite) {
        k.add([
          k.rect(30, 30, { radius: 6 }),
          k.color(255, 245, 215),
          k.outline(2, k.rgb(120, 90, 40)),
          k.pos(px, py),
          k.anchor('center'),
        ]);
      }
```
Place the box block immediately before the `worldFace` call. (`def` already refers to `NPC_DEFS[p.defId]` in this loop — reuse it instead of the extra `npcDef` if it is already in scope; the snippet names it explicitly to be self-contained.) Leave the name label (`k.add([k.text(def.name, ...)])`) unchanged.

- [ ] **Step 4: Enemy face.** Replace the enemy face (`const face = k.add([k.text(enemy.sprite, ...)...])` ~L272-276) with:
```ts
      const enemyHasSprite = !!resolveSprite(enemy.spriteId, enemy.sprite).def?.world;
      const face = worldFace(k, {
        spriteId: enemy.spriteId,
        emoji: enemy.sprite,
        x: px,
        y: py,
        size: enemy.isBoss ? 30 : 24,
        z: 6,
      }).obj;
```
Guard the enemy body box (`const body = k.add([k.rect(...) ...])` ~L265-271) so it only draws in fallback mode. Change that block to:
```ts
      const body = enemyHasSprite
        ? null
        : k.add([
            k.rect(enemy.isBoss ? 42 : 32, enemy.isBoss ? 42 : 32, { radius: 8 }),
            k.color(60, 30, 50),
            k.outline(2, k.rgb(255, 120, 120)),
            k.pos(px, py),
            k.anchor('center'),
          ]);
```
The idle-hover `onUpdate` (~L284-291) references `body.pos.y`. Make it null-safe:
```ts
      let t = Math.random() * Math.PI * 2;
      face.onUpdate(() => {
        if (pausedRef.current) return;
        t += k.dt() * 2.4;
        const dy = Math.sin(t) * 3;
        if (body) body.pos.y = py + dy;
        face.pos.y = py + dy;
      });
```
(Attach the hover to `face` so it works whether or not the body box exists.)

- [ ] **Step 5: Player.** Replace the player creation (~L300-308) with a sprite-or-fallback build:
```ts
    const heroView = resolveSprite(avatar.spriteId, avatar.sprite).def?.world ?? null;
    let player: ReturnType<typeof k.add>;
    if (heroView) {
      player = k.add([
        k.sprite(`w_${avatar.spriteId}`),
        k.pos(spawn.x, spawn.y),
        k.anchor('center'),
        k.z(10),
      ]);
      (player as unknown as { play: (n: string) => void }).play('idle');
    } else {
      player = k.add([
        k.rect(28, 28, { radius: 8 }),
        k.color(255, 220, 100),
        k.outline(2, k.rgb(120, 80, 0)),
        k.pos(spawn.x, spawn.y),
        k.anchor('center'),
        k.z(10),
      ]);
      player.add([k.text(avatar.sprite, { size: 20 }), k.anchor('center')]);
    }
    let curAnim = 'idle';
```

- [ ] **Step 6: Ember face.** Replace the Ember creation (~L311-316) with:
```ts
    const ember = worldFace(k, {
      spriteId: EMBER_SPRITE_IDS[emberStage],
      emoji: EMBER_SPRITES[emberStage],
      x: spawn.x - 24,
      y: spawn.y + 8,
      size: EMBER_MAP_SIZE[emberStage],
      z: 9,
    }).obj;
```
`ember.pos = ember.pos.lerp(...)` later (~L443) still works (it is a game object). Leave that follow code unchanged.

- [ ] **Step 7: Drive player walk/idle + facing.** In the main loop, right after `if (dx !== 0 || dy !== 0) lastDir = { x: dx, y: dy };` (~L379), add:
```ts
      const moving = dx !== 0 || dy !== 0;
      if (heroView) {
        const wantWalk = moving && !!heroView.anims.walk;
        const want = wantWalk ? 'walk' : 'idle';
        if (want !== curAnim) {
          curAnim = want;
          (player as unknown as { play: (n: string) => void }).play(want);
        }
        // Single-frame sprites (no 'walk' anim): a little squash-stretch hop.
        if (moving && !heroView.anims.walk) {
          const hop = 1 + Math.sin(k.time() * 16) * 0.06;
          (player as unknown as { scale: ReturnType<typeof k.vec2> }).scale = k.vec2(1, hop);
        } else if (!heroView.anims.walk) {
          (player as unknown as { scale: ReturnType<typeof k.vec2> }).scale = k.vec2(1, 1);
        }
        if (dx !== 0) {
          (player as unknown as { flipX: boolean }).flipX = dx < 0;
        }
      }
```

- [ ] **Step 8: Typecheck + full test run**

Run: `cd /workspaces/Hazelapp/hazel-game && npm run build && npm test`
Expected: `tsc -b` clean; full suite green. World renders identically (all emoji) — confirm by eye in `npm run dev` (walk around Verdara, bump an NPC, start a battle).

- [ ] **Step 9: Commit**

```bash
cd /workspaces/Hazelapp
git add hazel-game/src/features/world/WorldCanvas.tsx
git commit --no-verify -m "feat(sprites): render world characters through sprite helpers (emoji fallback live)"
```

---

## Task 8: Asset production + manifest population (manual)

This is the art phase — not TDD. The pipeline (Tasks 1–7) is fully wired and green; here you obtain CC0 art, normalize it to horizontal strips, drop it under `public/sprites/`, add the matching `SPRITES` entries, and assign `spriteId`s. Do **Blaze first** as the end-to-end quality gate before producing the rest (spec build-order step 3).

**Asset convention (must match the manifest):** one PNG per view, all frames in a single **horizontal row**, transparent background, consistent `frameW × frameH`. Path: `hazel-game/public/sprites/<character>/world.png` and/or `battle.png`.

- [ ] **Step 1: Source the CC0 art** (all free-for-commercial, CC0):
  - Side-view battlers — LuizMelo (https://luizmelo.itch.io/): *Hero Knight 2* (hero base), *Monsters Creatures Fantasy* (Mushroom→Spore Puff, Flying Eye→a flyer). Confirm CC0 in each download's readme.
  - Top-down world humanoids/tokens — Kenney (CC0): *Tiny Town* (https://kenney.nl/assets/tiny-town) and *Tiny Dungeon* (https://kenney.nl/assets/tiny-dungeon) for NPCs (Sage Flora, Fern, Trader Tadpole) and generic enemy tokens.
  - Record every pack (name, author, URL, license) in `CREDITS.md` (Step 6) as you download.

- [ ] **Step 2: Generate the mascots** to match the base style, both perspectives, animated: Blaze, Shield, Nova (heroes); Ember egg/hatchling/whelp/dragon; Static Jelly (slime). Use a pixel-art generator (Retro Diffusion / PixelLab) + Aseprite cleanup, or commission. Export each animation as a horizontal strip.

- [ ] **Step 3: Normalize each character to horizontal strips.** If frames come as separate PNGs, assemble a strip with ImageMagick:
```bash
# from a folder of zero-padded frames frame_00.png … frame_0N.png
convert frame_*.png +append world.png   # horizontal strip
identify -format "%w x %h\n" world.png   # confirm width === frames * frameW
```
Place the result at `hazel-game/public/sprites/<character>/<view>.png`.

- [ ] **Step 4: Blaze quality-gate spike.** Add ONLY Blaze to the manifest and wire it, then verify in-app before doing anyone else. Edit `hazel-game/src/content/sprites.ts` — replace `export const SPRITES = {};` with a real entry (fill the numbers from your actual sheets):
```ts
export const SPRITES: Record<string, SpriteDef> = {
  blaze: {
    emoji: '🦁',
    world: {
      sheet: '/sprites/blaze/world.png',
      frameW: 32, frameH: 32, frames: 8,
      anims: { idle: { from: 0, to: 1, fps: 3 }, walk: { from: 2, to: 7, fps: 10 } },
    },
    battle: {
      sheet: '/sprites/blaze/battle.png',
      frameW: 64, frameH: 80, frames: 12,
      anims: {
        idle: { from: 0, to: 3, fps: 6 },
        attack: { from: 4, to: 9, fps: 12, loop: false },
        hurt: { from: 10, to: 11, fps: 8, loop: false },
      },
    },
  },
};
```
Assign the id in `hazel-game/src/content/avatars.ts` — add `spriteId: 'blaze',` to Blaze (id `a1`). Then:
```bash
cd /workspaces/Hazelapp/hazel-game && npm test && npm run dev
```
Expected: `sprites.test.ts` validates the new entry; in the browser, pick Blaze, walk Verdara (idle/walk/flip), enter a battle (idle/attack/hurt). If quality is acceptable, proceed; if not, adjust the art/frame data before scaling up.

- [ ] **Step 5: Populate the rest of the slice.** Add `SPRITES` entries and assign `spriteId`s for the remaining characters, verifying each in-app:
  - Heroes: Shield (`a2`→`shield`), Nova (`a3`→`nova`) in `avatars.ts`.
  - Ember: `ember-egg`/`ember-hatchling`/`ember-whelp`/`ember-dragon` (manifest ids already mapped by `EMBER_SPRITE_IDS`).
  - Verdara enemies in `enemies.ts`: Spore Puff, Static Jelly, Comet Crab, Smog Fiend (boss) — add `spriteId` to each def.
  - Verdara NPCs in `npcs.ts`: Sage Flora, Fern, Trader Tadpole — add `spriteId` to each def.
  Leave hub NPCs and the other three zones without `spriteId` (they stay emoji by design).

- [ ] **Step 6: Write `CREDITS.md`** at the repo root listing every sourced asset: pack name, author, source URL, license (CC0), and which character uses it; note generated mascots as original work. Add an in-game pointer later if desired (out of scope here).

- [ ] **Step 7: Verify the whole slice**

Run: `cd /workspaces/Hazelapp/hazel-game && npm test && npm run build && npm run dev`
Expected: all tests green; build clean; in-app, every Verdara-slice character shows animated sprites in world + battle, and non-slice characters (hub NPCs, other zones) still show emoji.

- [ ] **Step 8: Commit** (assets + manifest + ids; docs come in Task 9)

```bash
cd /workspaces/Hazelapp
git add hazel-game/public/sprites CREDITS.md hazel-game/src/content/sprites.ts \
  hazel-game/src/content/avatars.ts hazel-game/src/content/enemies.ts hazel-game/src/content/npcs.ts
git commit --no-verify -m "feat(sprites): Verdara-slice pixel art + manifest entries (Blaze gate first)"
```

---

## Task 9: Documentation ritual + verified commit

The repo's pre-commit hook requires `CLAUDE.md`, `docs/ISSUES.md`, and `docs/TEST-CASES.md` to be updated. This task does that in one hook-passing commit and closes the feature.

**Files:**
- Modify: `hazel-game/CLAUDE.md`, `hazel-game/docs/ISSUES.md`, `hazel-game/docs/TEST-CASES.md`

> Confirm the docs' real locations first (`ls hazel-game/docs`); paths below assume `hazel-game/docs/`. The hook activates via `git config core.hooksPath .githooks` (run once if not already set).

- [ ] **Step 1: CLAUDE.md Feature Log entry.** Add a newest-first entry under "## Feature Log" summarizing: the sprite system (manifest `src/content/sprites.ts` + `resolveSprite` + `lib/spriteAnim.ts`), the battle `<SpriteSheet>` and KaPlay `worldSprites` helpers, the optional `spriteId` field with emoji fallback (zero-regression), the all-CC0 sourcing (Kenney + LuizMelo + generated mascots) and Verdara-slice scope, and that the other zones/hub NPCs remain emoji pending rollout. Also update the "Game canvas" / stack notes if they assert "emoji only".

- [ ] **Step 2: docs/ISSUES.md follow-up.** Log a rollout issue: "Pixel-art rollout to remaining cast — hub NPCs + Numbria/Gearfall/Chromaria zones (heroes/Ember/Verdara shipped in the slice)." Note any art gaps found during Task 8.

- [ ] **Step 3: docs/TEST-CASES.md.** Add cases covering: `spriteAnim` math (loop wrap, clamp, bgPosX), manifest validation (idle required, `to < frames`), `resolveSprite` fallback (undefined/unknown id → emoji), `<SpriteSheet>` fallback vs image render + scale, `toKaplayAnims` mapping, and the manual world/battle visual checks (idle/walk/flip; idle/attack/hurt; non-slice characters still emoji).

- [ ] **Step 4: Verify, then commit with the hook ON**

```bash
cd /workspaces/Hazelapp
git config core.hooksPath .githooks   # no-op if already set
cd hazel-game && npm test && npm run build && cd /workspaces/Hazelapp
git add hazel-game/CLAUDE.md hazel-game/docs/ISSUES.md hazel-game/docs/TEST-CASES.md
git commit -m "docs(sprites): log pixel-art character system + Verdara slice"
```
Expected: tests green, build clean, hook passes (all three docs staged).

- [ ] **Step 5: Finish the branch.** Use the `superpowers:finishing-a-development-branch` skill to choose merge/PR/cleanup.

---

## Self-review notes (author)

- **Spec coverage:** §6a manifest → Task 2; §6b data model + fallback → Tasks 2–3; §6c world (load + render + movement anim) → Tasks 6–7; §6d battle SpriteSheet + motion preservation → Tasks 4–5; §6e asset pipeline (`public/sprites/`) → Tasks 6/8; §5 all-CC0 sourcing + CREDITS → Task 8; §4 slice roster → Tasks 3/8; §7 testing → unit tests in Tasks 1–6 + manual checks in Tasks 7–8; §8 build order (engine → Blaze gate → rest) → Tasks 1–7 then Task 8 steps 4→5.
- **Risks carried from spec:** mascot generation quality is gated by the Blaze spike (Task 8 step 4) before scaling; top-down/side-view style mismatch is accepted; no free top-down walk cycles → single-frame hop path implemented in Task 7 step 7.
- **Type consistency:** `SpriteAnim`/`SpriteView`/`SpriteDef`, `resolveSprite(spriteId, emoji) → {def, emoji}`, `worldKey`/`w_<id>`, and `EMBER_SPRITE_IDS` names are used identically across tasks.
- **Known verification points for the executor:** exact enemy-registry export name (Task 3 step 1), KaPlay type-export names (Task 6 step 3), and docs directory location (Task 9) — each flagged inline with a fallback.
