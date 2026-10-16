/** A gauntlet's candle-lights (the Spire's climb, the Name finale, #75 item 16e): lit ones, then snuffed. */
export function Candles({ lit, total }: { lit: number; total: number }) {
  return (
    <span title="Candle-lights" className="text-sm whitespace-nowrap" role="img" aria-label={`${lit} of ${total} candle-lights left`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} aria-hidden className={i < lit ? '' : 'opacity-25 grayscale'}>
          🕯️
        </span>
      ))}
    </span>
  );
}
