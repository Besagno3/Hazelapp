import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGameStore } from '../../store/gameStore';
import { useProfileStore } from '../../store/profileStore';
import { useGeneratedQuestions } from '../../hooks/useGeneratedQuestions';
import { calcAttackDamage } from '../../lib/utils';
import { npcDefeatXp, XP_PER_CORRECT } from '../../lib/level';
import { attackBonus, defenseBonus, xpBonusPerCorrect } from '../../lib/powerups';
import { BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { LoadingScreen, ErrorScreen } from '../../components/StatusScreens';

const QUESTIONS_PER_ROUND = 3;

type Phase = 'player-attack' | 'npc-attack';

export default function BattleArena() {
  const { battle, updateBattleHp, endBattle, avatar, setPhase: setGamePhase } = useGameStore();
  const npc = battle.npc!;
  const topic = npc.topic;
  const addXp = useProfileStore((s) => s.addXp);
  const powerUps = useProfileStore((s) => s.profile?.powerUps) ?? {};
  // Battle question difficulty is the NPC's level, not the player's skill ramp.
  const { questions, loading, error, reload } = useGeneratedQuestions(
    topic,
    BATTLE_QUESTION_COUNT,
    npc.level,
  );

  const [phase, setPhase] = useState<Phase>('player-attack');
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [roundAnswers, setRoundAnswers] = useState<boolean[]>([]);
  const [shakeNpc, setShakeNpc] = useState(false);
  const [shakePlayer, setShakePlayer] = useState(false);
  // Every answer across the whole battle — feeds the XP reward on the result.
  const allAnswers = useRef<boolean[]>([]);

  if (loading) return <LoadingScreen label="Summoning your challenge…" topic={topic} />;
  if (error) {
    return <ErrorScreen message={error} onRetry={reload} onBack={() => setGamePhase('world')} />;
  }

  const currentQ = questions[qIndex % questions.length];

  function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === currentQ.correctIndex;
    allAnswers.current = [...allAnswers.current, correct];
    const newAnswers = [...roundAnswers, correct];

    setTimeout(() => {
      if (newAnswers.length < QUESTIONS_PER_ROUND) {
        setQIndex((i) => i + 1);
        setSelected(null);
        setRoundAnswers(newAnswers);
      } else {
        applyRoundResult(newAnswers);
      }
    }, 700);
  }

  function finishBattle(result: 'win' | 'lose') {
    // Award XP for correct answers (+ Scholar bonus), plus an NPC-defeat bonus.
    const correct = allAnswers.current.filter(Boolean).length;
    const reward =
      correct * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)) +
      (result === 'win' ? npcDefeatXp(npc.level) : 0);
    void addXp(reward);
    endBattle(result);
  }

  function applyRoundResult(answers: boolean[]) {
    const correct = answers.filter(Boolean).length;

    if (phase === 'player-attack') {
      const base = (avatar?.fightStyle === 'aggressive' ? 40 : 30) + attackBonus(powerUps);
      const dmg = calcAttackDamage(correct, QUESTIONS_PER_ROUND, base);
      const newNpcHp = Math.max(0, battle.npcHp - dmg);
      setShakeNpc(true);
      setTimeout(() => setShakeNpc(false), 500);
      updateBattleHp(battle.playerHp, newNpcHp);

      if (newNpcHp <= 0) {
        confetti({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
        finishBattle('win');
        return;
      }
      setPhase('npc-attack');
    } else {
      const base = (avatar?.fightStyle === 'defensive' ? 35 : 25) + defenseBonus(powerUps);
      const blocked = calcAttackDamage(correct, QUESTIONS_PER_ROUND, base);
      const npcDmg = Math.max(0, 30 - blocked);
      const newPlayerHp = Math.max(0, battle.playerHp - npcDmg);
      setShakePlayer(true);
      setTimeout(() => setShakePlayer(false), 500);
      updateBattleHp(newPlayerHp, battle.npcHp);

      if (newPlayerHp <= 0) {
        finishBattle('lose');
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
            <span>{battle.playerHp}/{battle.playerMaxHp}</span>
          </div>
          {hpBar(battle.playerHp, battle.playerMaxHp, 'bg-green-400')}
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
        <motion.div animate={shakePlayer ? { x: [-8, 8, -8, 0] } : {}} className="text-8xl">
          {avatar?.sprite ?? '🧑'}
        </motion.div>
        <motion.div animate={shakeNpc ? { x: [8, -8, 8, 0] } : {}} className="text-8xl">
          {npc.sprite}
        </motion.div>
      </div>

      {/* Phase label */}
      <p className="text-sm text-gray-300 mb-4 uppercase tracking-widest">
        {phase === 'player-attack'
          ? 'Your Attack — Answer to deal damage!'
          : 'Defend! — Correct answers block NPC damage!'}
      </p>
      <p className="text-xs text-gray-400 mb-4">
        Question {roundAnswers.length + 1}/{QUESTIONS_PER_ROUND} · {topic} Lvl {npc.level}
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
