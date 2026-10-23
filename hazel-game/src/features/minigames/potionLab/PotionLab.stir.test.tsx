import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

// Full motion here: the stir takes STIR_MS before the colour shows (MiniGameStage.test runs reduced).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => false,
}));
// The main tests stand in an always-ready wait (a step's buttons wait a moment as it starts — PotionLab.taps.test).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../../machines/gameFlow')>()),
  sendFlow: () => {},
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  playMusic: () => {},
  sfx: () => {},
}));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { STIR_MS } = await import('./PotionLab');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { pageFlag } = await import('../../../content/minigames');

function setFlags(flags: Record<string, boolean>) {
  useSaveStore.setState({ save: { ...useSaveStore.getState().save!, flags } });
}

beforeEach(() => {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags: {} }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { science: 2 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp: vi.fn(async () => {}),
    recordActivity: vi.fn(async () => {}),
  });
});
afterEach(() => vi.useRealTimers());

const counter = () => within(screen.getByRole('group', { name: 'Jars on the counter' }));
const flags = () => useSaveStore.getState().save!.flags;

/** Opens the lab, then runs the clock by hand. */
async function open() {
  const view = render(<MiniGameStage game="potion-lab" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
  await screen.findByRole('group', { name: 'Jars on the counter' });
  vi.useFakeTimers();
  return view;
}

function stir(jar: RegExp, guess: string) {
  fireEvent.click(counter().getByRole('button', { name: jar }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Your guess' })).getByRole('button', { name: guess }));
  fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
}

describe('🧪 the stir, with motion (review round 1)', () => {
  it('the colour shows when the stir is done, and only then is the page paid', async () => {
    await open();
    stir(/Soapy water/, 'Blue-green');
    expect(screen.getByRole('button', { name: 'Stirring…' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Stir, stir, stir…')).toBeInTheDocument();
    expect(flags()[pageFlag('potion-lab', 'soap')]).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(STIR_MS);
    });
    expect(screen.getByRole('heading', { name: 'It turned blue-green!' })).toBeInTheDocument();
    expect(flags()[pageFlag('potion-lab', 'soap')]).toBe(true);
  });

  it('“Pick a different jar” waits out the stir: an old stir never lands on a new jar', async () => {
    await open();
    stir(/Soapy water/, 'Pink');
    const other = screen.getByRole('button', { name: 'Pick a different jar' });
    expect(other).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(other);
    // The jars wait too.
    fireEvent.click(counter().getByRole('button', { name: /Lemon juice/ }));
    expect(counter().getByRole('button', { name: /Soapy water/ })).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      vi.advanceTimersByTime(STIR_MS);
    });
    expect(screen.getByRole('heading', { name: 'It turned blue-green!' })).toBeInTheDocument();
  });

  it('a different jar before stirring starts afresh, focused where the jars are', async () => {
    await open();
    fireEvent.click(counter().getByRole('button', { name: /Soapy water/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick a different jar' }));
    // The step card's heading: jsdom lays nothing out, so here the counter counts as hidden, as on a phone.
    expect(screen.getByRole('heading', { name: 'Step 1 · Pick a jar' })).toHaveFocus();
    expect(counter().getByRole('button', { name: /Soapy water/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaving for the map mid-stir pays nothing, then or later', async () => {
    const { unmount } = await open();
    stir(/Lemon juice/, 'Pink');
    act(() => {
      vi.advanceTimersByTime(STIR_MS / 2);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(STIR_MS * 2);
    });
    expect(flags()[pageFlag('potion-lab', 'lemon')]).toBeUndefined();
  });

  it('a press on the waiting “Stirring…” starts nothing: leaving mid-stir still pays nothing (review round 2)', async () => {
    const { unmount } = await open();
    stir(/Lemon juice/, 'Pink');
    fireEvent.click(screen.getByRole('button', { name: 'Stirring…' }));
    act(() => {
      vi.advanceTimersByTime(STIR_MS / 2);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(STIR_MS * 3);
    });
    expect(flags()[pageFlag('potion-lab', 'lemon')]).toBeUndefined();
  });

  it('the guesses wait during the stir', async () => {
    await open();
    stir(/Lemon juice/, 'Pink');
    const guesses = within(screen.getByRole('group', { name: 'Your guess' }));
    expect(guesses.getByRole('button', { name: 'Blue-green' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(guesses.getByRole('button', { name: 'Blue-green' }));
    expect(guesses.getByRole('button', { name: 'Pink' })).toHaveAttribute('aria-pressed', 'true');
    expect(guesses.getByRole('button', { name: 'Blue-green' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a Brew Book page read during the stir gives way to Tadpole’s verdict (review round 2)', async () => {
    setFlags({ [pageFlag('potion-lab', 'soap')]: true });
    await open();
    stir(/Lemon juice/, 'Pink');
    fireEvent.click(screen.getByRole('button', { name: /Soapy water: turns it blue-green. Read the page/ }));
    expect(screen.getAllByText(/That’s part of why it feels slippery/).length).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(STIR_MS);
    });
    expect(screen.queryAllByText(/That’s part of why it feels slippery/)).toHaveLength(0);
    expect(screen.getByText(/You guessed it before you saw it.*just what Fern ordered/)).toBeInTheDocument();
  });

  it('the guesses come into view as the step starts, clear of the sticky Stir — never as one is tapped (PR 11 review round 1 bench)', async () => {
    const into = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = into;
    try {
      await open();
      into.mockClear();
      fireEvent.click(counter().getByRole('button', { name: /Lemon juice/ }));
      const guesses = screen.getByRole('group', { name: 'Your guess' });
      expect(into.mock.contexts).toContain(guesses);
      // Stir is sticky, and the panel's scroll padding keeps them above it (code review round 2: untested; UX: 80 px left
      // the last row's foot under it).
      expect(screen.getByRole('button', { name: 'Make a guess first' }).parentElement).toHaveClass('sticky');
      expect(screen.getByRole('complementary', { name: /The job and/ })).toHaveClass('scroll-pb-24');
      into.mockClear();
      fireEvent.click(within(guesses).getByRole('button', { name: 'Pink' }));
      fireEvent.click(within(guesses).getByRole('button', { name: 'Stays purple' }));
      expect(into).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });
});
