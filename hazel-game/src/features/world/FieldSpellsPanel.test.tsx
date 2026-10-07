import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', () => ({ sendFlow: (...a: unknown[]) => sendFlow(...a) }));

const { default: FieldSpellsPanel } = await import('./FieldSpellsPanel');
const { defaultSave } = await import('../../lib/save');
const { fieldSpellFlag, visitedFlag } = await import('../../content/fieldSpells');
const { litFlag } = await import('../../content/zones');
import type { SaveData } from '../../types';

const knowing = (flags: Record<string, boolean>, zoneId: SaveData['zoneId'] = 'lumina-village'): SaveData => ({
  ...defaultSave(),
  zoneId,
  flags: { ...defaultSave().flags, ...flags },
});
const all = {
  [fieldSpellFlag('return')]: true,
  [fieldSpellFlag('glow')]: true,
  [fieldSpellFlag('calm')]: true,
};

beforeEach(() => sendFlow.mockClear());

describe('FieldSpellsPanel (#75 item 9)', () => {
  it('names the shrine that teaches each spell not learned yet', () => {
    render(<FieldSpellsPanel save={defaultSave()} calmLeft={0} onCast={vi.fn()} />);
    expect(screen.getByText("Learn it at Wayfarer's Shrine.")).toBeInTheDocument();
    expect(screen.getByText('Learn it at the Shrine of First Light.')).toBeInTheDocument();
    expect(screen.getByText('Learn it at the Shrine of Quiet Paws.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Return offers the towns you have been to; the one you are in is greyed out', () => {
    const onCast = vi.fn();
    render(<FieldSpellsPanel save={knowing({ ...all, [visitedFlag('numbria')]: true })} calmLeft={0} onCast={onCast} />);
    expect(screen.getByRole('button', { name: /Lumina Village \(here\)/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Verdara/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Numbria' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    expect(onCast).toHaveBeenCalledWith({ spell: 'return', to: 'numbria' });
  });

  it('Glow casts only in a dark place that is not lit yet', () => {
    const onCast = vi.fn();
    const { unmount } = render(<FieldSpellsPanel save={knowing(all)} calmLeft={0} onCast={onCast} />);
    expect(screen.getByText('Nothing dark to light here.')).toBeInTheDocument();
    unmount();
    render(<FieldSpellsPanel save={knowing(all, 'echo-mine')} calmLeft={0} onCast={onCast} />);
    const [glow] = screen.getAllByRole('button', { name: 'Cast' });
    fireEvent.click(glow);
    expect(onCast).toHaveBeenCalledWith({ spell: 'glow' });
  });

  it('a lit place says so', () => {
    render(<FieldSpellsPanel save={knowing({ ...all, [litFlag('echo-mine')]: true }, 'echo-mine')} calmLeft={0} onCast={vi.fn()} />);
    expect(screen.getByText('This place is lit already.')).toBeInTheDocument();
  });

  it('Calm waits until the last one wears off', () => {
    const onCast = vi.fn();
    render(<FieldSpellsPanel save={knowing({ [fieldSpellFlag('calm')]: true })} calmLeft={30} onCast={onCast} />);
    expect(screen.getByText('Calm is on — 30s left.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cast' })).toBeDisabled();
  });
});
