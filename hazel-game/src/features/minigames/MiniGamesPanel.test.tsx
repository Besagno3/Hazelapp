import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MiniGamesPanel from './MiniGamesPanel';
import { openedFlag, pageFlag, starFlag } from '../../content/minigames';

describe('📜 Menu → 🎮 Mini-games (docs/DESIGN-MINIGAMES.md §3.6)', () => {
  it('shows nothing until a game has been opened', () => {
    const { container } = render(<MiniGamesPanel flags={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a game opened, who runs it where, its collection and its stars', () => {
    render(
      <MiniGamesPanel
        flags={{ [openedFlag('potion-lab')]: true, [pageFlag('potion-lab', 'lemon')]: true, [starFlag('potion-lab', 1)]: true }}
      />,
    );
    expect(screen.getByRole('heading', { name: /Mini-games/ })).toBeInTheDocument();
    expect(screen.getByText('Potion Lab')).toBeInTheDocument();
    expect(screen.getByText('Trader Tadpole, Verdara · Brew Book 1/12')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 of 3 stars' })).toBeInTheDocument();
  });
});
