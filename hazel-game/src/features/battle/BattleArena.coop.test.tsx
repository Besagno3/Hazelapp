import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { BattleEnemy, Kid, Profile, Question, QuestionSeat } from '../../types';

/** A question whose right answer is `right` (first) and wrong ones follow it. */
const question = (id: string, text: string, right: string, wrong: string[]): Question => ({
  id, topic: 'math', level: 3, text, options: [right, ...wrong], correctIndex: 0,
});
// Each player's pools, told apart by their answers.
const ADA = question('ada-1', 'What is 2 + 2?', '4', ['5', '6', '7']);
const MIA = question('mia-1', 'What is 30 + 30?', '60', ['61', '62', '63']);
const ADA_HARD = question('ada-s', 'What is 12 × 12?', '144', ['145', '146', '147']);
const MIA_HARD = question('mia-s', 'What is 25 × 25?', '625', ['626', '627', '628']);

// The pools by who they're for (`seat`) and flavour; each call is kept to see what was asked.
type Opts = { seat?: QuestionSeat; off?: boolean } | undefined;
const { calls, share } = vi.hoisted(() => ({ calls: [] as unknown[][], share: { on: false } }));
vi.mock('../../hooks/useBattleQuestions', () => ({
  useBattleQuestions: (...args: unknown[]) => {
    calls.push(args);
    const flavor = args[3] as string | undefined;
    const opts = args[4] as Opts;
    // `share`: Player 2's batch holds the hero's question too (a guest at the kid's own level).
    const mia = flavor === 'spell' ? [MIA_HARD] : share.on ? [ADA, MIA] : [MIA];
    const questions = opts?.off ? [] : opts?.seat ? mia : flavor === 'spell' ? [ADA_HARD] : [ADA];
    return { questions, loading: false, error: null, reload: () => {} };
  },
}));
vi.mock('./BattleIntro', async () => {
  const { useEffect } = await import('react');
  return {
    BattleIntro: ({ onDone }: { onDone: () => void }) => {
      useEffect(() => onDone(), [onDone]);
      return null;
    },
  };
});
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  // No answer shuffling: the right one stays first.
  shuffleAnswers: <T,>(x: T) => x,
  fetchQuestions: () => new Promise(() => {}),
}));
const { markSeen } = vi.hoisted(() => ({ markSeen: vi.fn() }));
vi.mock('../../lib/seen', () => ({ markSeen }));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
vi.mock('../../machines/gameFlow', () => ({ sendFlow: vi.fn() }));

const { default: BattleArena } = await import('./BattleArena');
const { combatState, useBattleStore } = await import('../../store/battleStore');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { useFamilyStore } = await import('../../store/familyStore');
const { usePlayerTwoStore } = await import('../../store/playerTwoStore');
const { defaultSave } = await import('../../lib/save');
const { EMBER_HATCHED } = await import('../../content/story');
const { SPELL_LEVEL_BONUS } = await import('../../content/spells');
const { defeatXp } = await import('../../lib/battleMath');
const { npcDefeatXp } = await import('../../lib/level');

const enemy = {
  id: 'count-bat', instanceId: 'e1', name: 'Count Bat', sprite: '🦇', level: 3, maxHp: 500,
  topic: 'math', zoneId: 'numbria', isBoss: false, coins: 10,
} as BattleEnemy;
const kid = (id: string, name: string, icon: string, birthYear: number): Kid => ({ id, name, icon, hasPin: true, birthYear, birthMonth: 1 });
const addXp = vi.fn();
const setSkillLevel = vi.fn();
const MIA_KID = { kind: 'kid' as const, id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 1, skillLevels: { math: 5 } };

function start({ hatched = true, coop = true, hp = 500, charge = 0 } = {}) {
  const save = defaultSave();
  useSaveStore.setState({
    userId: null,
    save: { ...save, avatarId: 'a1', flags: hatched ? { ...save.flags, [EMBER_HATCHED]: true } : save.flags },
    status: 'ready',
    remoteError: null,
  });
  useFamilyStore.setState({ kids: [kid('kid-1', 'Ada', 'panda', 2019), kid('kid-2', 'Mia', 'fox', 2014)], activeKidId: 'kid-1' });
  usePlayerTwoStore.setState({ playerTwo: MIA_KID, coop, loading: false });
  useBattleStore.getState().reset();
  useBattleStore.getState().start({ ...enemy, maxHp: hp }, 100, 100);
  if (charge) useBattleStore.getState().applyCombat({ ...combatState(), charge });
  render(<BattleArena />);
}

