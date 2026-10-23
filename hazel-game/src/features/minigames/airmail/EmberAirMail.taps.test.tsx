import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// A double tap (code review round 1: untested — the main tests stand in an always-ready wait): a step's buttons wait a
// moment as it starts, so a second tap on what came under the finger does nothing. The clock is stood in for
// (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: EmberAirMail } = await import('./EmberAirMail');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');

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
const pidge = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const where = () => screen.getByRole('group', { name: /^The map of/ });

describe('🐉 a double tap', () => {
  it('the compass and Deliver pressed as a parcel starts do nothing, nor Next as the stamp’s card comes; a moment later they do', () => {
    render(<EmberAirMail def={MINIGAMES['ember-air-mail']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    press('Fly north');
    press(/Deliver/);
    expect(where()).toHaveAccessibleDescription(/Ember is at the post office\./);
    expect(pidge()).not.toContain('Nobody’s waiting here');
    wait();
    press('Fly north');
    press('Fly east');
    press('Fly east');
    press(/Deliver/);
    expect(screen.getByRole('heading', { name: 'Letter delivered!' })).toBeInTheDocument();
    // The second tap of the double, on Next as it comes: nothing.
    press('Next parcel');
    expect(screen.getByRole('heading', { name: 'Letter delivered!' })).toBeInTheDocument();
    wait();
    press('Next parcel');
    expect(screen.queryByRole('heading', { name: 'Letter delivered!' })).not.toBeInTheDocument();
    // The next parcel's start waits too.
    press('Fly south');
    expect(where()).toHaveAccessibleDescription(/Ember is at the post office\./);
  });

  it('Tricky: a “How far?” choice pressed as it comes does nothing; a moment later it does', () => {
    render(<EmberAirMail def={MINIGAMES['ember-air-mail']} band="tricky" round={0} onPage={() => true} onFinish={() => {}} />);
    wait();
    for (const d of ['south', 'south', 'south', 'south']) press(`Fly ${d}`);
    press(/Deliver/);
    expect(screen.getByRole('heading', { name: 'How far?' })).toBeInTheDocument();
    press('15,000 km');
    expect(pidge()).not.toContain('Not quite');
    wait();
    press('15,000 km');
    expect(pidge()).toContain('Not quite');
    press('12,000 km');
    expect(screen.getByRole('heading', { name: 'Postcard delivered!' })).toBeInTheDocument();
  });
});
