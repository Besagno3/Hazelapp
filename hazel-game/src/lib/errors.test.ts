import { describe, it, expect, vi } from 'vitest';
import {
  authErrorMessage,
  authRetryAfter,
  errorMessage,
  friendlyMessage,
  isExpiredLink,
  NETWORK_MESSAGE,
  OFFLINE_MESSAGE,
  SEND_FAILED_MESSAGE,
  SIGNED_OUT_MESSAGE,
  TROUBLE_MESSAGE,
  sessionRanOut,
  type AuthWhere,
} from './errors';

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
    ['weak password: too short', { code: 'weak_password', message: 'Password should be at least 8 characters.', reasons: ['length'] }, /^That password is too short\. Use at least 8 characters\.$/],
    ['…no code', { message: 'Password should be at least 10 characters.' }, /at least 10 characters/],
    ['the same password again', { code: 'same_password', message: 'New password should be different from the old password.' }, /password you have now/],
    ['rate limited, with a wait', { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 39 seconds.', status: 429 }, /wait 39 seconds/],
    ['rate limited, no wait given', { message: 'Too many requests' }, /Too many tries.*wait a minute/],
    ['the hourly email cap: an hour, not a minute', { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 }, /^We can't send more emails right now\. Please try again in about an hour\.$/],
    ['…an older server, no code', { message: 'Email rate limit exceeded', status: 429 }, /about an hour/],
    ['…by status alone', { message: 'Request rate limit reached', status: 429 }, /Too many tries/],
    ['a bad email address', { code: 'email_address_invalid', message: 'Email address "x@y" is invalid' }, /doesn't look right/],
    ['an expired link', { code: 'otp_expired', message: 'Token has expired or is invalid' }, /link has run out/],
    ['the session gone (off the reset page)', { message: 'Auth session missing!' }, /^Your sign-in ran out — please sign in again\.$/],
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

  it('anything nobody mapped says what didn’t happen, in plain words — never the server’s own English (#159 r2)', () => {
    const odd = { code: 'email_provider_disabled', message: 'Email logins are disabled', details: 'config', status: 400 };
    const said: Record<AuthWhere, string> = {
      'sign-in': "We couldn't sign you in just now. Please try again in a few minutes.",
      'sign-up': "We couldn't make your account just now. Please try again in a few minutes.",
      gate: "We couldn't check your password just now. Please try again in a few minutes.",
      reset: "We couldn't save your new password just now. Please try again in a few minutes.",
      forgot: "We couldn't send a reset link just now. Please try again in a few minutes.",
      resend: "We couldn't send the link again just now. Please try again in a few minutes.",
      link: 'That email link didn\'t work. Sign in to get a new one, or tap "Forgot password?".',
    };
    for (const [where, words] of Object.entries(said) as [AuthWhere, string][]) {
      const msg = authErrorMessage(odd, { where });
      expect(msg).toBe(words);
      expect(msg).not.toMatch(/Email logins|something went wrong/i);
    }
    // Sign-in's, by default.
    expect(authErrorMessage(odd)).toBe(said['sign-in']);
  });
});

describe('authErrorMessage — review round 2 (#159)', () => {
  it('a non-JSON error page (Cloudflare 520/522/524, a proxy’s HTML 500: AuthUnknownError, no status) is the service’s trouble, not parser text', () => {
    const html = { name: 'AuthUnknownError', message: 'Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON' };
    expect(authErrorMessage(html)).toBe(TROUBLE_MESSAGE);
    expect(authErrorMessage(html, { where: 'gate' })).toBe(TROUBLE_MESSAGE);
    expect(friendlyMessage(html)).toBe(TROUBLE_MESSAGE);
    // …by its words too, whatever carries them.
    expect(friendlyMessage(new SyntaxError('Unexpected end of JSON input'))).toBe(TROUBLE_MESSAGE);
    expect(friendlyMessage(new SyntaxError('JSON.parse: unexpected character at line 1 column 1 of the JSON data'))).toBe(TROUBLE_MESSAGE);
    expect(friendlyMessage(new SyntaxError("JSON Parse error: Unrecognized token '<'"))).toBe(TROUBLE_MESSAGE);
  });

  it('"after 0 seconds" (GoTrue rounds down) waits 1 second — the words and the countdown agree', () => {
    const zero = { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 0 seconds.', status: 429 };
    expect(authErrorMessage(zero)).toBe('Too many tries for now. Please wait 1 second, then try again.');
    expect(authRetryAfter(zero)).toBe(1);
    // Never the hourly cap, which has no wait in it.
    expect(authErrorMessage(zero)).not.toMatch(/hour/);
  });

  it('the hourly email cap names spam only where a link went out before: the resend', () => {
    const cap = { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 };
    expect(authErrorMessage(cap, { where: 'resend' })).toBe(
      "We've sent a lot of emails just now. Please try again in about an hour (and check spam for the last one).",
    );
    for (const where of ['sign-up', 'forgot', 'gate', 'sign-in'] as const) {
      const msg = authErrorMessage(cap, { where });
      expect(msg).toBe("We can't send more emails right now. Please try again in about an hour.");
      expect(msg).not.toMatch(/spam|last one|sent a lot/);
    }
  });

  it('a sign-in that ran out (JWT, refresh token, session) says to sign in again — on the reset page, that the link ran out', () => {
    const gone = [
      { code: 'bad_jwt', message: 'invalid JWT: unable to parse or verify signature, token is expired', status: 403 },
      { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
      { code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used', status: 400 },
      { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 },
      { message: 'invalid JWT: token is expired' },
    ];
    for (const err of gone) {
      expect(sessionRanOut(err)).toBe(true);
      expect(authErrorMessage(err)).toBe(SIGNED_OUT_MESSAGE);
      expect(authErrorMessage(err)).not.toMatch(/JWT|token|Refresh/);
      expect(authErrorMessage(err, { where: 'reset' })).toBe('That link has run out. Tap "Back to sign in", then "Forgot password?" for a new one.');
    }
    expect(sessionRanOut({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false);
  });

  it('an email link that came back with an error says why, on sign-in (#159 r2 also noted)', () => {
    expect(authErrorMessage({ code: 'otp_expired', message: 'Email link is invalid or has expired' }, { where: 'link' })).toBe(
      'That email link has run out. Sign in to get a new one, or tap "Forgot password?".',
    );
    expect(authErrorMessage({ code: 'access_denied', message: 'Email link is invalid or has expired' }, { where: 'link' })).toMatch(/run out/);
  });
});

describe('authErrorMessage — a refused password says what to change (#130 S6 review)', () => {
  const SETS = "abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
  const chars = (sets = SETS) => ({ code: 'weak_password', message: `Password should contain at least one character of each: ${sets}.`, reasons: ['characters'] });

  it('kinds of character: only the ones the password is missing', () => {
    expect(authErrorMessage(chars(), { password: 'dragonfire1' })).toBe('That password needs a capital letter and a symbol (like ! or ?).');
    expect(authErrorMessage(chars('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789'), { password: 'dragonfire' })).toBe(
      'That password needs a number.',
    );
  });

  it('…every kind it asks for, when the password isn’t known', () => {
    expect(authErrorMessage(chars())).toBe('That password needs a small letter, a capital letter, a number and a symbol (like ! or ?).');
  });

  it('a password from a data leak: choose another — not a rule it already meets', () => {
    const msg = authErrorMessage(
      { code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.', reasons: ['pwned'] },
      { password: 'dragonfire11' },
    );
    expect(msg).toBe('That password has shown up in a data leak. Choose a different one.');
  });

  it('two rules at once, in one line', () => {
    const err = {
      code: 'weak_password',
      message: 'Password should be at least 8 characters. Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
      reasons: ['length', 'characters'],
    };
    expect(authErrorMessage(err, { password: 'dragon' })).toBe('That password is too easy to guess. Use at least 8 characters, with a capital letter and a number.');
  });

  it('a rule it doesn’t know: the server’s own words, tidied', () => {
    expect(authErrorMessage({ code: 'weak_password', message: 'password must not contain your name', reasons: [] })).toBe(
      'Password must not contain your name.',
    );
  });
});

describe('authErrorMessage — only points at what the screen has (#130 S6 review)', () => {
  const wrong = { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 };
  const taken = { code: 'user_already_exists', message: 'User already registered', status: 422 };

  it('the 👪 Grown-ups gate has no email field, and its link is "Forgot it?"', () => {
    const msg = authErrorMessage(wrong, { where: 'gate' });
    expect(msg).toBe('That password isn\'t right. Try again, or tap "Forgot it?" below.');
    expect(msg).not.toMatch(/email|Forgot password/);
  });

  it('sign-up hides "Forgot password?": it says to sign in', () => {
    const msg = authErrorMessage(taken, { where: 'sign-up' });
    expect(msg).toMatch(/already an account with that email\. Tap "Sign in" below instead/);
    expect(msg).not.toMatch(/Forgot password/);
  });

  it('the reset page names its own way back', () => {
    expect(authErrorMessage({ code: 'otp_expired', message: 'Email link is invalid or has expired' }, { where: 'reset' })).toBe(
      'That link has run out. Tap "Back to sign in", then "Forgot password?" for a new one.',
    );
  });
});

describe('authErrorMessage — the server’s own trouble isn’t the grown-up’s connection (#130 S6 review)', () => {
  it('a 502/503/504 (supabase-js: AuthRetryableFetchError with that status) says to try again in a few minutes', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'upstream connect error', status: 503 })).toBe(TROUBLE_MESSAGE);
    expect(friendlyMessage({ name: 'AuthRetryableFetchError', message: '{}', status: 504 })).toBe(TROUBLE_MESSAGE);
  });

  it('…while a fetch that never got an answer still says to check the connection', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe(NETWORK_MESSAGE);
  });

  it('an unexpected failure on Supabase’s side, in plain words', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', message: 'Database error saving new user', status: 500 })).toBe(TROUBLE_MESSAGE);
    expect(authErrorMessage({ message: 'Internal Server Error', status: 500 })).toBe(TROUBLE_MESSAGE);
  });

  it('an email that couldn’t be sent says just that', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', message: 'Error sending confirmation email', status: 500 })).toBe(SEND_FAILED_MESSAGE);
    expect(authErrorMessage({ message: 'Error sending recovery email', status: 500 })).toBe(SEND_FAILED_MESSAGE);
    expect(authErrorMessage({ code: 'email_address_not_authorized', message: 'Email address "a@b.co" cannot be used as it is not authorized', status: 400 })).toBe(
      SEND_FAILED_MESSAGE,
    );
  });
});

describe('isExpiredLink: a link that ran out, not any "expired"', () => {
  it('the email link’s own errors', () => {
    expect(isExpiredLink({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe(true);
    expect(isExpiredLink({ message: 'Email link is invalid or has expired' })).toBe(true);
    // The reset link's recovery session gone (supabase-js turns session_not_found into this) — on the reset page.
    const missing = { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 };
    expect(isExpiredLink(missing, { where: 'reset' })).toBe(true);
    expect(isExpiredLink({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' }, { where: 'reset' })).toBe(true);
    // Anywhere else it's the sign-in that ran out, not a link.
    expect(isExpiredLink(missing)).toBe(false);
  });

  it('a JWT that has expired is not a link that ran out', () => {
    const jwt = { code: 'bad_jwt', message: 'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired', status: 403 };
    expect(isExpiredLink(jwt)).toBe(false);
    expect(authErrorMessage(jwt)).not.toMatch(/run out/);
  });
});

describe('authRetryAfter: how long the resend button counts down after a refusal', () => {
  it('the wait the server named', () => {
    expect(authRetryAfter({ code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 12 seconds.', status: 429 })).toBe(12);
  });
  it('a minute for a request limit', () => {
    expect(authRetryAfter({ code: 'over_request_rate_limit', message: 'Request rate limit reached', status: 429 })).toBe(60);
  });
  it('none for the hourly email cap (a countdown would promise falsely), or anything else', () => {
    expect(authRetryAfter({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 })).toBeNull();
    expect(authRetryAfter({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBeNull();
  });
});
