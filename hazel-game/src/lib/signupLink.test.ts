import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropSignupParam, hasSignupParam } from './signupLink';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('the public site\'s ?signup (#146)', () => {
  it('is spotted with or without a value, and only by its own name', () => {
    expect(hasSignupParam('?signup')).toBe(true);
    expect(hasSignupParam('?a=1&signup=1')).toBe(true);
    expect(hasSignupParam('')).toBe(false);
    expect(hasSignupParam('?signups')).toBe(false);
  });

  it('is dropped from the address, keeping everything else', () => {
    window.history.replaceState({ keep: 1 }, '', '/play/?code=abc&signup#top');
    dropSignupParam();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/play/?code=abc#top');
    expect(window.history.state).toEqual({ keep: 1 });
  });

  it('leaves an address without it alone', () => {
    window.history.replaceState(null, '', '/play/?code=~');
    const write = vi.spyOn(window.history, 'replaceState');
    dropSignupParam();
    // Nothing written (a rewrite would also turn "~" into "%7E").
    expect(write).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?code=~');
    write.mockRestore();
  });
});
