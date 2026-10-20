import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));

const { default: DialogueOverlay } = await import('./DialogueOverlay');
const { BattleResult } = await import('../battle/BattleResult');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { litFlag } = await import('../../content/zones');
const { fieldSpellFlag } = await import('../../content/fieldSpells');

function withFlags(flags: Record<string, boolean>) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
}

/** Every line the NPC says, reading on with ▼ Next. */
function readAll(): string {
  const said: string[] = [];
  for (let i = 0; i < 10; i++) {
    said.push(document.querySelector('p')!.textContent ?? '');
    const next = screen.queryByText('▼ Next');
    if (!next) break;
    fireEvent.click(next);
  }
  return said.join('\n');
}

beforeEach(() => {
  sendFlow.mockClear();
  withFlags({});
});

describe('innkeepers (#75 item 11 review)', () => {
  it('offer 🛏️ Rest from the very first line — the news from the road can wait', () => {
    render(<DialogueOverlay npcId="numbria-innkeeper" />);
    expect(screen.getByText('▼ Next')).toBeInTheDocument();
    fireEvent.click(screen.getByText('🛏️ Rest'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'OPEN_SERVICE', service: 'inn', npcId: 'numbria-innkeeper' });
  });

  it("other services still wait for the last line (a shrine keeper's trial follows its story)", () => {
    render(<DialogueOverlay npcId="wayfarer-keeper" />);
    expect(screen.getByText('▼ Next')).toBeInTheDocument();
    expect(screen.queryByText('🕯️ Take the trial')).toBeNull();
  });

  it('rumors about a place lit or a spell learned go quiet once it is done', () => {
    render(<DialogueOverlay npcId="hub-innkeeper" />);
    expect(readAll()).toMatch(/Echo Mine/);
  });
  it('…the mine, once Glow has lit it', () => {
    withFlags({ [litFlag('echo-mine')]: true });
    render(<DialogueOverlay npcId="hub-innkeeper" />);
    expect(readAll()).not.toMatch(/Echo Mine/);
  });
  it('…and Old Wren, once Glow is learned', () => {
    withFlags({ [fieldSpellFlag('glow')]: true });
    render(<DialogueOverlay npcId="verdara-innkeeper" />);
    expect(readAll()).not.toMatch(/Old Wren/);
  });
});

describe('the defeat screen names where you wake, and why there', () => {
  // A defeat screen never shows the enemy, so a stand-in will do.
  const props = {
    result: 'defeat' as const,
    enemy: {} as never,
    crystalName: '',
    correctCount: 0,
    xp: 0,
    coins: 0,
    lucky: false,
    firstWin: false,
    drop: null,
    onLeave: () => {},
  };
  it('at the last inn rested at', () => {
    render(<BattleResult {...props} wakeInn="the Square Root Inn in Numbria" />);
    expect(screen.getByText(/back to the Square Root Inn in Numbria, where you last rested/)).toBeInTheDocument();
    expect(screen.getByText('To the inn')).toBeInTheDocument();
  });
  it('or home', () => {
    render(<BattleResult {...props} />);
    expect(screen.getByText(/home to Lumina Village/)).toBeInTheDocument();
    expect(screen.getByText('Back home')).toBeInTheDocument();
  });
});

