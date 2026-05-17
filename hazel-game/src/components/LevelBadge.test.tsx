import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LevelBadge from './LevelBadge';
import { useProfileStore } from '../store/profileStore';

describe('LevelBadge', () => {
  beforeEach(() => {
    useProfileStore.getState().clearProfile();
  });

  it('renders nothing when no profile is loaded', () => {
    const { container } = render(<LevelBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the level derived from the profile XP', () => {
    useProfileStore.setState({
      profile: { id: 'u1', birthYear: 2014, birthMonth: 6, skillLevels: {}, xp: 250, powerUps: {} },
    });
    render(<LevelBadge />);
    // 250 XP → floor(250/100) + 1 = level 3
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('50/100 XP')).toBeInTheDocument();
  });
});
