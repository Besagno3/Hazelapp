import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import type { Avatar, FightStyle } from '../../types';

const AVATARS: Avatar[] = [
  { id: 'a1', name: 'Blaze', sprite: '🦁', fightStyle: 'aggressive', maxHp: 100 },
  { id: 'a2', name: 'Shield', sprite: '🐢', fightStyle: 'defensive', maxHp: 140 },
  { id: 'a3', name: 'Nova', sprite: '🦅', fightStyle: 'balanced', maxHp: 120 },
];

const STYLE_DESC: Record<FightStyle, string> = {
  aggressive: 'High attack damage, lower HP',
  defensive: 'High HP, lower attack',
  balanced: 'Well-rounded stats',
};

export default function AvatarSelect() {
  const { setAvatar, setPhase } = useGameStore();

  function handlePick(avatar: Avatar) {
    setAvatar(avatar);
    setPhase('world');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-500 p-6">
      <motion.h1
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-extrabold text-white mb-2"
      >
        Pick Your Fighter
      </motion.h1>
      <p className="text-fuchsia-200 mb-8">Choose wisely — your style defines your battle.</p>

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
