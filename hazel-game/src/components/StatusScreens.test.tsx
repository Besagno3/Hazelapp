import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen, ErrorScreen } from './StatusScreens';

describe('LoadingScreen', () => {
  it('shows the given label', () => {
    render(<LoadingScreen label="Building your questions…" />);
    expect(screen.getByText('Building your questions…')).toBeInTheDocument();
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
