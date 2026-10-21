import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import ErrorDetails from './ErrorDetails';

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
          <ErrorDetails error={error} className="mt-6" />
        </div>
      </div>
    );
  }
}
