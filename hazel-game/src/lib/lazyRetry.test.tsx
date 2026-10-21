import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense, useState } from 'react';
import LazyBoundary from '../components/LazyBoundary';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  isChunkLoadError,
  noteReloadFor,
  retryableLazy,
  retryLazy,
  serverAnswers,
  takeReloadNote,
  useLazyRetry,
  type RetryableLazy,
} from './lazyRetry';

const CHUNK_GONE = () => new TypeError('Failed to fetch dynamically imported module: http://localhost/src/Page.tsx');

function Page({ name }: { name: string }) {
  return <h2>Hello, {name}</h2>;
}

/** A page as GrownUpsArea wires one: a boundary keyed by the retry, Suspense inside it. */
function Harness({ page, beforeReload }: { page: RetryableLazy<{ name: string }>; beforeReload?: () => void }) {
  const [tries, setTries] = useState(0);
  return (
    <LazyBoundary key={tries} failed={<Failed page={page} onLoaded={() => setTries((n) => n + 1)} beforeReload={beforeReload} />}>
      <Suspense fallback={<p>Loading…</p>}>
        <page.Component name="Mia" />
      </Suspense>
    </LazyBoundary>
  );
}

function Failed({ page, onLoaded, beforeReload }: { page: RetryableLazy<{ name: string }>; onLoaded: () => void; beforeReload?: () => void }) {
  const { busy, words, tryAgain } = useLazyRetry(page, onLoaded, beforeReload);
  return (
    <div>
      <p>The page didn&apos;t load. {words ?? 'Try again.'}</p>
      <button aria-disabled={busy || undefined} onClick={busy ? undefined : () => void tryAgain()}>
        {busy ? 'Trying…' : 'Try again'}
      </button>
    </div>
  );
}

// React rethrows a render error on window in development; jsdom would print each one.
const quiet = (e: ErrorEvent) => e.preventDefault();
beforeEach(() => window.addEventListener('error', quiet));
afterEach(() => {
  window.removeEventListener('error', quiet);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The game's own page, as our server sends it (its title and root are what `serverAnswers` looks for). */
const OUR_PAGE = '<!doctype html><html><head><title>Hazel Quest</title></head><body><div id="root"></div></body></html>';
const page200 = (body = OUR_PAGE, type = 'text/html; charset=utf-8') => new Response(body, { status: 200, headers: { 'content-type': type } });

function stubPage({ answers }: { answers: boolean }) {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, href: 'http://localhost/play/', origin: 'http://localhost', reload });
  const fetch = vi.fn(() => (answers ? Promise.resolve(page200()) : Promise.reject(new TypeError('Failed to fetch'))));
  vi.stubGlobal('fetch', fetch);
  return { reload, fetch };
}

