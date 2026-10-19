import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorldMapPanel from './WorldMapPanel';
import { BOAT_MENDED, BOAT_HOME } from '../../content/boat';
import { actCrystals, crystalFlag } from '../../content/topics';
import { ACT2_SEEN, FLIGHT_FLAG, SPIRE_CLEARED } from '../../content/story';
import { TILE } from '../../content/zones';
import { FLAG_PERCH, STAR_PERCH } from '../../lib/worldMap';

// jsdom has no canvas: the map's squares are skipped, the markers still render.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const allCrystals = Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true]));
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
    // The voyage's 🚩 is where the way starts: Old Marlow's shore, not his empty dock (#117p r1).
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/flagged at Starfall Coast\./);
  });

  it("from Taleshore, a boat at home is waiting at Marlow's dock, not moored out (15c review round 2)", () => {
    const flying = { ...flags, [FLIGHT_FLAG]: true };
    render(<WorldMapPanel zoneId="port-lantern" pos={null} flags={flying} boat={BOAT_HOME} />);
    expect(screen.getByText("⛵ The Biscuit is waiting at Marlow's dock, on Dawnreach.")).toBeInTheDocument();
    expect(screen.queryByText(/moored out/)).toBeNull();
  });

  it('past the Great Fogbank, Taleshore — only once Ember can fly, and flown, not sailed (#75 item 15c)', () => {
    const { unmount } = render(<WorldMapPanel zoneId="silver-shallows" pos={px(11, 21)} flags={flags} />);
    expect(screen.queryByText('Taleshore ▶')).toBeNull();
    expect(screen.getByText('The Great Fogbank — no boat can pass it')).toBeInTheDocument();
    unmount();
    const flying = { ...flags, [FLIGHT_FLAG]: true };
    const again = render(<WorldMapPanel zoneId="silver-shallows" pos={px(11, 21)} flags={flying} />);
    expect(screen.getByText('Taleshore ▶')).toBeInTheDocument();
    expect(screen.getByText('The Great Fogbank — no boat can pass it, but Ember flies over it')).toBeInTheDocument();
    expect(again.container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/Fly off the east edge to Taleshore\./);
    again.unmount();
    // On Taleshore itself: Port Lantern, and the way back west over the fog.
    render(<WorldMapPanel zoneId="port-lantern" pos={null} flags={flying} />);
    expect(screen.getByText('◀ Silver Shallows')).toBeInTheDocument();
    expect(screen.getByText('Port Lantern')).toBeInTheDocument();
  });

  it('no sea-edge marker before the boat is mended', () => {
    render(<WorldMapPanel zoneId="dawnreach" pos={px(40, 30)} flags={{ ...allCrystals, [SPIRE_CLEARED]: true }} />);
    expect(screen.queryByText('Silver Shallows ▶')).toBeNull();
  });
});

describe('Remembrance Hill on the menu map (#75 item 14e)', () => {
  it('before Act II it is not on the map or in the list — its fog is marked as lifting later', () => {
    render(<WorldMapPanel zoneId="lumina-village" pos={null} flags={allCrystals} />);
    expect(screen.queryByText(/Remembrance Hill/)).toBeNull();
    expect(screen.getByText('Fog with nothing on it lifts later in your adventure')).toBeInTheDocument();
    // With every crystal restored, no bank shows a crystal: no "restore the crystal" line (review fix).
    expect(screen.queryByText(/restore the crystal shown on it/)).toBeNull();
  });

  it('out on the Shallows, the spoken map never names a 🚩 it does not draw (review fix)', () => {
    const { container } = render(
      <WorldMapPanel
        zoneId="silver-shallows"
        pos={px(30, 20)}
        flags={{ ...allCrystals, [SPIRE_CLEARED]: true, [ACT2_SEEN]: true, [BOAT_MENDED]: true, 'visited:silver-shallows': true }}
        aboard
      />,
    );
    const label = container.querySelector('canvas')!.getAttribute('aria-label')!;
    expect(label).toContain('Visit Remembrance Hill');
    expect(label).not.toContain('flagged at');
  });

  it('once Lumina starts remembering, it is listed with its own icon', () => {
    render(<WorldMapPanel zoneId="lumina-village" pos={null} flags={{ ...allCrystals, [SPIRE_CLEARED]: true, [ACT2_SEEN]: true }} />);
    expect(screen.getByText('Remembrance Hill')).toBeInTheDocument();
    // The Dragon's Roost's clouds still stand, unmarked, until Ember can fly (#75 item 15b).
    expect(screen.getByText('Fog with nothing on it lifts later in your adventure')).toBeInTheDocument();
  });

  it("once Ember can fly, no fog is left on Dawnreach and the Dragon's Roost is listed (#75 item 15b)", () => {
    render(
      <WorldMapPanel zoneId="lumina-village" pos={null} flags={{ ...allCrystals, [SPIRE_CLEARED]: true, [ACT2_SEEN]: true, [FLIGHT_FLAG]: true }} />,
    );
    expect(screen.getByText("Dragon's Roost")).toBeInTheDocument();
    expect(screen.queryByText('Fog with nothing on it lifts later in your adventure')).toBeNull();
  });
});

