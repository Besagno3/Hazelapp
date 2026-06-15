import { describe, it, expect } from 'vitest';
import {
  TOPIC_REGISTRY,
  EXTRA_TOPICS,
  TOPICS,
  ALL_TOPICS,
  topicInfo,
  crystalInfo,
} from './topics';

describe('topic registry (#55 crystal vs question topics)', () => {
  it('the four crystal topics carry crystal/fiend/zone fields', () => {
    expect(TOPIC_REGISTRY).toHaveLength(4);
    for (const t of TOPIC_REGISTRY) {
      expect(t.crystalName, `${t.id} crystalName`).toBeTruthy();
      expect(t.fiendName, `${t.id} fiendName`).toBeTruthy();
      expect(t.zoneId, `${t.id} zoneId`).toBeTruthy();
    }
  });

  it('the expansion topics are styling-only (no crystal fields)', () => {
    expect(EXTRA_TOPICS.map((t) => t.id)).toEqual(['nature', 'space', 'history']);
    for (const t of EXTRA_TOPICS) {
      expect(t.crystalName).toBeUndefined();
      expect(t.fiendName).toBeUndefined();
      expect(t.label).toBeTruthy();
      expect(t.skyGradient).toBeTruthy();
    }
  });

  it('topicInfo resolves every one of the seven question topics', () => {
    expect(ALL_TOPICS).toHaveLength(7);
    for (const id of ALL_TOPICS) {
      const info = topicInfo(id);
      expect(info.id).toBe(id);
      expect(info.emoji).toBeTruthy();
    }
  });

  it('TOPICS is exactly the four crystal topics; crystalInfo gives their fields', () => {
    expect([...TOPICS].sort()).toEqual(['creativity', 'engineering', 'math', 'science']);
    for (const id of TOPICS) {
      expect(crystalInfo(id).crystalName).toBeTruthy();
    }
  });
});
