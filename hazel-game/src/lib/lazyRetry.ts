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

/**
 * Is this a file that didn't load (#29 review round 2)? Only that keeps a
 * failure on its page (`LazyBoundary`); any other error — a bug in the page,
 * a junk save value, a module that throws as it runs — goes on to the app's
 * crash screen, with its details for grown-ups. The browsers' own words for a
 * dynamic import that failed: Chrome "Failed to fetch dynamically imported
 * module", Firefox "error loading dynamically imported module", Safari
 * "Importing a module script failed."; Vite's "Unable to preload CSS"; a
 * bundler's `ChunkLoadError`.
 */
export function isChunkLoadError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return (
    typeof message === 'string' &&
    /dynamically imported module|importing a module script failed|unable to preload css|loading (css )?chunk \S+ failed/i.test(message)
  );
}

/**
 * Does the game's own server answer with the game's own page (#29 review
 * round 2)? A fresh GET of this page must come back OK (not a 5xx), from
 * this site (where any redirect ended — a hotel or school wifi's sign-in
 * page is elsewhere), as a web page carrying the game's own page (its title
 * and root: a sign-in page served in its place has neither). Anything else
 * — no answer, an error page, someone else's page — is "out of reach": a
 * reload would land on it and lose the game.
 */
export async function serverAnswers(): Promise<boolean> {
  try {
    const res = await fetch(window.location.href, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return false;
    if (res.url && new URL(res.url).origin !== window.location.origin) return false;
    if (!/text\/html/i.test(res.headers.get('content-type') ?? '')) return false;
    const page = await res.text();
    return page.includes('<title>Hazel Quest</title>') && page.includes('id="root"');
  } catch {
    return false;
  }
}

/**
 * What came of loading a page's file again: `loaded` (the next render shows
 * it), `reload` (it still fails while our server answers — a new version
 * replaced the file, or the browser kept the earlier failure, as Chrome does
 * for a module for the page's life; only a fresh page can load it) or
 * `unreachable` (the connection, or something that isn't our server in the
 * way: reloading would lose the game, so it waits).
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
 * still missing while our server answers reloads the page (a new version is
 * out); `beforeReload` runs first, so the page can leave a note for after
 * (📈 Progress does: the reload lands on "Who's playing?", #29 review round 2).
 */
export function useLazyRetry<P extends object>(page: RetryableLazy<P>, onLoaded: () => void, beforeReload?: () => void) {
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
      beforeReload?.();
      window.location.reload();
      return;
    }
    setWords(friendlyMessage(got.err) === OFFLINE_MESSAGE ? OFFLINE_MESSAGE : NETWORK_MESSAGE);
    trying.current = false;
    setBusy(false);
  }, [page, onLoaded, beforeReload]);
  return { busy, words, tryAgain };
}

/** The note 📈 Progress leaves before reloading for a new version (sessionStorage: this tab only). */
const RELOAD_NOTE_KEY = 'hazel-reloaded-for';

/** Remember, for after the reload, why the game reloaded itself. Storage that can't be written just drops the note. */
export function noteReloadFor(why: 'progress'): void {
  try {
    sessionStorage.setItem(RELOAD_NOTE_KEY, why);
  } catch {
    // Private mode / blocked storage: the reload still happens, unexplained.
  }
}

/** Why the game reloaded itself just now, once (the note is cleared as it's read); null when it didn't. */
export function takeReloadNote(): 'progress' | null {
  try {
    const why = sessionStorage.getItem(RELOAD_NOTE_KEY);
    sessionStorage.removeItem(RELOAD_NOTE_KEY);
    return why === 'progress' ? why : null;
  } catch {
    return null;
  }
}
