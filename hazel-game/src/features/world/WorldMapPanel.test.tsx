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
    expect(screen.getByText("⛵ = the Biscuit, waiting at Marlow's dock")).toBeInTheDocument();
    // Off the east edge lies the Shallows, now there's a boat to sail there.
    expect(screen.getByText('Silver Shallows ▶')).toBeInTheDocument();
    expect(screen.getByText(/Next: Sail the Silver Shallows/)).toBeInTheDocument();
    expect(screen.getByText("Go east to Marlow's dock and sail east.")).toBeInTheDocument();
    const marks = Array.from(container.querySelectorAll('span[aria-hidden]'), (s) => s.textContent);
    expect(marks).toContain('⛵');
    expect(marks).toContain('🚩');
  });
});

describe('the menu map at sea — review fixes (#75 item 14)', () => {
  const flags = { ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true };

  it('names the Shallows\' islets and the way home off its west edge', () => {
    const { container } = render(<WorldMapPanel zoneId="silver-shallows" pos={px(11, 21)} flags={flags} boat={{ zoneId: 'silver-shallows', x: 11, y: 23 }} />);
    expect(screen.getByText('Gull Rock')).toBeInTheDocument();
    expect(screen.getByText('Sandpiper Cay')).toBeInTheDocument();
    expect(screen.getByText('◀ Dawnreach')).toBeInTheDocument();
    expect(screen.getByText("⭐ You're out on the Silver Shallows")).toBeInTheDocument();
    expect(screen.getByText('⛵ = the Biscuit, moored where you left her')).toBeInTheDocument();
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/Sail off the west edge to Dawnreach\./);
  });

  it('after a Return, Dawnreach\'s map says the boat is out in the Shallows and who can fetch it', () => {
    const { container } = render(<WorldMapPanel zoneId="lumina-village" pos={null} flags={flags} boat={{ zoneId: 'silver-shallows', x: 3, y: 22 }} />);
    expect(screen.getByText(/The Biscuit is moored out in the Silver Shallows — Old Marlow on Starfall Coast can row her home/)).toBeInTheDocument();
    // The voyage's 🚩 is read out as Marlow's dock, not the Shallows.
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/flagged at Marlow's dock\./);
  });

  it('no sea-edge marker before the boat is mended', () => {
    render(<WorldMapPanel zoneId="dawnreach" pos={px(40, 30)} flags={{ ...allCrystals, [SPIRE_CLEARED]: true }} />);
    expect(screen.queryByText('Silver Shallows ▶')).toBeNull();
  });
});
