import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LevelBadge from './LevelBadge';
import { useProfileStore } from '../store/profileStore';
import { playerLevel, xpProgress } from '../lib/level';

describe('LevelBadge', () => {
  beforeEach(() => {
    useProfileStore.getState().clearProfile();
  });

  it('falls back to level 1 / 0 XP when no profile is loaded', () => {
    render(<LevelBadge />);
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('0/100 XP')).toBeInTheDocument();
  });

  it('uses a top-center placement in battle (clears the combatant panels)', () => {
    const { container } = render(<LevelBadge placement="top-center" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('left-1/2');
    expect(badge.className).not.toContain('left-3');
  });

  it('shows the level derived from the profile XP', () => {
    useProfileStore.setState({
      profile: {
        id: 'u1',
        birthYear: 2014,
        birthMonth: 6,
        skillLevels: {},
        xp: 250,
        powerUps: {},
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedOn: null,
      },
    });
    render(<LevelBadge />);
    // Level is derived from the (now level-scaling) XP curve — assert against
    // the same functions the badge uses so this can't drift when the curve is
    // tuned. At 250 XP the growing per-level cost lands the player in level 2.
    const level = playerLevel(250);
    const { into, needed } = xpProgress(250);
    expect(level).toBe(2);
    expect(screen.getByText(`Level ${level}`)).toBeInTheDocument();
    expect(screen.getByText(`${into}/${needed} XP`)).toBeInTheDocument();
  });
});
