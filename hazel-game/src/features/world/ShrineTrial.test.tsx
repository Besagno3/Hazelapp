import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Question } from '../../types';

// Five trial questions; the first option is always right.
const questions: Question[] = [0, 1, 2, 3, 4].map((i) => ({
  id: `trial-q${i}`,
  topic: 'space',
  level: 3,
  text: `Star riddle ${i}?`,
  options: ['Right', 'Wrong A', 'Wrong B', 'Wrong C'],
  correctIndex: 0,
}));
const fetchQuestions = vi.fn(async () => questions);
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  fetchQuestions: (...args: unknown[]) => fetchQuestions(...(args as [])),
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: ShrineTrial } = await import('./ShrineTrial');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { fieldSpellFlag, TRIAL_CORRECT } = await import('../../content/fieldSpells');

beforeEach(() => {
  fetchQuestions.mockClear();
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});

async function answer(i: number, pick: 'Right' | 'Wrong A', next: RegExp) {
  await screen.findByText(`Star riddle ${i}?`);
  fireEvent.click(screen.getByText(pick));
  fireEvent.click(screen.getByText(next));
}

describe('ShrineTrial (#75 item 9)', () => {
  it(`teaches the spell after ${TRIAL_CORRECT} right answers; a miss just brings another (and goes to the Library)`, async () => {
    render(<ShrineTrial npcId="wayfarer-keeper" />);
    expect(screen.getByText(/Wayfarer Juniper's trial — 🏠 Return/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('🕯️ Begin the trial'));
    expect(fetchQuestions).toHaveBeenCalledWith('space', expect.any(Number), expect.any(Number), 5, expect.any(String));

    await answer(0, 'Wrong A', /Try another one/);
    expect(useSaveStore.getState().save!.library.map((e) => e.question.id)).toEqual(['trial-q0']);
    await answer(1, 'Right', /1 of 3 — next question/);
    await answer(2, 'Right', /2 of 3 — next question/);
    expect(useSaveStore.getState().save!.flags[fieldSpellFlag('return')]).toBeUndefined();
    await answer(3, 'Right', /Learn Return!/);

    // Learned the moment the last right answer landed.
    expect(useSaveStore.getState().save!.flags[fieldSpellFlag('return')]).toBe(true);
    expect(screen.getByText('You learned 🏠 Return!')).toBeInTheDocument();
    expect(screen.getByText(/Field spells/)).toBeInTheDocument();
  });

  it('fetches another batch if the questions run out', async () => {
    render(<ShrineTrial npcId="quiet-keeper" />);
    fireEvent.click(screen.getByText('🕯️ Begin the trial'));
    for (let i = 0; i < 5; i++) await answer(i, 'Wrong A', /Try another one/);
    await screen.findByText('Star riddle 0?');
    expect(fetchQuestions).toHaveBeenCalledTimes(2);
  });

  it('a hero who knows the spell is reminded how to cast it — no trial', () => {
    useSaveStore.setState({ save: { ...defaultSave(), flags: { [fieldSpellFlag('glow')]: true } } });
    render(<ShrineTrial npcId="shrine-keeper" />);
    expect(screen.getByText('🔆 Glow is yours')).toBeInTheDocument();
    expect(screen.queryByText('🕯️ Begin the trial')).toBeNull();
  });
});
