import { describe, it, expect, afterEach } from 'vitest';
import {
  countdownClock,
  forgetAllLocks,
  forgetLock,
  functionMissing,
  grownUpLockedText,
  kidLockedText,
  kidLockKey,
  lockLeft,
  pinCheckMessage,
  PIN_CHECK_FAILED,
  pinVerdict,
  rememberLock,
  triesLeftText,
  waitLength,
} from './pinLock';
import { NETWORK_MESSAGE, SIGNED_OUT_MESSAGE } from './errors';
// The database's ladder, read as text: the words the pad says must match it.
import migration0022 from '../../supabase/migrations/0022_pin_attempt_limit.sql?raw';

afterEach(() => forgetAllLocks());

describe('reading a PIN try (#124c)', () => {
  it("reads the database's answer", () => {
    expect(pinVerdict({ ok: true, tries_left: 5, wait_seconds: 0 })).toEqual({ ok: true, triesLeft: 5, waitSeconds: 0, limited: true });
    expect(pinVerdict({ ok: false, tries_left: 2, wait_seconds: 0 })).toEqual({ ok: false, triesLeft: 2, waitSeconds: 0, limited: true });
    expect(pinVerdict({ ok: false, tries_left: 0, wait_seconds: 299.2 })).toEqual({ ok: false, triesLeft: 0, waitSeconds: 300, limited: true });
    // Not your kid / no PIN: nothing counted.
    expect(pinVerdict({ ok: false, tries_left: null, wait_seconds: 0 })).toMatchObject({ triesLeft: null, limited: true });
  });

  it('an older database (a bare true / false) counts nothing; junk is a plain no', () => {
    expect(pinVerdict(true)).toEqual({ ok: true, triesLeft: null, waitSeconds: 0, limited: false });
    expect(pinVerdict(false)).toEqual({ ok: false, triesLeft: null, waitSeconds: 0, limited: false });
    for (const junk of [null, undefined, 'yes', [true], 7]) expect(pinVerdict(junk)).toMatchObject({ ok: false, limited: false });
    expect(pinVerdict({ ok: 'true', wait_seconds: 'soon', tries_left: -3 })).toEqual({ ok: false, triesLeft: 0, waitSeconds: 0, limited: true });
  });

  it('knows a missing function (migration 0022 not applied) from any other error', () => {
    expect(functionMissing({ code: 'PGRST202', message: 'Could not find the function public.try_kid_pin' })).toBe(true);
    expect(functionMissing({ code: '42883', message: 'function does not exist' })).toBe(true);
    expect(functionMissing({ message: 'Could not find the function public.try_parent_pin(p_pin) in the schema cache' })).toBe(true);
    expect(functionMissing({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(functionMissing(new Error('Failed to fetch'))).toBe(false);
    expect(functionMissing(null)).toBe(false);
  });
});

describe('the words and the countdown', () => {
  it('waits in words a kid knows, rounded up', () => {
    expect(waitLength(1)).toBe('1 second');
    expect(waitLength(30)).toBe('30 seconds');
    expect(waitLength(60)).toBe('1 minute');
    expect(waitLength(61)).toBe('2 minutes');
    expect(waitLength(300)).toBe('5 minutes');
    expect(waitLength(900)).toBe('15 minutes');
    expect(waitLength(3600)).toBe('1 hour');
    expect(waitLength(0)).toBe('1 second');
  });

  it('the ladder the database uses is the one the words describe (1, 5, 15, 60 minutes)', () => {
    const ladder = [...migration0022.matchAll(/when p_lockouts (?:<= 1|= \d) then (\d+)/g)].map((m) => Number(m[1]));
    expect(ladder).toEqual([60, 300, 900]);
    expect(migration0022).toMatch(/else 3600/);
    expect(migration0022).toMatch(/c_tries constant integer := 5;/);
    expect([60, 300, 900, 3600].map(waitLength)).toEqual(['1 minute', '5 minutes', '15 minutes', '1 hour']);
  });

  it('counts down as m:ss', () => {
    expect(countdownClock(300)).toBe('5:00');
    expect(countdownClock(245)).toBe('4:05');
    expect(countdownClock(9)).toBe('0:09');
    expect(countdownClock(3600)).toBe('60:00');
    expect(countdownClock(-2)).toBe('0:00');
  });

  it('kid and grown-up lines', () => {
    expect(kidLockedText('5 minutes')).toBe('Too many tries — ask a grown-up, or wait 5 minutes.');
    expect(grownUpLockedText('1 minute')).toBe('Too many tries. Use your password instead, or wait 1 minute.');
    expect(triesLeftText(2)).toBe('2 more tries before a rest.');
    expect(triesLeftText(1)).toBe('1 more try before a rest.');
  });

  it('a check that failed never shows the database’s words', () => {
    expect(pinCheckMessage(new Error('Failed to fetch'))).toBe(NETWORK_MESSAGE);
    expect(pinCheckMessage({ message: 'JWT expired', code: 'PGRST301' })).toBe(SIGNED_OUT_MESSAGE);
    expect(pinCheckMessage({ message: 'permission denied for function try_kid_pin', code: '42501' })).toBe(PIN_CHECK_FAILED);
  });
});

describe('locks this tab remembers', () => {
  it('counts down from when it was heard, and forgets one that ran out or a new PIN', () => {
    const key = kidLockKey('kid-sam');
    expect(lockLeft(key)).toBe(0);
    rememberLock(key, 300, 1_000_000);
    expect(lockLeft(key, 1_000_000)).toBe(300);
    expect(lockLeft(key, 1_000_000 + 1500)).toBe(299);
    expect(lockLeft(kidLockKey('kid-kit'), 1_000_000)).toBe(0);
    expect(lockLeft(key, 1_000_000 + 300_000)).toBe(0);
    rememberLock(key, 60, 2_000_000);
    forgetLock(key);
    expect(lockLeft(key, 2_000_000)).toBe(0);
    rememberLock(key, 0, 2_000_000);
    expect(lockLeft(key, 2_000_000)).toBe(0);
  });
});
