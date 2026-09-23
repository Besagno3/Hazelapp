import { describe, it, expect } from 'vitest';
import { camAxis } from './camera';

describe('camAxis', () => {
  it('keeps single-screen maps centred', () => {
    expect(camAxis(10, 704, 704)).toBe(352);
    expect(camAxis(700, 704, 704)).toBe(352);
  });
  it('follows the target on larger maps', () => {
    expect(camAxis(700, 1408, 704)).toBe(700);
  });
  it('clamps at both map edges', () => {
    expect(camAxis(20, 1408, 704)).toBe(352);
    expect(camAxis(1400, 1408, 704)).toBe(1056);
  });
});
