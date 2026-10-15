import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PathTarget } from '../../types';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: KeyGateOverlay } = await import('./KeyGateOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { ZONES, gateFlag, gateIdAt } = await import('../../content/zones');
const { keyFlag } = await import('../../content/keys');

function gateOf(zoneId: 'chorus-isle' | 'sunken-archive'): PathTarget {
  const z = ZONES[zoneId];
  return { kind: 'keygate', id: gateIdAt(zoneId, z.map, z.keyGate!.x, z.keyGate!.y), topic: z.topic!, zoneId };
}
function withFlags(flags: Record<string, boolean>) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
}
const A = keyFlag('chorus-a');
const B = keyFlag('chorus-b');

beforeEach(() => withFlags({}));

describe('KeyGateOverlay — the double gate on Chorus Isle (#75 item 15g)', () => {
  it('with neither key: two locks, both keys and both wardens named, no way to open it', () => {
    render(<KeyGateOverlay target={gateOf('chorus-isle')} />);
    expect(screen.getByText('A sealed gate')).toBeInTheDocument();
    const body = document.body.textContent!;
    expect(body).toMatch(/This gate has two locks\. You need both Chorus Keys/);
    expect(body).toMatch(/the Compass Golem \(the Wayfinder Isles\)/);
    expect(body).toMatch(/the Riddle Leviathan \(Inkwell Cove\)/);
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull();
  });

  it('with one key: that one fits, the other is named — still shut', () => {
    withFlags({ [A]: true });
    render(<KeyGateOverlay target={gateOf('chorus-isle')} />);
    const body = document.body.textContent!;
    expect(body).toMatch(/The First Chorus Key 🎹 fits one lock!/);
    expect(body).toMatch(/The other needs the Second Chorus Key 🎶/);
    expect(body).toMatch(/the Riddle Leviathan \(Inkwell Cove\)/);
    expect(body).toMatch(/🎹🔒/); // the held key beside the lock still shut
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull();
  });

  it('with both: both keys fit, and the gate opens', () => {
    withFlags({ [A]: true, [B]: true });
    const target = gateOf('chorus-isle');
    render(<KeyGateOverlay target={target} />);
    expect(screen.getByText('Both keys fit!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use both keys' }));
    expect(useSaveStore.getState().save!.flags[gateFlag(target.id)]).toBe(true);
  });

  it('a one-key gate reads as before — the Memoria Key fits the silver door', () => {
    withFlags({ [keyFlag('memoria')]: true });
    render(<KeyGateOverlay target={gateOf('sunken-archive')} />);
    expect(screen.getByText('The Memoria Key fits!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use the Memoria Key' })).toBeInTheDocument();
  });
});
