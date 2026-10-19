import { describe, it, expect, vi } from 'vitest';
import { authErrorMessage, errorMessage, friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE } from './errors';
import { MIN_PASSWORD_LENGTH } from '../content/family';

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

describe('friendlyMessage (#130 S6)', () => {
  it('keeps the error’s own words but drops the code, details and hint', () => {
    const pgError = { message: 'Could not save', details: 'row 3', hint: 'run the migration', code: '42703' };
    expect(friendlyMessage(pgError)).toBe('Could not save');
    // …which the logs still get.
    expect(errorMessage(pgError)).toContain('[42703]');
  });

  it('says plainly when the connection is the trouble', () => {
    expect(friendlyMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE);
    expect(friendlyMessage({ name: 'AuthRetryableFetchError', message: '{}', status: 0 })).toBe(NETWORK_MESSAGE);
    expect(friendlyMessage(new TypeError('Load failed'))).toBe(NETWORK_MESSAGE);
  });

  it('says you’re offline when the browser knows it', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(friendlyMessage(new Error('anything'))).toBe(OFFLINE_MESSAGE);
      expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(OFFLINE_MESSAGE);
    } finally {
      online.mockRestore();
    }
  });
});

describe('authErrorMessage (#130 S6)', () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['wrong email or password', { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }, /email and password don't match.*Forgot password/],
    ['…an older server, no code', { message: 'Invalid login credentials' }, /email and password don't match/],
    ['email not confirmed', { code: 'email_not_confirmed', message: 'Email not confirmed' }, /confirm your email first/],
    ['already registered', { code: 'user_already_exists', message: 'User already registered' }, /already an account with that email/],
    ['…email_exists', { code: 'email_exists', message: 'Email address already exists' }, /already an account/],
    ['weak password', { code: 'weak_password', message: 'Password should be at least 6 characters.' }, new RegExp(`too easy to guess.*at least ${MIN_PASSWORD_LENGTH} characters`)],
    ['…no code', { message: 'Password is too weak' }, /too easy to guess/],
    ['the same password again', { code: 'same_password', message: 'New password should be different from the old password.' }, /password you have now/],
    ['rate limited, with a wait', { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 39 seconds.', status: 429 }, /wait 39 seconds/],
    ['rate limited, no wait given', { message: 'Too many requests' }, /Too many tries.*wait a minute/],
    ['…by status alone', { message: 'Request rate limit reached', status: 429 }, /Too many tries/],
    ['a bad email address', { code: 'email_address_invalid', message: 'Email address "x@y" is invalid' }, /doesn't look right/],
    ['an expired link', { code: 'otp_expired', message: 'Token has expired or is invalid' }, /link has run out/],
    ['no session for a new password', { message: 'Auth session missing!' }, /link has run out/],
    ['sign-ups off', { code: 'signup_disabled', message: 'Signups not allowed for this instance' }, /paused/],
  ];
  it.each(cases)('%s', (_name, err, words) => {
    const msg = authErrorMessage(err);
    expect(msg).toMatch(words);
    // Never the raw code.
    expect(msg).not.toMatch(/\[|_/);
  });

  it('the network first, whatever the code', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe(NETWORK_MESSAGE);
  });

  it('anything else in its own words, without the code or details', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', message: 'Database error saving new user', details: 'trigger' })).toBe(
      'Database error saving new user',
    );
  });
});
