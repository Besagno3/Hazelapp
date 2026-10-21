import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** The module keeps "taken once" state: a fresh copy for each test. */
async function fresh() {
  vi.resetModules();
  return import('./linkError');
}

beforeEach(() => window.history.replaceState(null, '', '/play/'));
afterEach(() => window.history.replaceState(null, '', '/play/'));

describe('an email-change link coming back to the game (#124d, #167 review round 1)', () => {
  it('knows the first of the two links, the second, and a link that failed', async () => {
    const { emailLinkNoticeFrom } = await fresh();
    expect(
      emailLinkNoticeFrom({ hash: '#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email', search: '' }),
    ).toBe('other-email');
    expect(emailLinkNoticeFrom({ hash: '#access_token=a&expires_in=3600&refresh_token=r&token_type=bearer&type=email_change', search: '' })).toBe(
      'email-changed',
    );
    expect(emailLinkNoticeFrom({ hash: '', search: '?type=email_change' })).toBe('email-changed');
    expect(emailLinkNoticeFrom({ hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', search: '' })).toBe(
      'link-failed',
    );
    for (const nothing of [{ hash: '', search: '' }, { hash: '#access_token=a&type=recovery', search: '' }, { hash: '#top', search: '?review' }]) {
      expect(emailLinkNoticeFrom(nothing), JSON.stringify(nothing)).toBeNull();
    }
  });

  it('says what happened and what to do next', async () => {
    const { emailLinkWords } = await fresh();
    expect(emailLinkWords('other-email', '')).toBe(
      'Nearly done! Now tap the link in the other email we sent — your sign-in email changes once both links are tapped.',
    );
    expect(emailLinkWords('email-changed', 'new@example.com')).toBe('Your sign-in email is now new@example.com.');
    expect(emailLinkWords('email-changed', '')).toBe('Your sign-in email has changed.');
    expect(emailLinkWords('link-failed', '')).toMatch(/didn't work .* so nothing changed\. Need a new one\? Ask again in 👪 Grown-ups\./);
  });

  it('is taken once, and its words come off the address (a reload says nothing)', async () => {
    window.history.replaceState(null, '', '/play/?keep=1#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email');
    const { takeEmailLinkNotice } = await fresh();
    expect(takeEmailLinkNotice(window.location)).toBe('other-email');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/play/?keep=1');
    expect(takeEmailLinkNotice(window.location)).toBeNull();
  });

  it('reads the address the page opened with — supabase-js takes the session out of the hash before any screen asks', async () => {
    window.history.replaceState(null, '', '/play/#access_token=a&refresh_token=r&type=email_change');
    const { takeEmailLinkNotice } = await fresh();
    // supabase-js clears the hash once it has the session…
    window.history.replaceState(null, '', '/play/');
    // …but the copy made as the module loaded still says what the link was.
    expect(takeEmailLinkNotice()).toBe('email-changed');
  });
});
