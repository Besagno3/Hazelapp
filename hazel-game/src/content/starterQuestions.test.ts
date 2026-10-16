import { describe, it, expect } from 'vitest';
import { ALL_TOPICS } from './topics';
import {
  isStarterId,
  starterBand,
  starterBank,
  starterQuestions,
  STARTER_BANDS,
} from './starterQuestions';
import { screenQuestion } from '../../supabase/functions/_shared/questionScreen';

describe('starter questions (B5)', () => {
  it('has six questions in every band of every topic', () => {
    for (const topic of ALL_TOPICS)
      for (const band of STARTER_BANDS) expect(starterBank(topic, band), `${topic} ${band}`).toHaveLength(6);
  });

  it('every one passes the same kids’ screen as AI questions', () => {
    for (const topic of ALL_TOPICS)
      for (const band of STARTER_BANDS)
        for (const q of starterBank(topic, band))
          expect(screenQuestion({ ...q, explanation: q.explanation ?? null }), `${q.id}: ${q.text}`).toBeNull();
  });

  it('every one has a right answer, an explanation and an id no other has', () => {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const topic of ALL_TOPICS)
      for (const band of STARTER_BANDS)
        for (const q of starterBank(topic, band)) {
          expect(q.correctIndex).toBe(0);
          expect(q.topic).toBe(topic);
          expect(q.explanation?.length, q.id).toBeGreaterThan(10);
          expect(isStarterId(q.id)).toBe(true);
          ids.add(q.id);
          texts.add(q.text);
        }
    expect(ids.size).toBe(ALL_TOPICS.length * STARTER_BANDS.length * 6);
    expect(texts.size).toBe(ids.size);
  });

  it('puts levels 1–3, 4–6 and 7–10 in the easy, middle and hard bands', () => {
    expect([1, 2, 3].map(starterBand)).toEqual(['easy', 'easy', 'easy']);
    expect([4, 5, 6].map(starterBand)).toEqual(['middle', 'middle', 'middle']);
    expect([7, 8, 9, 10].map(starterBand)).toEqual(['hard', 'hard', 'hard', 'hard']);
  });

  it("serves the level's own band first, all different", () => {
    for (const level of [2, 5, 9]) {
      const qs = starterQuestions('science', level, 5);
      expect(qs).toHaveLength(5);
      expect(new Set(qs.map((q) => q.id)).size).toBe(5);
      for (const q of qs) expect(q.id).toContain(`-${starterBand(level)}-`);
    }
  });

  it('tops a big batch up from the nearest band (a battle asks for 9)', () => {
    const easy = starterQuestions('math', 1, 9);
    expect(easy).toHaveLength(9);
    expect(easy.filter((q) => q.id.includes('-easy-'))).toHaveLength(6);
    expect(easy.filter((q) => q.id.includes('-middle-'))).toHaveLength(3);
    const middle = starterQuestions('music', 5, 9);
    expect(middle.filter((q) => q.id.includes('-easy-'))).toHaveLength(3);
    const hard = starterQuestions('space', 10, 9);
    expect(hard.filter((q) => q.id.includes('-middle-'))).toHaveLength(3);
    expect(new Set(hard.map((q) => q.id)).size).toBe(9);
    // Never more than the topic has.
    expect(starterQuestions('words', 5, 40)).toHaveLength(18);
  });
});
