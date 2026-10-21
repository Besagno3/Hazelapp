import { lazy, useCallback, useRef, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { errorMessage, friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE } from './errors';

/**
 * A lazy-loaded page whose file can be loaded again after it failed (#29
 * review round 1). A page's file can fail to load — the device went offline,
 * or a new version was deployed while the tab was open and the old file is
 * gone — and React keeps a lazy component's failure for good, so trying
 * again needs a new lazy component: `retryLazy` makes one. Render
 * `<page.Component />` (it changes after a retry, so re-render to pick it up),
 * inside a `LazyBoundary` so a failure stays on that page.
 */
export interface RetryableLazy<P extends object> {
  Component: LazyExoticComponent<ComponentType<P>>;
  load: () => Promise<{ default: ComponentType<P> }>;
}

export function retryableLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): RetryableLazy<P> {
  return { Component: lazy(load), load };
}

/** Does the game's own server answer? (A HEAD of this page; any answer counts.) */
export async function serverAnswers(): Promise<boolean> {
  try {
    await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/**
 * What came of loading a page's file again: `loaded` (the next render shows
 * it), `reload` (it still fails while the server answers — a new version
 * replaced the file, or the browser kept the earlier failure, as Chrome does
 * for a module for the page's life; only a fresh page can load it) or
 * `unreachable` (the connection: reloading would lose the game, so it waits).
 */
export type LazyRetryOutcome = { outcome: 'loaded' } | { outcome: 'reload' } | { outcome: 'unreachable'; err: unknown };

export async function retryLazy<P extends object>(page: RetryableLazy<P>): Promise<LazyRetryOutcome> {
  try {
    const mod = await page.load();
    page.Component = lazy(() => Promise.resolve(mod));
    return { outcome: 'loaded' };
  } catch (err) {
    console.warn("A page's file didn't load again:", errorMessage(err));
    return (await serverAnswers()) ? { outcome: 'reload' } : { outcome: 'unreachable', err };
  }
}

/**
 * The "Try again" of a page whose file didn't load: `busy` while it tries (the
 * button waits with `aria-disabled`, keeping the keyboard's place), `words`
 * for the connection's trouble (offline, or the server out of reach), and
 * `onLoaded` once the file is in — the caller re-renders the page. A file
 * still missing while the server answers reloads the page: a new version is out.
 */
export function useLazyRetry<P extends object>(page: RetryableLazy<P>, onLoaded: () => void) {
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<string | null>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? OFFLINE_MESSAGE : null,
  );
  const trying = useRef(false);
  const tryAgain = useCallback(async () => {
    if (trying.current) return;
    trying.current = true;
    setBusy(true);
    const got = await retryLazy(page);
    if (got.outcome === 'loaded') {
      onLoaded();
      return;
    }
    if (got.outcome === 'reload') {
      window.location.reload();
      return;
    }
    setWords(friendlyMessage(got.err) === OFFLINE_MESSAGE ? OFFLINE_MESSAGE : NETWORK_MESSAGE);
    trying.current = false;
    setBusy(false);
  }, [page, onLoaded]);
  return { busy, words, tryAgain };
}
