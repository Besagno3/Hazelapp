import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
