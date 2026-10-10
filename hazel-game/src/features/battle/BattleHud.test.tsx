import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BattleHud } from './BattleHud';
import { BattleResult } from './BattleResult';
import { keyForBoss } from '../../content/keys';
import { AVATARS } from '../../content/avatars';
import { atTier, spawnEnemy } from '../../content/enemies';
import type { DangerTier } from '../../content/regions';

function hud(tier: DangerTier, powerMoveNext: string | null = null, defId = 'count-bat') {
  const enemy = spawnEnemy(defId, 'numbria', 'a', 8, {}, tier);
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
    expect(screen.getByText(/Tough critter: it hits harder/)).toHaveClass('sr-only');
  });

  it('past "!!!" the marks stay three and change colour; it reads aloud as very tough (#75 item 14c)', () => {
    hud(6);
    const marks = screen.getByText('!!!');
    expect(marks.parentElement).toHaveClass('text-fuchsia-300');
    expect(screen.getByText(/^Very tough critter: it hits harder/)).toHaveClass('sr-only');
  });

  it('a warden reads aloud as a very tough boss, not a critter (#75 item 14f review)', () => {
    hud(5, null, 'ringkeeper');
    expect(screen.getByText(/^Very tough boss: it hits harder/)).toHaveClass('sr-only');
  });

  it('up to "!!!" it reads aloud as tough, not very tough', () => {
    hud(4);
    expect(screen.getByText('!!!').parentElement).toHaveClass('text-red-300');
    expect(screen.getByText(/^Tough critter/)).toBeInTheDocument();
  });

  it('near home there are none', () => {
    hud(1);
    hud(0);
    expect(screen.queryByText(/^!+$/)).toBeNull();
    expect(screen.queryByText(/Tough critter/)).toBeNull();
  });

  it('a power move coming next has its own row; the marks stay put', () => {
    hud(4, 'Mighty Blow');
    expect(screen.getByText('💢 Mighty Blow next!')).toBeInTheDocument();
    expect(screen.getByText('!!!')).toBeInTheDocument();
  });

  it('once mercy has eased the fight, a 💛 stands where its marks were', () => {
    const eased = atTier(spawnEnemy('count-bat', 'chromaria', 'a', 8), 1);
    render(
      <BattleHud
        enemy={eased}
        enemyHp={eased.maxHp}
        enemyShielded={false}
        speedBoost={0}
        powerMoveNext={null}
        avatar={AVATARS[0]}
        playerHp={100}
        playerMaxHp={100}
        charge={0}
        streak={0}
      />,
    );
    expect(screen.getByText('💛')).toBeInTheDocument();
    expect(screen.getByText('Going easier on you')).toHaveClass('sr-only');
    expect(screen.queryByText(/^!+$/)).toBeNull();
  });
});

describe('the result screen after a critter with "!" marks (#75 item 12)', () => {
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
    expect(screen.getByText(/Tough-critter bonus/)).toBeInTheDocument();
  });
  it('…but not near home', () => {
    render(<BattleResult {...base} result="victory" enemy={spawnEnemy('count-bat', 'numbria', 'a', 8)} />);
    expect(screen.queryByText(/Tough-critter bonus/)).toBeNull();
  });
  it('a warden whose gate is on the map names the Fiend it unlocks; the Ringkeeper the door nobody remembers (#75 item 14f)', () => {
    const { unmount } = render(<BattleResult {...base} result="victory" enemy={spawnEnemy('thicket-warden', 'whispering-woods', 'w', 8)} keyBoss={keyForBoss('thicket-warden')} />);
    expect(screen.getByText(/You won the Verdant Key! It unlocks the Smog Fiend's gate\./)).toBeInTheDocument();
    unmount();
    render(<BattleResult {...base} result="victory" enemy={spawnEnemy('ringkeeper', 'eldergrove', 'r', 8)} keyBoss={keyForBoss('ringkeeper')} />);
    expect(screen.getByText(/You won the Memoria Key! It opens a door the whole world forgot\./)).toBeInTheDocument();
    expect(screen.queryByText(/Hollow Fiend/)).toBeNull();
  });
  it("a defeat in Eldergrove says Fen tucks you up in her hollow (#75 item 14f)", () => {
    render(
      <BattleResult
        {...base}
        result="defeat"
        enemy={spawnEnemy('ring-beetle', 'eldergrove', 'b', 8)}
        wakeInn="the Wound-Down Inn in Gearfall Canyon"
        shelter={{ line: "Fen the Forager finds you and tucks you up in Fen's Hollow.", place: "Fen's Hollow" }}
      />,
    );
    expect(screen.getByText(/Fen the Forager finds you and tucks you up in Fen's Hollow\. You're safe, rested/)).toBeInTheDocument();
    expect(screen.queryByText(/Wound-Down Inn/)).toBeNull();
    expect(screen.getByRole('button', { name: "To Fen's Hollow" })).toBeInTheDocument();
  });
  it('a first win names the enemy mid-sentence: "the Ringkeeper", "an Oak Owl", "a Count Bat" (#75 item 14f review)', () => {
    const first = (defId: string) => {
      const { unmount } = render(<BattleResult {...base} firstWin result="victory" enemy={spawnEnemy(defId, 'eldergrove', 'f', 8)} />);
      const text = screen.getByText(/First time beating/).textContent;
      unmount();
      return text;
    };
    expect(first('ringkeeper')).toBe('⭐ First time beating the Ringkeeper — bonus coins!');
    expect(first('oak-owl')).toBe('⭐ First time beating an Oak Owl — bonus coins!');
    expect(first('count-bat')).toBe('⭐ First time beating a Count Bat — bonus coins!');
  });
  it('a defeat shows its tip', () => {
    render(<BattleResult {...base} result="defeat" enemy={spawnEnemy('count-bat', 'gearfall', 'a', 8)} tip="Follow the 🚩!" />);
    expect(screen.getByText('💡 Follow the 🚩!')).toBeInTheDocument();
  });
});