describe('a lazy page whose file fails to load (#29 review round 1)', () => {
  it('the failure stays on the page: its own words, not the crash screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = retryableLazy<{ name: string }>(() => Promise.reject(CHUNK_GONE()));
    render(<Harness page={page} />);
    expect(await screen.findByText(/The page didn't load\. Try again\./)).toBeInTheDocument();
    expect(warn.mock.calls.flat().join(' ')).toContain('Failed to fetch dynamically imported module');
  });

  it('Try again loads it afresh (React keeps a lazy failure, so a new one is made) and shows the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubPage({ answers: true });
    let fail = true;
    const load = vi.fn(() => (fail ? Promise.reject(CHUNK_GONE()) : Promise.resolve({ default: Page })));
    const page = retryableLazy(load);
    render(<Harness page={page} />);
    await screen.findByText(/didn't load/);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Hello, Mia' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('still missing while the server answers: a new version replaced the file, so the page reloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reload, fetch } = stubPage({ answers: true });
    const page = retryableLazy<{ name: string }>(() => Promise.reject(CHUNK_GONE()));
    render(<Harness page={page} />);
    await screen.findByText(/didn't load/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('http://localhost/play/', { cache: 'no-store', credentials: 'same-origin' });
  });

  it('before it reloads, the page leaves its note (📈 Progress: "Who\'s playing?" says why after, review round 2)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const order: string[] = [];
    const { reload } = stubPage({ answers: true });
    reload.mockImplementation(() => order.push('reload'));
    const page = retryableLazy<{ name: string }>(() => Promise.reject(CHUNK_GONE()));
    render(<Harness page={page} beforeReload={() => order.push('note')} />);
    await screen.findByText(/didn't load/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(order).toEqual(['note', 'reload']));
  });

  it('the server out of reach: no reload (it would lose the game), the connection in words, the keyboard keeps its place', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reload } = stubPage({ answers: false });
    const page = retryableLazy<{ name: string }>(() => Promise.reject(CHUNK_GONE()));
    render(<Harness page={page} />);
    await screen.findByText(/didn't load/);
    const button = screen.getByRole('button', { name: 'Try again' });
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('Trying…');
    expect(await screen.findByText(/We couldn't reach Hazel Quest\. Check your internet connection, then try again\./)).toBeInTheDocument();
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).toHaveFocus();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a tap while it tries does nothing more', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubPage({ answers: false });
    let finish: (v: { default: typeof Page }) => void = () => {};
    let calls = 0;
    const page = retryableLazy(() => {
      calls += 1;
      return calls === 1 ? Promise.reject<{ default: typeof Page }>(CHUNK_GONE()) : new Promise<{ default: typeof Page }>((r) => (finish = r));
    });
    render(<Harness page={page} />);
    await screen.findByText(/didn't load/);
    const button = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toBe(2);
    await act(async () => finish({ default: Page }));
    expect(await screen.findByRole('heading', { name: 'Hello, Mia' })).toBeInTheDocument();
  });

  it("serverAnswers: only our own page counts — not an error page, a wifi sign-in page or someone else's (review round 2)", async () => {
    stubPage({ answers: true });
    expect(await serverAnswers()).toBe(true);
    const answer = (res: Response | object) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(res)));
    // An error page: a 5xx or a 404 is no new version.
    answer(new Response(OUR_PAGE, { status: 503, headers: { 'content-type': 'text/html' } }));
    expect(await serverAnswers()).toBe(false);
    answer(new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } }));
    expect(await serverAnswers()).toBe(false);
    // A captive portal that answers in place with its own page…
    answer(page200('<html><head><title>Hotel Wi-Fi — sign in</title></head><body><form></form></body></html>'));
    expect(await serverAnswers()).toBe(false);
    // …or redirects there (fetch follows it to the other site), even one that copies our page.
    const redirected = { ok: true, redirected: true, url: 'http://portal.hotel.example/login', headers: new Headers({ 'content-type': 'text/html' }), text: async () => OUR_PAGE };
    answer(redirected);
    expect(await serverAnswers()).toBe(false);
    // Our own site redirecting to our own page is still us.
    answer({ ...redirected, url: 'http://localhost/play/' });
    expect(await serverAnswers()).toBe(true);
    // Not a web page at all, whatever it holds.
    answer(page200(OUR_PAGE, 'text/plain'));
    expect(await serverAnswers()).toBe(false);
    // No answer.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await serverAnswers()).toBe(false);
  });

  it('a wifi sign-in page in the way: no reload into it — the connection in words (review round 2)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reload } = stubPage({ answers: true });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(page200('<html><title>Sign in to Free WiFi</title></html>'))));
    const page = retryableLazy<{ name: string }>(() => Promise.reject(CHUNK_GONE()));
    render(<Harness page={page} />);
    await screen.findByText(/didn't load/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/We couldn't reach Hazel Quest\. Check your internet connection, then try again\./)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('isChunkLoadError: each browser\'s words for a file that didn\'t load, and nothing else (review round 2)', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://hazel.example/assets/ProgressPage-abc.js',
      'error loading dynamically imported module: https://hazel.example/assets/ProgressPage-abc.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/index-abc.css',
    ]) {
      expect(isChunkLoadError(new TypeError(message))).toBe(true);
    }
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 7 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
    for (const err of [new TypeError("Cannot read properties of undefined (reading 'tiles')"), new Error('Failed to fetch'), null, 'Importing a module script failed.', {}]) {
      expect(isChunkLoadError(err)).toBe(false);
    }
  });

  it('a page that loads but throws (a bug, not a missing file) goes on to the crash screen with its details — no Try again that remounts into it (review round 2)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Broken(): never {
      throw new TypeError("Cannot read properties of undefined (reading 'tiles')");
    }
    const page = retryableLazy<{ name: string }>(() => Promise.resolve({ default: Broken }));
    render(
      <ErrorBoundary>
        <Harness page={page} />
      </ErrorBoundary>,
    );
    const title = await screen.findByRole('heading', { name: 'Oops! The game tripped over.' });
    // The crash screen is heard: its title takes the focus.
    expect(title).toHaveFocus();
    expect(screen.getByText('Details for grown-ups')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /reading 'tiles'/.test(el.textContent ?? ''))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText(/didn't load/)).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).not.toContain("didn't load");
  });

  it("a module that throws as it runs isn't a missing file either: the crash screen, not a reload on every tap", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reload } = stubPage({ answers: true });
    const page = retryableLazy<{ name: string }>(() => Promise.reject(new ReferenceError('WorldCanvas is not defined')));
    render(
      <ErrorBoundary>
        <Harness page={page} />
      </ErrorBoundary>,
    );
    expect(await screen.findByRole('heading', { name: 'Oops! The game tripped over.' })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /WorldCanvas is not defined/.test(el.textContent ?? ''))).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('the note left before a reload is read once, after it', () => {
    expect(takeReloadNote()).toBeNull();
    noteReloadFor('progress');
    expect(takeReloadNote()).toBe('progress');
    expect(takeReloadNote()).toBeNull();
    sessionStorage.setItem('hazel-reloaded-for', 'something-else');
    expect(takeReloadNote()).toBeNull();
  });

  it('retryLazy swaps in a new component only when the file loads', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubPage({ answers: false });
    const page = retryableLazy<{ name: string }>(() => Promise.reject(CHUNK_GONE()));
    const first = page.Component;
    expect(await retryLazy(page)).toMatchObject({ outcome: 'unreachable' });
    expect(page.Component).toBe(first);
    page.load = () => Promise.resolve({ default: Page });
    expect(await retryLazy(page)).toEqual({ outcome: 'loaded' });
    expect(page.Component).not.toBe(first);
  });
});
