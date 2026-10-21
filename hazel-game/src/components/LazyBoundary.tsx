import { Component, type ReactNode } from 'react';
import { errorMessage } from '../lib/errors';
import { isChunkLoadError } from '../lib/lazyRetry';

interface Props {
  children: ReactNode;
  /** What shows in the page's place when its file didn't load: its own words and a way to try again or go back. */
  failed: ReactNode;
}

/**
 * Keeps a lazy-loaded page's *file that didn't load* on that page (#29
 * review round 1): offline, or a new version deployed while the tab was open,
 * shows `failed` in its place instead of the whole game going to the crash
 * screen. Only that (#29 review round 2, `isChunkLoadError`): any other error
 * in the page — a bug, a junk save value — goes on to the app's
 * `ErrorBoundary`, which shows the error under "Details for grown-ups"; "Try
 * again" could only remount it into the same crash. Pair it with
 * `retryableLazy` / `useLazyRetry` (`lib/lazyRetry.ts`); key it by the retry
 * so a loaded page starts afresh.
 */
export default class LazyBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) console.warn("A page didn't load:", errorMessage(error));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Not a file that didn't load: the app's crash screen is the one for it.
    if (!isChunkLoadError(error)) throw error;
    return this.props.failed;
  }
}
