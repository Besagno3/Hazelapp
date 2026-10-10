import { TOPIC_REGISTRY, type CrystalTopicInfo } from '../content/topics';
import type { CrystalTopic } from '../types';

/**
 * A stand-in for a later act's crystal (#75 item 14c): an Act II crystal
 * that isn't in the game yet, for tests that check Act I doesn't change when
 * one is added — the Spire's seal, the ending, the HUD count, the 🚩's order.
 * Its id isn't a real topic (hence the cast); it lives out on the Silver
 * Shallows, past the sea, where Act II's places are.
 */
export const FAKE_ACT_TWO_CRYSTAL: CrystalTopicInfo = {
  id: 'memory-test' as CrystalTopic,
  label: 'Test Memory',
  emoji: '🧪',
  buttonColor: 'bg-amber-600',
  skyGradient: 'from-stone-900 to-amber-700',
  groundTint: [150, 130, 110],
  crystalName: 'Crystal of Testing',
  fiendName: 'The Test Fiend',
  zoneId: 'silver-shallows',
  act: 2,
};

/** Adds the stand-in crystal to the registry; call the returned function to take it out again. */
export function addFakeActTwoCrystal(): () => void {
  TOPIC_REGISTRY.push(FAKE_ACT_TWO_CRYSTAL);
  return () => {
    const i = TOPIC_REGISTRY.indexOf(FAKE_ACT_TWO_CRYSTAL);
    if (i >= 0) TOPIC_REGISTRY.splice(i, 1);
  };
}
