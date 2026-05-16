import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import type { NPC, Topic } from '../../types';

const NPCS: NPC[] = [
  { id: 'npc1', name: 'Count Calculus', sprite: '🧙', level: 1, topic: 'math', hp: 80, maxHp: 80, questions: [] },
  { id: 'npc2', name: 'Dr. Molecule', sprite: '🤖', level: 2, topic: 'science', hp: 100, maxHp: 100, questions: [] },
  { id: 'npc3', name: 'Gear Master', sprite: '⚔️', level: 3, topic: 'engineering', hp: 120, maxHp: 120, questions: [] },
  { id: 'npc4', name: 'Muse Maxine', sprite: '🧚', level: 4, topic: 'creativity', hp: 150, maxHp: 150, questions: [] },
];

const TOPIC_COLORS: Record<Topic, string> = {
  math: 'bg-blue-100 border-blue-400',
  science: 'bg-green-100 border-green-400',
  engineering: 'bg-orange-100 border-orange-400',
  creativity: 'bg-pink-100 border-pink-400',
};

export default function WorldMap() {
  const { startBattle, avatar } = useGameStore();

  function handleChallenge(npc: NPC) {
    if (!avatar) return;
    startBattle(npc, avatar.hp);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-400 to-teal-600 p-6">
      <motion.h1
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-extrabold text-white text-center mb-2"
      >
        Open World
      </motion.h1>
      <p className="text-center text-emerald-100 mb-8">Choose an NPC to battle!</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {NPCS.map((npc, i) => (
          <motion.div
            key={npc.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.12 }}
            className={`rounded-2xl border-2 p-6 shadow-lg ${TOPIC_COLORS[npc.topic]}`}
          >
            <div className="text-5xl mb-2">{npc.sprite}</div>
            <h3 className="font-bold text-lg">{npc.name}</h3>
            <p className="text-sm text-gray-500 capitalize mb-1">Topic: {npc.topic}</p>
            <p className="text-sm text-gray-500 mb-4">Level {npc.level} · HP {npc.maxHp}</p>
            <button
              onClick={() => handleChallenge(npc)}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition w-full"
            >
              Challenge!
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
