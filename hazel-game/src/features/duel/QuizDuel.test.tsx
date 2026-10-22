import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import type { Kid } from '../../types';

// The question service, stood in for at the wire: each request gets five
// questions named for who they were asked for and at what level
// ("kid-2 L5 #0"), the first option right. The same kid and level get the same
// five — as a guest playing at the kid's own level would.
type Body = { profileId?: string; skillLevel: number; count: number; cacheOnly?: boolean };
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke } } }));
const questionsFor = (b: Body) =>
  Array.from({ length: b.count }, (_, i) => {
    const id = `${b.profileId} L${b.skillLevel} #${i}`;
    return { id, level: b.skillLevel, text: `${id}?`, options: [`Right ${id}`, `Wrong ${id}`], correctIndex: 0, explanation: '', timesAsked: 0 };
  });

// Player 2's levels (read only), and what's marked seen for whom.
const { readKidPlay, markSeen, sendFlow } = vi.hoisted(() => ({ readKidPlay: vi.fn(), markSeen: vi.fn(), sendFlow: vi.fn() }));
vi.mock('../../lib/playerTwo', async (orig) => ({ ...(await orig<typeof import('../../lib/playerTwo')>()), readKidPlay }));
vi.mock('../../lib/seen', () => ({ markSeen }));
// A sister's XP, to her own game (stood in for: `lib/kidXp` has its own tests).
const { giveKidXp } = vi.hoisted(() => ({ giveKidXp: vi.fn() }));
vi.mock('../../lib/kidXp', async (orig) => ({ ...(await orig<typeof import('../../lib/kidXp')>()), giveKidXp }));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
vi.mock('../../machines/gameFlow', async (orig) => ({ ...(await orig<typeof import('../../machines/gameFlow')>()), sendFlow }));
// Answers never need shuffling here: the right one stays first.
vi.mock('../../lib/questions', async (orig) => {
  const real = await orig<typeof import('../../lib/questions')>();
  return { ...real, shuffleAnswers: <T,>(x: T) => x };
});

const { default: QuizDuel } = await import('./QuizDuel');
const { useFamilyStore } = await import('../../store/familyStore');
const { useProfileStore } = await import('../../store/profileStore');
const { usePlayerTwoStore } = await import('../../store/playerTwoStore');
const { clearCarried } = await import('../../lib/questions');
const { SWITCH_CONFIRM_GAP_MS } = await import('../auth/SwitchPlayerButton');
const { forgetAllLocks } = await import('../../lib/pinLock');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');

const kid = (id: string, name: string, icon: string, birthYear: number): Kid => ({ id, name, icon, hasPin: true, birthYear, birthMonth: 1 });
// Mia's PIN is 4821 (the database's verdict, stood in for).
const checkKidPin = vi.fn(async (_id: string, pin: string) => ({ ok: pin === '4821', triesLeft: 4, waitSeconds: 0, limited: true }));
const pinLocks = vi.fn(async () => null);
const addXp = vi.fn();
const setSkillLevel = vi.fn();
const recordActivity = vi.fn();
/** The bodies the question service was asked with. */
const asked = () => invoke.mock.calls.map((c) => c[1].body as Body);

beforeEach(() => {
  shown = '';
  invoke.mockReset();
  invoke.mockImplementation(async (_name: string, { body }: { body: Body }) => ({ data: { questions: questionsFor(body) }, error: null }));
  readKidPlay.mockReset();
  readKidPlay.mockResolvedValue({ skillLevels: { math: 5 }, powerUps: {}, worldOpen: true });
  markSeen.mockClear();
  sendFlow.mockClear();
  addXp.mockClear();
  setSkillLevel.mockClear();
  recordActivity.mockClear();
  giveKidXp.mockReset();
  giveKidXp.mockResolvedValue({ saved: true, level: 4, leveledUp: false });
  // Ada's world is open: she earns XP (#122).
  useSaveStore.setState({ save: { ...defaultSave(), worldUnlocked: true } });
  clearCarried();
  usePlayerTwoStore.getState().clear();
  // Ada (7, math level 3) is playing; Mia (12) is her sister.
  checkKidPin.mockClear();
  forgetAllLocks();
  useFamilyStore.setState({
    userId: 'parent-1',
    kids: [kid('kid-1', 'Ada', 'panda', 2019), kid('kid-2', 'Mia', 'fox', 2014)],
    activeKidId: 'kid-1',
    checkKidPin,
    pinLocks,
  });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: 2019, birthMonth: 1, skillLevels: { math: 3 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp,
    setSkillLevel,
    recordActivity,
  });
});

