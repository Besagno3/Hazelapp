import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BattleHud } from './BattleHud';
import { BattleResult } from './BattleResult';
import { AVATARS } from '../../content/avatars';
import { spawnEnemy } from '../../content/enemies';
import type { DangerTier } from '../../content/regions';

function hud(tier: DangerTier, powerMoveNext: string | null = null) {
  const enemy = spawnEnemy('count-bat', 'numbria', 'a', 8, {}, tier);
  return render(
    <BattleHud
      enemy={enemy}
      enemyHp={enemy.maxHp}
      enemyShielded={false}
      speedBoost={0}
      powerMoveNext={powerMoveNext}
      avatar={AVATARS[0]}
      playerHp={100}
      playerMaxHp={100}
      charge={0}
      streak={0}
    />,
  );
}

describe('BattleHud danger marks (#75 item 12)', () => {
  it('a far-from-home enemy shows its "!" marks beside its level, as on the map', () => {
    hud(3);
    expect(screen.getByText('!!')).toBeInTheDocument();
    expect(screen.getByText(/Lv \d/)).toBeInTheDocument();
    // Read aloud instead of "exclamation exclamation".
    expect(screen.getByText(/Far from home: it hits harder/)).toHaveClass('sr-only');
  });

  it('near home there are none', () => {
    hud(1);
    hud(0);
    expect(screen.queryByText(/^!+$/)).toBeNull();
    expect(screen.queryByText(/Far from home/)).toBeNull();
  });

  it('a power move coming next has its own row; the marks stay put', () => {
    hud(4, 'Mighty Blow');
    expect(screen.getByText('💢 Mighty Blow next!')).toBeInTheDocument();
    expect(screen.getByText('!!!')).toBeInTheDocument();
  });
});

describe('the result screen far from home (#75 item 12)', () => {
  const base = {
    crystalName: '',
    correctCount: 3,
    xp: 40,
    coins: 30,
    lucky: false,
    firstWin: false,
    drop: null,
    onLeave: () => {},
  };
  it('a win says why it paid more', () => {
    render(<BattleResult {...base} result="victory" enemy={spawnEnemy('count-bat', 'gearfall', 'a', 8)} />);
    expect(screen.getByText(/Far-from-home bonus/)).toBeInTheDocument();
  });
  it('…but not near home', () => {
    render(<BattleResult {...base} result="victory" enemy={spawnEnemy('count-bat', 'numbria', 'a', 8)} />);
    expect(screen.queryByText(/Far-from-home bonus/)).toBeNull();
  });
  it('a defeat shows its tip', () => {
    render(<BattleResult {...base} result="defeat" enemy={spawnEnemy('count-bat', 'gearfall', 'a', 8)} tip="Follow the 🚩!" />);
    expect(screen.getByText('💡 Follow the 🚩!')).toBeInTheDocument();
  });
});
