import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterPortrait } from './CharacterPortrait';

describe('CharacterPortrait', () => {
  it("uses a fighter's battle sheet", () => {
    render(<CharacterPortrait spriteId="blaze" emoji="🦁" />);
    expect(screen.getByRole('img').style.backgroundImage).toContain('/sprites/blaze/battle.png');
  });

  it("uses a world-only NPC's world sheet, facing the player", () => {
    render(<CharacterPortrait spriteId="village-elder" emoji="👴" />);
    const el = screen.getByRole('img');
    expect(el.style.backgroundImage).toContain('/sprites/village-elder/world.png');
    // idleDown starts at frame 6 of the 32px-wide world strip.
    expect(el.style.backgroundPosition).toBe('-192px 0px');
  });

  it('falls back to the emoji for an unknown id', () => {
    render(<CharacterPortrait spriteId="nobody" emoji="❓" />);
    expect(screen.getByText('❓')).toBeInTheDocument();
  });
});
