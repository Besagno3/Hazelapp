import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import { errorMessage } from '../lib/errors';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches uncaught render errors instead of a blank white screen. A kid sees
 * a friendly screen and Reload (#130 S6); the actual error — what makes a
 * failure diagnosable — goes to the console and sits folded under "Details
 * for grown-ups" (with the stack in dev).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  // The title takes the focus as the crash screen appears, so a screen reader hears it (#29 review round 2).
  private heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  // A crash in the very first render commits the boundary with its error at once.
  componentDidMount() {
    if (this.state.error) this.heading.current?.focus({ preventScroll: true });
  }

  componentDidUpdate(_: Props, prev: State) {
    if (!prev.error && this.state.error) this.heading.current?.focus({ preventScroll: true });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-indigo-950 p-6">
        <div className="bg-white text-gray-800 rounded-2xl p-8 max-w-lg w-full shadow-xl text-center">
          <div className="text-5xl mb-3" aria-hidden>
            🙈
          </div>
          <h1 ref={this.heading} tabIndex={-1} className="text-xl font-bold mb-2 focus:outline-none">
            Oops! The game tripped over.
          </h1>
          <p className="text-gray-700 mb-5">Tap Reload to jump back in. Your adventure is saved as you play.</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-6 py-2.5 transition"
          >
            🔄 Reload
          </button>
          <details className="group mt-6 text-left">
            {/* Flex hides the browser's ▸, so it brings its own: it turns down when open. */}
            <summary className="min-h-[44px] flex items-center gap-1.5 cursor-pointer list-none rounded-lg px-1 text-sm font-medium text-gray-600 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="inline-block w-4 text-center text-base leading-none transition-transform motion-reduce:transition-none group-open:rotate-90">
                ▸
              </span>
              <span className="underline decoration-dotted underline-offset-2">Details for grown-ups</span>
            </summary>
            <p className="text-sm text-red-700 font-mono break-words mt-1">{errorMessage(error)}</p>
            {import.meta.env.DEV && error.stack && (
              <pre className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded-lg p-3 overflow-auto max-h-48">
                {error.stack}
              </pre>
            )}
          </details>
        </div>
      </div>
    );
  }
}
