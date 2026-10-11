import { motion } from 'framer-motion';
import { AVATARS, HERO_ABILITIES, STYLE_DESC, STYLE_LABEL } from '../../content/avatars';
import { resolveSprite } from '../../content/sprites';
import { SpriteSheet } from './SpriteSheet';
import { useSaveStore } from '../../store/saveStore';
import { sendFlow } from '../../machines/gameFlow';
import type { Avatar } from '../../types';
import { sfx } from '../../lib/audio';

export default function AvatarSelect() {
  const update = useSaveStore((s) => s.update);

  function handlePick(avatar: Avatar) {
    sfx('select');
    // Write the choice into the save first — the machine's CHOOSE_AVATAR
    // guard reads it before letting the player into the world. Flush right
    // away so the choice reaches other devices even if this tab dies before
    // the debounce fires.
    update((s) => ({ ...s, avatarId: avatar.id }));
    void useSaveStore.getState().flush();
    sendFlow({ type: 'CHOOSE_AVATAR' });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-500 p-4 sm:p-6">
      <motion.h1
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-extrabold text-white mb-2 text-center"
      >
        Pick Your Hero
      </motion.h1>
      <p className="text-fuchsia-100 mb-6 sm:mb-8 text-center">Choose wisely — your style defines your battles in Lumina.</p>

      {/* Five heroes: a list of wide cards on a phone, a wrapping row of tall
          cards from `sm` up (3 + 2, then all five in a row on a wide screen). */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-3 sm:gap-4 w-full max-w-md sm:max-w-5xl">
        {AVATARS.map((a, i) => {
          const abilities = HERO_ABILITIES[a.fightStyle];
          return (
            <motion.button
              key={a.id}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePick(a)}
              className="bg-white rounded-2xl p-4 sm:p-5 shadow-xl flex sm:flex-col items-center gap-4 sm:gap-0 text-left sm:text-center sm:w-48"
            >
              <div className="text-6xl sm:mb-3 flex justify-center shrink-0">
                <SpriteSheet
                  view={resolveSprite(a.spriteId, a.sprite).def?.battle ?? null}
                  emoji={a.sprite}
                  scale={3}
                />
              </div>
              <div className="flex-1 min-w-0 sm:w-full">
                <h3 className="font-bold text-lg text-violet-700">{a.name}</h3>
                <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-600 mt-0.5">{STYLE_LABEL[a.fightStyle]}</p>
                <p className="text-xs text-gray-500 mt-1">{STYLE_DESC[a.fightStyle]}</p>
                <p className="text-sm font-semibold text-gray-700 mt-2">HP: {a.maxHp}</p>
                {abilities.length > 0 && (
                  <ul className="mt-2 space-y-1.5 text-left">
                    {abilities.map((ab) => (
                      <li key={ab.name} className="text-xs text-gray-600 leading-snug">
                        <span aria-hidden>{ab.emoji} </span>
                        <span className="font-bold text-violet-700">{ab.name}:</span> {ab.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
