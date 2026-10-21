import { friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE, sessionRanOut, SIGNED_OUT_MESSAGE, TROUBLE_MESSAGE } from './errors';
import { GROWN_UPS_LOCKED_MESSAGE, grownUpsLocked } from './grownUpsGate';

/**
 * Words for a family screen when something didn't happen (#130 S6): the
 * connection's or the server's trouble, or a sign-in that ran out, in plain
 * words, and 👪 Grown-ups locking again (#167) says so; anything else gets
 * the screen's own `fallback` ("That didn't save just now…") — never the
 * database's words, which are for the console (`errorMessage`, logged
 * beside it).
 */
export function plainErrorOr(err: unknown, fallback: string): string {
  if (sessionRanOut(err)) return SIGNED_OUT_MESSAGE;
  if (grownUpsLocked(err)) return GROWN_UPS_LOCKED_MESSAGE;
  const words = friendlyMessage(err);
  return [OFFLINE_MESSAGE, NETWORK_MESSAGE, TROUBLE_MESSAGE].includes(words) ? words : fallback;
}
