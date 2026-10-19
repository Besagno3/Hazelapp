import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { sfx, type SfxName } from '../../lib/audio';
import {
  COMPANION_MOTION,
  HERO_MOTION,
  actingMs,
  fireballLaunchMs,
  type Choreo,
  type CompanionMotion,
  type HeroMove,
} from './choreography';

export type FxSide = 'hero' | 'enemy';
export interface FloatText {
  id: number;
  text: string;
  side: FxSide;
  color: string;
}
export interface Fireball {
  id: number;
  delayMs: number;
  big: boolean;
}

/** Enemy lunge length; the impact effects land at IMPACT_MS into it. */
const LUNGE_MS = 520;
export const IMPACT_MS = 260;
/** How long the enemy shows its hurt pose after a blow lands. */
const FLINCH_MS = 420;
/** How long the companion cheers for a streak. */
const CHEER_MS = 1200;

type Later = (fn: () => void, ms: number) => void;

/**
 * A transient flag that is true for `ms` after each trigger. Only the latest
 * trigger's timer may clear it (a quick second one must not be cut short).
 */
function useBlip(later: Later) {
  const [on, setOn] = useState(false);
  const seq = useRef(0);
  const trigger = useCallback(
    (ms: number) => {
      const n = ++seq.current;
      setOn(true);
      later(() => {
        if (n === seq.current) setOn(false);
      }, ms);
    },
    [later],
  );
  return [on, trigger] as const;
}

/**
 * Cosmetic battle effects (#44): floating numbers, the callout banner, and
 * every motion — the enemy's lunge, the hero's and companion's per-move
 * choreography (`./choreography`), Ember's fireballs, the enemy flinching when
 * a blow lands, the companion's cheer and swap-in drop. Nothing here changes
 * the fight's numbers — those are written immediately via `lib/battleTurn.ts`
 * — so a kid tapping through faster than the animation can never lose a heal
 * or a hit (#70). Every pending timer is owned here and cleared on unmount.
 */
