import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BattleHud } from './BattleHud';
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

describe('BattleHud danger word (#75 item 12)', () => {
  it('a far-from-home enemy says how tough it fights; its level is still its questions\'', () => {
    hud(3);
    expect(screen.getByText('💪 Fierce')).toBeInTheDocument();
    expect(screen.getByText(/Lv \d/)).toBeInTheDocument();
  });

  it('near home it says nothing extra', () => {
    hud(1);
    expect(screen.queryByText(/💪/)).toBeNull();
    hud(0);
    expect(screen.queryByText(/💪/)).toBeNull();
  });

  it('a power move coming next takes the spot', () => {
    hud(4, 'Mighty Blow');
    expect(screen.getByText('💢 Mighty Blow next!')).toBeInTheDocument();
    expect(screen.queryByText('💪 Mighty')).toBeNull();
  });
});
