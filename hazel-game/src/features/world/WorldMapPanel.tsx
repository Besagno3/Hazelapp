import { useEffect, useRef } from 'react';
import { TILE, ZONES, fogAt, fogLifted } from '../../content/zones';
import type { ZoneId } from '../../types';
import {
  ANY_CRYSTAL_EMOJI,
  FOG_COLOR,
  HIDDEN_PLACE_EMOJI,
  fogMarker,
  fogMarkerAt,
  mapCaption,
  mapCellColor,
  placeEmoji,
  whereOnMap,
} from '../../lib/worldMap';
import { goalDirections, nextObjective } from '../../lib/wayfinding';

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
}: {
  zoneId: ZoneId;
  pos: { x: number; y: number } | null;
  flags: Record<string, boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = ZONES.dawnreach;
  const cols = world.map[0].length;
  const rows = world.map.length;
  const places = world.places ?? [];
  const here = whereOnMap(ZONES, world, zoneId, pos);
  const foggedBanks = (world.fogs ?? []).filter((f) => !fogLifted(f, flags));
  const fogged = foggedBanks.length > 0;
  const emojiOf = (p: (typeof places)[number]) => placeEmoji(world, p, flags);
  const anyHidden = places.some((p) => emojiOf(p) === HIDDEN_PLACE_EMOJI);
  const goal = nextObjective(flags);
  const flagAt = goal.zoneId ? whereOnMap(ZONES, world, goal.zoneId, null) : null;
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

  const caption = mapCaption(here, ZONES[zoneId].name, world.name);
  const nextLabel = goal.zoneId ? `Next: ${goal.title}` : goal.why;
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
          aria-label={`Map of ${world.name}. ${caption}. ${goal.zoneId ? `${nextLabel}, flagged at ${flagAt?.place ?? ZONES[goal.zoneId].name}.` : nextLabel}`}
          className="block w-full rounded-md"
          style={{ imageRendering: 'pixelated' }}
        />
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
      </ul>
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