/** Types a PIN on the pad. */
async function typePin(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

/** Taps Mia's tile and types her PIN. */
async function pickMia() {
  fireEvent.click(screen.getByRole('button', { name: /Mia/ }));
  await typePin('4821');
  await waitFor(() => expect(usePlayerTwoStore.getState().playerTwo).toMatchObject({ kind: 'kid', id: 'kid-2' }));
}

/** Picks Mia as Player 2 and Math. */
async function startWithMia() {
  render(<QuizDuel />);
  await pickMia();
  await waitFor(() => expect(usePlayerTwoStore.getState().loading).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Math/ }));
}

/** The question on screen now (the last one may still be sliding out). */
let shown = '';

/** Answers this turn's question right or wrong, then taps Next. */
async function play(right: boolean) {
  const question = await waitFor(() => {
    const h = screen.getAllByRole('heading', { level: 3 }).find((x) => x.textContent !== shown && !x.closest('[inert]'));
    if (!h) throw new Error('no new question yet');
    return h;
  });
  const id = question.textContent!.replace(/\?$/, '');
  shown = question.textContent!;
  fireEvent.click(screen.getByRole('button', { name: `${right ? 'Right' : 'Wrong'} ${id}` }));
  fireEvent.click(screen.getByRole('button', { name: /Next: |See who won/ }));
  return id;
}

