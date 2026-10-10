import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Kid } from '../../types';

const { default: WhoIsPlaying } = await import('./WhoIsPlaying');
const { useFamilyStore } = await import('../../store/familyStore');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'panda', hasPin: true, birthYear: 2019, birthMonth: 8 };
const choose = vi.fn();
const setGrownUpsOpen = vi.fn();
const checkKidPin = vi.fn(async (_id: string, pin: string) => pin === '4821');

async function type(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

beforeEach(() => {
  vi.clearAllMocks();
  useFamilyStore.setState({ kids: [sam, kit], choose, setGrownUpsOpen, checkKidPin });
});

describe('WhoIsPlaying (#118)', () => {
  it('shows a tile for each kid, with their picture and nickname', () => {
    render(<WhoIsPlaying />);
    expect(screen.getByRole('button', { name: 'Sam' })).toHaveTextContent('🦊');
    expect(screen.getByRole('button', { name: 'Kit' })).toHaveTextContent('🐼');
  });

  it("a kid types their PIN to get in; a wrong one says try again and doesn't", async () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    expect(screen.getByText('Hi, Sam!')).toBeInTheDocument();
    await type('1234');
    expect(checkKidPin).toHaveBeenLastCalledWith('kid-sam', '1234');
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/Not quite/);
    await type('4821');
    expect(choose).toHaveBeenCalledWith('kid-sam');
  });

  it("\"That's not me\" goes back to the tiles", () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Kit' }));
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    expect(screen.getByText("Who's playing?")).toBeInTheDocument();
    expect(choose).not.toHaveBeenCalled();
  });

  it('👪 Grown-ups opens the grown-ups area', () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: /Grown-ups/ }));
    expect(setGrownUpsOpen).toHaveBeenCalledWith(true);
  });
});
