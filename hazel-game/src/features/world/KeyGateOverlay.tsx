import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { gateFlag, ZONES } from '../../content/zones';
import { dungeonEntrance } from '../../content/dungeons';
import { placeName } from '../../lib/wayfinding';
import { keyForZone, keyFlag } from '../../content/keys';
import { useSaveStore } from '../../store/saveStore';
import { sfx } from '../../lib/audio';
import { sendFlow } from '../../machines/gameFlow';
import type { PathTarget } from '../../types';
import ModalLayer from '../../components/ModalLayer';

/**
 * A warden-keyed Fiend gate (#58). Unlike the gatekeeper question, this gate
 * opens only to the key dropped by the matching themed-zone warden boss: hold
 * it and the gate grinds open; otherwise the gate names the warden to go beat.
 */
export default function KeyGateOverlay({ target }: { target: PathTarget }) {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);

  const key = keyForZone(target.zoneId);
  if (!save || !key) return null;

  const hasKey = save.flags[keyFlag(key.id)] === true;
  // A warden at the bottom of a dungeon (#75 item 10) is found by its entrance:
  // "in the Whispering Woods", "deep in the Clockwork Depths".
  const entrance = dungeonEntrance(key.fromZone);
  const where = `${entrance === key.fromZone ? 'in' : 'deep in'} ${placeName(ZONES[entrance])}`;
  const bossName = key.bossName.replace(/^The /, 'the ');

  function open() {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    sfx('gate');
    update((s) => ({ ...s, flags: { ...s.flags, [gateFlag(target.id)]: true } }));
    sendFlow({ type: 'CLOSE' });
  }

  return (
    <ModalLayer label="Locked gate" className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl"
      >
        <div className="text-5xl mb-2">{hasKey ? key.emoji : '🔒'}</div>
        <h2 className="text-lg font-extrabold text-gray-800 mb-2">
          {hasKey ? `The ${key.name} fits!` : 'A sealed gate'}
        </h2>
        <p className="text-sm text-gray-600 mb-5">
          {hasKey ? (
            <>
              The {key.name} {key.emoji} hums and the gate grinds open — the path to{' '}
              {key.fiendName} lies beyond.
            </>
          ) : (
            <>
              Ancient magic seals this gate. It will only open to the{' '}
              <strong>
                {key.name} {key.emoji}
              </strong>{' '}
              — beat <strong>{bossName}</strong> {where} to claim it.
            </>
          )}
        </p>
        <div className="flex justify-center gap-3">
          {hasKey && (
            <button
              onClick={open}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg px-5 py-2 text-sm"
            >
              Use the {key.name}
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
