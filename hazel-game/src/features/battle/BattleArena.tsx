import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { LoadingScreen, ErrorScreen } from '../../components/StatusScreens';
import { useGeneratedQuestions } from '../../hooks/useGeneratedQuestions';
import { fetchQuestions } from '../../lib/questions';
import { calcAge, clampLevel, nextSkillLevelFromBattle, skillLevelFor } from '../../lib/age';
import { npcDefeatXp, XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import {
  attackDamage,
  specialDamage,
  enemyAttack,
  defendReduction,
  bossPhase,
  BOSS_XP_BONUS,
} from '../../lib/battleMath';
import { BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { SAGES, CHARGE_MAX, SPECIAL_LEVEL_BONUS } from '../../content/abilities';
import { POTION_HEAL } from '../../content/items';
import { topicInfo, crystalFlag, TOPIC_REGISTRY } from '../../content/topics';
import { BOSS_LINES, emberStage, EMBER_SPRITES, EMBER_HATCHED } from '../../content/story';
import { avatarById } from '../../content/avatars';
import { HUB_ZONE } from '../../content/zones';
import { useBattleStore } from '../../store/battleStore';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow } from '../../machines/gameFlow';
import { pushLibrary } from '../../lib/save';
import type { LibraryEntry, Question } from '../../types';

const DEFAULT_AGE = 10;

type Turn =
  | { kind: 'command' }
  | { kind: 'question'; mode: 'attack' | 'special' | 'guard'; question: Question }
  | { kind: 'enemy-question'; question: Question }
  | { kind: 'message'; text: string; next: () => void }
  | { kind: 'victory' }
  | { kind: 'defeat' };

/**
 * FF-style side-profile command battle (#37). Enemy left, hero right, on a
 * pseudo-3D ground plane. Commands: Attack / Special / Guard / Potion /
 * Flee — every command resolves through a question (the educational core),
 * and the enemy's counterattack is blocked by answering a defend question.
 * Specials (FF6 Esper homage) need an equipped Sage, a full charge gauge,
 * and a question two levels up; a miss fizzles harmlessly.
 */
export default function BattleArena() {
  const { enemy, playerHp, playerMaxHp, enemyHp, setHp, markDefeated, endBattle } =
    useBattleStore();
  const save = useSaveStore((s) => s.save);
  const updateSave = useSaveStore((s) => s.update);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const setSkillLevel = useProfileStore((s) => s.setSkillLevel);
  const recordActivity = useProfileStore((s) => s.recordActivity);

  const powerUps = profile?.powerUps ?? {};
  const avatar = avatarById(save?.avatarId ?? null);
  const style = avatar?.fightStyle ?? 'balanced';
  const age = profile ? calcAge(profile.birthYear, profile.birthMonth) : DEFAULT_AGE;
  const topic = enemy?.topic ?? 'math';
  const info = topicInfo(topic);
  const sage = save?.sageEquipped ? SAGES[save.sageEquipped] : null;
  const crystals = TOPIC_REGISTRY.filter((t) => save?.flags[crystalFlag(t.id)]).length;
  const ember = emberStage(crystals, save?.flags ?? {});

  const { questions, loading, error, reload } = useGeneratedQuestions(
    topic,
    BATTLE_QUESTION_COUNT,
    enemy?.level,
  );

  const [turn, setTurn] = useState<Turn>({ kind: 'command' });
  const [charge, setCharge] = useState(0);
  const [guarded, setGuarded] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [specialQs, setSpecialQs] = useState<Question[]>([]);
  const [specialIdx, setSpecialIdx] = useState(0);
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  // One-shot animation triggers (remount keys).
  const [heroLunge, setHeroLunge] = useState(0);
  const [enemyLunge, setEnemyLunge] = useState(0);
  const [floats, setFloats] = useState<{ id: number; text: string; side: 'hero' | 'enemy'; color: string }[]>([]);
  const floatId = useRef(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const misses = useRef<LibraryEntry[]>([]);
  const lastPhase = useRef(0);
  const lastAnswer = useRef<{ correct: boolean } | null>(null);

  // Warm the Special-tier pool (level +2) once a Sage is equipped.
  useEffect(() => {
    if (!sage || !enemy) return;
    let active = true;
    fetchQuestions(
      topic,
      age,
      clampLevel(enemy.level + SPECIAL_LEVEL_BONUS),
      3,
      `a hero unleashing the special attack "${sage.specialName}" on ${enemy.name}`,
    )
      .then((qs) => active && setSpecialQs(qs))
      .catch(() => {
        /* Special stays unavailable; basic commands are unaffected. */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sage?.topic, enemy?.instanceId]);

  const float = useCallback((text: string, side: 'hero' | 'enemy', color: string) => {
    const id = ++floatId.current;
    setFloats((f) => [...f, { id, text, side, color }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
  }, []);

  // Fiends monologue before the first command (#37 story pass).
  const bossIntroDone = useRef(false);
  useEffect(() => {
    if (loading || !enemy?.isBoss || bossIntroDone.current) return;
    bossIntroDone.current = true;
    const lines = BOSS_LINES[enemy.topic].intro;
    const chain = lines.reduceRight<() => void>(
      (next, line) => () => setTurn({ kind: 'message', text: line, next }),
      () => setTurn({ kind: 'command' }),
    );
    chain();
  }, [loading, enemy]);

  // Battle entered without an encounter (e.g. stale reload) — bail out.
  const invalid = !enemy || !save || !avatar;
  useEffect(() => {
    if (invalid) sendFlow({ type: 'BATTLE_END', result: 'lose' });
  }, [invalid]);
  if (invalid) return null;
  if (loading) return <LoadingScreen label={`${enemy.name} approaches…`} topic={topic} />;
  if (error) {
    return (
      <ErrorScreen
        message={error}
        onRetry={reload}
        onBack={() => {
          sendFlow({ type: 'BATTLE_END', result: 'lose' });
          endBattle();
        }}
      />
    );
  }

  const phase = enemy.isBoss ? bossPhase(enemyHp, enemy.maxHp) : 0;
  const nextQuestion = () => {
    const q = questions[qIndex % questions.length];
    setQIndex((i) => i + 1);
    return q;
  };

  function recordAnswer(correct: boolean, q: Question, picked: number) {
    setAnswers((a) => [...a, correct]);
    if (correct) setCharge((c) => Math.min(CHARGE_MAX, c + 1));
    else misses.current.push({ question: q, picked });
  }

  // --- Command handlers ------------------------------------------------------

  function commandAttack() {
    setTurn({ kind: 'question', mode: 'attack', question: nextQuestion() });
  }
  function commandGuard() {
    setTurn({ kind: 'question', mode: 'guard', question: nextQuestion() });
  }
  function commandSpecial() {
    const q = specialQs[specialIdx % specialQs.length];
    setSpecialIdx((i) => i + 1);
    setTurn({ kind: 'question', mode: 'special', question: q });
  }
  function commandPotion() {
    updateSave((s) => ({ ...s, items: { ...s.items, potion: Math.max(0, s.items.potion - 1) } }));
    const healed = Math.min(playerMaxHp, playerHp + POTION_HEAL);
    setHp(healed, enemyHp);
    float(`+${healed - playerHp}`, 'hero', 'text-emerald-300');
    setTurn({ kind: 'message', text: `${avatar!.name} drinks a Berry Potion! 🧪`, next: enemyTurn });
  }
  function commandFlee() {
    updateSave((s) => ({ ...s, hp: playerHp }));
    sendFlow({ type: 'BATTLE_END', result: 'lose' });
    endBattle();
  }

  // --- Turn resolution --------------------------------------------------------

  function resolvePlayerQuestion(mode: 'attack' | 'special' | 'guard') {
    const wasCorrect = lastAnswer.current?.correct ?? false;
    lastAnswer.current = null;

    if (mode === 'guard') {
      if (wasCorrect) {
        setGuarded(true);
        float('🛡️', 'hero', 'text-sky-300');
        setTurn({ kind: 'message', text: `${avatar!.name} braces behind a wall of knowing!`, next: enemyTurn });
      } else {
        setTurn({ kind: 'message', text: 'The guard slips… stay sharp!', next: enemyTurn });
      }
      return;
    }

    let dmg: number;
    let text: string;
    if (mode === 'special') {
      if (wasCorrect && sage) {
        dmg = specialDamage(style, powerUps);
        setCharge(0);
        text =
          ember !== 'egg'
            ? `${sage.specialEmoji} ${sage.specialName}! Ember roars as your answer blazes!`
            : `${sage.specialEmoji} ${sage.specialName}! A brilliant answer erupts!`;
        confetti({ particleCount: 90, spread: 100, origin: { y: 0.4 } });
      } else {
        setTurn({ kind: 'message', text: 'The Special fizzles… the charge is safe. Try again!', next: enemyTurn });
        return;
      }
    } else {
      dmg = attackDamage(wasCorrect, style, powerUps);
      text = wasCorrect ? `${avatar!.name} strikes true!` : 'A glancing blow…';
    }

    setHeroLunge((n) => n + 1);
    const newEnemyHp = Math.max(0, enemyHp - dmg);
    setTimeout(() => {
      float(`-${dmg}`, 'enemy', mode === 'special' ? 'text-amber-300' : 'text-red-300');
      setHp(playerHp, newEnemyHp);
    }, 260);

    if (newEnemyHp <= 0) {
      setTurn({ kind: 'message', text, next: () => victory() });
      return;
    }
    // Boss enrage callout when crossing a phase boundary.
    if (enemy!.isBoss) {
      const p = bossPhase(newEnemyHp, enemy!.maxHp);
      if (p > lastPhase.current) {
        lastPhase.current = p;
        setPhaseBanner(p === 1 ? `${enemy!.name} growls — it's getting serious!` : `${enemy!.name} is furious!`);
        setTimeout(() => setPhaseBanner(null), 2500);
      }
    }
    setTurn({ kind: 'message', text, next: enemyTurn });
  }

  function enemyTurn() {
    setTurn({ kind: 'enemy-question', question: nextQuestion() });
  }

  function resolveEnemyQuestion() {
    const wasCorrect = lastAnswer.current?.correct ?? false;
    lastAnswer.current = null;

    const raw = enemyAttack(enemy!.level, enemy!.isBoss, phase);
    let dmg: number;
    if (guarded) {
      dmg = 0;
      setGuarded(false);
    } else {
      dmg = Math.max(0, raw - defendReduction(wasCorrect, style, powerUps));
    }

    setEnemyLunge((n) => n + 1);
    const newPlayerHp = Math.max(0, playerHp - dmg);
    setTimeout(() => {
      float(dmg === 0 ? 'Blocked!' : `-${dmg}`, 'hero', dmg === 0 ? 'text-sky-300' : 'text-red-300');
      setHp(newPlayerHp, enemyHp);
    }, 260);

    const text =
      dmg === 0
        ? `${enemy!.name} attacks — completely blocked!`
        : wasCorrect
          ? `${enemy!.name} attacks — you soften the hit!`
          : `${enemy!.name} lands a hit!`;

    if (newPlayerHp <= 0) {
      setTurn({ kind: 'message', text, next: () => defeat() });
    } else {
      setTurn({ kind: 'message', text, next: () => setTurn({ kind: 'command' }) });
    }
  }

  // --- Battle end --------------------------------------------------------------

  function settleCommon() {
    const correct = answers.filter(Boolean).length;
    const xp = correct * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps));
    void recordActivity();
    if (profile) {
      const current = skillLevelFor(profile.skillLevels, topic, age);
      const next = nextSkillLevelFromBattle(current, answers);
      if (next !== current) void setSkillLevel(topic, next);
    }
    return xp;
  }

  function victory() {
    confetti({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
    const xp = settleCommon() + npcDefeatXp(enemy!.level) + (enemy!.isBoss ? BOSS_XP_BONUS : 0);
    void addXp(xp);
    markDefeated(enemy!.instanceId);
    updateSave((s) => ({
      ...s,
      hp: playerHp,
      coins: s.coins + enemy!.coins,
      library: pushLibrary(s.library, misses.current),
      flags: {
        ...s.flags,
        // The first victory warms the egg — the hatch scene plays back in
        // the world (#37 story pass).
        [EMBER_HATCHED]: true,
        ...(enemy!.isBoss ? { [crystalFlag(topic)]: true } : {}),
      },
    }));
    setTurn({ kind: 'victory' });
  }

  function defeat() {
    const xp = settleCommon();
    void addXp(xp);
    // No game over (#37): wake up safe at Lumina Field, fully healed.
    updateSave((s) => ({
      ...s,
      hp: null,
      zoneId: HUB_ZONE,
      pos: null,
      library: pushLibrary(s.library, misses.current),
    }));
    setTurn({ kind: 'defeat' });
  }

  function leave(result: 'win' | 'lose') {
    // Transition first, then clear the session — clearing first would
    // re-render this screen enemy-less while still in the battle state.
    sendFlow({ type: 'BATTLE_END', result });
    endBattle();
  }

  // --- Render -------------------------------------------------------------------

  const correctCount = answers.filter(Boolean).length;
  const hpPct = (hp: number, max: number) => `${Math.max(0, (hp / max) * 100)}%`;

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-b ${info.skyGradient} overflow-hidden relative`}>
      {/* Parallax backdrop + pseudo-3D ground plane */}
      <div className="absolute inset-x-0 bottom-0 h-[46%] pointer-events-none">
        <div className="absolute -top-10 left-[8%] w-52 h-24 bg-black/20 rounded-full blur-md" />
        <div className="absolute -top-6 right-[12%] w-64 h-20 bg-black/25 rounded-full blur-md" />
        <div
          className="absolute inset-x-[-20%] bottom-0 h-full rounded-[100%_100%_0_0]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.18), rgba(0,0,0,0.35) 70%)',
            transform: 'perspective(500px) rotateX(30deg) scale(1.25)',
            transformOrigin: 'bottom',
          }}
        />
      </div>

      {/* Status panels (FF-style boxes) */}
      <div className="relative z-10 flex justify-between p-4 gap-4">
        <div className="bg-indigo-950/90 border-2 border-white/70 rounded-xl px-4 py-2 text-white w-60">
          <div className="flex justify-between text-sm font-bold">
            <span>
              {enemy.isBoss && '👑 '}
              {enemy.name}
            </span>
            <span className="text-white/70">Lv {enemy.level}</span>
          </div>
          <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
            <motion.div className="h-full bg-red-400 rounded-full" animate={{ width: hpPct(enemyHp, enemy.maxHp) }} />
          </div>
          <div className="text-[11px] text-white/60 text-right mt-0.5">
            {enemyHp}/{enemy.maxHp}
          </div>
        </div>
        <div className="bg-indigo-950/90 border-2 border-white/70 rounded-xl px-4 py-2 text-white w-60">
          <div className="flex justify-between text-sm font-bold">
            <span>
              {avatar.sprite} {avatar.name}
            </span>
            <span className="flex gap-0.5 items-center" title="Special charge">
              {Array.from({ length: CHARGE_MAX }).map((_, i) => (
                <span key={i} className={i < charge ? 'text-amber-300' : 'text-white/25'}>
                  ◆
                </span>
              ))}
            </span>
          </div>
          <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
            <motion.div className="h-full bg-green-400 rounded-full" animate={{ width: hpPct(playerHp, playerMaxHp) }} />
          </div>
          <div className="text-[11px] text-white/60 text-right mt-0.5">
            {playerHp}/{playerMaxHp}
          </div>
        </div>
      </div>

      {/* Boss enrage banner */}
      <AnimatePresence>
        {phaseBanner && (
          <motion.p
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center text-amber-300 font-extrabold tracking-wide"
          >
            ⚠️ {phaseBanner}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Combatants on the ground plane */}
      <div className="relative z-10 flex-1 flex items-end justify-between px-[12%] pb-[8%] min-h-[220px]">
        <div className="relative">
          <motion.div
            key={`el${enemyLunge}`}
            animate={enemyLunge ? { x: [0, 70, 0] } : {}}
            transition={{ duration: 0.5 }}
            className={enemy.isBoss ? 'text-[7rem] leading-none' : 'text-8xl leading-none'}
            style={{ filter: 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))' }}
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.2 }}>
              {enemy.sprite}
            </motion.div>
          </motion.div>
          {floats
            .filter((f) => f.side === 'enemy')
            .map((f) => (
              <motion.span
                key={f.id}
                initial={{ y: 0, opacity: 1 }}
                animate={{ y: -54, opacity: 0 }}
                transition={{ duration: 1 }}
                className={`absolute -top-6 left-1/2 -translate-x-1/2 font-extrabold text-2xl ${f.color}`}
              >
                {f.text}
              </motion.span>
            ))}
        </div>

        <div className="relative">
          <motion.div
            key={`hl${heroLunge}`}
            animate={heroLunge ? { x: [0, -70, 0] } : {}}
            transition={{ duration: 0.5 }}
            className="text-8xl leading-none scale-x-[-1]"
            style={{ filter: 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))' }}
          >
            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>
              {avatar.sprite}
            </motion.div>
          </motion.div>
          {guarded && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl">🛡️</span>}
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            className={`absolute -right-10 bottom-0 ${ember === 'egg' ? 'text-2xl' : ember === 'dragon' ? 'text-5xl' : 'text-3xl'}`}
            title="Ember"
            style={{ filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.4))' }}
          >
            {EMBER_SPRITES[ember]}
          </motion.span>
          {floats
            .filter((f) => f.side === 'hero')
            .map((f) => (
              <motion.span
                key={f.id}
                initial={{ y: 0, opacity: 1 }}
                animate={{ y: -54, opacity: 0 }}
                transition={{ duration: 1 }}
                className={`absolute -top-6 left-1/2 -translate-x-1/2 font-extrabold text-2xl ${f.color}`}
              >
                {f.text}
              </motion.span>
            ))}
        </div>
      </div>

      {/* Bottom box: commands / question / message / results */}
      <div className="relative z-20 p-4 pb-6 flex justify-center">
        {turn.kind === 'command' && (
          <div className="bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-4 w-full max-w-xl text-white shadow-2xl">
            <p className="text-xs text-white/60 mb-3 uppercase tracking-widest">
              Your move — every command is a question!
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <CommandButton emoji="⚔️" label="Attack" onClick={commandAttack} />
              <CommandButton
                emoji={sage?.specialEmoji ?? '✨'}
                label={sage ? sage.specialName : 'Special'}
                disabled={!sage || charge < CHARGE_MAX || specialQs.length === 0}
                hint={
                  !sage
                    ? 'Find a Sage!'
                    : charge < CHARGE_MAX
                      ? `Charge ${charge}/${CHARGE_MAX}`
                      : 'Ready!'
                }
                onClick={commandSpecial}
              />
              <CommandButton emoji="🛡️" label="Guard" onClick={commandGuard} />
              <CommandButton
                emoji="🧪"
                label="Potion"
                disabled={save.items.potion === 0 || playerHp === playerMaxHp}
                hint={`×${save.items.potion}`}
                onClick={commandPotion}
              />
              <CommandButton
                emoji="🏃"
                label="Flee"
                disabled={enemy.isBoss}
                hint={enemy.isBoss ? 'No escape!' : undefined}
                onClick={commandFlee}
              />
            </div>
          </div>
        )}

        {(turn.kind === 'question' || turn.kind === 'enemy-question') && (
          <div className="w-full max-w-xl">
            <p className="text-center text-white font-bold mb-2 text-sm uppercase tracking-widest">
              {turn.kind === 'enemy-question'
                ? `🛡️ ${enemy.name} attacks — answer to block!`
                : turn.mode === 'special'
                  ? `${sage?.specialEmoji} Extra-hard question — unleash ${sage?.specialName}!`
                  : turn.mode === 'guard'
                    ? '🛡️ Answer to raise your guard!'
                    : '⚔️ Answer to strike!'}
            </p>
            <QuestionCard
              key={turn.question.id + qIndex + specialIdx}
              question={turn.question}
              hints={save.items.hint}
              onUseHint={() =>
                updateSave((s) => ({ ...s, items: { ...s.items, hint: Math.max(0, s.items.hint - 1) } }))
              }
              onAnswered={(correct, picked) => {
                lastAnswer.current = { correct };
                recordAnswer(correct, turn.question, picked);
              }}
              continueLabel="▶ Go!"
              onContinue={() =>
                turn.kind === 'enemy-question'
                  ? resolveEnemyQuestion()
                  : resolvePlayerQuestion(turn.mode)
              }
            />
          </div>
        )}

        {turn.kind === 'message' && (
          <motion.button
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={turn.next}
            className="bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-5 w-full max-w-xl text-white text-left shadow-2xl"
          >
            <p className="font-semibold">{turn.text}</p>
            <p className="text-xs text-white/50 mt-2">▼ tap to continue</p>
          </motion.button>
        )}

        {(turn.kind === 'victory' || turn.kind === 'defeat') && (
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-indigo-950/95 border-4 border-amber-300 rounded-2xl p-6 w-full max-w-xl text-white text-center shadow-2xl"
          >
            {turn.kind === 'victory' ? (
              <>
                <div className="text-5xl mb-2">🏆</div>
                <h2 className="text-xl font-extrabold text-amber-300 mb-1">Victory!</h2>
                {enemy.isBoss && (
                  <>
                    <p className="text-white/60 italic text-sm mb-1">
                      "{BOSS_LINES[topic].defeat}"
                    </p>
                    <p className="text-emerald-300 font-bold mb-1">
                      💎 The {info.crystalName} shines again!
                    </p>
                  </>
                )}
                <p className="text-sm text-white/80">
                  {correctCount} correct answers · 🪙 +{enemy.coins} ·{' '}
                  ⭐ +{correctCount * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)) + npcDefeatXp(enemy.level) + (enemy.isBoss ? BOSS_XP_BONUS : 0)}{' '}
                  XP
                </p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-2">😴</div>
                <h2 className="text-xl font-extrabold mb-1">Whew — that was close!</h2>
                <p className="text-sm text-white/80">
                  Friendly hands carry you back to Lumina Field. You're safe, rested, and{' '}
                  {correctCount > 0 ? `kept ${correctCount} answers' worth of XP!` : 'ready to try again!'}
                </p>
              </>
            )}
            <button
              onClick={() => leave(turn.kind === 'victory' ? 'win' : 'lose')}
              className="mt-4 bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
            >
              {turn.kind === 'victory' ? 'Onward!' : 'Back to the field'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function CommandButton({
  emoji,
  label,
  hint,
  disabled,
  onClick,
}: {
  emoji: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 rounded-xl px-3 py-2.5 text-left transition"
    >
      <span className="text-lg mr-1.5">{emoji}</span>
      <span className="font-bold text-sm">{label}</span>
      {hint && <span className="block text-[10px] text-white/50 mt-0.5">{hint}</span>}
    </button>
  );
}
