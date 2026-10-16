/**
 * The public site's "Create a free family account" opens the game at
 * `?signup` (#146), so a grown-up lands on the sign-up form, not Sign in.
 * `AuthPage` reads it as it opens; it's then dropped from the address — and
 * `App` drops it too when someone is already signed in, so a later sign-out
 * still opens on Sign in.
 */
const SIGNUP_PARAM = 'signup';

/** Whether the address asks for the sign-up form. */
export function hasSignupParam(search = window.location.search): boolean {
  return new URLSearchParams(search).has(SIGNUP_PARAM);
}

/** Remove `?signup` from the address, keeping everything else in it. */
export function dropSignupParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SIGNUP_PARAM)) return;
  url.searchParams.delete(SIGNUP_PARAM);
  window.history.replaceState(window.history.state, '', url);
}
