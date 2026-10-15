import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { gateFlag, ZONES } from '../../content/zones';
import { dungeonEntrance } from '../../content/dungeons';
import { placeName } from '../../lib/wayfinding';
import { keysForZone, keyFlag, type GateKey } from '../../content/keys';
import { useSaveStore } from '../../store/saveStore';
import { sfx } from '../../lib/audio';
import { sendFlow } from '../../machines/gameFlow';
import type { PathTarget } from '../../types';
import ModalLayer from '../../components/ModalLayer';

/**
 * A warden-keyed Fiend gate (#58). Unlike the gatekeeper question, this gate
 * opens only to the key dropped by the matching themed-zone warden boss: hold
 * it and the gate grinds open; otherwise the gate names the warden to go beat.
 * Chorus Isle's gate takes two keys (#75 item 15g): it opens once both are
 * held, and says which is still missing.
 */
export default function KeyGateOverlay({ target }: { target: PathTarget }) {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);

  const keys = keysForZone(target.zoneId);
  if (!save || keys.length === 0) return null;

  const held = (k: GateKey) => save.flags[keyFlag(k.id)] === true;
  const hasKey = keys.every(held);
  const missing = keys.filter((k) => !held(k));
  const key = keys[0];
  const door = key.door ?? 'gate';
  const both = keys.length > 1;
  const names = (ks: GateKey[]) => ks.map((k) => `the ${k.name} ${k.emoji}`).join(' and ');
  // A warden at the bottom of a dungeon (#75 item 10) is found by its entrance:
  // "in the Whispering Woods", "deep in the Clockwork Depths".
  const where = (k: GateKey) => {
    const entrance = dungeonEntrance(k.fromZone);
    return `${entrance === k.fromZone ? 'in' : 'deep in'} ${placeName(ZONES[entrance])}`;
  };
  const bossName = (k: GateKey) => k.bossName.replace(/^The /, 'the ');

  function open() {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    sfx('gate');
    update((s) => ({ ...s, flags: { ...s.flags, [gateFlag(target.id)]: true } }));
    sendFlow({ type: 'CLOSE' });
  }

  return (
    <ModalLayer label={`Locked ${door}`} className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl"
      >
        {/* A held key of two sits beside the lock still shut (15g review). */}
        <div className="text-5xl mb-2">{hasKey ? keys.map((k) => k.emoji).join('') : `${keys.filter(held).map((k) => k.emoji).join('')}🔒`}</div>
        <h2 className="text-lg font-extrabold text-gray-800 mb-2">
          {hasKey ? (both ? 'Both keys fit!' : `The ${key.name} fits!`) : `A sealed ${door}`}
        </h2>
        <p className="text-sm text-gray-600 mb-5">
          {hasKey ? (
            <>
              {both ? `${names(keys).replace(/^t/, 'T')} hum together` : `The ${key.name} ${key.emoji} hums`} and the {door}{' '}
              grinds open — the path to {key.fiendName} lies beyond.
            </>
          ) : both && missing.length < keys.length ? (
            <>
              {names(keys.filter(held)).replace(/^t/, 'T')} fits one lock! The other needs <strong>{names(missing)}</strong> — beat{' '}
              <strong>{bossName(missing[0])}</strong> ({placeName(ZONES[dungeonEntrance(missing[0].fromZone)])}).
            </>
          ) : both ? (
            <>
              This {door} has two locks. You need both Chorus Keys {keys.map((k) => k.emoji).join('')}! Beat{' '}
              {keys.map((k, i) => (
                <span key={k.id}>
                  {i > 0 && ' and '}
                  <strong>{bossName(k)}</strong> ({placeName(ZONES[dungeonEntrance(k.fromZone)])})
                </span>
              ))}
              .
            </>
          ) : (
            <>
              Ancient magic seals this {door}. It will only open to the{' '}
              <strong>
                {key.name} {key.emoji}
              </strong>{' '}
              — beat <strong>{bossName(key)}</strong> {where(key)} to claim it.
            </>
          )}
        </p>
        <div className="flex justify-center gap-3">
          {hasKey && (
            <button
              onClick={open}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg px-5 py-2 text-sm"
            >
              {both ? 'Use both keys' : `Use the ${key.name}`}
            </button>
          )}
          <button
            onClick={() => sendFlow({ type: 'CLOSE' })}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg px-5 py-2 text-sm"
          >
            {hasKey ? 'Not yet' : 'Walk away'}
          </button>
        </div>
      </motion.div>
    </ModalLayer>
  );
}
