import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap (code review round 1): a step's buttons wait a moment as it starts — and Check again after a wrong check,
// so the second tap doesn't wipe the clue. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: IndexTimeline } = await import('./IndexTimeline');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { SET_BY_ID, check, checkWords, jobFor, spanChoices, spanRight, spanWords } = await import('../../../lib/minigames/timeline');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = (ms = SETTLE_MS) => act(() => void (now += ms));
const tray = () => screen.getByRole('group', { name: /^The washed-up cards/ });
const index = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

describe('📜 a double tap', () => {
  it('a card pressed as a drawer starts does nothing; Check pressed twice after a wrong check keeps its clue', () => {
    render(<IndexTimeline def={MINIGAMES['index-timeline']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('gentle', 0, 0);
    fireEvent.click(within(tray()).getAllByRole('button')[0]);
    expect(within(tray()).getAllByRole('button')).toHaveLength(job.events.length);
    wait();
    // The dealt order (never right): placed as dealt, checked — and Check again, straight away.
    for (const id of job.dealt) fireEvent.click(within(tray()).getByRole('button', { name: job.events.find((ev) => ev.id === id)!.name }));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    const clue = index();
    expect(clue).toContain(checkWords(job, check(job, job.dealt)));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toBe(clue);
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain('Every card on the timeline first');
  });
});

describe('📜 from the keyboard', () => {
  const name = (job: ReturnType<typeof jobFor>, id: string) => job.events.find((ev) => ev.id === id)!.name;
  const card = (label: string) => within(tray()).getByRole('button', { name: label });
  const checkButton = () => screen.getByRole('button', { name: 'Check the order' });
  function start() {
    render(<IndexTimeline def={MINIGAMES['index-timeline']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    wait();
    return jobFor('gentle', 0, 0);
  }
  // A key's press: focus on it, then a click with no pointer (as Enter or Space gives).
  const press = (b: HTMLElement) => {
    b.focus();
    fireEvent.click(b);
  };

  it('a Tab from where a drawer starts goes to the first card (UX and code review round 2: it went to Check)', () => {
    const job = start();
    expect(tray()).toHaveFocus();
    const focusable = Array.from(document.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])'));
    const after = focusable.find((el) => tray().compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after).toBe(card(name(job, job.dealt[0])));
  });

  it('a card placed, on to the next card left, then Check; a wrong check, on to the first card back (code review round 1)', () => {
    const job = start();
    const dealt = job.dealt.map((id) => name(job, id));
    press(card(dealt[0]));
    expect(card(dealt[1])).toHaveFocus();
    wait();
    press(card(dealt[1]));
    expect(card(dealt[2])).toHaveFocus();
    wait();
    press(card(dealt[2]));
    expect(checkButton()).toHaveFocus();
    wait();
    press(checkButton());
    // The dealt order isn't right: the first card back has focus.
    expect(within(tray()).getAllByRole('button')[0]).toHaveFocus();
  });

  it('a second Enter straight away presses nothing where focus moved on to, nor a held one (code review round 2)', () => {
    const job = start();
    const dealt = job.dealt.map((id) => name(job, id));
    press(card(dealt[0]));
    // The second of a double Enter, on the card focus moved on to: not placed. A moment later, it is.
    fireEvent.click(card(dealt[1]));
    expect(card(dealt[1])).toBeInTheDocument();
    // A held Enter's repeats press nothing.
    expect(fireEvent.keyDown(card(dealt[1]), { key: 'Enter', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(card(dealt[1]), { key: 'Enter' })).toBe(true);
    wait();
    press(card(dealt[1]));
    wait();
    press(card(dealt[2]));
    // On to Check: pressed straight away, no check; a moment later, it checks.
    expect(checkButton()).toHaveFocus();
    fireEvent.click(checkButton());
    expect(index()).not.toContain('in order!');
    expect(fireEvent.keyDown(checkButton(), { key: ' ', repeat: true })).toBe(false);
    wait();
    fireEvent.click(checkButton());
    expect(index()).toContain(checkWords(job, check(job, job.dealt)));
  });

  it('a pointer’s quick taps aren’t held back; focus moves only from a card or Check that had it', () => {
    const job = start();
    const dealt = job.dealt.map((id) => name(job, id));
    // A card tapped with focus elsewhere: focus stays where it was.
    fireEvent.click(card(dealt[0]));
    expect(tray()).toHaveFocus();
    // A tap (a click with a count) on the card focus moved on to, straight away: placed.
    press(card(dealt[1]));
    expect(card(dealt[2])).toHaveFocus();
    fireEvent.click(card(dealt[2]), { detail: 1 });
    expect(within(tray()).queryAllByRole('button')).toHaveLength(0);
    // A wrong check with focus elsewhere leaves it there; a card on the line taken back keeps focus on its place.
    const there = screen.getByRole('button', { name: /^Place 1 of 3/ });
    there.focus();
    wait();
    fireEvent.click(checkButton());
    expect(there).toHaveFocus();
    wait();
    const kept = screen.getAllByRole('button', { name: /^Place \d of 3.*, right$/ });
    expect(kept.length).toBeGreaterThan(0);
    const back = within(tray()).getAllByRole('button')[0];
    press(back);
    const taken = screen.getByRole('button', { name: new RegExp(`^Place \\d of 3.*: ${back.getAttribute('aria-label')}$`) });
    wait();
    press(taken);
    expect(taken).toHaveFocus();
    expect(index()).toContain('is back with the washed-up cards.');
  });
});

describe('📜 Expert’s years, a double tap', () => {
  it('an answer tapped as the question comes, where Check was, isn’t picked; a moment later it is; a key’s never held back', () => {
    const onFinish = vi.fn();
    render(<IndexTimeline def={MINIGAMES['index-timeline']} band="expert" round={0} onPage={() => true} onFinish={onFinish} />);
    wait();
    const job = jobFor('expert', 0, 0);
    for (const ev of job.events) fireEvent.click(within(tray()).getByRole('button', { name: new RegExp(`^${ev.name}`) }), { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }), { detail: 1 });
    const answers = () => within(screen.getByRole('group', { name: 'How many years?' }));
    const wrong = spanChoices(job).find((n) => n !== spanRight(job))!;
    // The double tap's second, straight away: nothing picked.
    fireEvent.click(answers().getByRole('button', { name: `${wrong.toLocaleString('en-GB')} years` }), { detail: 1 });
    expect(index()).not.toContain('Not ');
    // A key acts at once.
    fireEvent.click(answers().getByRole('button', { name: `${wrong.toLocaleString('en-GB')} years` }), { detail: 0 });
    expect(index()).toContain(spanWords(job, wrong));
    wait();
    fireEvent.click(answers().getByRole('button', { name: `${spanRight(job).toLocaleString('en-GB')} years` }), { detail: 1 });
    expect(screen.getByRole('heading', { name: `${SET_BY_ID[job.set].name}, in order.` })).toHaveFocus();
    // Next: a tap straight away waits; a key doesn't.
    fireEvent.click(screen.getByRole('button', { name: 'Next drawer' }), { detail: 1 });
    expect(screen.getByRole('heading', { name: `${SET_BY_ID[job.set].name}, in order.` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next drawer' }), { detail: 0 });
    expect(screen.getByRole('group', { name: /^The washed-up cards: 7 to place/ })).toBeInTheDocument();
  });
});