/** Taps through message boxes until `what` shows (or gives up). */
function readOnTo(what: RegExp | string) {
  for (let i = 0; i < 10 && !screen.queryByText(what); i++) {
    const next = screen.queryByText(/tap to continue/);
    if (!next) break;
    fireEvent.click(next);
  }
  return screen.getByText(what);
}

/** Picks an answer and goes on. */
function answer(text: string) {
  fireEvent.click(screen.getByRole('button', { name: text }));
  fireEvent.click(screen.getByText('▶ Go!'));
}

const asker = () => screen.getByTestId('coop-asker').textContent;

beforeEach(() => {
  calls.length = 0;
  share.on = false;
  markSeen.mockClear();
  addXp.mockClear();
  setSkillLevel.mockClear();
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: 2019, birthMonth: 1, skillLevels: { math: 3 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null } as Profile,
    addXp,
    setSkillLevel,
    recordActivity: vi.fn(),
  });
});

describe('👥 co-op battles (#178)', () => {
  it("alone, nothing changes: Player 2's pools are off and the enemy follows the hero", () => {
    start({ coop: false });
    expect(calls.filter((c) => (c[4] as Opts)?.seat === undefined && (c[4] as Opts)?.off).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('coop-chip')).toBeNull();
    expect(screen.getByText('Your move!')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Attack'));
    answer('4');
    readOnTo(/answer to block/);
    expect(screen.queryByTestId('partner-menu')).toBeNull();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it("Player 2's questions are asked for as them, at their own level (and super-hard, for Pair Attacks)", () => {
    start();
    const seats = calls.map((c) => [c[2], c[3], (c[4] as Opts)?.seat] as const).filter(([, , seat]) => seat);
    const mia = expect.objectContaining({ kid: 'kid-2', age: 12, skillLevel: 5 });
    expect(seats).toContainEqual([5, undefined, mia]);
    expect(seats).toContainEqual([5 + SPELL_LEVEL_BONUS, 'spell', mia]);
  });

  it('a guest plays at the fight’s level moved by their pace, asked for as the kid playing', () => {
    usePlayerTwoStore.setState({ playerTwo: { kind: 'guest', name: 'Dad', pace: 'harder' } });
    useFamilyStore.setState({ kids: [kid('kid-1', 'Ada', 'panda', 2019)], activeKidId: 'kid-1' });
    const save = defaultSave();
    useSaveStore.setState({ save: { ...save, avatarId: 'a1', flags: { ...save.flags, [EMBER_HATCHED]: true } }, status: 'ready' });
    useBattleStore.getState().reset();
    useBattleStore.getState().start(enemy, 100, 100);
    usePlayerTwoStore.setState({ coop: true });
    render(<BattleArena />);
    const seat = calls.map((c) => (c[4] as Opts)?.seat).find(Boolean);
    expect(seat).toEqual(expect.objectContaining({ kid: null, age: 7, skillLevel: 5 }));
    expect(screen.getByTestId('coop-chip')).toHaveTextContent('🐼 Ada + 🙂 Dad');
  });

  it("each round: Ada's move, then Mia's companion move with her own question, then the enemy — blocked in turn", () => {
    start();
    expect(screen.getByTestId('coop-chip')).toHaveTextContent('👥 🐼 Ada + 🦊 Mia');
    expect(screen.getByText("Ada's move!")).toBeInTheDocument();
    // The companion is Mia's now: not one of Ada's commands.
    const ember = screen.getByRole('button', { name: /Ember/ });
    expect(ember).toBeDisabled();
    expect(ember).toHaveTextContent('🦊 Mia plays next');

    fireEvent.click(screen.getByText('Attack'));
    expect(asker()).toBe("🐼 Ada's question");
    answer('4');
    readOnTo(/Mia's turn/);
    const menu = screen.getByTestId('partner-menu');
    expect(within(menu).queryByText('← Back')).toBeNull();
    fireEvent.click(within(menu).getAllByRole('button')[0]);
    expect(asker()).toBe("🦊 Mia's question");
    expect(screen.getByText('What is 30 + 30?')).toBeInTheDocument();
    expect(markSeen).toHaveBeenCalledWith('mia-1', 'kid-2');
    answer('60');
    // The enemy's first blow: Ada blocks it.
    readOnTo(/answer to block/);
    expect(asker()).toBe("🐼 Ada's question");
    answer('4');
    readOnTo("Ada's move!");
    // Round two: the next blow is Mia's to block.
    fireEvent.click(screen.getByText('Guard'));
    answer('4');
    readOnTo(/Mia's turn/);
    fireEvent.click(within(screen.getByTestId('partner-menu')).getAllByRole('button')[0]);
    answer('60');
    readOnTo(/answer to block/);
    expect(asker()).toBe("🦊 Mia's question");
    expect(screen.getByText('What is 30 + 30?')).toBeInTheDocument();
  });

  it("Mia never gets the question the hero's pool holds, though her batch has it", () => {
    share.on = true;
    start();
    fireEvent.click(screen.getByText('Guard'));
    answer('4');
    readOnTo(/Mia's turn/);
    fireEvent.click(within(screen.getByTestId('partner-menu')).getAllByRole('button')[0]);
    expect(screen.getByText('What is 30 + 30?')).toBeInTheDocument();
    expect(screen.queryByText('What is 2 + 2?')).toBeNull();
  });

  it('Player 2 is locked for the fight: a new pick, or levels read late, change nothing until the next one', () => {
    start();
    const seatsBefore = calls.length;
    act(() => usePlayerTwoStore.setState({ playerTwo: { ...MIA_KID, skillLevels: { math: 9 } } }));
    act(() => usePlayerTwoStore.setState({ playerTwo: { kind: 'guest', name: 'Dad', pace: 'easier' } }));
    const later = calls.slice(seatsBefore).map((c) => (c[4] as Opts)?.seat).filter(Boolean);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((seat) => seat!.kid === 'kid-2' && seat!.skillLevel === 5)).toBe(true);
    expect(screen.getByTestId('coop-chip')).toHaveTextContent('🦊 Mia');
    expect(screen.getByText("Ada's move!")).toBeInTheDocument();
  });

  it("only Ada's answers count for her: XP, level and Library — the result shows both players", () => {
    // Ada guards (a miss), Mia's strike wins (a 1-HP critter).
    start({ hp: 1 });
    fireEvent.click(screen.getByText('Guard'));
    answer('5');
    readOnTo(/Mia's turn/);
    fireEvent.click(within(screen.getByTestId('partner-menu')).getAllByRole('button')[0]);
    answer('60');
    readOnTo('Victory!');
    expect(screen.getByTestId('team-line')).toHaveTextContent('🐼 Ada 0 right · 🦊 Mia 1 right');
    expect(screen.getByText(/0 correct answers/)).toBeInTheDocument();
    // The win's own XP only: Ada answered nothing right, and Mia's right answer isn't hers.
    expect(addXp).toHaveBeenCalledTimes(1);
    expect(addXp).toHaveBeenCalledWith(defeatXp(npcDefeatXp(enemy.level), enemy.tier));
    // Ada's miss goes to her Library; Mia's question never does.
    expect(useSaveStore.getState().save!.library.map((e) => e.question.id)).toEqual(['ada-1']);
    // The battle ramp never lowers a level, and Ada got none right: hers stays.
    expect(setSkillLevel).not.toHaveBeenCalled();
  });

  it('a Pair Attack takes both: Mia first, then Ada — both right, it fires', () => {
    start({ charge: 2 });
    fireEvent.click(screen.getByText('Guard'));
    answer('4');
    readOnTo(/Mia's turn/);
    fireEvent.click(screen.getByRole('button', { name: /Twin Strike/ }));
    expect(asker()).toBe("🦊 Mia's question");
    expect(screen.getByText(/Twin Strike — Mia first!/)).toBeInTheDocument();
    answer('625');
    expect(asker()).toBe("🐼 Ada's question");
    expect(screen.getByText(/Now finish Twin Strike!/)).toBeInTheDocument();
    answer('144');
    expect(readOnTo(/unleash Twin Strike/)).toBeInTheDocument();
  });

  it("…and a miss from either fizzles it, the charge safe — Ada isn't asked after Mia's miss", () => {
    start({ charge: 2 });
    fireEvent.click(screen.getByText('Guard'));
    answer('4');
    readOnTo(/Mia's turn/);
    fireEvent.click(screen.getByRole('button', { name: /Twin Strike/ }));
    answer('626');
    expect(screen.getByText(/falls out of step/)).toBeInTheDocument();
    expect(screen.queryByText('What is 12 × 12?')).toBeNull();
    expect(combatState().charge).toBeGreaterThanOrEqual(2);
  });

  it('with Ember still an egg, Mia cheers: right, +1 ◆ on top of the answer’s', () => {
    start({ hatched: false });
    fireEvent.click(screen.getByText('Guard'));
    answer('5');
    readOnTo(/Mia's turn/);
    expect(screen.getByText(/cheer Valor on/)).toBeInTheDocument();
    const before = combatState().charge;
    fireEvent.click(screen.getByRole('button', { name: /Cheer Valor on/ }));
    expect(screen.getByText(/Answer to cheer Valor on/)).toBeInTheDocument();
    answer('60');
    expect(combatState().charge).toBe(before + 2);
    expect(screen.getByText(/Mia cheers Valor on/)).toBeInTheDocument();
  });
});
