import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGameStore } from '../../store/gameStore';
import { calcAttackDamage } from '../../lib/utils';
import type { Question, Topic } from '../../types';

// Placeholder battle questions — swap for Supabase queries keyed on NPC topic + level
const BATTLE_QUESTIONS: Record<Topic, Question[]> = {
  math: [
    { id: 'bm1', topic: 'math', level: 1, text: 'What is 9 × 9?', options: ['72', '81', '90', '99'], correctIndex: 1 },
    { id: 'bm2', topic: 'math', level: 1, text: 'What is 50% of 80?', options: ['30', '35', '40', '45'], correctIndex: 2 },
    { id: 'bm3', topic: 'math', level: 1, text: 'What is 2⁵?', options: ['16', '32', '64', '128'], correctIndex: 1 },
  ],
  science: [
    { id: 'bs1', topic: 'science', level: 1, text: 'Boiling point of water (°C)?', options: ['90', '95', '100', '110'], correctIndex: 2 },
    { id: 'bs2', topic: 'science', level: 1, text: 'What force pulls objects down?', options: ['Friction', 'Gravity', 'Magnetism', 'Tension'], correctIndex: 1 },
    { id: 'bs3', topic: 'science', level: 1, text: 'What organelle is the powerhouse?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Vacuole'], correctIndex: 2 },
  ],
  engineering: [
    { id: 'be1', topic: 'engineering', level: 1, text: 'What does RAM stand for?', options: ['Random Access Memory', 'Read Access Module', 'Rapid Action Memory', 'Read All Memory'], correctIndex: 0 },
    { id: 'be2', topic: 'engineering', level: 1, text: 'Ohm\'s Law: V = ?', options: ['I+R', 'I×R', 'I÷R', 'I-R'], correctIndex: 1 },
    { id: 'be3', topic: 'engineering', level: 1, text: 'Which is NOT a programming language?', options: ['Python', 'Java', 'Photoshop', 'Rust'], correctIndex: 2 },
  ],
  creativity: [
    { id: 'bc1', topic: 'creativity', level: 1, text: 'Yellow + Blue = ?', options: ['Purple', 'Orange', 'Green', 'Brown'], correctIndex: 2 },
    { id: 'bc2', topic: 'creativity', level: 1, text: 'How many strings on a guitar?', options: ['4', '5', '6', '7'], correctIndex: 2 },
    { id: 'bc3', topic: 'creativity', level: 1, text: 'Shakespeare wrote how many plays?', options: ['27', '37', '47', '57'], correctIndex: 1 },
  ],
};

type Phase = 'player-attack' | 'npc-attack' | 'result';

export default function BattleArena() {
  const { battle, updateBattleHp, endBattle, avatar } = useGameStore();
  const npc = battle.npc!;
  const topic = npc.topic;
  const questions = BATTLE_QUESTIONS[topic];

  const [phase, setPhase] = useState<Phase>('player-attack');
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [roundAnswers, setRoundAnswers] = useState<boolean[]>([]);
  const [shakeNpc, setShakeNpc] = useState(false);
  const [shakePlayer, setShakePlayer] = useState(false);

  const currentQ = questions[qIndex % questions.length];

  function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === currentQ.correctIndex;
    const newAnswers = [...roundAnswers, correct];

    setTimeout(() => {
      if (newAnswers.length < 3) {
        setQIndex((i) => i + 1);
        setSelected(null);
        setRoundAnswers(newAnswers);
      } else {
        applyRoundResult(newAnswers);
      }
    }, 700);
  }

  function applyRoundResult(answers: boolean[]) {
    const correct = answers.filter(Boolean).length;

    if (phase === 'player-attack') {
      const dmg = calcAttackDamage(correct, 3, avatar?.fightStyle === 'aggressive' ? 40 : 30);
      const newNpcHp = Math.max(0, battle.npcHp - dmg);
      setShakeNpc(true);
      setTimeout(() => setShakeNpc(false), 500);
      updateBattleHp(battle.playerHp, newNpcHp);

      if (newNpcHp <= 0) {
        confetti({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
        endBattle('win');
        return;
      }
      setPhase('npc-attack');
    } else {
      const blocked = calcAttackDamage(correct, 3, avatar?.fightStyle === 'defensive' ? 35 : 25);
      const npcDmg = Math.max(0, 30 - blocked);
      const newPlayerHp = Math.max(0, battle.playerHp - npcDmg);
      setShakePlayer(true);
      setTimeout(() => setShakePlayer(false), 500);
      updateBattleHp(newPlayerHp, battle.npcHp);

      if (newPlayerHp <= 0) {
        endBattle('lose');
        return;
      }
      setPhase('player-attack');
    }

    setQIndex((i) => i + 1);
    setSelected(null);
    setRoundAnswers([]);
  }

  const hpBar = (current: number, max: number, color: string) => (
    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        animate={{ width: `${(current / max) * 100}%` }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-red-900 p-6 text-white">
      <h1 className="text-3xl font-extrabold mb-6">Battle Arena</h1>

      {/* HP Bars */}
      <div className="w-full max-w-lg space-y-4 mb-8">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>{avatar?.name ?? 'You'} {avatar?.sprite}</span>
            <span>{battle.playerHp}/{avatar?.maxHp}</span>
          </div>
          {hpBar(battle.playerHp, avatar?.maxHp ?? 100, 'bg-green-400')}
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>{npc.sprite} {npc.name}</span>
            <span>{battle.npcHp}/{npc.maxHp}</span>
          </div>
          {hpBar(battle.npcHp, npc.maxHp, 'bg-red-400')}
        </div>
      </div>

      {/* Sprites */}
      <div className="flex justify-around w-full max-w-lg mb-8">
        <motion.div
          animate={shakePlayer ? { x: [-8, 8, -8, 0] } : {}}
          className="text-8xl"
        >
          {avatar?.sprite ?? '🧑'}
        </motion.div>
        <motion.div
          animate={shakeNpc ? { x: [8, -8, 8, 0] } : {}}
          className="text-8xl"
        >
          {npc.sprite}
        </motion.div>
      </div>

      {/* Phase label */}
      <p className="text-sm text-gray-300 mb-4 uppercase tracking-widest">
        {phase === 'player-attack' ? 'Your Attack — Answer to deal damage!' : 'Defend! — Correct answers block NPC damage!'}
      </p>
      <p className="text-xs text-gray-400 mb-4">
        Question {roundAnswers.length + 1}/3
      </p>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id + qIndex}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -40, opacity: 0 }}
          className="bg-white text-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl"
        >
          <h2 className="font-semibold text-lg mb-4">{currentQ.text}</h2>
          <div className="grid grid-cols-2 gap-3">
            {currentQ.options.map((opt, idx) => {
              let cls = 'border-2 rounded-lg px-3 py-2 text-sm font-medium transition ';
              if (selected === null) cls += 'border-gray-200 hover:border-purple-400';
              else if (idx === currentQ.correctIndex) cls += 'border-green-500 bg-green-50 text-green-700';
              else if (idx === selected) cls += 'border-red-400 bg-red-50 text-red-600';
              else cls += 'border-gray-200 opacity-40';

              return (
                <button key={idx} onClick={() => handleAnswer(idx)} className={cls}>
                  {opt}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
