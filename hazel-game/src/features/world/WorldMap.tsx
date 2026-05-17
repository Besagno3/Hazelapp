import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useProfileStore } from '../../store/profileStore';
import { calcAge } from '../../lib/age';
import { generateNpcs } from '../../lib/npc';
import { prefetchQuestions, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import type { NPC, Topic } from '../../types';

/** Age used when no profile is loaded yet. */
const DEFAULT_AGE = 10;

const TOPIC_COLORS: Record<Topic, string> = {
  math: 'bg-blue-100 border-blue-400',
  science: 'bg-green-100 border-green-400',
  engineering: 'bg-orange-100 border-orange-400',
  creativity: 'bg-pink-100 border-pink-400',
};

export default function WorldMap() {
  const { startBattle, avatar } = useGameStore();
  const profile = useProfileStore((s) => s.profile);
  const age = profile ? calcAge(profile.birthYear, profile.birthMonth) : DEFAULT_AGE;
  // A fresh random set of NPCs each time the world is entered.
  const [npcs] = useState(() => generateNpcs(age, 4));

  // Warm each NPC's battle questions while the player browses the map, so
  // clicking "Challenge!" starts the battle without a wait.
  useEffect(() => {
    for (const npc of npcs) {
      prefetchQuestions(npc.topic, age, npc.level, BATTLE_QUESTION_COUNT);
    }
  }, [npcs, age]);

  function handleChallenge(npc: NPC) {
    if (!avatar) return;
    // Each battle starts the player at full HP — battles are independent.
    startBattle(npc, avatar.maxHp);
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
        {npcs.map((npc, i) => (
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
