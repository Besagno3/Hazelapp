import { useEffect, useRef } from 'react';
import { ZONES, fogAt } from '../../content/zones';
import type { ZoneId } from '../../types';
import { FOG_COLOR, PLACE_EMOJI, mapCaption, mapCellColor, whereOnMap } from '../../lib/worldMap';

/** Screen pixels per overworld tile on the map. */
const PX = 4;

/**
 * The menu's world map (#75 Phase 1, a stub): Dawnreach drawn small, fog where
 * it hasn't lifted yet, each place marked with its own emoji, and a pulsing
 * star where you are — so a kid can always answer "where am I?" and "where's
 * everything else?".
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
  const fogged = (world.fogs ?? []).some((f) => !f.liftedBy.some((flag) => flags[flag]));

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
          aria-label={`Map of ${world.name}. ${caption}.`}
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
            {PLACE_EMOJI[p.icon]}
          </span>
        ))}
        {here && (
          <span
            aria-hidden
            // Out on the map the star is you; inside a place it perches on
            // top of that place's emoji like a pin, so both stay visible.
            className={`absolute -translate-x-1/2 ${here.exact ? '-translate-y-1/2' : '-translate-y-[110%]'} text-base leading-none animate-pulse drop-shadow pointer-events-none`}
            style={at(here.x, here.y)}
          >
            ⭐
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/70 mt-1.5">⭐ {caption}</p>
      <ul className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-white/60">
        {places.map((p) => (
          <li key={p.name} className={p.name === here?.place ? 'text-amber-300 font-semibold' : undefined}>
            <span aria-hidden>{PLACE_EMOJI[p.icon]} </span>
            {p.name}
          </li>
        ))}
      </ul>
      {fogged && (
        <p className="text-[11px] text-white/60 mt-1">
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: FOG_COLOR }} />
          Fog — restore a crystal to clear it
        </p>
      )}
    </div>
  );
}
