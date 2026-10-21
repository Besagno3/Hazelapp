import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense, useState } from 'react';
import LazyBoundary from '../components/LazyBoundary';
import { retryableLazy, retryLazy, serverAnswers, useLazyRetry, type RetryableLazy } from './lazyRetry';

const CHUNK_GONE = () => new TypeError('Failed to fetch dynamically imported module: http://localhost/src/Page.tsx');

function Page({ name }: { name: string }) {
  return <h2>Hello, {name}</h2>;
}

/** A page as GrownUpsArea wires one: a boundary keyed by the retry, Suspense inside it. */
function Harness({ page }: { page: RetryableLazy<{ name: string }> }) {
  const [tries, setTries] = useState(0);
  return (
    <LazyBoundary key={tries} failed={<Failed page={page} onLoaded={() => setTries((n) => n + 1)} />}>
      <Suspense fallback={<p>Loading…</p>}>
        <page.Component name="Mia" />
      </Suspense>
    </LazyBoundary>
  );
}

function Failed({ page, onLoaded }: { page: RetryableLazy<{ name: string }>; onLoaded: () => void }) {
  const { busy, words, tryAgain } = useLazyRetry(page, onLoaded);
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

function stubPage({ answers }: { answers: boolean }) {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, href: 'http://localhost/play/', reload });
  const fetch = vi.fn(() => (answers ? Promise.resolve(new Response(null, { status: 200 })) : Promise.reject(new TypeError('Failed to fetch'))));
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
    expect(fetch).toHaveBeenCalledWith('http://localhost/play/', { method: 'HEAD', cache: 'no-store' });
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

  it('serverAnswers: any answer counts; only a failed fetch is "out of reach"', async () => {
    stubPage({ answers: true });
    expect(await serverAnswers()).toBe(true);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))));
    expect(await serverAnswers()).toBe(true);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await serverAnswers()).toBe(false);
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
