import { useEffect, useRef } from 'react';
import { GREAT_FOGBANK, TILE, ZONES, fogAt, fogLifted } from '../../content/zones';
import { floorTitle } from '../../content/dungeons';
import type { BoatSpot, ZoneId } from '../../types';
import {
  ANY_CRYSTAL_EMOJI,
  FOG_COLOR,
  HIDDEN_PLACE_EMOJI,
  edgeLabelSpot,
  seaEdgeLabel,
  fogMarker,
  fogMarkerAt,
  mapCaption,
  mapCellColor,
  placeEmoji,
  whereOnMap,
} from '../../lib/worldMap';
import { goalDirections, nextObjective } from '../../lib/wayfinding';
import { boatAway, hasBoat } from '../../content/boat';

/** A map's name mid-sentence: "the Silver Shallows", "Dawnreach" (on the map's edges: `seaEdgeLabel`). */
const mid = (name: string) => (name.startsWith('The ') ? `the ${name.slice(4)}` : name);

/** Screen pixels per overworld tile on the map. */
const PX = 4;

/**
 * The menu's world map (#75 Phase 1, a stub): Dawnreach drawn small, fog where
 * it hasn't lifted yet, each place marked with its own emoji, a pulsing star
 * where you are, and a 🚩 on the place to head for next with the way there
 * (#75 item 6) — so a kid can always answer "where am I?" and "where do I go?".
 */
