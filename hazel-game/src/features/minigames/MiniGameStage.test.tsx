import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';

// Reduced motion: no zoom and no stir wait, so a round plays straight through.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
// The main tests stand in an always-ready wait (a step's buttons wait a moment as it starts — PotionLab.taps.test).
vi.mock('./useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
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
const { openedFlag, pageFlag, sealFlag, starFlag } = await import('../../content/minigames');
const { MINIGAME_PAGE_XP, MINIGAME_STAR_COINS, MINIGAME_STAR_XP } = await import('../../content/items');
const { rememberedBand, roundsPlayed } = await import('../../lib/minigames');
const { JAR_IDS } = await import('../../lib/minigames/potionLab');

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}, age = 9) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: {
      id: 'kid-1',
      birthYear: new Date().getFullYear() - age,
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
    // The dialog is described by the hello and how to play, so a reader hears them as focus lands on Play.
    expect(screen.getByRole('dialog', { name: 'Potion Lab' })).toHaveAccessibleDescription(/Orders are piling up.*1 · Pour in one jar/);
    expect(screen.getByText(/Stars: your first round · half the Brew Book · the whole Brew Book/)).toBeInTheDocument();
    // Its music, and found for the menu.
    expect(playMusic).toHaveBeenCalledWith('shrine');
    expect(save().flags[openedFlag('potion-lab')]).toBe(true);
  });

  it('a band picked is remembered for this kid, and says what the level suggests', () => {
    const { unmount } = render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tricky' }));
    expect(screen.getByRole('button', { name: 'Tricky' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Your Science level \(2\) suggests Gentle/)).toBeInTheDocument();
    expect(rememberedBand('kid-1', 'potion-lab')).toBe('tricky');
    // …and the stage opens on it next time.
    unmount();
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByRole('button', { name: 'Tricky' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('picking the suggested band again forgets the choice, so the band grows with the level (review round 2)', () => {
    const first = render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gentle' }));
    expect(rememberedBand('kid-1', 'potion-lab')).toBeNull();
    first.unmount();
    setUp(8);
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByRole('button', { name: 'Tricky' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Back, and Escape, leave for the map', () => {
    render(<MiniGameStage game="potion-lab" />);
    const back = screen.getByRole('button', { name: 'Back to the map' });
    expect(back).toHaveTextContent('🗺️ Map');
    fireEvent.click(back);
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
    expect(map).toHaveTextContent('🗺️ Map');
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

describe('the Expert band (§8)', () => {
  it('a teen is offered Expert where the game has it, from the level and the age — said so; a teen’s hello and steps; a game without it shows three', () => {
    // A new 14-year-old: level 6 (a new teen's start, at most), which alone suggests Medium.
    setUp(6, {}, 14);
    const { unmount } = render(<MiniGameStage game="potion-lab" />);
    const bands = within(screen.getByRole('group', { name: 'How tricky?' }));
    expect(bands.getAllByRole('button').map((b) => b.textContent)).toEqual(['Gentle', 'Medium', 'Tricky', 'Expert']);
    expect(bands.getByRole('button', { name: 'Expert' })).toHaveAttribute('aria-pressed', 'true');
    // Where the age lifted it, said so (UX review round 1).
    // Not set against the level, a new teen's start (UX review round 2: "alone suggests Medium" read as a verdict).
    expect(screen.getByText(/^Picked for your age\. Expert: the pH scale in numbers/)).toBeInTheDocument();
    expect(screen.queryByText(/alone suggests/)).toBeNull();
    // Expert's own picture for the guess: no colours (code and UX review round 2).
    expect(document.querySelector('#mg-how circle[fill="#ff5fa8"]')).toBeNull();
    // A teen's hello and steps, the seal in them (UX review round 1: the card greeted a young kid).
    expect(screen.getByText(/Today’s orders come as a pH, counted in tens/)).toBeInTheDocument();
    expect(screen.getByText(/Every pH spot on in a round wins the Expert seal\. No clock\./)).toBeInTheDocument();
    expect(screen.queryByText(/Ribbit! Orders are piling up/)).toBeNull();
    // Another band: its own card, and what age suggests.
    fireEvent.click(bands.getByRole('button', { name: 'Medium' }));
    expect(screen.getByText(/^Expert is suggested for your age\. More jars on Medium and Tricky\./)).toBeInTheDocument();
    expect(document.querySelector('#mg-how circle[fill="#ff5fa8"]')).not.toBeNull();
    expect(screen.getByText(/Ribbit! Orders are piling up/)).toBeInTheDocument();
    unmount();

    render(<MiniGameStage game="ember-air-mail" />);
    const three = within(screen.getByRole('group', { name: 'How tricky?' }));
    expect(three.getAllByRole('button').map((b) => b.textContent)).toEqual(['Gentle', 'Medium', 'Tricky']);
    expect(three.getByRole('button', { name: 'Tricky' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('🧪 Potion Lab on Expert: an order in tens from pure water, the pH guessed as a number; spot on every time, the seal — shown, never paid', async () => {
    setUp(6, {}, 14);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(screen.getByText('Fern needs an Owl Tonic that is a thousand times as acidic as pure water. Which jar?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 1 · Pick a jar' })).toHaveAccessibleDescription(
      'One Owl Tonic that is a thousand times as acidic as pure water. 7 is neutral. Each step down is ten times as acidic; each step up, ten times as alkaline.',
    );
    fireEvent.click(within(screen.getByRole('group', { name: 'Jars on the counter' })).getByRole('button', { name: /Orange juice/ }));
    expect(screen.getByText(/is in\. What’s its pH, 0 to 14\?/)).toBeInTheDocument();
    // Tadpole asks plainly (code review round 1: untested).
    expect(screen.getByText('Orange juice. What’s its pH? Guess, then stir.')).toBeInTheDocument();
    const guesses = within(screen.getByRole('group', { name: 'Your guess' })).getAllByRole('button');
    expect(guesses).toHaveLength(15);
    // The number alone: no glyph over it.
    expect(guesses.map((b) => b.textContent)).toEqual(Array.from({ length: 15 }, (_, n) => String(n)));
    fireEvent.click(screen.getByRole('button', { name: 'pH 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
    expect(screen.getByText(/You said pH 4 — spot on\./)).toBeInTheDocument();
    expect(screen.getByText('Spot on: orange juice is about pH 3–4. That’s what Fern needs.')).toBeInTheDocument();
    expect(screen.getByText('Orange juice is about pH 3–4: three or four steps below 7, so a thousand to ten thousand times as acidic as pure water. A base neutralises it.')).toBeInTheDocument();
    const coins = save().coins;
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));
    expect(within(screen.getByRole('region', { name: 'You got' })).getByText('The Expert seal: spot on every time')).toBeInTheDocument();
    expect(save().flags[sealFlag('potion-lab')]).toBe(true);
    // Never paid: the coins are star 1's alone.
    expect(save().coins).toBe(coins + MINIGAME_STAR_COINS);

    // The next: a miss, then the jar — one of two spot on; the seal held, said so.
    fireEvent.click(screen.getByRole('button', { name: 'Brew another' }));
    await screen.findByText('Beekeeper Hilda needs a Thunder Draught that is a thousand times as alkaline as pure water. Which jar?');
    await brew(/Lemon juice/, 'pH 3');
    // How far in tens there too (UX review round 2).
    expect(screen.getByText(/You said pH 3; it’s about pH 2 — 1 step out: ten times off\./)).toBeInTheDocument();
    // How far, and which way, in tens (UX review round 1) — and which way to look next (round 2).
    expect(screen.getByText('Lemon juice is about pH 2 — one step below your 3: ten times more acidic. Not what Beekeeper Hilda needs — try a more alkaline jar.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try another jar' }));
    // Soapy water: pH 9–12 — 10 is spot on.
    await brew(/Soapy water/, 'pH 10');
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Beekeeper Hilda' }));
    expect(within(screen.getByRole('region', { name: 'What you found out' })).getByText('Spot on: 1 of 2. You won the Expert seal before — it’s yours to keep.')).toBeInTheDocument();
  });

  it('Expert picked over another band suggested still wins the seal (code review round 1: a stale band); spot on again says so, not as new', async () => {
    // An 11-year-old at level 6: Tricky suggested.
    setUp(6, {}, 11);
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByRole('button', { name: 'Tricky' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    await brew(/Tomato juice/, 'pH 5');
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));
    expect(save().flags[sealFlag('potion-lab')]).toBe(true);
    expect(within(screen.getByRole('region', { name: 'You got' })).getByText('The Expert seal: spot on every time')).toBeInTheDocument();
    // The next, spot on first time: the seal again — not in what's new.
    fireEvent.click(screen.getByRole('button', { name: 'Brew another' }));
    await screen.findAllByText(/Thunder Draught/);
    await brew(/Soapy water/, 'pH 12');
    fireEvent.click(screen.getByRole('button', { name: /Give it to/ }));
    expect(screen.getByText('Spot on every time — the Expert seal again.')).toBeInTheDocument();
    expect(screen.queryByText('The Expert seal: spot on every time')).toBeNull();
  });

  it('the seal won shows on the title card, said with the stars; a round on another band says nothing of it', async () => {
    setUp(2, { [sealFlag('potion-lab')]: true });
    render(<MiniGameStage game="potion-lab" />);
    expect(screen.getByText(/The Expert seal: an Expert round spot on every time\./)).toBeInTheDocument();
    // With the stars, for a reader too (code review round 2: untested).
    expect(screen.getByText('and the Expert seal')).toHaveClass('sr-only');
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    await brew(/Lemon juice/, 'Pink');
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));
    expect(screen.queryByText(/Spot on|Expert seal/)).toBeNull();
  });

  it('on Expert, a Brew Book page waits till its jar’s brewed this round — no colour, no kind, no fact (code review rounds 1 and 2: the answer, one tap away)', async () => {
    setUp(6, { [pageFlag('potion-lab', 'orange')]: true, [pageFlag('potion-lab', 'tomato')]: true }, 14);
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    // Tomato's fact said "about pH 4" — the first order's answer.
    fireEvent.click(screen.getByRole('button', { name: 'Tomato juice. Read the page' }));
    expect(screen.getAllByText('Tomato juice: brew it this round to read its page.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/pH \d|turns it|an acid/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Orange juice. Read the page' }));
    expect(screen.queryByText(/about pH 3–4/)).toBeNull();
    await brew(/Orange juice/, 'pH 4');
    fireEvent.click(screen.getByRole('button', { name: /^Orange juice: turns it pink\. Read the page/ }));
    expect(screen.getAllByText(/Orange juice: about pH 3–4 —/).length).toBeGreaterThan(0);
    // Tomato's still waits.
    expect(screen.getByRole('button', { name: 'Tomato juice. Read the page' })).toBeInTheDocument();
  });
});

describe('🧪 Potion Lab, a whole round (§5.1)', () => {
  it('a wrong jar is explained and pays its page; the right one fills Fern’s order; the reward shows only what’s new', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(screen.getByText(/Fern wants a Berry Potion that glows pink/)).toBeInTheDocument();
    // Focus starts at the jars, described by the order (jsdom lays nothing out: the step card's heading, as on a phone).
    const start = screen.getByRole('heading', { name: 'Step 1 · Pick a jar' });
    // The game loads lazily: focus lands as it mounts (review round 2 of PR 2: a flake).
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAccessibleDescription('One Berry Potion that glows pink.');
    expect(screen.getByRole('group', { name: 'Jars on the counter' })).toHaveAccessibleDescription('One Berry Potion that glows pink.')

    // Soapy water, guessed pink: it turns blue-green — explained, no order filled.
    await brew(/Soapy water/, 'Pink');
    expect(screen.getByRole('heading', { name: 'It turned blue-green!' })).toHaveFocus();
    expect(screen.getByText('Soapy water is a base. Bases turn cabbage juice blue-green.')).toBeInTheDocument();
    expect(screen.getByText(/You guessed pink\. Now you know! New Brew Book page!/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Give it to Fern/ })).toBeNull();
    expect(save().flags[pageFlag('potion-lab', 'soap')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);

    // Lemon, guessed pink: right, and it fills the order.
    fireEvent.click(screen.getByRole('button', { name: 'Try another jar' }));
    await brew(/Lemon juice/, 'Pink');
    expect(screen.getByText(/You guessed pink — right! New Brew Book page!/)).toBeInTheDocument();
    const coins = save().coins;
    const potions = save().items.potion;
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));

    // The reward: star 1, the Berry Potion, the coins and XP — and the page found this round.
    expect(screen.getByRole('heading', { level: 1, name: 'Berry Potion brewed!' })).toHaveFocus();
    expect(screen.getByText('Lemon juice is an acid. Acids turn cabbage juice pink.')).toBeInTheDocument();
    // Always "What you found out"; new pages on their own line, since one may not be the jar delivered (review round 2).
    expect(screen.getByRole('heading', { name: 'What you found out' })).toBeInTheDocument();
    expect(screen.getByText('New Brew Book pages: Soapy water, Lemon juice.')).toBeInTheDocument();
    const got = within(screen.getByRole('region', { name: 'You got' }));
    expect(got.getByText(/A Berry Potion from Trader Tadpole, in your bag/)).toBeInTheDocument();
    expect(got.getByText(`${2 * MINIGAME_PAGE_XP + MINIGAME_STAR_XP} XP`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to the map' })).toHaveTextContent('🗺️ Map');
    expect(save().flags[starFlag('potion-lab', 1)]).toBe(true);
    expect(save().items.potion).toBe(potions + 1);
    expect(save().coins).toBe(coins + MINIGAME_STAR_COINS);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_STAR_XP);
    // Noted on this device, so the next visit picks up at the next order (PR 2 review round 2).
    expect(roundsPlayed('kid-1', 'potion-lab')).toBe(1);

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
    expect(screen.getByText('New Brew Book page: Baking soda.')).toBeInTheDocument();
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
    expect(screen.getByText(/You guessed an acid — right!/)).toBeInTheDocument();
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
    // On the ticket from the start, and under the guesses.
    expect(screen.getAllByText('Acids turn it pink, neutral things leave it purple, bases turn it blue-green.')).toHaveLength(2);
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
    expect(screen.getAllByText(/Lemons are full of citric acid/).length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole('group', { name: 'Your guess' })).getByRole('button', { name: 'Blue-green' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
    expect(screen.queryAllByText(/Lemons are full of citric acid/)).toHaveLength(0);
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
    // Nothing paid, but the day counts (§3.4).
    expect(addXp).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledTimes(1);
  });

  it('a Brew Book page read shows under the book, with what the jar does in words (review round 2)', async () => {
    setUp(2, { [pageFlag('potion-lab', 'lemon')]: true });
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    const page = screen.getByRole('button', { name: /Lemon juice: turns it pink. Read the page/ });
    expect(page).toHaveTextContent('Lemon');
    fireEvent.click(page);
    expect(page).toHaveAttribute('aria-pressed', 'true');
    const book = within(screen.getByRole('region', { name: 'Brew Book' }));
    expect(book.getByText(/^Lemon juice turns it pink — it’s an acid\. Lemons are full of citric acid/)).toBeInTheDocument();
  });

  it('a jar in the Brew Book says so on the counter — never its kind, Medium’s very question (review round 2)', async () => {
    setUp(5, { [pageFlag('potion-lab', 'soap')]: true });
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    const counter = within(await screen.findByRole('group', { name: 'Jars on the counter' }));
    expect(counter.getByRole('button', { name: /^Soapy water\s*in your Brew Book$/ })).toBeInTheDocument();
    expect(counter.queryByText(/^(Acid|Base|Neutral)$/)).toBeNull();
  });

  it('on a phone or a short screen the order is in the step card too', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    await screen.findByRole('group', { name: 'Jars on the counter' });
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'For Fern: a Berry Potion that glows pink')).toBeInTheDocument();
  });
});