describe('Eldergrove on the menu map (#75 item 14f)', () => {
  const afterHill = {
    ...allCrystals,
    [SPIRE_CLEARED]: true,
    [ACT2_SEEN]: true,
    [BOAT_MENDED]: true,
    'visited:silver-shallows': true,
    'visited:remembrance-hill': true,
  };

  it('out on the Shallows, the 🚩 for the Memoria Key sits on Eldergrove', () => {
    const { container } = render(<WorldMapPanel zoneId="silver-shallows" pos={px(30, 20)} flags={afterHill} aboard />);
    expect(screen.getByText('Eldergrove')).toBeInTheDocument();
    expect(screen.getByText(/Next: Win the Memoria Key/)).toBeInTheDocument();
    expect(screen.getByText('Go south-west to Eldergrove.')).toBeInTheDocument();
    const marks = Array.from(container.querySelectorAll('span[aria-hidden]'), (s) => s.textContent);
    expect(marks).toContain('🚩');
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/flagged at Eldergrove\./);
  });

  it("on Dawnreach its 🚩 sits on Marlow's dock, and the way starts there (14f review)", () => {
    const { container } = render(<WorldMapPanel zoneId="remembrance-hill" pos={null} flags={afterHill} boat={BOAT_HOME} />);
    expect(screen.getByText(/Next: Win the Memoria Key/)).toBeInTheDocument();
    expect(screen.getByText("Go north-east to Marlow's dock and sail east to the Silver Shallows, then go south-east to Eldergrove.")).toBeInTheDocument();
    const marks = Array.from(container.querySelectorAll('span[aria-hidden]'), (s) => s.textContent);
    expect(marks).toContain('🚩');
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/Next: Win the Memoria Key, flagged at Marlow's dock\./);
  });

  it('a goal with no 🚩 on this map ends with a full stop before the boat line (review fix)', () => {
    const beforeHill = { ...afterHill, 'visited:remembrance-hill': false };
    const { container } = render(
      <WorldMapPanel zoneId="silver-shallows" pos={px(30, 20)} flags={beforeHill} boat={{ zoneId: 'silver-shallows', x: 11, y: 23 }} />,
    );
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/Next: Visit Remembrance Hill\. The boat: /);
  });

  it("after a Return, the Biscuit still out on the Shallows, the way starts with Old Marlow rowing her home (#117p)", () => {
    const { container } = render(<WorldMapPanel zoneId="lumina-village" pos={null} flags={afterHill} boat={{ zoneId: 'silver-shallows', x: 30, y: 20 }} />);
    expect(
      screen.getByText('Go east to Starfall Coast, then ask Old Marlow to row the Biscuit home, then go east to his dock and sail east to the Silver Shallows, then go south-east to Eldergrove.'),
    ).toBeInTheDocument();
    // …and the 🚩 marks the first place those words send you: Starfall Coast, on the map and in its list (r1).
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/Next: Win the Memoria Key, flagged at Starfall Coast\./);
    expect(screen.getByText('Starfall Coast').closest('li')).toHaveTextContent('🚩');
    expect(screen.getAllByText('🚩', { exact: false }).filter((s) => s.tagName === 'SPAN' && s.textContent === '🚩')).toHaveLength(1);
  });

  it('the Biscuit moored down Dawnreach\'s coast, a walk away: the 🚩 sits on the ⛵ and the words walk you to her — no Old Marlow (#159 r2)', () => {
    const downTheCoast = { zoneId: 'dawnreach' as const, x: 64, y: 4 };
    const { container } = render(<WorldMapPanel zoneId="dawnreach" pos={px(60, 30)} flags={afterHill} boat={downTheCoast} />);
    expect(
      screen.getByText('Walk north to the Biscuit (⛵ on your map) and sail east to the Silver Shallows, then go south-east to Eldergrove.'),
    ).toBeInTheDocument();
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/Next: Win the Memoria Key, flagged at the Biscuit\./);
    // One 🚩, drawn on the boat's own cell — not on Starfall Coast or the empty dock.
    const flags = Array.from(container.querySelectorAll('span[aria-hidden]')).filter((s) => s.textContent === '🚩');
    expect(flags).toHaveLength(1);
    const cols = 80;
    const rows = 60;
    expect((flags[0] as HTMLElement).style.left).toBe(`${((64 + 0.5) / cols) * 100}%`);
    expect((flags[0] as HTMLElement).style.top).toBe(`${((4 + 0.5) / rows) * 100}%`);
    expect(screen.getByText('Starfall Coast').closest('li')).not.toHaveTextContent('🚩');
    expect(screen.queryByText(/Old Marlow/)).toBeNull();
  });

  it('…but left out in open water off Dawnreach, nobody can walk to her: the 🚩 goes back to Old Marlow\'s shore (#159 r2)', () => {
    const { container } = render(<WorldMapPanel zoneId="dawnreach" pos={px(60, 30)} flags={afterHill} boat={{ zoneId: 'dawnreach', x: 76, y: 40 }} />);
    expect(screen.getByText(/ask Old Marlow to row the Biscuit home/)).toBeInTheDocument();
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).toMatch(/flagged at Starfall Coast\./);
  });

  it('sailing off Dawnreach already, no 🚩 is left on the empty dock: the words name the edge the map names (r1)', () => {
    const { container } = render(<WorldMapPanel zoneId="dawnreach" pos={px(72, 30)} flags={afterHill} aboard />);
    expect(screen.getByText('Sail east to the Silver Shallows, then go south-east to Eldergrove.')).toBeInTheDocument();
    expect(screen.getByText('Silver Shallows ▶')).toBeInTheDocument();
    const marks = Array.from(container.querySelectorAll('span[aria-hidden]'), (s) => s.textContent);
    expect(marks).not.toContain('🚩');
    expect(container.querySelector('canvas')!.getAttribute('aria-label')).not.toContain('flagged at');
  });

  it('inside Eldergrove the boat at its beach is drawn clear of the 🌳, ⭐ and 🚩 on the island (#117n)', () => {
    const { unmount } = render(<WorldMapPanel zoneId="eldergrove" pos={px(20, 1)} flags={afterHill} boat={{ zoneId: 'silver-shallows', x: 12, y: 33 }} />);
    const boat = screen.getByTestId('map-boat');
    expect(boat).toHaveTextContent('⛵');
    expect(parseFloat(boat.style.marginTop)).toBeLessThan(0); // nudged up, out to sea
    // The ⭐ and 🚩 perch clear above the 🌳, as worldMap's pin geometry says.
    const pins = Array.from(document.querySelectorAll('span[aria-hidden]')).filter((s) => s.textContent === '⭐' || s.textContent === '🚩');
    expect(pins.map((p) => p.textContent).sort()).toEqual(['⭐', '🚩']);
    expect(pins.find((p) => p.textContent === '⭐')!.className).toContain(`-translate-y-[${Math.round(STAR_PERCH * 100)}%]`);
    expect(pins.find((p) => p.textContent === '🚩')!.className).toContain(`-translate-y-[${Math.round(FLAG_PERCH * 100)}%]`);
    unmount();
    // Out in open water, nothing near: right where she's moored.
    render(<WorldMapPanel zoneId="eldergrove" pos={px(20, 1)} flags={afterHill} boat={{ zoneId: 'silver-shallows', x: 30, y: 25 }} />);
    expect(parseFloat(screen.getByTestId('map-boat').style.marginTop || '0')).toBe(0);
    expect(parseFloat(screen.getByTestId('map-boat').style.marginLeft || '0')).toBe(0);
  });

  it('inside Eldergrove the map is the Shallows, with you on its island', () => {
    render(<WorldMapPanel zoneId="eldergrove" pos={px(20, 1)} flags={afterHill} />);
    expect(screen.getByText('🗺️ The Silver Shallows')).toBeInTheDocument();
    expect(screen.getByText("⭐ You're here: Eldergrove")).toBeInTheDocument();
    expect(screen.getByText("It's right here in Eldergrove!")).toBeInTheDocument();
  });
});
