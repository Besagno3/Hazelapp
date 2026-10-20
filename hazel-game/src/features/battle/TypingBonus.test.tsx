import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypingBonus } from './TypingBonus';
import { bonusWords, charKey } from '../../content/typing';

describe('TypingBonus (#165 item 3)', () => {
  it('names whose name and what it pays; the name typed claims it once', () => {
    const onClaim = vi.fn();
    render(<TypingBonus bonus={{ word: 'Count Bat', who: 'enemy', reward: { kind: 'item', id: 'potion' } }} holdRule={false} onClaim={onClaim} />);
    expect(screen.getByTestId('typing-bonus')).toHaveTextContent("Type the foe's name to claim 🧪 a Berry Potion");
    for (const ch of 'Count Bat') {
      const code = charKey(ch)!.key.code;
      fireEvent.keyDown(window, { code, key: ch });
      fireEvent.keyUp(window, { code, key: ch });
    }
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('typing-bonus')).toHaveTextContent('Claimed: 🧪 a Berry Potion!');
    fireEvent.keyDown(window, { code: 'KeyC', key: 'C' });
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('the rewards in words', () => {
    expect(bonusWords({ kind: 'coins', amount: 15 })).toBe('🪙 15 coins');
    expect(bonusWords({ kind: 'xp', amount: 20 })).toBe('⭐ 20 XP');
    expect(bonusWords({ kind: 'item', id: 'hint' })).toBe('🪶 a Hint Feather');
  });
});
