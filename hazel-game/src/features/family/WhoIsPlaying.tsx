import { useEffect, useRef, useState } from 'react';
import { kidIcon } from '../../content/family';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import { emailLinkWords, takeEmailLinkNotice } from '../auth/linkError';
import { kidLockKey } from '../../lib/pinLock';
import { takeReloadNote } from '../../lib/lazyRetry';
import FamilyCard from './FamilyCard';
import PinPad from './PinPad';
import type { Kid } from '../../types';

/**
 * After 📈 Progress reloaded the game (#29 review round 2): what happened, and
 * the way back — no reason it can't be sure of (a network blip reloads it too,
 * with no new version, review round 3).
 */
export const PROGRESS_RELOADED_NOTE = 'The page had to reload. Open 👪 Grown-ups again to carry on.';

/** What the locked pad tells a grown-up: where to unlock it, and that the same PIN is fine (#124c review). */
export const KID_UNLOCK_HELP =
  'Grown-ups: in 👪 Grown-ups, tap Change by their name and type their PIN again — the same one is fine — to unlock it.';

/**
 * "Who's playing?" (#124): each kid taps their own tile, then types their
 * 4-digit PIN (5 wrong in a row and the database gives it a break, #124c — a
 * grown-up typing the PIN again in 👪 Grown-ups unlocks it, and the pad
 * notices). Grown-ups manage the family from 👪 Grown-ups, behind their own
 * PIN or password. Opened from an email-change link (#124d), it says what the
 * link did, once, at the top — focused, so it's heard (#167 review round 1);
 * after 📈 Progress reloaded the game, it says that, and how to get back (#29
 * review rounds 2–3).
 */
export default function WhoIsPlaying() {
  const kids = useFamilyStore((s) => s.kids);
  const choose = useFamilyStore((s) => s.choose);
  const checkKidPin = useFamilyStore((s) => s.checkKidPin);
  const setGrownUpsOpen = useFamilyStore((s) => s.setGrownUpsOpen);
  const pinLocks = useFamilyStore((s) => s.pinLocks);
  const email = useAuthStore((s) => s.user?.email ?? '');
  const [asking, setAsking] = useState<Kid | null>(null);
  const [resting, setResting] = useState(false);
  // An email-change link brought the grown-up here: what it did, once.
  const [linkNotice] = useState(() => takeEmailLinkNotice());
  // 📈 Progress reloaded the game: say so, once (#29 review round 2).
  const [reloadNote] = useState(() => takeReloadNote());
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (linkNotice || reloadNote) noticeRef.current?.focus({ preventScroll: true });
  }, [linkNotice, reloadNote]);
  // Who the pad is open for right now: a check that answers after "That's not me" lets nobody in.
  const askingId = useRef<string | null>(null);
  function ask(kid: Kid | null) {
    askingId.current = kid?.id ?? null;
    setAsking(kid);
    setResting(false);
  }

  if (asking) {
    const kid = asking;
    return (
      <FamilyCard focusTitle title={`Hi, ${kid.name ?? 'Player'}!`} subtitle={resting ? 'Taking a short break.' : 'Type your PIN.'}>
        <PinPad
          key={kid.id}
          onSubmit={async (pin) => {
            const verdict = await checkKidPin(kid.id, pin);
            if (verdict.ok && askingId.current === kid.id) choose(kid.id);
            return verdict;
          }}
          forgotText="Forgot it? A grown-up can change it in 👪 Grown-ups."
          lockKey={kidLockKey(kid.id)}
          checkLock={async () => {
            const locks = await pinLocks();
            return locks === null ? null : (locks.kids[kid.id] ?? 0);
          }}
          lockedHelp={KID_UNLOCK_HELP}
          onLockedChange={setResting}
        />
        <button
          onClick={() => ask(null)}
          className="mt-1 w-full min-h-11 text-center text-sm text-purple-600 hover:underline"
        >
          ← That's not me
        </button>
      </FamilyCard>
    );
  }

  return (
    <FamilyCard wide title="Who's playing?">
      {linkNotice && !asking && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          className={`-mt-2 mb-4 rounded-xl border px-3 py-2 text-center text-sm font-semibold focus:outline-none [overflow-wrap:anywhere] ${
            linkNotice === 'link-failed' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-800'
          }`}
        >
          <span aria-hidden="true">{linkNotice === 'other-email' ? '📬 ' : linkNotice === 'email-changed' ? '✅ ' : '⚠️ '}</span>
          {emailLinkWords(linkNotice, email)}
        </p>
      )}
      {reloadNote && !linkNotice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          className="-mt-2 mb-4 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-center text-sm font-semibold text-sky-900 focus:outline-none"
        >
          <span aria-hidden="true">🔄 </span>
          {PROGRESS_RELOADED_NOTE}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {kids.map((k) => (
          <button
            key={k.id}
            onClick={() => ask(k)}
            className="rounded-2xl bg-purple-50 hover:bg-purple-100 p-4 flex flex-col items-center transition"
          >
            <span className="text-5xl" aria-hidden>
              {kidIcon(k.icon)}
            </span>
            <span className="mt-2 font-bold text-purple-800 truncate max-w-full">{k.name ?? 'Player'}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => setGrownUpsOpen(true)}
        className="mt-6 w-full text-center text-sm text-gray-500 hover:underline"
      >
        👪 Grown-ups
      </button>
    </FamilyCard>
  );
}
