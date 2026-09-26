import { describe, it, expect } from 'vitest';
import {
  EMBER_BREATH,
  COMPANION_MOTION,
  COMPANION_STRIKE,
  HERO_MOTION,
  HERO_STRIKE,
  PAIR_CHOREO,
  contactFraction,
  fitReach,
  REACH_FRACTION,
  fireballLaunchMs,
  pairChoreo,
  FIREBALL_FLIGHT_MS,
  type Choreo,
} from './choreography';
import { PAIR_ATTACKS } from '../../content/companion';
import { GENERATED_SPRITES } from '../../content/sprites.generated';

const ALL: Choreo[] = [HERO_STRIKE, COMPANION_STRIKE, EMBER_BREATH, ...Object.values(PAIR_CHOREO)];

describe('battle choreography', () => {
  it('every Pair Attack has its own choreography, with both actors moving', () => {
    for (const p of PAIR_ATTACKS) {
      expect(PAIR_CHOREO[p.id], p.id).toBeDefined();
      expect(PAIR_CHOREO[p.id].hero && PAIR_CHOREO[p.id].companion, p.id).toBeTruthy();
    }
    expect(pairChoreo('nope')).toBe(PAIR_CHOREO['twin-strike']);
  });

  it('every motion starts and ends at rest, moving toward the enemy (−x)', () => {
    for (const k of [...Object.values(HERO_MOTION), ...Object.values(COMPANION_MOTION)]) {
      expect(k.x[0]).toBe(0);
      expect(k.x.at(-1)).toBe(0);
      expect(Math.min(...k.x)).toBeLessThan(0);
      if (k.y) expect(k.y.length).toBe(k.x.length);
      if (k.times) expect(k.times.length).toBe(k.x.length);
    }
  });

  it('the blow lands when the moving actor reaches the enemy (±60ms)', () => {
    for (const c of ALL) {
      const mover = c.hero ? HERO_MOTION[c.hero] : COMPANION_MOTION[c.companion!];
      if (c.fireballs > 0 && !c.hero) continue; // fireball volleys land by flight time instead
      const contactMs = contactFraction(mover) * mover.duration * 1000;
      expect(Math.abs(contactMs - c.hitMs), JSON.stringify(c)).toBeLessThanOrEqual(60);
    }
  });

  it('the last fireball of a volley arrives exactly on the hit', () => {
    for (const c of ALL.filter((x) => x.fireballs > 0)) {
      expect(fireballLaunchMs(c, c.fireballs - 1) + FIREBALL_FLIGHT_MS).toBe(c.hitMs);
      for (let i = 1; i < c.fireballs; i++) {
        expect(fireballLaunchMs(c, i)).toBeGreaterThan(fireballLaunchMs(c, i - 1));
      }
    }
  });

  it("Ember's battle sheets carry the attack, breath and cheer clips", () => {
    for (const id of ['ember-hatchling', 'ember-whelp', 'ember-dragon']) {
      const anims = GENERATED_SPRITES[id].battle!.anims;
      for (const clip of ['idle', 'attack', 'hurt', 'breath', 'cheer']) expect(anims[clip], `${id}.${clip}`).toBeDefined();
    }
    expect(GENERATED_SPRITES['fx-fireball'].battle).toBeDefined();
  });

  it('reaching moves are rescaled to the on-screen gap; lunges keep their size', () => {
    const fit = fitReach(HERO_MOTION.comet, 500);
    expect(Math.min(...fit.x)).toBe(-500 * REACH_FRACTION);
    expect(fit.x[0]).toBe(0);
    expect(fit.x.at(-1)).toBe(0);
    expect(fit.y).toEqual(HERO_MOTION.comet.y);
    expect(fitReach(HERO_MOTION.comet, 180).x[2]).toBeGreaterThan(-180); // phones: never overshoots
    expect(fitReach(HERO_MOTION.lunge, 500)).toBe(HERO_MOTION.lunge);
    expect(fitReach(HERO_MOTION.comet, null)).toBe(HERO_MOTION.comet);
  });
});
