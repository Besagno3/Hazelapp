import { TOPIC_REGISTRY, type CrystalTopicInfo } from '../content/topics';
import type { CrystalTopic } from '../types';

/**
 * A stand-in for a later act's crystal (#75 item 14c): one that isn't in the
 * game yet, for tests that check the acts before it don't change when it's
 * added — the Spire's seal, the ending, the HUD count, the 🚩's order. Since
 * Act II's Crystal of Memory arrived (#75 item 14h) it stands for Act III's
 * (Voices, item 15). Its id isn't a real topic (hence the cast).
 */
export const FAKE_LATER_CRYSTAL: CrystalTopicInfo = {
  id: 'voices-test' as CrystalTopic,
  label: 'Test Voices',
  emoji: '🧪',
  buttonColor: 'bg-amber-600',
  skyGradient: 'from-stone-900 to-amber-700',
  groundTint: [150, 130, 110],
  crystalName: 'Crystal of Testing',
  fiendName: 'The Test Fiend',
  zoneId: 'silver-shallows',
  act: 3,
};

/** Adds the stand-in crystal to the registry; call the returned function to take it out again. */
export function addFakeLaterCrystal(): () => void {
  TOPIC_REGISTRY.push(FAKE_LATER_CRYSTAL);
  return () => {
    const i = TOPIC_REGISTRY.indexOf(FAKE_LATER_CRYSTAL);
    if (i >= 0) TOPIC_REGISTRY.splice(i, 1);
  };
}
