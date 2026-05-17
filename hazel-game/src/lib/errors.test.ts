import { describe, it, expect } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('returns a string unchanged', () => {
    expect(errorMessage('boom')).toBe('boom');
  });

  it('uses an Error message', () => {
    expect(errorMessage(new Error('network down'))).toBe('network down');
  });

  it('includes a Supabase-style code, details and hint', () => {
    const pgError = {
      message: 'column "xp" does not exist',
      details: 'check the schema',
      hint: 'run the migration',
      code: '42703',
    };
    const msg = errorMessage(pgError);
    expect(msg).toContain('column "xp" does not exist');
    expect(msg).toContain('42703');
    expect(msg).toContain('run the migration');
  });

  it('falls back to an `error` field', () => {
    expect(errorMessage({ error: 'bad topic' })).toBe('bad topic');
  });

  it('handles null and undefined', () => {
    expect(errorMessage(null)).toBe('Unknown error');
    expect(errorMessage(undefined)).toBe('Unknown error');
  });

  it('serialises an opaque object rather than losing it', () => {
    expect(errorMessage({ weird: 1 })).toBe('{"weird":1}');
  });
});
