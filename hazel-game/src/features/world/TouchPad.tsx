/**
 * On-screen d-pad for tablets/phones (#37, from the #36 follow-up list).
 * Reports the held direction via `onDirChange`; the parent stores it in a
 * ref the KaPlay loop reads each frame — no React re-renders while walking.
 * Beside it, the ✋ button uses what the hero faces (#124) — opens a chest,
 * talks to someone — and says what it would do (`action`, from the canvas).
 */
export default function TouchPad({
  onDirChange,
  onAction,
  action = null,
}: {
  onDirChange: (dx: number, dy: number) => void;
  onAction?: () => void;
  /** What ✋ would do now ("Open chest", "Talk"), or null with nothing to use. */
  action?: string | null;
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
    <div className="flex items-center gap-6 sm:hidden mt-3">
      <div className="grid grid-cols-3 gap-1" aria-label="movement pad">
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
      {onAction && (
        <button
          type="button"
          aria-label={action ?? 'Use (nothing here yet)'}
          // On the press, like the d-pad — a tap's click would come late. A
          // keyboard's Enter / Space click (detail 0) still works it.
          onPointerDown={(e) => {
            e.preventDefault();
            onAction();
          }}
          onClick={(e) => {
            if (e.detail === 0) onAction();
          }}
          onContextMenu={(e) => e.preventDefault()}
          className={`w-20 h-20 rounded-full flex flex-col items-center justify-center select-none touch-none font-extrabold shadow-lg transition-opacity ${
            action ? 'bg-amber-300 active:bg-amber-200 text-amber-950' : 'bg-white/20 text-white/60'
          }`}
        >
          <span aria-hidden className="text-2xl leading-none">✋</span>
          <span aria-hidden className="text-[11px] leading-tight mt-1 px-1 text-center">{action ?? 'Use'}</span>
        </button>
      )}
    </div>
  );
}
