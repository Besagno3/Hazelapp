/**
 * On-screen d-pad for tablets/phones (#37, from the #36 follow-up list).
 * Reports the held direction via `onDirChange`; the parent stores it in a
 * ref the KaPlay loop reads each frame — no React re-renders while walking.
 */
export default function TouchPad({
  onDirChange,
}: {
  onDirChange: (dx: number, dy: number) => void;
}) {
  function hold(dx: number, dy: number) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        onDirChange(dx, dy);
      },
      onPointerUp: () => onDirChange(0, 0),
      onPointerLeave: () => onDirChange(0, 0),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  }

  const btn =
    'w-12 h-12 bg-white/20 active:bg-white/40 rounded-xl text-white text-xl font-bold select-none touch-none flex items-center justify-center';

  return (
    <div className="grid grid-cols-3 gap-1 sm:hidden mt-3" aria-label="movement pad">
      <div />
      <button className={btn} {...hold(0, -1)} aria-label="up">▲</button>
      <div />
      <button className={btn} {...hold(-1, 0)} aria-label="left">◀</button>
      <div />
      <button className={btn} {...hold(1, 0)} aria-label="right">▶</button>
      <div />
      <button className={btn} {...hold(0, 1)} aria-label="down">▼</button>
      <div />
    </div>
  );
}
