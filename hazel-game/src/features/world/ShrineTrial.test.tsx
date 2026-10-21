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
const { useProfileStore } = await import('../../store/profileStore');
const { XP_PER_CORRECT } = await import('../../lib/level');
const { xpBonusPerCorrect } = await import('../../lib/powerups');

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

  it('starter questions still teach the spell, but pay no XP (#153); bank ones pay', async () => {
    const addXp = vi.fn();
    useProfileStore.setState({ addXp });
    fetchQuestions.mockResolvedValueOnce(questions.map((q, i) => ({ ...q, id: `starter-space-easy-${i + 1}` })));
    render(<ShrineTrial npcId="wayfarer-keeper" />);
    fireEvent.click(screen.getByText('🕯️ Begin the trial'));
    await answer(0, 'Right', /1 of 3 — next question/);
    await answer(1, 'Right', /2 of 3 — next question/);
    await answer(2, 'Right', /Learn Return!/);
    expect(useSaveStore.getState().save!.flags[fieldSpellFlag('return')]).toBe(true);
    expect(addXp).not.toHaveBeenCalled();
  });

  it('…as a bank question pays its XP', async () => {
    const addXp = vi.fn();
    useProfileStore.setState({ addXp });
    render(<ShrineTrial npcId="wayfarer-keeper" />);
    fireEvent.click(screen.getByText('🕯️ Begin the trial'));
    await answer(0, 'Right', /1 of 3 — next question/);
    expect(addXp).toHaveBeenCalledWith(XP_PER_CORRECT);
  });

  it('a Scholar hero gets the bonus on top, as in battles and quizzes (#102j)', async () => {
    const addXp = vi.fn();
    useProfileStore.setState({ profile: { birthYear: 2017, birthMonth: 1, powerUps: { scholar: 2 } } as never, addXp });
    render(<ShrineTrial npcId="wayfarer-keeper" />);
    fireEvent.click(screen.getByText('🕯️ Begin the trial'));
    await answer(0, 'Right', /1 of 3 — next question/);
    expect(addXp).toHaveBeenCalledWith(XP_PER_CORRECT + xpBonusPerCorrect({ scholar: 2 }));
    expect(xpBonusPerCorrect({ scholar: 2 })).toBeGreaterThan(0);
    useProfileStore.setState({ profile: null });
  });

  it('fetches another batch if the questions run out', async () => {
    render(<ShrineTrial npcId="quiet-keeper" />);
    fireEvent.click(screen.getByText('🕯️ Begin the trial'));
    for (let i = 0; i < 5; i++) await answer(i, 'Wrong A', /Try another one/);
    await screen.findByText('Star riddle 0?');
    expect(fetchQuestions).toHaveBeenCalledTimes(2);
  });

  it('questions that fail to load say so in plain words, with Try again — the raw error goes to the console (#130 S6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fetchQuestions.mockRejectedValueOnce(new Error('relation "questions" does not exist'));
      render(<ShrineTrial npcId="wayfarer-keeper" />);
      fireEvent.click(screen.getByText('🕯️ Begin the trial'));
      expect(await screen.findByText('The questions didn\'t load. Tap "Try again".')).toBeInTheDocument();
      // An alert, so a screen reader hears it as it appears (#124 review).
      expect(screen.getByRole('alert')).toHaveTextContent("The questions didn't load.");
      expect(screen.queryByText(/relation|does not exist/)).toBeNull();
      expect(warn).toHaveBeenCalledWith('Shrine trial questions failed:', 'relation "questions" does not exist');
      fireEvent.click(screen.getByText('Try again'));
      expect(await screen.findByText('Star riddle 0?')).toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });

  it('a hero who knows the spell is reminded how to cast it — no trial', () => {
    useSaveStore.setState({ save: { ...defaultSave(), flags: { [fieldSpellFlag('glow')]: true } } });
    render(<ShrineTrial npcId="shrine-keeper" />);
    expect(screen.getByText('🔆 Glow is yours')).toBeInTheDocument();
    expect(screen.queryByText('🕯️ Begin the trial')).toBeNull();
  });
});
