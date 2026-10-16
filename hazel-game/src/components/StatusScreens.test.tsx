import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen, ErrorScreen, OutdatedScreen } from './StatusScreens';
import { FUN_FACTS, GENERIC_FACTS } from '../lib/funFacts';

describe('LoadingScreen', () => {
  it('shows the given label', () => {
    render(<LoadingScreen label="Building your questions…" />);
    expect(screen.getByText('Building your questions…')).toBeInTheDocument();
  });

  it('shows a topic-specific fact when given a topic', () => {
    render(<LoadingScreen label="Loading…" topic="math" />);
    // The rendered fact must be one of the topic's pool.
    const rendered = FUN_FACTS.math.find((f) => screen.queryByText(f));
    expect(rendered).toBeDefined();
  });

  it('falls back to a generic fact when no topic is given', () => {
    render(<LoadingScreen label="Loading…" />);
    const rendered = GENERIC_FACTS.find((f) => screen.queryByText(f));
    expect(rendered).toBeDefined();
  });
});

describe('ErrorScreen', () => {
  it('renders the message and both actions when handlers are given', () => {
    render(<ErrorScreen message="Network failed" onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Network failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('omits actions that are not provided', () => {
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
