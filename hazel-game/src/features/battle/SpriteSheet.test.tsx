import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpriteSheet } from './SpriteSheet';
import type { SpriteView } from '../../content/sprites';

const view: SpriteView = {
  sheet: '/sprites/blaze/battle.png',
  frameW: 64,
  frameH: 64,
  frames: 6,
  anims: { idle: { from: 0, to: 3, fps: 6 }, attack: { from: 4, to: 5, fps: 10, loop: false } },
};

describe('SpriteSheet', () => {
  it('renders the emoji fallback when no view is given', () => {
    render(<SpriteSheet view={null} emoji="🦁" />);
    expect(screen.getByText('🦁')).toBeInTheDocument();
  });

  it('renders an image element backed by the sheet when a view is given', () => {
    render(<SpriteSheet view={view} emoji="🦁" />);
    const el = screen.getByRole('img');
    expect(el.style.backgroundImage).toContain('/sprites/blaze/battle.png');
    expect(el.style.width).toBe('64px');
    expect(el.style.height).toBe('64px');
  });

  it('scales width/height by the scale prop', () => {
    render(<SpriteSheet view={view} emoji="🦁" scale={2} />);
    const el = screen.getByRole('img');
    expect(el.style.width).toBe('128px');
    expect(el.style.height).toBe('128px');
  });

  it('falls back to idle when the requested anim is missing', () => {
    render(<SpriteSheet view={view} anim="hurt" emoji="🦁" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
