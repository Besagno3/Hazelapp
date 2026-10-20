import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyboardDiagram } from './KeyboardDiagram';

const keyRect = (code: string) => screen.getByRole('img').querySelector(`g[data-code="${code}"] rect`)!;
const keyText = (code: string) => screen.getByRole('img').querySelector(`g[data-code="${code}"] text`)!.textContent;

describe('KeyboardDiagram (#159 review rounds 4–5)', () => {
  it('a mark up on its key: the key shows the mark, and only the anchor Shift lights with the hold on', () => {
    render(<KeyboardDiagram target="Digit1" targetChar="!" anchors={['ShiftRight']} held={new Set()} />);
    expect(keyText('Digit1')).toBe('!');
    expect(keyRect('ShiftRight').getAttribute('class')).toMatch(/fill-sky-400/);
    expect(keyRect('ShiftLeft').getAttribute('class')).not.toMatch(/amber/);
    expect(screen.getByRole('img')).toHaveAccessibleName('Press the 1 key (!) with your left little finger, holding the right Shift with your other hand.');
  });

  it("with the hold off the other hand's Shift lights for a mark, and for a capital; the hint names it", () => {
    const { rerender } = render(<KeyboardDiagram target="Digit1" targetChar="!" held={new Set()} />);
    expect(keyRect('ShiftRight').getAttribute('class')).toMatch(/fill-amber-200/);
    expect(keyRect('ShiftLeft').getAttribute('class')).not.toMatch(/amber/);
    expect(screen.getByRole('img')).toHaveAccessibleName('Press the right Shift and the 1 key (!) with your left little finger.');
    rerender(<KeyboardDiagram target="KeyE" targetChar="E" held={new Set()} />);
    expect(keyText('KeyE')).toBe('E');
    expect(keyRect('ShiftRight').getAttribute('class')).toMatch(/fill-amber-200/);
    expect(screen.getByRole('img')).toHaveAccessibleName('Press the right Shift and the E key with your left middle finger.');
    rerender(<KeyboardDiagram target="KeyJ" targetChar="J" held={new Set()} />);
    expect(keyRect('ShiftLeft').getAttribute('class')).toMatch(/fill-amber-200/);
    expect(keyRect('ShiftRight').getAttribute('class')).not.toMatch(/amber/);
    rerender(<KeyboardDiagram target="Digit1" targetChar="1" held={new Set()} />);
    expect(keyText('Digit1')).toBe('1');
    expect(keyRect('ShiftLeft').getAttribute('class')).not.toMatch(/amber/);
  });
});
