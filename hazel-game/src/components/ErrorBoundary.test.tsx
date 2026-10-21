import { describe, it, expect, vi, afterEach, onTestFinished } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Boom(): never {
  throw Object.assign(new Error('Cannot read properties of undefined (reading "hp")'), { code: 'TypeError' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary (#130 S6)', () => {
  it('a crash shows a friendly screen and Reload, not the raw error', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // React (dev) re-throws the render error for the browser to report; keep jsdom quiet.
    const quiet = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', quiet);
    onTestFinished(() => window.removeEventListener('error', quiet));
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // Heard as it appears: its title takes the focus (#29 review round 2).
    expect(screen.getByRole('heading', { name: 'Oops! The game tripped over.' })).toHaveFocus();
    expect(screen.getByRole('button', { name: /Reload/ })).toBeInTheDocument();
    // The actual error is still there for a grown-up — folded away — and in the console.
    const raw = screen.getByText(/Cannot read properties of undefined/, { selector: 'p' });
    const details = raw.closest('details')!;
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    const summary = details.querySelector('summary')!;
    expect(summary).toHaveTextContent('Details for grown-ups');
    // It looks like it opens: its own ▸ (flex hides the browser's), turning down when open, and a focus ring.
    const marker = summary.querySelector('[aria-hidden]')!;
    expect(marker).toHaveTextContent('▸');
    expect(marker).toHaveClass('group-open:rotate-90');
    expect(details).toHaveClass('group');
    expect(summary).toHaveClass('focus-visible:ring-2');
    expect(log).toHaveBeenCalledWith('Uncaught error:', expect.any(Error), expect.anything());
  });

  it('no crash, no screen', () => {
    render(
      <ErrorBoundary>
        <p>Playing</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Playing')).toBeInTheDocument();
    expect(screen.queryByText(/tripped over/)).toBeNull();
  });
});
