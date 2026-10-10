import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { useInertOutside } from './useInertOutside';

function Layer({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useInertOutside(ref);
  return <div ref={ref} data-testid={name} />;
}

/** A page with a HUD and two layers that can each be up or not. */
function Page({ a, b }: { a: boolean; b: boolean }) {
  return (
    <div>
      <div data-testid="hud">HUD</div>
      {a && <Layer name="a" />}
      {b && <Layer name="b" />}
    </div>
  );
}

describe('useInertOutside (#75 item 14b review: holders that overlap)', () => {
  it('the page stays inert until the last layer closes, whichever closes first', () => {
    const { getByTestId, rerender } = render(<Page a b={false} />);
    const hud = () => getByTestId('hud');
    expect(hud()).toHaveAttribute('inert');

    rerender(<Page a b />); // a second layer opens over the first
    expect(getByTestId('a')).toHaveAttribute('inert');
    rerender(<Page a={false} b />); // the first closes first
    expect(hud()).toHaveAttribute('inert');
    rerender(<Page a={false} b={false} />);
    expect(hud()).not.toHaveAttribute('inert');
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it("never clears inert it didn't set", () => {
    const markInert = (el: HTMLDivElement | null) => el?.setAttribute('inert', '');
    const { getByTestId, rerender } = render(
      <div>
        <div data-testid="other" ref={markInert} />
        <Layer name="a" />
      </div>,
    );
    rerender(
      <div>
        <div data-testid="other" ref={markInert} />
      </div>,
    );
    expect(getByTestId('other')).toHaveAttribute('inert');
  });
});
