import { useEffect, useRef } from 'react';
import { ZONES, fogAt } from '../../content/zones';
import type { ZoneId } from '../../types';
import { mapCellColor, whereOnMap } from '../../lib/worldMap';

/** Screen pixels per overworld tile on the map. */
const PX = 4;

/**
 * The menu's world map (#75 Phase 1, a stub): Dawnreach drawn small, fog where
 * it hasn't lifted yet, every place marked, and a pulsing star where you are —
 * so a kid can always answer "where am I?" and "where's everything else?".
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
  const here = whereOnMap(ZONES, world, zoneId, pos);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = fogAt(world, x, y, flags) ? '#e6e8f4' : mapCellColor(world.map[y][x]);
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    for (const p of world.places ?? []) {
      ctx.fillStyle = '#1a1626';
      ctx.fillRect(p.x * PX - 2, p.y * PX - 2, PX + 4, PX + 4);
      ctx.fillStyle = '#fff4c8';
      ctx.fillRect(p.x * PX - 1, p.y * PX - 1, PX + 2, PX + 2);
    }
  }, [world, cols, rows, flags]);

  const zoneName = ZONES[zoneId].name;
  const caption = !here
    ? `You're in ${zoneName}.`
    : here.exact
      ? `You're out on ${world.name}.`
      : here.place === zoneName
        ? `You're in ${zoneName}.`
        : `You're in ${zoneName}, beyond ${here.place}.`;

  return (
    <div className="bg-white/10 rounded-xl p-3 mb-3">
      <div className="font-bold text-sm mb-2">🗺️ {world.name}</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={cols * PX}
          height={rows * PX}
          role="img"
          aria-label={`Map of ${world.name}. ${caption}`}
          className="block w-full rounded-md"
          style={{ imageRendering: 'pixelated' }}
        />
        {here && (
          <span
            aria-hidden
            className="absolute -translate-x-1/2 -translate-y-1/2 text-base leading-none animate-pulse drop-shadow"
            style={{ left: `${((here.x + 0.5) / cols) * 100}%`, top: `${((here.y + 0.5) / rows) * 100}%` }}
          >
            ⭐
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/70 mt-1.5">⭐ {caption}</p>
      <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-white/55">
        {(world.places ?? []).map((p) => (
          <li key={p.name} className={p.name === here?.place ? 'text-amber-300 font-semibold' : undefined}>
            ◽ {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