describe("Old Marlow rows the boat home (#75 item 14)", () => {
  async function marlowWithBoatAt(boat: { zoneId: 'silver-shallows' | 'dawnreach'; x: number; y: number }) {
    const { BOAT_MENDED } = await import('../../content/boat');
    useSaveStore.setState({
      userId: null,
      save: { ...defaultSave(), flags: { [BOAT_MENDED]: true }, boat },
      status: 'ready',
      remoteError: null,
    });
    render(<DialogueOverlay npcId="coast-fisher" />);
  }

  it('after his own lines, offers when the boat is out at sea — and only rows her home if asked', async () => {
    const { BOAT_HOME, boatSpot } = await import('../../content/boat');
    await marlowWithBoatAt({ zoneId: 'silver-shallows', x: 3, y: 22 });
    const said = readAll();
    expect(said).toMatch(/still out in the Silver Shallows\? Don't fret/);
    // Saying bye leaves her where she is…
    expect(screen.getByText('⛵ Row her home')).toBeInTheDocument();
    fireEvent.click(screen.getByText('⛵ Row her home'));
    // …the button brings her back, and he says so.
    expect(boatSpot(useSaveStore.getState().save!)).toEqual(BOAT_HOME);
    expect(screen.getByText(/tied up at my dock again/)).toBeInTheDocument();
    expect(screen.queryByText('⛵ Row her home')).toBeNull();
    fireEvent.click(screen.getByText('Bye!'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('once ⛵ Row her home has gone from under focus, focus goes on to Bye! — and Escape still says Bye (#110o r1, #159 r2)', async () => {
    await marlowWithBoatAt({ zoneId: 'silver-shallows', x: 3, y: 22 });
    while (screen.queryByText('▼ Next')) fireEvent.click(screen.getByText('▼ Next'));
    const row = screen.getByText('⛵ Row her home');
    row.focus();
    fireEvent.click(row);
    // Not the box (its description, his new line, is said by the live region already): the way out.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bye!' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bye!' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it("closing without asking leaves the boat where it is; one moored right by his dock is home already", async () => {
    const { boatSpot } = await import('../../content/boat');
    await marlowWithBoatAt({ zoneId: 'dawnreach', x: 60, y: 56 });
    expect(readAll()).toMatch(/moored along the coast/);
    fireEvent.click(screen.getByText('Bye!'));
    expect(boatSpot(useSaveStore.getState().save!)).toEqual({ zoneId: 'dawnreach', x: 60, y: 56 });
  });
});

describe("Miner Mabel and Moss's Moonstone (#75 item 13 review)", () => {
  const offered = 'quest:hermit-moonstone:offered';
  const handedOver = 'quest-item:moonstone:handed-over';
  it('points to the nook while the quest is on — not before it, not once the stone is cut', () => {
    withFlags({ [offered]: true, [litFlag('echo-mine')]: true });
    const { unmount } = render(<DialogueOverlay npcId="mine-miner" />);
    expect(readAll()).toMatch(/little nook up the left-hand tunnel/);
    unmount();
    withFlags({ [litFlag('echo-mine')]: true });
    const before = render(<DialogueOverlay npcId="mine-miner" />);
    expect(readAll()).not.toMatch(/Moonstone/);
    before.unmount();
    withFlags({ [offered]: true, [handedOver]: true, [litFlag('echo-mine')]: true });
    render(<DialogueOverlay npcId="mine-miner" />);
    expect(readAll()).not.toMatch(/left-hand tunnel/);
  });
});

describe("a tale-stone's riddle (#75 item 15e)", () => {
  const onReef = (flags: Record<string, boolean>) =>
    useSaveStore.setState({ userId: null, save: { ...defaultSave(), zoneId: 'story-reef', flags }, status: 'ready', remoteError: null });

  it('on its turn, the last line asks the riddle — a words question for that step', () => {
    onReef({ 'quest:yarn-tale:offered': true });
    render(<DialogueOverlay npcId="reef-stone-1" />);
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('📜 Hear the question'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'OPEN_PATH', target: { kind: 'riddle', id: 'yarn-stone-1', topic: 'words', zoneId: 'story-reef' } });
    expect(useSaveStore.getState().save!.flags['quest-step:yarn-stone-1']).toBeUndefined();
  });

  it('"Later" walks away without asking', () => {
    onReef({ 'quest:yarn-tale:offered': true });
    render(<DialogueOverlay npcId="reef-stone-1" />);
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('Later'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    expect(sendFlow).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_PATH' }));
  });
});

describe("Umbra Remembered (#75 item 16e)", () => {
  it('his last line offers 🌑 Answer Umbra, which opens the finale', () => {
    withFlags({ 'root-heart-reached': true, 'name-learned': true, 'met-umbra-remembered': true });
    render(<DialogueOverlay npcId="umbra-remembered" />);
    fireEvent.click(screen.getByText('▼ Next'));
    // Focused, so Enter through the talk opens the finale rather than closing it (16e review round 4).
    expect(screen.getByRole('button', { name: '🌑 Answer Umbra' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '🌑 Answer Umbra' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'OPEN_SERVICE', service: 'name', npcId: 'umbra-remembered' });
  });
});

describe("a step through a service NPC (#75 item 15f: Shush's letter to Librarian Sage)", () => {
  it('pressing 📚 Library on the last line still hands the letter over and takes the reply', () => {
    useSaveStore.setState({
      userId: null,
      save: { ...defaultSave(), zoneId: 'lumina-village', questItems: ['shush-letter'], flags: { 'quest:shush-letters:offered': true } },
      status: 'ready',
      remoteError: null,
    });
    render(<DialogueOverlay npcId="hub-librarian" />);
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('📚 Library'));
    const save = useSaveStore.getState().save!;
    expect(save.questItems).toEqual(['sage-letter']);
    expect(save.flags['quest-step:shush-deliver']).toBe(true);
    expect(sendFlow).toHaveBeenCalledWith({ type: 'OPEN_SERVICE', service: 'library', npcId: 'hub-librarian' });
  });
});

describe('One More Name (#75 item 16b): the dog\'s name is the hero\'s to choose', () => {
  it('ends on one button per name; the one picked sticks, with the Dog Badge', () => {
    const done = { 'act4-seen': true, 'quest:unnamed-dog:offered': true, 'quest-step:dog-wick': true, 'quest-step:dog-lumen': true, 'quest-step:dog-prim': true };
    withFlags(done);
    render(<DialogueOverlay npcId="memory-dog" />);
    fireEvent.click(screen.getByText('▼ Next'));
    expect(screen.queryByText('🎉 Thanks!')).toBeNull();
    expect(screen.getByText('🥒 Pickles')).toBeInTheDocument();
    expect(screen.getByText('🎩 Sir Wigglesworth')).toBeInTheDocument();
    // No name is focused: a stray Enter can't pick one (16b review round 1).
    expect(['🥒 Pickles', '⚓ Captain', '🎩 Sir Wigglesworth']).not.toContain(document.activeElement?.textContent);
    fireEvent.click(screen.getByText('⚓ Captain'));
    const save = useSaveStore.getState().save!;
    expect(save.flags['dog-named-captain']).toBe(true);
    expect(save.flags['dog-named-pickles']).toBeUndefined();
    expect(save.flags['quest:unnamed-dog:done']).toBe(true);
    expect(save.badges).toContain('dog-badge');
    // Then the dog's answer and the reward, before the box closes.
    expect(screen.getByText(/Captain it is!.*Dog Badge/)).toBeInTheDocument();
    expect(sendFlow).not.toHaveBeenCalledWith({ type: 'CLOSE' });
    // In talk he's Captain now (the box's name and header follow the pick).
    expect(screen.getByRole('dialog', { name: 'Captain' })).toBeInTheDocument();
    // Thanks isn't focused, so a held Enter can't close the reply unread (16b review round 2).
    expect(document.activeElement?.textContent).not.toBe('🎉 Thanks!');
    // …but → reaches it, so a keyboard player isn't stuck (16b review round 4).
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('🎉 Thanks!');
    fireEvent.click(screen.getByText('🎉 Thanks!'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('the arrow keys move between the names, from none focused (16b review round 3)', () => {
    withFlags({ 'act4-seen': true, 'quest:unnamed-dog:offered': true, 'quest-step:dog-wick': true, 'quest-step:dog-lumen': true, 'quest-step:dog-prim': true });
    render(<DialogueOverlay npcId="memory-dog" />);
    fireEvent.click(screen.getByText('▼ Next'));
    expect(screen.getByText(/\(Pick one!\)/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('🥒 Pickles');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('⚓ Captain');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(document.activeElement?.textContent).toBe('Later');
  });

  it('can be put off: Later closes without choosing', () => {
    withFlags({ 'act4-seen': true, 'quest:unnamed-dog:offered': true, 'quest-step:dog-wick': true, 'quest-step:dog-lumen': true, 'quest-step:dog-prim': true });
    render(<DialogueOverlay npcId="memory-dog" />);
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('Later'));
    expect(useSaveStore.getState().save!.flags['quest:unnamed-dog:done']).toBeUndefined();
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });
});

describe("a line in the kid's own hand: pen-pal replies (#165 item 9)", async () => {
  const { useKeyboardStore } = await import('../../store/keyboardStore');
  const { PEN_PALS, charKey, penPalReplyFlag, typingLessonFlag } = await import('../../content/typing');
  const pal = PEN_PALS[0];
  const atTheLibrarian = (flags: Record<string, boolean>, typingAnchor = false) =>
    useSaveStore.setState({
      userId: null,
      save: { ...defaultSave(), zoneId: 'lumina-village', questItems: ['shush-letter'], typingAnchor, flags: { 'quest:shush-letters:offered': true, ...flags } },
      status: 'ready',
      remoteError: null,
    });
  const capitals = { [typingLessonFlag('capitals')]: true };

  it('Librarian Sage offers it on the last line with a keyboard and the capitals lesson; a line picked and typed hands the letter over with the kid\'s line in it', async () => {
    useKeyboardStore.getState().reset();
    useKeyboardStore.getState().seen();
    atTheLibrarian(capitals);
    render(<DialogueOverlay npcId="hub-librarian" />);
    expect(screen.queryByText('✍️ Add a line of my own')).toBeNull();
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('✍️ Add a line of my own'));
    expect(screen.getByTestId('pen-pal')).toHaveTextContent(pal.offer);
    fireEvent.click(screen.getByText(`✍️ ${pal.replies[1]}`));
    expect(screen.getByText(`Type: ${pal.replies[1]}`)).toBeInTheDocument();
    // The task is read to a screen reader (review round 4), and "Maybe not" is a step away.
    await waitFor(() => expect(screen.getByTestId('pen-pal')).toHaveTextContent(`Type this: ${pal.replies[1]}`));
    expect(screen.getByText('Maybe not')).toBeInTheDocument();
    for (const ch of pal.replies[1]) {
      const found = charKey(ch)!;
      fireEvent.keyDown(window, { code: found.key.code, key: ch });
      fireEvent.keyUp(window, { code: found.key.code, key: ch });
    }
    // The envelope after the line's beat (review round 4): the last key never lands on "Got it!", and the
    // buttons beside the line are out of reach meanwhile (round 5).
    expect(screen.queryByText('✨ Got it!')).toBeNull();
    expect(screen.getByText('Maybe not')).toBeDisabled();
    expect(screen.getByText('Pick another line')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('pen-pal')).toHaveTextContent(pal.written));
    const save = useSaveStore.getState().save!;
    expect(save.questItems).toEqual(['sage-letter']);
    expect(save.flags['quest-step:shush-deliver']).toBe(true);
    expect(save.flags[penPalReplyFlag(pal.questId, 1)]).toBe(true);
    expect(sendFlow).not.toHaveBeenCalledWith({ type: 'CLOSE' });
    fireEvent.click(screen.getByText('✨ Got it!'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('📚 Library beside the offer leaves the step for next time, and is the quieter button (review round 6)', () => {
    useKeyboardStore.getState().reset();
    useKeyboardStore.getState().seen();
    atTheLibrarian(capitals);
    render(<DialogueOverlay npcId="hub-librarian" />);
    fireEvent.click(screen.getByText('▼ Next'));
    const library = screen.getByText('📚 Library');
    expect(library.className).not.toMatch(/amber/);
    fireEvent.click(library);
    expect(sendFlow).toHaveBeenCalledWith({ type: 'OPEN_SERVICE', service: 'library', npcId: 'hub-librarian' });
    const save = useSaveStore.getState().save!;
    expect(save.flags['quest-step:shush-deliver']).toBeUndefined();
    expect(save.questItems).toEqual(['shush-letter']);
  });

  it('a kid who reads on with Enter finds nothing focused beside the offer (review round 3)', () => {
    useKeyboardStore.getState().reset();
    useKeyboardStore.getState().seen();
    atTheLibrarian(capitals);
    render(<DialogueOverlay npcId="hub-librarian" />);
    const next = screen.getByText('▼ Next');
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(screen.getByText('✍️ Add a line of my own')).toBeInTheDocument();
    expect(document.activeElement?.tagName).not.toBe('BUTTON');
  });

  it('Escape is "Maybe not" while picking or typing, and "Got it!" once the envelope is sealed (#110o)', async () => {
    useKeyboardStore.getState().reset();
    useKeyboardStore.getState().seen();
    atTheLibrarian(capitals);
    render(<DialogueOverlay npcId="hub-librarian" />);
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('✍️ Add a line of my own'));
    fireEvent.click(screen.getByText(`✍️ ${pal.replies[0]}`));
    expect(screen.getByText(`Type: ${pal.replies[0]}`)).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByTestId('pen-pal')).toBeNull();
    expect(screen.getByText('✨ Got it!')).toBeInTheDocument();
    expect(sendFlow).not.toHaveBeenCalledWith({ type: 'CLOSE' });
    fireEvent.click(screen.getByText('✍️ Add a line of my own'));
    fireEvent.click(screen.getByText(`✍️ ${pal.replies[0]}`));
    for (const ch of pal.replies[0]) {
      const found = charKey(ch)!;
      fireEvent.keyDown(window, { code: found.key.code, key: ch });
      fireEvent.keyUp(window, { code: found.key.code, key: ch });
    }
    await waitFor(() => expect(screen.getByTestId('pen-pal')).toHaveTextContent(pal.written));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('no offer without a keyboard or before the capitals lesson; "Maybe not" goes back to the letter', () => {
    useKeyboardStore.getState().reset();
    atTheLibrarian(capitals);
    const first = render(<DialogueOverlay npcId="hub-librarian" />);
    fireEvent.click(screen.getByText('▼ Next'));
    expect(screen.queryByText('✍️ Add a line of my own')).toBeNull();
    first.unmount();
    useKeyboardStore.getState().seen();
    atTheLibrarian({});
    const second = render(<DialogueOverlay npcId="hub-librarian" />);
    fireEvent.click(screen.getByText('▼ Next'));
    expect(screen.queryByText('✍️ Add a line of my own')).toBeNull();
    second.unmount();
    atTheLibrarian(capitals);
    render(<DialogueOverlay npcId="hub-librarian" />);
    fireEvent.click(screen.getByText('▼ Next'));
    fireEvent.click(screen.getByText('✍️ Add a line of my own'));
    fireEvent.click(screen.getByText('Maybe not'));
    expect(screen.getByText('✨ Got it!')).toBeInTheDocument();
    expect(useSaveStore.getState().save!.questItems).toEqual(['shush-letter']);
  });

  it("back at Shush, the kid's line is read out before the reward", () => {
    useSaveStore.setState({
      userId: null,
      save: {
        ...defaultSave(),
        zoneId: 'quiet-quarter',
        questItems: ['sage-letter'],
        flags: { 'quest:shush-letters:offered': true, 'quest-step:shush-deliver': true, [penPalReplyFlag(pal.questId, 2)]: true },
      },
      status: 'ready',
      remoteError: null,
    });
    render(<DialogueOverlay npcId="quiet-shush" />);
    const said = readAll();
    expect(said).toContain(pal.read(pal.replies[2]));
    expect(said.indexOf(pal.replies[2])).toBeLessThan(said.indexOf('Reward'));
  });
});

describe('a screen reader hears each new line on ▼ Next (#142)', () => {
  it('the line is a polite live region read whole, and ▼ Next changes its words in place', () => {
    render(<DialogueOverlay npcId="hub-innkeeper" />);
    const line = document.querySelector('p')!;
    expect(line).toHaveAttribute('aria-live', 'polite');
    expect(line).toHaveAttribute('aria-atomic', 'true');
    const first = line.textContent;
    fireEvent.click(screen.getByText('▼ Next'));
    // The same region with new words — that's what gets read out.
    expect(document.querySelector('p')).toBe(line);
    expect(line.textContent).not.toBe(first);
  });

  it('the first line, often the only one, is heard too: a live region says nothing of what it opened with (#142 r1)', () => {
    render(<DialogueOverlay npcId="hub-innkeeper" />);
    const line = document.querySelector('p')!;
    const box = screen.getByRole('dialog');
    expect(box).toHaveAccessibleDescription(line.textContent!);
    expect(box.contains(document.activeElement)).toBe(true);
  });
});

describe("Escape takes the box's own way out, and nothing more (#110o)", () => {
  const escape = () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

  it('mid-talk it does nothing (there is no way out but reading on); on a plain talk\'s last line it says Bye', () => {
    render(<DialogueOverlay npcId="hub-innkeeper" />);
    const first = document.querySelector('p')!.textContent;
    escape();
    expect(sendFlow).not.toHaveBeenCalled();
    expect(document.querySelector('p')!.textContent).toBe(first);
    while (screen.queryByText('▼ Next')) fireEvent.click(screen.getByText('▼ Next'));
    escape();
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    // …and never a service: the inn's 🛏️ Rest stays a click away.
    expect(sendFlow).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_SERVICE' }));
  });

  it('never takes on a quest: an offer\'s last line ignores it', () => {
    render(<DialogueOverlay npcId="dawnreach-hermit" />);
    while (screen.queryByText('▼ Next')) fireEvent.click(screen.getByText('▼ Next'));
    expect(screen.getByText("I'm on it!")).toBeInTheDocument();
    escape();
    expect(sendFlow).not.toHaveBeenCalled();
    expect(useSaveStore.getState().save!.flags['quest:hermit-moonstone:offered']).toBeUndefined();
  });

  it('on a choice it is Later — no name picked', () => {
    withFlags({ 'act4-seen': true, 'quest:unnamed-dog:offered': true, 'quest-step:dog-wick': true, 'quest-step:dog-lumen': true, 'quest-step:dog-prim': true });
    render(<DialogueOverlay npcId="memory-dog" />);
    fireEvent.click(screen.getByText('▼ Next'));
    escape();
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    expect(useSaveStore.getState().save!.flags['quest:unnamed-dog:done']).toBeUndefined();
  });

  it('on a tale-stone it is Later — the riddle is never asked', () => {
    useSaveStore.setState({ userId: null, save: { ...defaultSave(), zoneId: 'story-reef', flags: { 'quest:yarn-tale:offered': true } }, status: 'ready', remoteError: null });
    render(<DialogueOverlay npcId="reef-stone-1" />);
    fireEvent.click(screen.getByText('▼ Next'));
    escape();
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    expect(sendFlow).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_PATH' }));
  });
});