export default function WorldMapPanel({
  zoneId,
  pos,
  flags,
  boat = null,
  aboard = false,
}: {
  zoneId: ZoneId;
  pos: { x: number; y: number } | null;
  flags: Record<string, boolean>;
  /** Where Marlow's boat is moored, if it is (#75 item 14) — ⛵ on its map. */
  boat?: BoatSpot | null;
  /** Sailing it: the caption says so. */
  aboard?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The map you're out on — Dawnreach, or the Silver Shallows (#75 item 14);
  // from inside a place, the overworld it's on.
  const world = ZONES[zoneId].kind === 'overworld' ? ZONES[zoneId] : ZONES.dawnreach;
  const cols = world.map[0].length;
  const rows = world.map.length;
  const places = world.places ?? [];
  const here = whereOnMap(ZONES, world, zoneId, pos);
  // Banks a crystal will clear get its marker; the Great Fogbank has a line of its own.
  const greatFogbank = (world.fogs ?? []).find((f) => f.id === GREAT_FOGBANK && !fogLifted(f, flags));
  const foggedBanks = (world.fogs ?? []).filter((f) => !fogLifted(f, flags) && f.id !== GREAT_FOGBANK);
  const fogged = foggedBanks.length > 0;
  const emojiOf = (p: (typeof places)[number]) => placeEmoji(world, p, flags);
  const anyHidden = places.some((p) => emojiOf(p) === HIDDEN_PLACE_EMOJI);
  const goal = nextObjective(flags);
  // A goal across the sea flags where it starts (Marlow's dock) on its own map.
  const flagAt = goal.at
    ? goal.at.zoneId === world.id
      ? { x: goal.at.x, y: goal.at.y, exact: true, place: undefined }
      : null
    : goal.zoneId
      ? whereOnMap(ZONES, world, goal.zoneId, null)
      : null;
  const boatHere = boat && boat.zoneId === world.id ? boat : null;
  // Moored on the other map (after a Return, say): the legend says where.
  const boatElsewhere = boat && boat.zoneId !== world.id ? boat : null;
  const boatHome = !!boatHere && !boatAway({ boat: boatHere, aboard: false, flags });
  // Landmarks (#75 item 14): islets and rocks named on the map, not entered.
  const landmarks = world.landmarks ?? [];
  // Which way the sea leads off this map, once there's a boat to sail it.
  const seaWays = hasBoat(flags) ? (world.seaLinks ?? []) : [];
  // Everything drawn on the map that a sea-edge label keeps clear of — the ⭐ above all.
  const marks = [...places, ...landmarks, ...(boatHere ? [boatHere] : []), ...(flagAt ? [flagAt] : [])];
  // On the overworld, directions start from the hero's own tile.
  const heroTile = zoneId === world.id && pos ? { x: Math.floor(pos.x / TILE), y: Math.floor(pos.y / TILE) } : undefined;
  const how = goalDirections(ZONES, goal, zoneId, heroTile);
  // Star and flag on the same place: the star steps aside so both show.
  const shared = !!here && !!flagAt && !here.exact && here.x === flagAt.x && here.y === flagAt.y;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = fogAt(world, x, y, flags) ? FOG_COLOR : mapCellColor(world.map[y][x]);
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }
  }, [world, cols, rows, flags]);

  const caption = aboard
    ? `You're sailing ${world.name.startsWith('The ') ? `the ${world.name.slice(4)}` : `off ${world.name}`} in the Biscuit`
    : mapCaption(here, floorTitle(ZONES, zoneId) ?? ZONES[zoneId].name, world.name);
  const nextLabel = goal.zoneId ? `Next: ${goal.title}` : goal.why;
  const flagName = goal.at?.name ?? flagAt?.place ?? (goal.zoneId ? ZONES[goal.zoneId].name : '');
  const boatLine = boatElsewhere
    ? `⛵ The Biscuit is moored out in ${mid(ZONES[boatElsewhere.zoneId].name)} — Old Marlow on Starfall Coast can row her home.`
    : boatHere
      ? boatHome
        ? "⛵ = the Biscuit, waiting at Marlow's dock"
        : '⛵ = the Biscuit, moored where you left her'
      : null;
  const seaWayText = seaWays.map((l) => `Sail off the ${l.side} edge to ${mid(ZONES[l.to].name)}.`).join(' ');
  const at = (x: number, y: number) => ({ left: `${((x + 0.5) / cols) * 100}%`, top: `${((y + 0.5) / rows) * 100}%` });

  return (
    <div className="bg-white/10 rounded-xl p-3 mb-3">
      <div className="font-bold text-sm mb-2">🗺️ {world.name}</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={cols * PX}
          height={rows * PX}
          role="img"
          aria-label={`Map of ${mid(world.name)}. ${caption}. ${goal.zoneId ? `${nextLabel}, flagged at ${flagName}.` : nextLabel}${boatLine ? ` ${boatLine.replace(/^⛵ (= )?/, boatElsewhere ? '' : 'The boat: ').replace(/([^.])$/, '$1.')}` : ''}${seaWayText ? ` ${seaWayText}` : ''}`}
          className="block w-full rounded-md"
          style={{ imageRendering: 'pixelated' }}
        />
        {seaWays.map((l) => (
          <span
            key={l.side}
            aria-hidden
            // Off this edge the sea carries on to the next map. Drawn before the
            // icons, so nothing is hidden under it, and down the side where no
            // marker is (`edgeLabelSpot`, #75 item 14d review).
            style={l.side === 'west' || l.side === 'east' ? { top: `${edgeLabelSpot(l.side, cols, rows, marks, here, seaEdgeLabel(l.side, ZONES[l.to].name)) * 100}%` } : undefined}
            className={`absolute pointer-events-none select-none whitespace-nowrap rounded bg-black/60 px-1 py-0.5 text-[10px] font-semibold leading-none text-white ${
              l.side === 'west'
                ? 'left-0.5 -translate-y-1/2'
                : l.side === 'east'
                  ? 'right-0.5 -translate-y-1/2'
                  : l.side === 'north'
                    ? 'top-0.5 left-1/2 -translate-x-1/2'
                    : 'bottom-0.5 left-1/2 -translate-x-1/2'
            }`}
          >
            {seaEdgeLabel(l.side, ZONES[l.to].name)}
          </span>
        ))}
        {places.map((p) => (
          <span
            key={p.name}
            aria-hidden
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none pointer-events-none select-none drop-shadow"
            style={at(p.x, p.y)}
          >
            {emojiOf(p)}
          </span>
        ))}
        {landmarks.map((l) => (
          <span
            key={l.name}
            aria-hidden
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none pointer-events-none select-none drop-shadow"
            style={at(l.x, l.y)}
          >
            {l.emoji}
          </span>
        ))}
        {foggedBanks.map((f) => (
          <span
            key={f.id}
            aria-hidden
            // The crystal that clears this bank (#75 item 7).
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none pointer-events-none select-none opacity-90"
            style={at(fogMarkerAt(f, places).x, fogMarkerAt(f, places).y)}
          >
            {fogMarker(f)}
          </span>
        ))}
        {boatHere && (
          <span
            aria-hidden
            // Marlow's boat, moored where it was left (#75 item 14).
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none pointer-events-none select-none drop-shadow"
            style={at(boatHere.x, boatHere.y)}
          >
            ⛵
          </span>
        )}
        {here && (
          <span
            aria-hidden
            // Out on the map the star is you; inside a place it perches on
            // top of that place's emoji like a pin, so both stay visible.
            className={`absolute ${shared ? '-translate-x-full' : '-translate-x-1/2'} ${here.exact ? '-translate-y-1/2' : '-translate-y-[110%]'} text-base leading-none animate-pulse drop-shadow pointer-events-none`}
            style={at(here.x, here.y)}
          >
            ⭐
          </span>
        )}
        {flagAt && (
          <span
            aria-hidden
            // Planted on the place's top-right corner, like a pin in a map.
            className="absolute -translate-x-[15%] -translate-y-[105%] text-[15px] leading-none drop-shadow pointer-events-none"
            style={at(flagAt.x, flagAt.y)}
          >
            🚩
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/70 mt-1.5">⭐ {caption}</p>
      <p className="text-[11px] mt-0.5">
        <span className="text-amber-300 font-semibold">
          <span aria-hidden>{goal.zoneId ? '🚩' : '🎉'} </span>
          {nextLabel}
        </span>
        {how && <span className="block text-white/70">{how}</span>}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-white/60">
        {places.map((p) => (
          <li key={p.name} className={p.name === here?.place ? 'text-amber-300 font-semibold' : undefined}>
            <span aria-hidden>{emojiOf(p)} </span>
            {p.name}
            {p.name === flagAt?.place && <span aria-hidden> 🚩</span>}
          </li>
        ))}
        {landmarks.map((l) => (
          <li key={l.name}>
            <span aria-hidden>{l.emoji} </span>
            {l.name}
          </li>
        ))}
      </ul>
      {(boatLine || greatFogbank) && (
        <p className="text-[11px] text-white/60 mt-1">
          {boatLine && <span className="block">{boatLine}</span>}
          {greatFogbank && (
            <span className="block">
              <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: FOG_COLOR }} />
              The Great Fogbank — no boat can pass it
            </span>
          )}
        </p>
      )}
      {fogged && (
        <p className="text-[11px] text-white/60 mt-1">
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: FOG_COLOR }} />
          Fog — restore the crystal shown on it to clear it
          {foggedBanks.some((f) => fogMarker(f) === ANY_CRYSTAL_EMOJI) && <span> ({ANY_CRYSTAL_EMOJI} = any crystal)</span>}
          {anyHidden && <span className="block">{HIDDEN_PLACE_EMOJI} = a place still hidden in the fog</span>}
        </p>
      )}
    </div>
  );
}
