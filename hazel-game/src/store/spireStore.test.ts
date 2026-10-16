import { describe, it, expect, beforeEach } from 'vitest';
import { useSpireStore } from './spireStore';
import { SPIRE_LIVES } from '../content/spire';

const s = () => useSpireStore.getState();

describe('spireStore (#74)', () => {
  beforeEach(() => s().reset());

  it('starts off-floor with full candles', () => {
    expect(s().floor).toBeNull();
    expect(s().lives).toBe(SPIRE_LIVES);
    expect(s().broken).toEqual([]);
  });

  it('a climb after a fall starts with more candles; a plain reset goes back to the usual (B4, #150)', () => {
    s().setLives(1);
    s().reset(SPIRE_LIVES + 2);
    expect(s().lives).toBe(SPIRE_LIVES + 2);
    expect(s().maxLives).toBe(SPIRE_LIVES + 2);
    s().reset();
    expect(s().lives).toBe(SPIRE_LIVES);
    expect(s().maxLives).toBe(SPIRE_LIVES);
  });

  it('entering a floor clears broken seals and any pending bump', () => {
    s().breakWard('1,1');
    s().enterFloor(2);
    expect(s().floor).toBe(2);
    expect(s().broken).toEqual([]);
    expect(s().pending).toBeNull();
    expect(s().exploring).toBe(false);
  });

  it('bumps only register while exploring, one at a time, and pause exploring', () => {
    s().enterFloor(0);
    s().bump({ kind: 'stairs' });
    expect(s().pending).toBeNull(); // a panel is open — ignored
    s().setExploring(true);
    s().bump({ kind: 'ward', id: '2,4' });
    expect(s().pending).toEqual({ kind: 'ward', id: '2,4' });
    expect(s().exploring).toBe(false);
    s().bump({ kind: 'stairs' }); // already one pending — ignored
    expect(s().pending).toEqual({ kind: 'ward', id: '2,4' });
  });

  it('a broken seal can’t be bumped again', () => {
    s().enterFloor(0);
    s().breakWard('2,4');
    s().setExploring(true);
    s().bump({ kind: 'ward', id: '2,4' });
    expect(s().pending).toBeNull();
  });

  it('breakWard is idempotent', () => {
    s().breakWard('1,1');
    s().breakWard('1,1');
    expect(s().broken).toEqual(['1,1']);
  });
});
