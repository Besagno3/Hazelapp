import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LoadingScreen, ErrorScreen, LazyFailedScreen, OutdatedScreen } from './StatusScreens';
import { retryableLazy } from '../lib/lazyRetry';
import { GENERIC_FACTS } from '../lib/funFacts';

describe('LoadingScreen', () => {
  it('shows the given label', () => {
    render(<LoadingScreen label="Building your questions…" />);
    expect(screen.getByText('Building your questions…')).toBeInTheDocument();
  });

  it('shows a fun fact while it waits', () => {
    render(<LoadingScreen label="Loading…" />);
    const rendered = GENERIC_FACTS.find((f) => screen.queryByText(f));
    expect(rendered).toBeDefined();
  });
});

describe('ErrorScreen', () => {
  it('renders the message and Try again when given a retry', () => {
    render(<ErrorScreen message="Network failed" onRetry={vi.fn()} />);
    expect(screen.getByText('Network failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('omits the retry when none is given', () => {
    render(<ErrorScreen message="Oops" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says "Something went wrong" unless given a friendlier title and button (#101i)', () => {
    const { unmount } = render(<ErrorScreen message="Oops" />);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    unmount();
    render(
      <ErrorScreen
        message="Refresh to keep playing."
        title="Hazel Quest has been updated!"
        emoji="✨"
        retryLabel="🔄 Refresh"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Hazel Quest has been updated!' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🔄 Refresh' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});

describe('OutdatedScreen', () => {
  it('the game was updated: says so, and that a refresh keeps everything (#101i)', () => {
    const refresh = vi.fn();
    render(<OutdatedScreen reason="update" onRefresh={refresh} />);
    expect(screen.getByRole('heading', { name: 'Hazel Quest has been updated!' })).toBeInTheDocument();
    expect(screen.getByText(/saved by the new version/)).toBeInTheDocument();
    screen.getByRole('button', { name: '🔄 Refresh' }).click();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('played on elsewhere: says where, and makes no promise about this tab\'s last moves (#151)', () => {
    render(<OutdatedScreen reason="elsewhere" onRefresh={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Your adventure moved on!' })).toBeInTheDocument();
    expect(screen.getByText(/another tab or on another device/)).toBeInTheDocument();
    expect(screen.queryByText(/has been updated|new version|nothing is lost/)).toBeNull();
    expect(screen.getByRole('button', { name: '🔄 Refresh' })).toBeInTheDocument();
  });
});

describe('LazyFailedScreen (#29 review round 1)', () => {
  it('offline from the start: says so and asks a grown-up; Try again waits in place while it tries', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const page = retryableLazy<object>(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
    render(<LazyFailedScreen page={page} onLoaded={vi.fn()} title="The world didn't load" />);
    expect(screen.getByText(`You're offline. Ask a grown-up to check the internet, then tap "Try again".`)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Try again' });
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('Trying…');
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    expect(button).toHaveFocus();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
