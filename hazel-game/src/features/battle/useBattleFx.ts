import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../../lib/audio';

export type FxSide = 'hero' | 'enemy';
export interface FloatText {
  id: number;
  text: string;
  side: FxSide;
  color: string;
}

/** Lunge animation length; the impact effects land at IMPACT_MS into it. */
const LUNGE_MS = 520;
export const IMPACT_MS = 260;

/**
 * Cosmetic battle effects (#44): floating numbers, lunges, the phase banner,
 * and delayed "impact" effects. Nothing here changes the fight's numbers —
 * those are written immediately via `lib/battleTurn.ts` — so a kid tapping
 * through faster than the animation can never lose a heal or a hit (#70).
 * Every pending timer is owned here and cleared on unmount.
 */
export function useBattleFx() {
  const timers = useRef(new Set<number>());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const [floats, setFloats] = useState<FloatText[]>([]);
  const floatId = useRef(0);
  const float = useCallback(
    (text: string, side: FxSide, color: string) => {
      const id = ++floatId.current;
      setFloats((f) => [...f, { id, text, side, color }]);
      later(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
    },
    [later],
  );

  // One banner lifecycle for every caller (archetype callouts, boss enrage):
  // a new banner cancels the previous hide timer, so a stale timeout can never
  // wipe a banner another path just raised.
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const showBanner = useCallback((text: string, ttl = 2500) => {
    if (bannerTimer.current !== null) clearTimeout(bannerTimer.current);
    setBanner(text);
    bannerTimer.current = window.setTimeout(() => setBanner(null), ttl);
  }, []);
  useEffect(
    () => () => {
      if (bannerTimer.current !== null) clearTimeout(bannerTimer.current);
    },
    [],
  );

  // Lunges: a counter is the remount key for the motion, and the acting flag
  // is true only for the lunge window (drives the sprite attack/hurt anims).
  const [heroLunge, setHeroLunge] = useState(0);
  const [enemyLunge, setEnemyLunge] = useState(0);
  const [heroActing, setHeroActing] = useState(false);
  const [enemyActing, setEnemyActing] = useState(false);
  // Only the latest lunge's timer may clear the flag (a quick second lunge
  // must not be cut short by the first one's timer).
  const heroSeq = useRef(0);
  const enemySeq = useRef(0);
  const lungeHero = useCallback(() => {
    const seq = ++heroSeq.current;
    setHeroLunge(seq);
    setHeroActing(true);
    sfx('attack'); // every hero lunge (attack / spell) gets the swoosh
    later(() => {
      if (seq === heroSeq.current) setHeroActing(false);
    }, LUNGE_MS);
  }, [later]);
  const lungeEnemy = useCallback(() => {
    const seq = ++enemySeq.current;
    setEnemyLunge(seq);
    setEnemyActing(true);
    later(() => {
      if (seq === enemySeq.current) setEnemyActing(false);
    }, LUNGE_MS);
  }, [later]);

  return {
    later,
    floats,
    float,
    banner,
    showBanner,
    heroLunge,
    enemyLunge,
    heroActing,
    enemyActing,
    lungeHero,
    lungeEnemy,
  };
}
