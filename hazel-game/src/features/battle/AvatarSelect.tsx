import { motion } from 'framer-motion';
import { AVATARS, STYLE_DESC } from '../../content/avatars';
import { useSaveStore } from '../../store/saveStore';
import { sendFlow } from '../../machines/gameFlow';
import type { Avatar } from '../../types';

export default function AvatarSelect() {
  const update = useSaveStore((s) => s.update);

  function handlePick(avatar: Avatar) {
    // Write the choice into the save first — the machine's CHOOSE_AVATAR
    // guard reads it before letting the player into the world.
    update((s) => ({ ...s, avatarId: avatar.id }));
    sendFlow({ type: 'CHOOSE_AVATAR' });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-500 p-6">
      <motion.h1
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-extrabold text-white mb-2"
      >
        Pick Your Hero
      </motion.h1>
      <p className="text-fuchsia-200 mb-8">Choose wisely — your style defines your battles in Lumina.</p>

      <div className="flex flex-col sm:flex-row gap-4">
        {AVATARS.map((a, i) => (
          <motion.button
            key={a.id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.15 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePick(a)}
            className="bg-white rounded-2xl p-6 shadow-xl text-center w-44"
          >
            <div className="text-6xl mb-3">{a.sprite}</div>
            <h3 className="font-bold text-lg text-violet-700">{a.name}</h3>
            <p className="text-xs text-gray-400 mt-1 capitalize">{a.fightStyle}</p>
            <p className="text-xs text-gray-500 mt-2">{STYLE_DESC[a.fightStyle]}</p>
            <p className="text-sm font-semibold text-gray-700 mt-3">HP: {a.maxHp}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
