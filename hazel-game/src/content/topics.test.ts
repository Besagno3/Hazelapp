import { describe, it, expect } from 'vitest';
import { CRYSTAL_TOPIC_IDS, EXTRA_TOPIC_IDS, TOTAL_CRYSTALS } from '../types';
import {
  TOPIC_REGISTRY,
  EXTRA_TOPICS,
  TOPICS,
  ALL_TOPICS,
  topicInfo,
  crystalInfo,
} from './topics';

describe('topic registry (#55 crystal vs question topics)', () => {
  it('TOPIC_REGISTRY covers exactly the CRYSTAL_TOPIC_IDS (Wave 0.1)', () => {
    // Adding a crystal topic = add its id to CRYSTAL_TOPIC_IDS; this test
    // then fails until the registry entry (crystal/Fiend/zone) exists.
    expect(TOPIC_REGISTRY.map((t) => t.id)).toEqual([...CRYSTAL_TOPIC_IDS]);
    expect(TOTAL_CRYSTALS).toBe(TOPIC_REGISTRY.length);
    for (const t of TOPIC_REGISTRY) {
      expect(t.crystalName, `${t.id} crystalName`).toBeTruthy();
      expect(t.fiendName, `${t.id} fiendName`).toBeTruthy();
      expect(t.zoneId, `${t.id} zoneId`).toBeTruthy();
    }
  });

  it('the current crystal ids are the shipped four (intent snapshot)', () => {
    expect([...CRYSTAL_TOPIC_IDS].sort()).toEqual([
      'creativity',
      'engineering',
      'math',
      'science',
    ]);
  });

  it('EXTRA_TOPICS covers exactly the EXTRA_TOPIC_IDS, styling-only', () => {
    expect(EXTRA_TOPICS.map((t) => t.id)).toEqual([...EXTRA_TOPIC_IDS]);
    for (const t of EXTRA_TOPICS) {
      expect(t.crystalName).toBeUndefined();
      expect(t.fiendName).toBeUndefined();
      expect(t.label).toBeTruthy();
      expect(t.skyGradient).toBeTruthy();
    }
  });

  it('topicInfo resolves every question topic, with no duplicate ids', () => {
    expect(ALL_TOPICS).toHaveLength(CRYSTAL_TOPIC_IDS.length + EXTRA_TOPIC_IDS.length);
    expect(new Set(ALL_TOPICS).size).toBe(ALL_TOPICS.length);
    for (const id of ALL_TOPICS) {
      const info = topicInfo(id);
      expect(info.id).toBe(id);
      expect(info.emoji).toBeTruthy();
    }
  });

  it('TOPICS mirrors the crystal ids; crystalInfo gives their fields', () => {
    expect(TOPICS).toEqual([...CRYSTAL_TOPIC_IDS]);
    for (const id of TOPICS) {
      expect(crystalInfo(id).crystalName).toBeTruthy();
    }
  });
});
