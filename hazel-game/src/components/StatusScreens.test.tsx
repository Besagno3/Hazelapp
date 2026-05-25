import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen, ErrorScreen } from './StatusScreens';
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
});
