import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

// Reduced motion: no zoom and no stir wait, so a round plays straight through.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));
const playMusic = vi.fn();
vi.mock('../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../lib/audio')>()),
  playMusic: (...args: unknown[]) => playMusic(...args),
  sfx: () => {},
}));

const { default: MiniGameStage } = await import('./MiniGameStage');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { openedFlag, pageFlag, starFlag } = await import('../../content/minigames');
const { MINIGAME_PAGE_XP, MINIGAME_STAR_COINS, MINIGAME_STAR_XP } = await import('../../content/items');
const { rememberedBand } = await import('../../lib/minigames');
const { JAR_IDS } = await import('../../lib/minigames/potionLab');

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: {
      id: 'kid-1',
      birthYear: new Date().getFullYear() - 9,
      birthMonth: 1,
      skillLevels: { science: level },
      xp: 0,
      powerUps: {},
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedOn: null,
    },
    addXp,
    recordActivity,
  });
}

beforeEach(() => {
  localStorage.clear();
  sendFlow.mockClear();
  playMusic.mockClear();
  addXp.mockClear();
  recordActivity.mockClear();
  setUp(2);
});

const save = () => useSaveStore.getState().save!;

/** Pours a jar, guesses, stirs. */
async function brew(jar: RegExp, guess: string | RegExp) {
  fireEvent.click(within(screen.getByRole('group', { name: 'Jars on the counter' })).getByRole('button', { name: jar }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Your guess' })).getByRole('button', { name: guess }));
  fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
}

describe('the stage (docs/DESIGN-MINIGAMES.md §2)', () => {
  it('opens on the title card: the name, the host’s hello, how to play, the band from the topic level', () => {
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByRole('dialog', { name: 'Potion Lab' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Potion Lab' })).toBeInTheDocument();
    expect(screen.getByText(/Orders are piling up/)).toBeInTheDocument();
    expect(screen.getByText(/1 · Pour in one jar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gentle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Picked from your Science level \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Brew Book: 0 of 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s brew!' })).toHaveFocus();
    // Its music, and found for the menu.
    expect(playMusic).toHaveBeenCalledWith('shrine');
    expect(save().flags[openedFlag('potion-lab')]).toBe(true);
  });

  it('a band picked is remembered for this kid, and says what the level suggests', () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tricky' }));
    expect(screen.getByRole('button', { name: 'Tricky' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Your Science level \(2\) suggests Gentle/)).toBeInTheDocument();
    expect(rememberedBand('kid-1', 'potion-lab')).toBe('tricky');
  });

  it('Back, and Escape, leave for the map', () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    sendFlow.mockClear();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('in the game, the way out says where it goes: 🗺️ Map', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    const map = screen.getByRole('button', { name: 'Back to the map' });
    expect(map).toHaveTextContent('🗺️Map');
    fireEvent.click(map);
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('a held Enter from the talk doesn’t skip the title card; the band chooser asks “How tricky?”', () => {
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByRole('group', { name: 'How tricky?' })).toBeInTheDocument();
    const play = screen.getByRole('button', { name: 'Let’s brew!' });
    expect(fireEvent.keyDown(play, { key: 'Enter', repeat: true })).toBe(false); // its default (the click) is stopped
    expect(fireEvent.keyDown(play, { key: 'Enter' })).toBe(true);
  });
});

describe('🧪 Potion Lab, a whole round (§5.1)', () => {
  it('a wrong jar is explained and pays its page; the right one fills Fern’s order; the reward shows only what’s new', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(screen.getByText(/Fern wants a Berry Potion that glows pink/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Potion Lab' })).toHaveFocus();

    // Soapy water, guessed pink: it turns blue-green — explained, no order filled.
    await brew(/Soapy water/, 'Pink');
    expect(screen.getByRole('heading', { name: 'It turned blue-green!' })).toHaveFocus();
    expect(screen.getByText('Soapy water is a base. Bases turn cabbage juice blue-green.')).toBeInTheDocument();
    expect(screen.getByText(/Not what you guessed — now you know! New Brew Book page!/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Give it to Fern/ })).toBeNull();
    expect(save().flags[pageFlag('potion-lab', 'soap')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);

    // Lemon, guessed pink: right, and it fills the order.
    fireEvent.click(screen.getByRole('button', { name: 'Try another jar' }));
    await brew(/Lemon juice/, 'Pink');
    expect(screen.getByText(/You guessed right! New Brew Book page!/)).toBeInTheDocument();
    const coins = save().coins;
    const potions = save().items.potion;
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));

    // The reward: star 1, the Berry Potion, the coins and XP — and the page found this round.
    expect(screen.getByRole('heading', { level: 1, name: 'Berry Potion brewed!' })).toHaveFocus();
    expect(screen.getByText('Lemon juice is an acid. Acids turn cabbage juice pink.')).toBeInTheDocument();
    expect(screen.getByText('Added: Soapy water, Lemon juice.')).toBeInTheDocument();
    expect(screen.getByText(/A Berry Potion, in your bag/)).toBeInTheDocument();
    expect(screen.getByText(`⭐ ${2 * MINIGAME_PAGE_XP + MINIGAME_STAR_XP} XP`)).toBeInTheDocument();
    expect(save().flags[starFlag('potion-lab', 1)]).toBe(true);
    expect(save().items.potion).toBe(potions + 1);
    expect(save().coins).toBe(coins + MINIGAME_STAR_COINS);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_STAR_XP);

    // Brew another: the next order. Lemon again pays nothing; a round that pays nothing still counts the day.
    fireEvent.click(screen.getByRole('button', { name: 'Brew another' }));
    await screen.findByText(/Beekeeper Hilda wants a Moss Tonic that glows blue-green/);
    addXp.mockClear();
    await brew(/Lemon juice/, 'Pink');
    expect(screen.queryByText(/New Brew Book page/)).toBeNull();
    expect(addXp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try another jar' }));
    await brew(/Baking soda/, 'Blue-green');
    addXp.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Beekeeper Hilda' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Moss Tonic brewed!' })).toBeInTheDocument();
    expect(screen.getByText('Added: Baking soda.')).toBeInTheDocument();
    expect(addXp).not.toHaveBeenCalledWith(MINIGAME_STAR_XP);
  });

  it('can’t stir before a guess', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Jars on the counter' })).getByRole('button', { name: /Vinegar/ }));
    const stir = screen.getByRole('button', { name: 'Make a guess first' });
    expect(stir).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(stir);
    expect(screen.queryByRole('heading', { name: /It turned/ })).toBeNull();
  });

  it('Medium guesses the kind; Tricky guesses on the five-colour strip and gives the pH', async () => {
    setUp(5);
    const { unmount } = render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(within(screen.getByRole('group', { name: 'Jars on the counter' })).getAllByRole('button')).toHaveLength(9);
    await brew(/Orange juice/, 'Acid');
    expect(screen.getByText(/You guessed right!/)).toBeInTheDocument();
    unmount();

    setUp(9);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(within(screen.getByRole('group', { name: 'Jars on the counter' })).getAllByRole('button')).toHaveLength(12);
    expect(screen.getByText(/Fern wants an Ember Tonic that glows red/)).toBeInTheDocument();
    await brew(/Sea water/, /Blue/);
    expect(screen.getByText(/Sea water is a base, about pH 8\./)).toBeInTheDocument();
  });

  it('Medium’s guesses come with a key from kind to colour', async () => {
    setUp(5);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Jars on the counter' })).getByRole('button', { name: /Lemon juice/ }));
    expect(screen.getByText('Acids → pink · Neutral → purple · Bases → blue-green')).toBeInTheDocument();
  });

  it('the Brew Book says where the pages not on this counter are', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(screen.getByText('6 more pages on Medium and Tricky.')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'A page for Medium' })).toHaveLength(3);
  });

  it('a found Brew Book page is read out by Tadpole', async () => {
    setUp(2, { [pageFlag('potion-lab', 'lemon')]: true });
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByText('Brew Book: 1 of 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Lemon juice: turns it pink. Read the page/ }));
    });
    expect(screen.getAllByText(/Lemons are full of citric acid/).length).toBeGreaterThan(0);
  });

  it('a page read is Tadpole’s line only until the next brew — then he says what happened (review round 1)', async () => {
    setUp(2, { [pageFlag('potion-lab', 'lemon')]: true });
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Jars on the counter' })).getByRole('button', { name: /Baking soda/ }));
    fireEvent.click(screen.getByRole('button', { name: /Lemon juice: turns it pink. Read the page/ }));
    expect(screen.getByText(/Lemons are full of citric acid/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Your guess' })).getByRole('button', { name: 'Blue-green' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
    expect(screen.queryByText(/Lemons are full of citric acid/)).toBeNull();
    expect(screen.getByText(/You guessed it before you saw it/)).toBeInTheDocument();
  });

  it('with every page found, a round that pays nothing says so in a kid’s words', async () => {
    const all = Object.fromEntries(JAR_IDS.flatMap((j) => [[pageFlag('potion-lab', j), true]]));
    setUp(2, { ...all, [starFlag('potion-lab', 1)]: true, [starFlag('potion-lab', 2)]: true, [starFlag('potion-lab', 3)]: true });
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    await brew(/Lemon juice/, 'Pink');
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));
    expect(screen.getByRole('heading', { name: 'Just for fun' })).toBeInTheDocument();
    expect(screen.getByText(/You’ve found every page! Now it’s just for fun/)).toBeInTheDocument();
  });
});