export function useBattleFx() {
  const reduceMotion = useReducedMotion() ?? false;
  const timers = useRef(new Set<number>());
  // False once the arena unmounts — late async results (a fetched pool) bail.
  const live = useRef(true);
  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    live.current = true;
    return () => {
      live.current = false;
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const [floats, setFloats] = useState<FloatText[]>([]);
  const fxId = useRef(0);
  const float = useCallback(
    (text: string, side: FxSide, color: string) => {
      const id = ++fxId.current;
      setFloats((f) => [...f, { id, text, side, color }]);
      later(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
    },
    [later],
  );

  // One banner lifecycle for every caller (archetype callouts, boss enrage,
  // power moves, pair attacks, swaps, the speed trigger). Banners queue: a new
  // one waits until the one on screen has had its time, so it can't wipe
  // "So quick!" before it's read (#97c). One timer moves the queue on, so a
  // stale timeout can never cut a banner short. The same banner showing or
  // waiting isn't queued twice. A banner that `answers` an earlier one (the
  // candle lit, for "Light a candle!") takes its place at once and drops it
  // from the queue — still asking would be wrong. Warnings default to ⚠️;
  // other callers bring their own emoji.
  const [banner, setBanner] = useState<string | null>(null);
  const bannerShown = useRef<string | null>(null);
  const bannerQueue = useRef<{ text: string; ttl: number }[]>([]);
  const bannerTimer = useRef<number | null>(null);
  const nextBanner = useCallback(function next() {
    const b = bannerQueue.current.shift() ?? null;
    bannerShown.current = b?.text ?? null;
    bannerTimer.current = b ? window.setTimeout(next, b.ttl) : null;
    setBanner(b?.text ?? null);
  }, []);
  const showBanner = useCallback(
    (text: string, ttl = 2500, icon = '⚠️', answers?: string) => {
      const line = `${icon} ${text}`;
      if (answers) {
        bannerQueue.current = bannerQueue.current.filter((b) => !b.text.includes(answers));
        if (bannerShown.current?.includes(answers)) {
          if (bannerTimer.current !== null) clearTimeout(bannerTimer.current);
          bannerQueue.current.unshift({ text: line, ttl });
          nextBanner();
          return;
        }
      }
      if (bannerShown.current === line || bannerQueue.current.some((b) => b.text === line)) return;
      bannerQueue.current.push({ text: line, ttl });
      if (bannerTimer.current === null) nextBanner();
    },
    [nextBanner],
  );
  useEffect(
    () => () => {
      if (bannerTimer.current !== null) clearTimeout(bannerTimer.current);
    },
    [],
  );

  // Lunges: a counter is the remount key for the motion; the motion name is set
  // in the same batch; the acting flag drives the sprite's attack/hurt clips.
  const [enemyLunge, setEnemyLunge] = useState(0);
  const [enemyActing, blipEnemyActing] = useBlip(later);
  const lungeEnemy = useCallback(() => {
    setEnemyLunge((n) => n + 1);
    blipEnemyActing(LUNGE_MS);
  }, [blipEnemyActing]);

  const [heroLunge, setHeroLunge] = useState(0);
  const [heroMotion, setHeroMotion] = useState<HeroMove>('lunge');
  const [heroActing, blipHeroActing] = useBlip(later);
  const [companionLunge, setCompanionLunge] = useState(0);
  const [companionMotion, setCompanionMotion] = useState<CompanionMotion>('lunge');
  const [companionActing, blipCompanionActing] = useBlip(later);
  const [fireballs, setFireballs] = useState<Fireball[]>([]);

  // Measured px gap between hero and enemy, so dives reach the enemy on any screen.
  const heroRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const [reachGap, setReachGap] = useState<number | null>(null);

  /**
   * Start a move: the hero's and/or companion's motions, the fireball volley
   * (`big` for a breath or a full-grown dragon) and the wind-up sound.
   */
  const perform = useCallback(
    (c: Choreo, sound: SfxName, big = false) => {
      const h = heroRef.current?.getBoundingClientRect();
      const e = enemyRef.current?.getBoundingClientRect();
      if (h && e && h.width > 0) setReachGap(h.left - e.right);
      if (c.hero) {
        setHeroMotion(c.hero);
        setHeroLunge((n) => n + 1);
        blipHeroActing(actingMs(HERO_MOTION[c.hero]));
      }
      if (c.companion) {
        setCompanionMotion(c.companion);
        setCompanionLunge((n) => n + 1);
        blipCompanionActing(actingMs(COMPANION_MOTION[c.companion]));
      }
      if (c.fireballs > 0 && !reduceMotion) {
        const volley = Array.from({ length: c.fireballs }, (_, i) => ({
          id: ++fxId.current,
          delayMs: fireballLaunchMs(c, i),
          big: big || c.companion === 'breath',
        }));
        setFireballs((f) => [...f, ...volley]);
        const ids = new Set(volley.map((v) => v.id));
        later(() => setFireballs((f) => f.filter((x) => !ids.has(x.id))), c.hitMs + 200);
      }
      if (c.soundMs > 0) later(() => sfx(sound), c.soundMs);
      else sfx(sound);
    },
    [later, reduceMotion, blipHeroActing, blipCompanionActing],
  );

  // The enemy flinches (knock-back + hurt pose) when a blow LANDS.
  const [enemyHit, setEnemyHit] = useState(0);
  const [enemyHurt, blipEnemyHurt] = useBlip(later);
  const hitEnemy = useCallback(() => {
    setEnemyHit((n) => n + 1);
    blipEnemyHurt(FLINCH_MS);
  }, [blipEnemyHurt]);

  const [cheering, blipCheering] = useBlip(later);
  const cheer = useCallback(() => blipCheering(CHEER_MS), [blipCheering]);

  // A swapped-in companion drops into place (remount key).
  const [swapIn, setSwapIn] = useState(0);
  const dropIn = useCallback(() => setSwapIn((n) => n + 1), []);

  // Everything the stage renders (plain values — no refs, so it's safe to read
  // during render; the element refs travel separately).
  const stage = {
    reduceMotion,
    floats,
    enemyLunge,
    enemyActing,
    enemyHit,
    enemyHurt,
    heroLunge,
    heroMotion,
    heroActing,
    companionLunge,
    companionMotion,
    companionActing,
    fireballs,
    reachGap,
    cheering,
    swapIn,
  };

  return {
    stage,
    reduceMotion,
    banner,
    heroRef,
    enemyRef,
    live,
    later,
    float,
    showBanner,
    lungeEnemy,
    perform,
    hitEnemy,
    cheer,
    dropIn,
  };
}

export type StageFx = ReturnType<typeof useBattleFx>['stage'];
