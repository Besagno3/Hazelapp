import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordInput from './PasswordInput';

function inForm(onSubmit = vi.fn()) {
  render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <PasswordInput placeholder="Password" autoComplete="current-password" defaultValue="dragonfire" />
    </form>,
  );
  return { field: screen.getByPlaceholderText('Password') as HTMLInputElement, onSubmit };
}

describe('PasswordInput (#117)', () => {
  it('starts hidden; the eye shows what was typed, and hides it again', () => {
    const { field } = inForm();
    expect(field.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field.type).toBe('text');
    expect(field.value).toBe('dragonfire');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field.type).toBe('password');
  });

  it('the eye never sends the form', () => {
    const { onSubmit } = inForm();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sending the form hides the password first', () => {
    const { field, onSubmit } = inForm();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    fireEvent.submit(field.form!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(field.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('keeps phone keyboards from changing a shown password, and passes its props through', () => {
    const { field } = inForm();
    expect(field).toHaveAttribute('autocapitalize', 'off');
    expect(field).toHaveAttribute('autocorrect', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(field).toHaveAttribute('autocomplete', 'current-password');
  });
});
