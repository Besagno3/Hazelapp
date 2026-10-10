import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Kid } from '../../types';

const { default: WhoIsPlaying } = await import('./WhoIsPlaying');
const { useFamilyStore } = await import('../../store/familyStore');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', picture: 'rocket', birthYear: 2017, birthMonth: 3 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'panda', picture: null, birthYear: 2019, birthMonth: 8 };
const choose = vi.fn();
const setGrownUpsOpen = vi.fn();

beforeEach(() => {
  choose.mockReset();
  setGrownUpsOpen.mockReset();
  useFamilyStore.setState({ kids: [sam, kit], choose, setGrownUpsOpen });
});

describe("WhoIsPlaying (#118)", () => {
  it('shows a tile for each kid, with their picture and nickname', () => {
    render(<WhoIsPlaying />);
    const sams = screen.getByRole('button', { name: 'Sam' });
    expect(sams).toHaveTextContent('🦊');
    expect(screen.getByRole('button', { name: 'Kit' })).toHaveTextContent('🐼');
  });

  it('a kid with a secret picture taps it to get in; a wrong one says try again', () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    expect(screen.getByText('Hi, Sam!')).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-label'))).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Apple' }));
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/Not that one/);
    fireEvent.click(screen.getByRole('button', { name: 'Rocket' }));
    expect(choose).toHaveBeenCalledWith('kid-sam');
  });

  it("a kid without one (from before parent accounts) goes straight in", () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Kit' }));
    expect(choose).toHaveBeenCalledWith('kid-kit');
  });

  it("\"That's not me\" goes back to the tiles", () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    expect(screen.getByText("Who's playing?")).toBeInTheDocument();
  });

  it('👪 Grown-ups opens the grown-ups area', () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: /Grown-ups/ }));
    expect(setGrownUpsOpen).toHaveBeenCalledWith(true);
  });

  it('the secret pictures come in a new order each time', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const { unmount } = render(<WhoIsPlaying />);
      fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
      const grid = screen.getByRole('button', { name: 'Rocket' }).parentElement!;
      orders.add(within(grid).getAllByRole('button').map((b) => b.getAttribute('aria-label')).join());
      unmount();
    }
    expect(orders.size).toBeGreaterThan(1); // 6 identical orders of 9 would be a 1-in-(9!)^5 fluke
  });
});