describe('🆚 Quiz Duel — picking Player 2 (#186)', () => {
  it("offers the family's other kids and a guest — never the kid playing — and the topics once picked", async () => {
    render(<QuizDuel />);
    expect(screen.getByRole('heading', { name: /Quiz Duel/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Who's playing with Ada?" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mia/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /Ada/ })).toBeNull();
    expect(screen.getByRole('button', { name: /A friend or grown-up/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a topic' })).toBeNull();
    expect(screen.getByText('Family players earn XP for right answers. Question levels stay as they are, and guests play just for fun.')).toBeInTheDocument();

    await pickMia();
    expect(screen.getByRole('button', { name: /Mia/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: 'Pick a topic' })).toBeInTheDocument();
    expect(readKidPlay).toHaveBeenCalledWith('kid-2');
  });

  it("a sister types her own PIN first: the pad asks her by name, the topics wait, a wrong PIN picks nobody", async () => {
    usePlayerTwoStore.getState().chooseGuest('Dad', 'same');
    render(<QuizDuel />);
    expect(screen.getByRole('heading', { name: 'Pick a topic' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mia/ }));
    const pad = screen.getByTestId('player-two-pin');
    expect(pad).toHaveTextContent("Hi, Mia! Type your PIN.");
    expect(screen.getByText(/Hi, Mia!/)).toHaveFocus();
    // The guest is still picked, but the topics wait until Mia is in.
    expect(screen.queryByRole('heading', { name: 'Pick a topic' })).toBeNull();
    await typePin('1111');
    expect(checkKidPin).toHaveBeenLastCalledWith('kid-2', '1111');
    expect(await screen.findByText(/Not quite — try again!/)).toBeInTheDocument();
    expect(usePlayerTwoStore.getState().playerTwo).toMatchObject({ kind: 'guest', name: 'Dad' });
    expect(readKidPlay).not.toHaveBeenCalled();
    await typePin('4821');
    await waitFor(() => expect(usePlayerTwoStore.getState().playerTwo).toMatchObject({ kind: 'kid', id: 'kid-2' }));
    expect(screen.queryByTestId('player-two-pin')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Pick a topic' })).toBeInTheDocument();
  });

  it('"That\'s not me" goes back to the tiles with nobody new picked', async () => {
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /Mia/ }));
    fireEvent.click(screen.getByRole('button', { name: "← That's not me" }));
    expect(screen.queryByTestId('player-two-pin')).toBeNull();
    expect(screen.getByRole('button', { name: /Mia/ })).toHaveAttribute('aria-pressed', 'false');
    expect(usePlayerTwoStore.getState().playerTwo).toBeNull();
  });

  it('a check that answers after "That\'s not me" picks nobody', async () => {
    let answer!: (v: { ok: boolean; triesLeft: number; waitSeconds: number; limited: boolean }) => void;
    checkKidPin.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /Mia/ }));
    await typePin('4821');
    fireEvent.click(screen.getByRole('button', { name: "← That's not me" }));
    await act(async () => answer({ ok: true, triesLeft: 5, waitSeconds: 0, limited: true }));
    expect(usePlayerTwoStore.getState().playerTwo).toBeNull();
  });

  it('a kid with no PIN yet is picked straight away', async () => {
    useFamilyStore.setState({ kids: [kid('kid-1', 'Ada', 'panda', 2019), { ...kid('kid-2', 'Mia', 'fox', 2014), hasPin: false }] });
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /Mia/ }));
    expect(screen.queryByTestId('player-two-pin')).toBeNull();
    expect(usePlayerTwoStore.getState().playerTwo).toMatchObject({ kind: 'kid', id: 'kid-2' });
  });

  it("a guest gets a name box and how tricky — against the kid playing's level", () => {
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /A friend or grown-up/ }));
    expect(screen.getByRole('textbox', { name: /Their name/ })).toHaveAttribute('maxLength', '20');
    const group = screen.getByRole('group', { name: 'How tricky should their questions be?' });
    expect(within(group).getByRole('button', { name: /Same as Ada/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: /Harder/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Their name/ }), { target: { value: 'Dad' } });
    expect(usePlayerTwoStore.getState().playerTwo).toEqual({ kind: 'guest', name: 'Dad', pace: 'harder' });
    expect(screen.getByText("Their questions are written for Ada's age.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pick a topic' })).toBeInTheDocument();
  });

  it("the topics wait while a kid's levels are read", async () => {
    let answer!: (levels: object) => void;
    readKidPlay.mockReturnValue(new Promise((r) => (answer = r)));
    render(<QuizDuel />);
    await pickMia();
    const math = screen.getByRole('button', { name: /Math/ });
    expect(math).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(math);
    expect(screen.queryByRole('heading', { name: /turn/ })).toBeNull();
    answer({ skillLevels: { math: 5 }, powerUps: {}, worldOpen: true });
    await waitFor(() => expect(math).toHaveAttribute('aria-disabled', 'false'));
  });

  it('Back goes to the Training Grounds', () => {
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: '← Back to the Training Grounds' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'EXIT_DUEL' });
  });
});

