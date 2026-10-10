import { describe, expect, it } from 'vitest';
import { useBattleStore } from './battleStore';

describe('battleStore — a session’s one-off hints', () => {
  it('the "💤 Sleepy critters…" hint is said once a session, and again for whoever signs in next (#112e)', () => {
    const s = useBattleStore.getState();
    s.reset();
    expect(useBattleStore.getState().sleeperHintSaid).toBe(false);
    s.saySleeperHint();
    expect(useBattleStore.getState().sleeperHintSaid).toBe(true);
    // Sign-out resets the session's stores (`useAuthInit`).
    s.reset();
    expect(useBattleStore.getState().sleeperHintSaid).toBe(false);
  });
});
