/**
 * Camera centre on one axis for a map `mapSize` px long seen through a
 * `viewSize` px viewport: follow `target`, but never show past the map edge.
 * Maps no bigger than the view stay centred (single-screen zones don't move).
 */
export function camAxis(target: number, mapSize: number, viewSize: number): number {
  if (mapSize <= viewSize) return mapSize / 2;
  const half = viewSize / 2;
  return Math.min(mapSize - half, Math.max(half, target));
}
