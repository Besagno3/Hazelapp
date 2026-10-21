import { friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE, sessionRanOut, SIGNED_OUT_MESSAGE, TROUBLE_MESSAGE } from './errors';
import { DEVICE_SIGNED_OUT_MESSAGE, DeviceSignedOutError, grownUpsLocked, grownUpsLockedWords } from './grownUpsGate';

/**
 * Words for a family screen when something didn't happen (#130 S6): the
 * connection's or the server's trouble, or a sign-in that ran out, in plain
 * words (this device's own sign-in ended — a right grown-up PIN on it — in
 * the gate's words, #167 review round 2), and 👪 Grown-ups being shut (#167)
 * says so — in the words the store chose for the screen it happened on (#167
 * review round 1); anything else gets
 * the screen's own `fallback` ("That didn't save just now…") — never the
 * database's words, which are for the console (`errorMessage`, logged
 * beside it).
 */
export function plainErrorOr(err: unknown, fallback: string): string {
  if (err instanceof DeviceSignedOutError) return DEVICE_SIGNED_OUT_MESSAGE;
  if (sessionRanOut(err)) return SIGNED_OUT_MESSAGE;
  if (grownUpsLocked(err)) return grownUpsLockedWords(err);
  const words = friendlyMessage(err);
  return [OFFLINE_MESSAGE, NETWORK_MESSAGE, TROUBLE_MESSAGE].includes(words) ? words : fallback;
}
