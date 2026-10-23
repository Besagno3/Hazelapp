import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));
vi.mock('../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../lib/audio')>()),
  playMusic: () => {},
  sfx: () => {},
}));
// The play screen each test stands in: a file that doesn't come (offline, or a deploy
// replaced it) until it does, or one with a bug in it. The title card's art is real.
type Play = import('../../lib/lazyRetry').RetryableLazy<import('./types').PlayProps>;
const screens = vi.hoisted(() => ({ play: null as null | Play }));
vi.mock('./games', async (orig) => {
  const real = await orig<typeof import('./games')>();
  return {
    GAME_SCREENS: {
      'potion-lab': {
        ...real.GAME_SCREENS['potion-lab'],
        get Play() {
          return screens.play!;
        },
      },
    },
  };
});
const { retryableLazy } = await import('../../lib/lazyRetry');
const offline = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/PotionLab.js'));

const { default: MiniGameStage } = await import('./MiniGameStage');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { sealFlag } = await import('../../content/minigames');

beforeEach(() => {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags: {} }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { science: 2 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
  });
});

describe('a play screen that doesn’t load (docs/DESIGN-MINIGAMES.md §4)', () => {
  it('says so on the stage, with Try again — and the way back to the map still works', async () => {
    screens.play = retryableLazy(offline);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    expect(await screen.findByText(/The Potion Lab didn’t open/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the map' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('Try again brings the game up, focused where it starts (review round 2)', async () => {
    let tries = 0;
    screens.play = retryableLazy(() => (tries++ === 0 ? offline() : import('./potionLab/PotionLab')));
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(screen.queryByText(/didn’t open/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Step 1 · Pick a jar' })).toHaveFocus());
  });

  it('a bug in the game stays on the stage: its own words, the details for grown-ups, and 🗺️ Map (review round 2)', async () => {
    const Broken = () => {
      throw new Error('a bug in the game');
    };
    screens.play = retryableLazy(async () => ({ default: Broken }));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    expect(await screen.findByText(/Something went wrong in the Potion Lab\. Everything you found is saved\./)).toBeInTheDocument();
    expect(screen.getByText('Details for grown-ups')).toBeInTheDocument();
    expect(screen.getByTestId('minigame-stage')).toBeInTheDocument();
    const maps = screen.getAllByRole('button', { name: 'Back to the map' });
    fireEvent.click(maps[maps.length - 1]);
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    quiet.mockRestore();
  });
});

describe('the Expert seal, from what a game reports (§8.3; code review round 2: the stage’s own guards were untested)', () => {
  /** A game that finishes at once, reporting how many it had spot on. */
  const finishing = (spotOn?: { right: number; of: number }) =>
    retryableLazy(async () => ({
      default: ({ onFinish }: import('./types').PlayProps) => (
        <button type="button" onClick={() => onFinish({ title: 'Round done!', learned: 'A lesson.', spotOn })}>
          Finish
        </button>
      ),
    }));
  async function round(band: 'Tricky' | 'Expert', spotOn?: { right: number; of: number }) {
    screens.play = finishing(spotOn);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: band }));
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    await screen.findByRole('heading', { name: 'Round done!' });
  }
  const sealed = () => useSaveStore.getState().save!.flags[sealFlag('potion-lab')];

  it('a report on another band counts for nothing — no seal, no line', async () => {
    await round('Tricky', { right: 1, of: 1 });
    expect(sealed()).toBeUndefined();
    expect(screen.queryByText(/Spot on|Expert seal/)).toBeNull();
  });

  it('a round with nothing in it is no seal, and says nothing of one', async () => {
    await round('Expert', { right: 0, of: 0 });
    expect(sealed()).toBeUndefined();
    expect(screen.queryByText(/Spot on|Expert seal/)).toBeNull();
  });

  it('one of two spot on, the first time: no seal — how it went and what wins it, in the card and a phone’s line', async () => {
    await round('Expert', { right: 1, of: 2 });
    expect(sealed()).toBeUndefined();
    expect(screen.getByText('Spot on: 1 of 2. Spot on every time wins the Expert seal.')).toBeInTheDocument();
    expect(screen.getByText(/^🎯 Spot on 1 of 2$/)).toBeInTheDocument();
  });

  it('all spot on: the seal, with what’s new — and no spot-on line beside it', async () => {
    await round('Expert', { right: 2, of: 2 });
    expect(sealed()).toBe(true);
    expect(screen.getByText('The Expert seal: spot on every time')).toBeInTheDocument();
    expect(screen.getByText(/^🏅 Expert seal$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Spot on/)).toBeNull();
  });

  // Claimed before something just for fun (Mirror Mural's own canvas, PR 14): leaving from it kept the pay, not the seal.
  const claiming = (spotOn: { right: number; of: number }) =>
    retryableLazy(async () => ({
      default: ({ onFinish, onClaim }: import('./types').PlayProps) => (
        <>
          <button type="button" onClick={() => onClaim?.(spotOn)}>
            Claim
          </button>
          <button type="button" onClick={() => onFinish({ title: 'Round done!', learned: 'A lesson.', spotOn })}>
            Finish
          </button>
        </>
      ),
    }));
  async function claim(band: 'Tricky' | 'Expert', spotOn: { right: number; of: number }) {
    screens.play = claiming(spotOn);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: band }));
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Claim' }));
  }

  it('claimed spot on every time: the seal’s kept before the reward — which still says it’s new', async () => {
    await claim('Expert', { right: 3, of: 3 });
    expect(sealed()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await screen.findByRole('heading', { name: 'Round done!' });
    expect(screen.getByText('The Expert seal: spot on every time')).toBeInTheDocument();
  });

  it('claimed with one missed, or on another band: no seal', async () => {
    await claim('Expert', { right: 2, of: 3 });
    expect(sealed()).toBeUndefined();
    cleanup();
    await claim('Tricky', { right: 3, of: 3 });
    expect(sealed()).toBeUndefined();
  });
});

