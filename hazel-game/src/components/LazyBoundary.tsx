import { Component, type ReactNode } from 'react';
import { errorMessage } from '../lib/errors';

interface Props {
  children: ReactNode;
  /** What shows in the page's place when it failed: its own words and a way to try again or go back. */
  failed: ReactNode;
}

/**
 * Keeps a lazy-loaded page's failure on that page (#29 review round 1): a
 * page whose file didn't load (offline, or a new version deployed while the
 * tab was open) shows `failed` in its place, instead of the whole game going
 * to the crash screen. Pair it with `retryableLazy` / `useLazyRetry`
 * (`lib/lazyRetry.ts`); key it by the retry so a loaded page starts afresh.
 */
export default class LazyBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn("A page didn't load:", errorMessage(error));
  }

  render() {
    return this.state.error ? this.props.failed : this.props.children;
  }
}
