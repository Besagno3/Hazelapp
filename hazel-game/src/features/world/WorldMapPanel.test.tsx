import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorldMapPanel from './WorldMapPanel';
import { BOAT_MENDED, BOAT_HOME } from '../../content/boat';
import { TOPIC_REGISTRY, crystalFlag } from '../../content/topics';
import { SPIRE_CLEARED } from '../../content/story';
import { TILE } from '../../content/zones';

// jsdom has no canvas: the map's squares are skipped, the markers still render.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const allCrystals = Object.fromEntries(TOPIC_REGISTRY.map((t) => [crystalFlag(t.id), true]));
const px = (x: number, y: number) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });

describe('the menu map at sea (#75 item 14)', () => {
  it('out on the Silver Shallows it maps the Shallows, with the Great Fogbank explained', () => {
    render(<WorldMapPanel zoneId="silver-shallows" pos={px(30, 20)} flags={{ ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true }} aboard />);
    expect(screen.getByText('🗺️ The Silver Shallows')).toBeInTheDocument();
    expect(screen.getByText(/You're sailing the Silver Shallows in the Biscuit/)).toBeInTheDocument();
    expect(screen.getByText(/The Great Fogbank — no boat can pass it/)).toBeInTheDocument();
    // No "restore the crystal" fog legend for a bank no crystal clears.
    expect(screen.queryByText(/restore the crystal shown/)).toBeNull();
  });

  it("on Dawnreach the boat shows where it's moored, and the voyage's 🚩 sits on Marlow's dock", () => {
    const { container } = render(
      <WorldMapPanel
        zoneId="lumina-village"
        pos={null}
        flags={{ ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true }}
        boat={BOAT_HOME}
      />,
    );
    expect(screen.getByText(/⛵ = Marlow's boat, waiting where you left it/)).toBeInTheDocument();
    expect(screen.getByText(/Next: Sail the Silver Shallows/)).toBeInTheDocument();
    expect(screen.getByText("Go east to Marlow's dock and sail east.")).toBeInTheDocument();
    const marks = Array.from(container.querySelectorAll('span[aria-hidden]'), (s) => s.textContent);
    expect(marks).toContain('⛵');
    expect(marks).toContain('🚩');
  });
});