describe('🆚 Quiz Duel — playing (#186)', () => {
  it('each player gets questions asked for as them, at their own level', async () => {
    await startWithMia();
    await screen.findByRole('heading', { name: /Ada's turn/ });
    // Ada as the kid playing at her level 3; Mia as herself at her level 5 (the server pitches to her age).
    expect(asked()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profileId: 'kid-1', skillLevel: 3 }),
        expect.objectContaining({ profileId: 'kid-2', skillLevel: 5 }),
      ]),
    );
    expect(screen.getByText('Math · Lvl 3')).toBeInTheDocument();
  });

  it('turns go Ada, Mia, Ada… with the score and whose turn on the board, and each question seen by its player', async () => {
    await startWithMia();
    expect(await play(true)).toBe('kid-1 L3 #0');
    expect(markSeen).toHaveBeenCalledWith('kid-1 L3 #0', undefined);
    const turn = await screen.findByRole('heading', { name: /Mia's turn/ });
    // The new turn takes the focus: the Next just tapped is gone.
    expect(turn).toHaveFocus();
    expect(screen.getByText('Math · Lvl 5')).toBeInTheDocument();
    expect(within(screen.getByTestId('duel-score-0')).getByText('1 right')).toBeInTheDocument();
    // Whose turn: a thick ring on screen, and said to a screen reader.
    expect(screen.getByTestId('duel-score-1')).toHaveTextContent('Mia0 right · their turn');
    expect(screen.getByTestId('duel-score-0')).not.toHaveTextContent('their turn');
    expect(await play(false)).toBe('kid-2 L5 #0');
    expect(markSeen).toHaveBeenCalledWith('kid-2 L5 #0', 'kid-2');
    await screen.findByRole('heading', { name: /Ada's turn/ });
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('Next names who goes next; a second tap never skips a player', async () => {
    await startWithMia();
    const question = await screen.findByRole('heading', { level: 3 });
    fireEvent.click(screen.getByRole('button', { name: `Right ${question.textContent!.replace(/\?$/, '')}` }));
    expect(screen.getByText('✅ Right!')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: "Next: Mia's turn →" });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(await screen.findByRole('heading', { name: /Mia's turn/ })).toBeInTheDocument();
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  it('a guest at the same level never gets a question the kid playing had (their batches are the same five)', async () => {
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /A friend or grown-up/ }));
    fireEvent.click(screen.getByRole('button', { name: /Math/ }));
    const ids = [];
    for (let t = 0; t < 5; t++) ids.push(await play(true));
    expect(new Set(ids).size).toBe(5);
    // Both asked for as Ada, at her level — the guest plays under the kid playing (B8).
    expect(asked().every((b) => b.profileId === 'kid-1' && b.skillLevel === 3)).toBe(true);
    expect(screen.getAllByText(/Guest/).length).toBeGreaterThan(0);
  });

  it('a guest who picked Harder plays two levels above the kid', async () => {
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /A friend or grown-up/ }));
    fireEvent.click(screen.getByRole('button', { name: /Harder/ }));
    fireEvent.click(screen.getByRole('button', { name: /Math/ }));
    await screen.findByRole('heading', { name: /Ada's turn/ });
    expect(asked()).toEqual(expect.arrayContaining([expect.objectContaining({ profileId: 'kid-1', skillLevel: 5 })]));
  });

  it('End duel takes two taps, then back to picking players', async () => {
    await startWithMia();
    await screen.findByRole('heading', { name: /Ada's turn/ });
    fireEvent.click(screen.getByRole('button', { name: 'End duel' }));
    expect(screen.getByRole('heading', { name: /Ada's turn/ })).toBeInTheDocument();
    const again = screen.getByRole('button', { name: 'Tap again to end the duel' });
    await new Promise((r) => setTimeout(r, SWITCH_CONFIRM_GAP_MS + 20));
    fireEvent.click(again);
    expect(screen.getByRole('heading', { name: "Who's playing with Ada?" })).toBeInTheDocument();
    // Player 2 is remembered for the next duel, and isn't asked for her PIN again.
    expect(screen.getByRole('button', { name: /Mia/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Mia/ }));
    expect(screen.queryByTestId('player-two-pin')).toBeNull();
    expect(checkKidPin).toHaveBeenCalledTimes(1);
  });
});

describe('🆚 Quiz Duel — the results (#186)', () => {
  it('the most right answers wins: the winner, both scores, the XP earned, what each missed — and no levels move', async () => {
    await startWithMia();
    for (let t = 0; t < 10; t++) await play(t % 2 === 0);
    const title = await screen.findByRole('heading', { name: 'Ada wins!' });
    expect(title).toHaveFocus();
    expect(screen.getByText('5 to 0. Great try, Mia!')).toBeInTheDocument();
    expect(within(screen.getByTestId('duel-score-0')).getByText('5 right')).toBeInTheDocument();
    expect(within(screen.getByTestId('duel-score-1')).getByText('0 right')).toBeInTheDocument();
    expect(screen.getByText('What Mia missed (5)')).toBeInTheDocument();
    expect(screen.queryByText(/What Ada missed/)).toBeNull();
    // Ada: 5 right bank answers × 10 XP. Mia earned none, so nothing is written to her game.
    expect(addXp).toHaveBeenCalledTimes(1);
    expect(addXp).toHaveBeenCalledWith(50);
    expect(within(screen.getByRole('list', { name: 'XP earned' })).getByText(/Ada: \+50 XP/)).toBeInTheDocument();
    expect(giveKidXp).not.toHaveBeenCalled();
    expect(setSkillLevel).not.toHaveBeenCalled();
  });

  it("a sister's right answers are XP in her own game — saving, then saved (a new level said)", async () => {
    let saved!: (r: { saved: true; level: number; leveledUp: boolean }) => void;
    giveKidXp.mockReturnValue(new Promise((r) => (saved = r)));
    await startWithMia();
    for (let t = 0; t < 10; t++) await play(t % 2 === 1);
    expect(await screen.findByRole('heading', { name: 'Mia wins!' })).toBeInTheDocument();
    expect(giveKidXp).toHaveBeenCalledTimes(1);
    expect(giveKidXp).toHaveBeenCalledWith('kid-2', 50);
    const xp = screen.getByRole('list', { name: 'XP earned' });
    expect(within(xp).getByText(/Mia: \+50 XP/)).toBeInTheDocument();
    expect(within(xp).getByText('Saving…')).toBeInTheDocument();
    // Ada earned none, but a duel is a day played.
    expect(addXp).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledTimes(1);
    await act(async () => saved({ saved: true, level: 4, leveledUp: true }));
    expect(within(xp).getByText('⭐ Mia reached level 4!')).toBeInTheDocument();
  });

  it("XP that can't be saved now is kept for next time, and said so", async () => {
    giveKidXp.mockResolvedValue({ saved: false });
    await startWithMia();
    for (let t = 0; t < 10; t++) await play(true);
    expect(await screen.findByText("It'll be added the next time Mia plays on this device.")).toBeInTheDocument();
  });

  it("before a kid's world opens, XP starts there — said instead of a number (#122)", async () => {
    useSaveStore.setState({ save: { ...defaultSave(), worldUnlocked: false } });
    readKidPlay.mockResolvedValue({ skillLevels: { math: 5 }, powerUps: {}, worldOpen: false });
    await startWithMia();
    for (let t = 0; t < 10; t++) await play(true);
    expect(await screen.findByRole('heading', { name: "It's a tie!" })).toBeInTheDocument();
    expect(screen.getByText('XP starts for Ada once Ada opens the world.')).toBeInTheDocument();
    expect(screen.getByText('XP starts for Mia once Mia opens the world.')).toBeInTheDocument();
    expect(addXp).not.toHaveBeenCalled();
    expect(giveKidXp).not.toHaveBeenCalled();
  });

  it('a guest earns nothing, and nothing is said for them', async () => {
    render(<QuizDuel />);
    fireEvent.click(screen.getByRole('button', { name: /A friend or grown-up/ }));
    // Harder: their own batch, two levels up (at Ada's level they'd share her five).
    fireEvent.click(screen.getByRole('button', { name: /Harder/ }));
    fireEvent.click(screen.getByRole('button', { name: /Math/ }));
    for (let t = 0; t < 10; t++) await play(true);
    expect(await screen.findByRole('heading', { name: "It's a tie!" })).toBeInTheDocument();
    expect(addXp).toHaveBeenCalledWith(50);
    expect(giveKidXp).not.toHaveBeenCalled();
    expect(within(screen.getByRole('list', { name: 'XP earned' })).queryByText(/Guest/)).toBeNull();
  });

  it('the same score is a tie; Rematch plays again from 0', async () => {
    await startWithMia();
    for (let t = 0; t < 10; t++) await play(true);
    expect(await screen.findByRole('heading', { name: "It's a tie!" })).toBeInTheDocument();
    expect(screen.getByText('You both got 5 right. What a match!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '🔁 Rematch' }));
    expect(await screen.findByRole('heading', { name: /Ada's turn/ })).toBeInTheDocument();
    expect(screen.getByTestId('duel-score-0')).toHaveTextContent('Ada0 right · their turn');
  });

  it('New players or topic goes back to the pick; Back to the Training Grounds leaves', async () => {
    await startWithMia();
    for (let t = 0; t < 10; t++) await play(t % 2 === 1);
    expect(await screen.findByRole('heading', { name: 'Mia wins!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Training Grounds' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'EXIT_DUEL' });
    fireEvent.click(screen.getByRole('button', { name: 'New players or topic' }));
    expect(screen.getByRole('heading', { name: "Who's playing with Ada?" })).toBeInTheDocument();
  });
});
