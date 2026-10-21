import { errorMessage } from '../lib/errors';

/**
 * The real error, folded under "Details for grown-ups" (#130 S6): shut by
 * default, with its own ▸ that turns down when open (flex hides the
 * browser's). The crash screen and 📈 Progress's "something went wrong" card
 * (#29 review round 3) show it.
 */
export default function ErrorDetails({ error, className }: { error: Error; className?: string }) {
  return (
    <details className={`group text-left ${className ?? ''}`}>
      <summary className="min-h-[44px] flex items-center gap-1.5 cursor-pointer list-none rounded-lg px-1 text-sm font-medium text-gray-600 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block w-4 text-center text-base leading-none transition-transform motion-reduce:transition-none group-open:rotate-90">
          ▸
        </span>
        <span className="underline decoration-dotted underline-offset-2">Details for grown-ups</span>
      </summary>
      <p className="text-sm text-red-700 font-mono break-words mt-1">{errorMessage(error)}</p>
      {import.meta.env.DEV && error.stack && (
        <pre className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded-lg p-3 overflow-auto max-h-48">{error.stack}</pre>
      )}
    </details>
  );
}
