import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Reduced motion: no zoom, so a round plays straight through.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
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
// A step's buttons always ready here (the wait after a step starts is tested with Mirror Mural's: useSettled).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { default: EmberAirMail } = await import('./EmberAirMail');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { STAMP_BY_ID, jobFor, learnedLine, roundQueue } = await import('../../../lib/minigames/airmail');
type Band = import('../../../content/minigames').Band;
type Dir = import('../../../lib/minigames/airmail').Dir;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { geography: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp,
    recordActivity,
  });
}

beforeEach(() => {
  addXp.mockClear();
  recordActivity.mockClear();
  setUp(2);
});

const save = () => useSaveStore.getState().save!;
const pidge = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
/** The line by the map: what Pidge said last, or, before a move, how to find the place. */
const line = () => document.querySelector('p.min-h-\\[4\\.1rem\\]')?.textContent ?? '';
const mapOfBay = () => screen.getByRole('group', { name: 'The map of the bay' });
const WORD: Record<Dir, string> = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const fly = (...dirs: Dir[]) => dirs.forEach((d) => fireEvent.click(screen.getByRole('button', { name: `Fly ${WORD[d]}` })));
const deliver = () => fireEvent.click(screen.getByRole('button', { name: /Deliver/ }));

function play(band: Band, round = 0, page = true) {
  const onPage = vi.fn(() => page);
  const onFinish = vi.fn();
  render(<EmberAirMail def={MINIGAMES['ember-air-mail']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** Gentle's three parcels from the post office (the lighthouse, the farm, the castle), each flown and delivered. */
const GENTLE_ROUTES: Dir[][] = [
  ['N', 'E', 'E'],
  ['S', 'S', 'W'],
  ['N', 'N', 'W', 'W'],
];

describe('🐉 the title card', () => {
  it('names the game, Pidge’s hello and the stamp album', () => {
    render(<MiniGameStage game="ember-air-mail" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ember Air Mail' })).toBeInTheDocument();
    expect(screen.getByText('Stamp album: 0 of 9')).toBeInTheDocument();
    expect(screen.getByText(/only one dragon fast enough/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s fly!' })).toHaveFocus();
  });
});

describe('🐉 Ember Air Mail, a round (docs/DESIGN-MINIGAMES.md §5.9)', () => {
  it('Gentle: the bay, four directions; each move said; the wrong place said kindly, which way to go; delivered → its stamp; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const job = jobFor('gentle', 0, 0, queue);
    expect(job).toMatchObject({ to: 'lighthouse', stamp: 'letter' });
    // Focus on the map — in the Tab order too — said by the clue, where Ember is and where the parcel's going (code review
    // round 1: a reader heard only where Ember was); the parcel's label; four compass buttons.
    const map = mapOfBay();
    expect(map).toHaveFocus();
    expect(map).toHaveAttribute('tabindex', '0');
    expect(map).toHaveAccessibleDescription('A letter for the lighthouse. Ember is at the post office. The lighthouse is 1 square north and 2 east. The arrow keys fly Ember too.');
    expect(document.getElementById('am-clue')).toHaveTextContent('A letter for the lighthouse.');
    expect(pidge()).toContain('A letter for the lighthouse. Can you see it on the map?');
    // By the map till the first move: how to find the place (UX review round 1: on a phone, Pidge's words were below the fold).
    expect(line()).toBe('Find the lighthouse’s picture on the map, then steer Ember there.');
    expect(screen.getAllByRole('button', { name: /^Fly / })).toHaveLength(4);
    // The map's key names its pictures (UX and code review round 1).
    expect(screen.getByRole('heading', { name: 'Map key' })).toBeInTheDocument();

    fly('N');
    expect(pidge()).toContain('North! Ember’s over the fields.');
    expect(line()).toBe('North! Ember’s over the fields.');
    // Delivered in the wrong place: where she is, and which way (Gentle's lesson: at once).
    deliver();
    expect(pidge()).toContain('Nobody’s waiting here. The lighthouse is 2 squares east.');
    expect(line()).toBe('Nobody’s waiting here. The lighthouse is 2 squares east.');
    fly('E', 'E');
    // There: what to do now (UX review round 2).
    expect(pidge()).toContain('East! Ember’s at the lighthouse. Now tap Deliver!');
    deliver();
    const head = screen.getByRole('heading', { name: 'Letter delivered!' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription(`${learnedLine(job, ['N', 'E', 'E'])} The letter stamp is in the album!`);
    expect(onPage).toHaveBeenCalledWith('letter', 'Letter');
    expect(pidge()).toContain('Coo! Right on target! Next parcel?');

    // The next parcel starts back at the post office, its route fresh — the map described without the clue Pidge has just
    // said (UX review round 2: a reader heard it twice).
    fireEvent.click(screen.getByRole('button', { name: 'Next parcel' }));
    expect(mapOfBay()).toHaveAccessibleDescription('Ember is at the post office. The farm is 2 squares south and 1 west. The arrow keys fly Ember too.');
    for (const i of [1, 2]) {
      fly(...GENTLE_ROUTES[i]);
      deliver();
      if (i < 2) fireEvent.click(screen.getByRole('button', { name: 'Next parcel' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'All delivered!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'The sack’s empty!', learned: learnedLine(jobFor('gentle', 0, 2, queue), GENTLE_ROUTES[2]) });
  });

  it('off the map’s edge: a bump and a word, and Ember stays; the arrow keys fly her too', () => {
    play('gentle');
    fly('N', 'N');
    fly('N');
    expect(pidge()).toContain('Ember can’t fly off the edge of the map — try another way.');
    // The same words again are read again (code review round 1: a second bump said nothing).
    const once = pidge();
    fly('N');
    expect(pidge()).not.toBe(once);
    expect(pidge().replace(/\u200b/g, '')).toBe(once.replace(/\u200b/g, ''));
    const map = mapOfBay();
    expect(map).toHaveAccessibleDescription(/Ember is at the woods\./);
    fireEvent.keyDown(map, { key: 'ArrowLeft' });
    expect(pidge()).toContain('West! Ember’s over the fields.');
    // Held down, one square (code review round 1: its repeats flew on).
    fireEvent.keyDown(map, { key: 'ArrowLeft', repeat: true });
    expect(map).toHaveAccessibleDescription(/Ember is over the fields\./);
    fireEvent.keyDown(map, { key: 'ArrowLeft' });
    expect(map).toHaveAccessibleDescription(/Ember is at the castle\./);
    // A held Enter on a compass button presses it once.
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Fly east' }), { key: 'Enter', repeat: true })).toBe(false);
  });

  it('a square tapped: next to Ember, she flies there; Ember or a square further, how to fly her — never nothing (UX review round 1)', () => {
    play('gentle');
    const map = mapOfBay();
    const squares = map.firstElementChild as HTMLElement;
    // The bay: 5 × 5 squares of 40 px.
    squares.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const tap = (x: number, y: number) => {
      fireEvent.pointerDown(squares, { clientX: x * 40 + 20, clientY: y * 40 + 20, button: 0, pointerType: 'touch' });
      fireEvent.pointerUp(squares, { clientX: x * 40 + 20, clientY: y * 40 + 20, button: 0, pointerType: 'touch' });
    };
    tap(2, 1);
    expect(pidge()).toContain('North! Ember’s over the fields.');
    tap(2, 1);
    expect(pidge()).toContain('That’s Ember! Tap the compass arrows to fly her.');
    tap(4, 4);
    expect(pidge()).toContain('Ember flies one square at a time — tap a square next to her, or the compass: north, east, south, west.');
    // A corner: next to her, but not on Gentle's compass (UX and code review round 2: it said to tap one next to her).
    tap(3, 0);
    expect(pidge()).toContain('No corners on this compass — north, east, south or west, one square at a time.');
    tap(3, 1);
    expect(map).toHaveAccessibleDescription(/Ember is over the fields\./);
    expect(pidge()).toContain('East! Ember’s over the fields.');
  });

  it('Medium: the town, eight directions, its squares named; a house found from a landmark, a wrong square said by its name', () => {
    setUp(5);
    const { onPage } = play('medium');
    const job = jobFor('medium', 0, 0, roundQueue('medium', () => false, 0));
    expect(job).toMatchObject({ to: { x: 1, y: 0 }, by: 'landmark' });
    expect(document.getElementById('am-clue')).toHaveTextContent('A seed packet for the house just east of the castle.');
    expect(pidge()).toContain('Find the castle first, then look east of it.');
    // On a phone, how to find it by the map (UX review round 1: below the fold).
    expect(line()).toBe('Find the castle first, then look east of it.');
    expect(screen.getAllByRole('button', { name: /^Fly / })).toHaveLength(8);
    const map = screen.getByRole('group', { name: 'The map of the town, squares A1 to F6' });
    expect(map).toHaveAccessibleDescription(/Ember is over D3, at the post office\. The castle is at A6\./);
    fly('NW');
    expect(pidge()).toContain('North-west! Ember’s over C4.');
    // The first wrong delivery: how to find it; the second, which way (UX review round 1).
    deliver();
    expect(pidge()).toContain('That’s C4. Find the castle first, then look east of it.');
    deliver();
    // Medium's lesson is the eight directions: the diagonal first (UX review round 2).
    expect(pidge()).toContain('That’s C4. The house is 1 square north-west, then 1 north.');
    fly('NW', 'N');
    expect(map).toHaveAccessibleDescription(/Ember is over B6, at a house\./);
    deliver();
    expect(screen.getByRole('heading', { name: 'Seed packet delivered!' })).toHaveAccessibleDescription(/^The house was at B6: B along, 6 up\. Ember flew 2 squares north-west, then 1 north\./);
    expect(onPage).toHaveBeenCalledWith('seeds', 'Seed packet');
    // The next parcel's first wrong delivery says how to find it again (code review round 2: untested).
    fireEvent.click(screen.getByRole('button', { name: 'Next parcel' }));
    fly('N');
    deliver();
    expect(pidge()).toMatch(/That’s D4\. (Find the .+ first, then look .+ of it\.|[A-F]\d is [A-F] along the bottom, then \d up the side\.)/);
  });

  it('Tricky: the world — round the back of it too; delivered, then how far by the map’s scale', () => {
    setUp(9);
    play('tricky');
    const job = jobFor('tricky', 0, 0, roundQueue('tricky', () => false, 0));
    expect(job).toMatchObject({ to: 'antarctica', stamp: 'postcard' });
    const map = screen.getByRole('group', { name: 'The map of the world' });
    // Not named before a try: which place fits the clue is the work (UX review round 2).
    expect(map).toHaveAccessibleDescription('A postcard to the icy continent at the very south of the world. Ember is over Europe. The arrow keys fly Ember too.');
    expect(line()).toBe('Which place fits the clue? Read the names on the map.');
    expect(document.getElementById('am-clue')).toHaveTextContent('A postcard to the icy continent at the very south of the world.');
    // West across the Atlantic and North America, and round the back of the world.
    fly('W', 'W', 'W', 'W');
    expect(map).toHaveAccessibleDescription(/Ember is over North America\./);
    fly('W', 'W', 'W');
    expect(pidge()).toContain('West! Round the back of the world! Ember’s over the Pacific Ocean.');
    fly('E');
    fly('E', 'E', 'E', 'E', 'E', 'E');
    expect(map).toHaveAccessibleDescription(/Ember is over Europe\./);
    fly('S', 'S');
    deliver();
    expect(pidge()).toContain('That’s Africa. Antarctica is the icy one, all along the bottom — find its name on the map.');
    expect(map).toHaveAccessibleDescription(/Antarctica is the icy one, all along the bottom\./);
    deliver();
    expect(pidge()).toContain('That’s Africa. Antarctica is 2 squares south.');
    fly('S', 'S');
    deliver();
    // How far: from Europe in a straight line — 4 squares, though Ember flew 18 (UX review rounds 1 and 2).
    const far = screen.getByRole('heading', { name: 'How far?' });
    expect(far).toHaveFocus();
    expect(document.getElementById('am-far')).toHaveTextContent('On this map each square counts as about 3,000 km. From Europe to Antarctica is about 4 squares in a straight line (the ruler on the map); Ember flew 18.');
    // Pidge just asks: the card has it all (UX review round 2: a reader heard it twice).
    expect(pidge()).toContain('Delivered! Now, by the map’s scale: about how far is it?');
    // A held Enter on a choice picks it once (code review round 2).
    expect(fireEvent.keyDown(screen.getByRole('button', { name: '15,000 km' }), { key: 'Enter', repeat: true })).toBe(false);
    // The line by the map waits for a wrong answer (UX review round 1: the question three times).
    expect(line()).toBe('');
    const choices = screen.getByRole('group', { name: 'About how far?' });
    expect(choices).toHaveTextContent('12,000 km15,000 km18,000 km');
    fireEvent.click(screen.getByRole('button', { name: '15,000 km' }));
    expect(pidge()).toContain('Not quite: it’s 4 squares in a straight line, and each counts as about 3,000 km — so 4 × 3,000.');
    expect(line()).toBe('Not quite: it’s 4 squares in a straight line, and each counts as about 3,000 km — so 4 × 3,000.');
    fireEvent.click(screen.getByRole('button', { name: '12,000 km' }));
    expect(screen.getByRole('heading', { name: 'Postcard delivered!' })).toHaveAccessibleDescription(/From Europe it’s about four squares in a straight line — about 12,000 km by the map’s scale\./);
  });

  it('Tricky: round the back of the world by a tap, and the world’s top a word of its own (code review and UX review round 2)', () => {
    setUp(9);
    play('tricky');
    const map = screen.getByRole('group', { name: 'The map of the world' });
    const squares = map.firstElementChild as HTMLElement;
    // The world: 12 × 6 squares of 20 px.
    squares.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 120, right: 240, bottom: 120, x: 0, y: 0, toJSON() {} }) as DOMRect;
    fly('W', 'W', 'W', 'W', 'W', 'W');
    expect(map).toHaveAccessibleDescription(/Ember is over the Pacific Ocean\./);
    fireEvent.pointerDown(squares, { clientX: 11 * 20 + 10, clientY: 30, button: 0, pointerType: 'touch' });
    fireEvent.pointerUp(squares, { clientX: 11 * 20 + 10, clientY: 30, button: 0, pointerType: 'touch' });
    expect(pidge()).toContain('West! Round the back of the world! Ember’s over the Pacific Ocean.');
    fly('N', 'N');
    expect(pidge()).toContain('That’s the top of the world — Ember can’t fly any further north!');
  });

  it('the album: a stamp read out by Pidge and under the album; stamps not in it come first', () => {
    setUp(2, { [pageFlag('ember-air-mail', 'letter')]: true });
    play('gentle');
    expect(screen.getByText('1 of 9 stamps')).toBeInTheDocument();
    expect(screen.getByText('PARCEL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Letter. Read the stamp' }));
    expect(screen.getAllByText(STAMP_BY_ID.letter.note, { exact: false })).toHaveLength(2);
  });

  it('a stamp delivered again (in the album already) says what was learned, not “in the album”', () => {
    play('gentle', 0, false);
    fly(...GENTLE_ROUTES[0]);
    deliver();
    expect(screen.getByRole('heading', { name: 'Letter delivered!' })).toHaveAccessibleDescription(learnedLine(jobFor('gentle', 0, 0), GENTLE_ROUTES[0]));
    // Not new: not marked so.
    expect(screen.queryByText('New!')).not.toBeInTheDocument();
  });

  it('through the stage: three parcels, the reward, star 1 and a Hint Feather', async () => {
    render(<MiniGameStage game="ember-air-mail" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s fly!' }));
    await screen.findByRole('group', { name: 'The map of the bay' });
    for (const i of [0, 1, 2]) {
      fly(...GENTLE_ROUTES[i]);
      deliver();
      // The stamp just stuck in, marked new (UX review round 1).
      if (i === 0) expect(screen.getByRole('button', { name: 'Letter, new. Read the stamp' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next parcel' : 'All delivered!' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'The sack’s empty!' })).toBeInTheDocument());
    expect(save().flags[starFlag('ember-air-mail', 1)]).toBe(true);
    expect(save().items.hint).toBe(defaultSave().items.hint + 1);
  });
});
