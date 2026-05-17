import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorMessage } from '../lib/errors';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches uncaught render errors and shows the *actual* error (and, in dev,
 * the stack) instead of a blank white screen — so failures are diagnosable.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-red-950 p-6">
        <div className="bg-white text-gray-800 rounded-2xl p-8 max-w-lg w-full shadow-xl">
          <div className="text-4xl mb-3">💥</div>
          <h1 className="text-xl font-bold mb-2">Something crashed</h1>
          <p className="text-sm text-red-600 font-mono break-words mb-4">
            {errorMessage(error)}
          </p>
          {import.meta.env.DEV && error.stack && (
            <pre className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-3 overflow-auto max-h-48">
              {error.stack}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-5 py-2 transition"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
