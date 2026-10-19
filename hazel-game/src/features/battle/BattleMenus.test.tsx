import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CommandMenu } from './BattleMenus';
import { COMPANIONS } from '../../content/companion';
import { defaultSave } from '../../lib/save';

function menu(over: Partial<Parameters<typeof CommandMenu>[0]> = {}) {
  const props: Parameters<typeof CommandMenu>[0] = {
    charge: 0,
    spellsLoaded: true,
    canCastAny: false,
    items: { ...defaultSave().items, potion: 2 },
    isBoss: false,
    powerMove: null,
    companion: COMPANIONS.ember,
    companionReady: true,
    companionHint: 'Dragon Tail · Pair Attacks',
    canSwap: false,
    onAttack: vi.fn(),
    onSpells: vi.fn(),
    onCompanion: vi.fn(),
    onGuard: vi.fn(),
    onItems: vi.fn(),
    onSwap: vi.fn(),
    onFlee: vi.fn(),
    ...over,
  };
  render(<CommandMenu {...props} />);
  return props;
}

describe('the command menu fits a 320×568 boss fight (#117q, #158b)', () => {
  it('six commands fill the grid; 🏃 Flee sits beside "Your move!"', () => {
    const props = menu();
    const flee = screen.getByRole('button', { name: /Flee/ });
    const header = screen.getByText('Your move!');
    // In the header row, not a grid row of its own.
    expect(flee.parentElement).toBe(header.closest('p')!.parentElement);
    const grid = screen.getByText('Attack').closest('button')!.parentElement!;
    expect(within(grid).queryByRole('button', { name: /Flee/ })).toBeNull();
    expect(grid.children).toHaveLength(6);
    fireEvent.click(flee);
    expect(props.onFlee).toHaveBeenCalledOnce();
  });

  it('…but last in the page: the first Tab meets Attack, and "Your move!" is still read first (#158b review)', () => {
    menu();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Attack');
    expect(buttons[buttons.length - 1]).toHaveTextContent('Flee');
    const header = screen.getByText('Your move!').closest('p')!;
    const attack = screen.getByText('Attack').closest('button')!;
    expect(header.compareDocumentPosition(attack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Placed in the header row by the grid, beside "Your move!".
    expect(screen.getByRole('button', { name: /Flee/ })).toHaveClass('col-start-2', 'row-start-1');
    expect(header).toHaveClass('col-start-1', 'row-start-1');
  });

  it("a boss's Flee is still there, greyed out, saying why", () => {
    const props = menu({ isBoss: true });
    const flee = screen.getByRole('button', { name: /Flee/ });
    expect(flee).toBeDisabled();
    expect(flee).toHaveTextContent('No escape!');
    fireEvent.click(flee);
    expect(props.onFlee).not.toHaveBeenCalled();
  });

  it('every command keeps a 44 px tap target, a short screen too', () => {
    menu();
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-[44px]');
  });

  it('a power move coming: a phone says just "Guard to block it!" (the name is on Guard and in the status box)', () => {
    menu({ powerMove: 'Thousand-Year Charge' });
    expect(screen.getByText('💢 Guard to block it!')).toHaveClass('sm:hidden');
    expect(screen.getByText(/Thousand-Year Charge is coming — Guard to block it!/)).toHaveClass('hidden', 'sm:inline');
    expect(screen.getByRole('button', { name: /Guard/ })).toHaveTextContent('Blocks Thousand-Year Charge!');
  });
});
