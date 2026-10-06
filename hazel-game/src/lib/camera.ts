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

/**
 * The camera's view measured in world pixels. A zoomed-out camera (scale < 1)
 * sees more of the world than the canvas is wide, so anything that works in
 * world space — edge clamping (`camAxis`) and which tiles to draw
 * (`visibleRange`) — must use this, not the raw canvas size.
 */
export function worldView(viewW: number, viewH: number, scale: { x: number; y: number }): { w: number; h: number } {
  return { w: viewW / scale.x, h: viewH / scale.y };
}
