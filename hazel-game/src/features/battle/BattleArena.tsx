import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { LoadingScreen, ErrorScreen } from '../../components/StatusScreens';
import { useGeneratedQuestions } from '../../hooks/useGeneratedQuestions';
import { fetchQuestions } from '../../lib/questions';
import { sfx, stopMusic, type SfxName } from '../../lib/audio';
import { playerAge, clampLevel, skillLevelFor } from '../../lib/age';
import { npcDefeatXp, XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import {
  attackDamage,
  spellDamage,
  companionAttackDamage,
  pairDamage,
  bossPhase,
  BOSS_XP_BONUS,
} from '../../lib/battleMath';
import {
  STREAK_MAX,
  STREAK_START,
  defendTimeMs,
  skillAfterBattle,
  speedStep,
  SUPER_EFFECTIVE,
  mercyFor,
  nextIntent,
  powerMoveName,
  resolveEnemyAttack,
  resolveHeroHit,
  rollDrop,
  streakMultiplier,
  victoryCoins,
  type EnemyIntent,
} from '../../lib/battleTurn';
import { BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { CHARGE_MAX } from '../../content/abilities';
import { spellsKnown, SPELL_LEVEL_BONUS, type Spell } from '../../content/spells';
import {
  COMPANIONS,
  COMPANION_IDS,
  EMBER_BONUS_CHARGE,
  PIP_PEEK_HIDES,
  WISP_MEND,
  companionCanFight,
  companionMove,
  companionPower,
  companionSprite,
  companionsInParty,
  pairAttacksFor,
  PAIR_ATTACKS,
  type CompanionId,
  type PairAttack,
} from '../../content/companion';
import {
  BATTLE_ITEMS,
  CLOVER_COIN_MULT,
  CONSUMABLES,
  POTION_HEAL,
  SNACK_HEAL,
  SPARK_CHARGE,
  TEA_DAMAGE_MULT,
  type ConsumableId,
} from '../../content/items';
import { topicInfo, crystalFlag } from '../../content/topics';
import { BOSS_LINES, emberStatus, EMBER_HATCHED } from '../../content/story';
import { keyForBoss, keyFlag } from '../../content/keys';
import { SpriteSheet } from './SpriteSheet';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { DefendTimer } from './DefendTimer';
import {
  EMBER_BREATH,
  COMPANION_CLIP,
  COMPANION_MOTION,
  COMPANION_STRIKE,
  FIREBALL_FLIGHT_MS,
  HERO_MOTION,
  HERO_STRIKE,
  actingMs,
  fireballLaunchMs,
  fitReach,
  pairChoreo,
  type Choreo,
  type CompanionMotion,
  type HeroMove,
  type Keyframes,
} from './choreography';
import { resolveSprite } from '../../content/sprites';
import { battleBackdrop } from '../../content/tiles';
import { avatarById } from '../../content/avatars';
import { HUB_ZONE } from '../../content/zones';
import { useBattleStore } from '../../store/battleStore';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow } from '../../machines/gameFlow';
import { pushLibrary } from '../../lib/save';
import type { LibraryEntry, Question } from '../../types';

/** Wall-clock ms for answer timing (module-level so it's never called during render). */
const nowMs = () => performance.now();

/**
 * `hide` = wrong options crossed out before the player starts (Pip's peek).
 * `seq` = which ask this is (unique per battle) — keys the question card.
 */
type Turn =
  | { kind: 'command' }
  | { kind: 'cast' }
  | { kind: 'items' }
  | { kind: 'companion' }
  | { kind: 'swap' }
  | { kind: 'question'; mode: 'attack' | 'guard' | 'companion'; question: Question; hide?: number; seq?: number }
  | { kind: 'question'; mode: 'spell'; spell: Spell; question: Question; hide?: number; seq?: number }
  | { kind: 'question'; mode: 'pair'; pair: PairAttack; question: Question; hide?: number; seq?: number }
  | { kind: 'enemy-question'; question: Question; hide?: number; seq?: number }
  | { kind: 'message'; text: string; next: () => void }
  | { kind: 'victory' }
  | { kind: 'defeat' };

type QuestionTurn = Extract<Turn, { kind: 'question' | 'enemy-question' }>;

/** What a win paid out, for the victory panel. */
interface Reward {
  coins: number;
  firstWin: boolean;
  drop: ConsumableId | null;
  /** Won under a Lucky Clover (coins already multiplied). */
  lucky: boolean;
}

/**
 * FF-style side-profile command battle (#37). Enemy left, hero right, on a
 * pseudo-3D ground plane. Commands: Attack / Spells / Companion / Guard /
 * Items / Swap / Flee — every command resolves through a question (the
 * educational core), and the enemy's counterattack is blocked by answering a
 * defend question.
 *
 * - **Spells** (the Spellbook): cast by answering one *super-hard* question
 *   (SPELL_LEVEL_BONUS levels up); a miss fizzles and the charge is safe. A
 *   Sage spell matching the enemy's topic is super effective.
 * - **Companions** (`content/companion.ts`): one fights beside the hero — a
 *   question-powered strike with a perk, plus Pair Attacks. 🔄 Swap brings in
 *   another companion **without spending the turn**.
 * - **Enemy intents** (`lib/battleTurn.ts`): enemies sometimes gather power
 *   (announced), then land a double-strength blow next turn unless guarded.
 * - **Streaks**: correct answers in a row power up every hit.
 * - **Mercy**: after a couple of losses to the same enemy, it eases off.
 *
 * Rules live in pure modules (`lib/battleMath.ts`, `lib/battleTurn.ts`,
 * `./choreography.ts`); this component plays them back. HP is written to the
 * store the moment a move resolves — only the *displayed* HP waits for the
 * blow to land (#70), so a fast tap can never act on stale HP.
 */
export default function BattleArena() {
  const { enemy, playerHp, playerMaxHp, enemyHp, setHp, markDefeated, endBattle } = useBattleStore();
  const recordLoss = useBattleStore((s) => s.recordLoss);
  const lossesSoFar = useBattleStore((s) => (enemy ? (s.losses[enemy.id] ?? 0) : 0));
  const save = useSaveStore((s) => s.save);
  const updateSave = useSaveStore((s) => s.update);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const setSkillLevel = useProfileStore((s) => s.setSkillLevel);
  const recordActivity = useProfileStore((s) => s.recordActivity);
  const reduceMotion = useReducedMotion() ?? false;

  const powerUps = profile?.powerUps ?? {};
  const avatar = avatarById(save?.avatarId ?? null);
  const style = avatar?.fightStyle ?? 'balanced';
  const age = playerAge(profile);
  const topic = enemy?.topic ?? 'math';
  const info = topicInfo(topic);
  // Warden bosses (#58) drop a gate key instead of restoring a crystal.
  const keyBoss = enemy ? keyForBoss(enemy.id) : undefined;
  const spells = save ? spellsKnown(save) : [];

  // Locked for the whole fight, re-locked per encounter:
  // - Ember's stage — a win can hatch the egg or grow Ember, but that reveal
  //   belongs to the world cutscene, not a sprite swap on the victory panel.
  // - The loss count behind mercy (easier questions) — recording this fight's loss must not
  //   re-key the question pool (and flash a loading screen over the defeat).
  const liveEmber = emberStatus(save?.flags ?? {}).stage;
  const [locked, setLocked] = useState(() => ({ for: enemy?.instanceId, ember: liveEmber, losses: lossesSoFar }));
  if (enemy && locked.for !== enemy.instanceId) {
    setLocked({ for: enemy.instanceId, ember: liveEmber, losses: lossesSoFar });
  }
  const ember = locked.ember;
  const mercy = mercyFor(locked.losses);

  // The active companion (🔄 Swap) lives in the save, so it survives reloads;
  // fall back to Ember if the saved pick isn't in this save's party.
  const party = save ? companionsInParty(save) : (['ember'] as CompanionId[]);
  const savedCompanion = save?.companionId ?? 'ember';
  const companionId: CompanionId = party.includes(savedCompanion) ? savedCompanion : 'ember';
  const companion = COMPANIONS[companionId];
  const cMove = companionMove(companionId, ember);
  const cPower = companionPower(companionId, ember);
  const cReady = companionCanFight(companionId, ember);
  const pairs = pairAttacksFor(companionId, ember);
  const emberActive = companionId === 'ember' && ember !== 'egg';

  const enemySprite = resolveSprite(enemy?.spriteId, enemy?.sprite ?? '❓');
  const heroSprite = resolveSprite(avatar?.spriteId, avatar?.sprite ?? '❓');
  const cSpriteIds = companionSprite(companionId, ember);
  const cSprite = resolveSprite(cSpriteIds.spriteId, cSpriteIds.emoji);
  const fireballSprite = resolveSprite('fx-fireball', '🔥');

  const { questions, loading, error, reload } = useGeneratedQuestions(
    topic,
    BATTLE_QUESTION_COUNT,
    enemy ? clampLevel(enemy.level - mercy.levelDrop) : undefined,
  );

  const [turn, setTurn] = useState<Turn>({ kind: 'command' });
  const [charge, setCharge] = useState(0);
  const [guarded, setGuarded] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  // Super-hard question pool (level + SPELL_LEVEL_BONUS) shared by spells + Pair Attacks.
  const [spellQs, setSpellQs] = useState<Question[]>([]);
  const [spellIdx, setSpellIdx] = useState(0);
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  // Correct answers in a row (any question) — powers up every hit.
  const [streak, setStreak] = useState(0);
  // Wrong options Pip will cross out on the next question. A ref, not state:
  // the next question is often posed by a `next` callback created before the
  // peek was set, and it must still see it.
  const peek = useRef(0);
  // What the enemy does on its NEXT turn (see lib/battleTurn nextIntent).
  const [intent, setIntent] = useState<EnemyIntent>('attack');
  const enemyTurnNo = useRef(0);
  const [reward, setReward] = useState<Reward | null>(null);
  // Speed trigger (lib/battleTurn speedStep): quick correct answers in a row
  // raise this battle's question level. Refs, not state — the next question is
  // often posed by a callback created a render earlier and must see the boost.
  const askedAt = useRef(0);
  // A Hint Feather or Pip's peek made this question easier — it can't count
  // toward the speed trigger.
  const helped = useRef(false);
  const askSeq = useRef(0);
  const speedRun = useRef(0);
  const speedBoost = useRef(0);
  const boostPool = useRef<{ qs: Question[]; i: number }>({ qs: [], i: 0 });
  const [boostShown, setBoostShown] = useState(0);
  // The question (by card key) the player has picked an answer for — stops
  // the defend countdown.
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);

  // Displayed HP while a blow is still in the air (null = show the store's).
  const [shownHp, setShownHp] = useState<{ p: number; e: number } | null>(null);
  const shownSeq = useRef(0);

  // One-shot animation triggers (remount keys) + which motion each plays
  // (see ./choreography). The motion is set together with the counter bump.
  const [heroLunge, setHeroLunge] = useState(0);
  const [heroMotion, setHeroMotion] = useState<HeroMove>('lunge');
  const [enemyLunge, setEnemyLunge] = useState(0);
  const [companionLunge, setCompanionLunge] = useState(0);
  const [companionMotion, setCompanionMotion] = useState<CompanionMotion>('lunge');
  const [swapIn, setSwapIn] = useState(0);
  const [cheer, setCheer] = useState(0);
  const [cheering, setCheering] = useState(false);
  // The enemy flinches when a blow LANDS (not when the attacker sets off).
  const [enemyHit, setEnemyHit] = useState(0);
  const [enemyHurt, setEnemyHurt] = useState(false);
  // Measured px gap between hero and enemy, so dives reach the enemy on any screen.
  const [reachGap, setReachGap] = useState<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  // Fireballs in flight, from Ember to the enemy.
  const [fireballs, setFireballs] = useState<{ id: number; delayMs: number; big: boolean }[]>([]);
  // Transient flags: true only while the lunge animation plays.
  const [enemyActing, setEnemyActing] = useState(false);
  const [heroActing, setHeroActing] = useState(false);
  const [companionActing, setCompanionActing] = useState(false);
  const [floats, setFloats] = useState<{ id: number; text: string; side: 'hero' | 'enemy'; color: string }[]>([]);
  const floatId = useRef(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const misses = useRef<LibraryEntry[]>([]);
  const lastPhase = useRef(0);
  // Shielded archetype (Wave 0.5): the first landed hit shatters the shield.
  // Re-derived whenever the enemy changes (React's adjust-state-during-render
  // pattern) — a mount-only initializer would leak shield state into the next
  // fight if a future flow ever swaps enemies without unmounting the arena.
  const [enemyShielded, setEnemyShielded] = useState(() => enemy?.behavior === 'shielded');
  const [shieldedFor, setShieldedFor] = useState(enemy?.instanceId);
  // Battle-item buffs (village expansion items): each lasts until it's used up.
  const [mirrored, setMirrored] = useState(false); // Mirror Charm: bounce the next hit
  const [focused, setFocused] = useState(false); // Focus Tea: next Attack ×TEA_DAMAGE_MULT
  const [lucky, setLucky] = useState(false); // Lucky Clover: ×CLOVER_COIN_MULT coins on a win
  if (enemy && shieldedFor !== enemy.instanceId) {
    setShieldedFor(enemy.instanceId);
    setEnemyShielded(enemy.behavior === 'shielded');
    // Battle-item buffs belong to one fight too.
    setMirrored(false);
    setFocused(false);
    setLucky(false);
  }

  // Warm the super-hard spell-tier pool (level + SPELL_LEVEL_BONUS). Every
  // hero knows at least Mend, so this always loads; spells stay castable.
  useEffect(() => {
    if (!enemy) return;
    let active = true;
    fetchQuestions(
      topic,
      age,
      clampLevel(enemy.level + SPELL_LEVEL_BONUS - mercy.levelDrop),
      4,
      `a hero casting a powerful spell against ${enemy.name}`,
    )
      .then((qs) => active && setSpellQs(qs))
      .catch(() => {
        /* Spells stay unavailable; basic commands are unaffected. */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemy?.instanceId]);

  // One banner lifecycle for every caller (archetype callouts, boss enrage,
  // power moves, pair attacks, swaps): showing a new banner cancels the
  // previous hide timer, so a stale timeout can never wipe a fresh banner.
  const bannerTimer = useRef<number | null>(null);
  // Warnings default to ⚠️; other callers bring their own emoji.
  const showBanner = useCallback((text: string, ttl = 2500, icon = '⚠️') => {
    if (bannerTimer.current !== null) clearTimeout(bannerTimer.current);
    setPhaseBanner(`${icon} ${text}`);
    bannerTimer.current = window.setTimeout(() => setPhaseBanner(null), ttl);
  }, []);
  useEffect(
    () => () => {
      if (bannerTimer.current !== null) clearTimeout(bannerTimer.current);
    },
    [],
  );

  // Start-of-battle callouts, once the question LoadingScreen clears (the
  // banner only renders in the battle UI): the archetype twist (so it's never
  // a gotcha), then mercy if this enemy has beaten the hero a couple of times.
  const calloutShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !enemy || calloutShownFor.current === enemy.instanceId) return;
    calloutShownFor.current = enemy.instanceId;
    const timers: number[] = [];
    let at = 250;
    if (enemy.behavior) {
      const callout = {
        shielded: `${enemy.name} raises a stony shield — the first hit will shatter it!`,
        trickster: `${enemy.name} is too slippery for Hint Feathers!`,
        healer: `${enemy.name} mends itself when it's hurt — press the attack!`,
      }[enemy.behavior];
      timers.push(window.setTimeout(() => showBanner(callout, 3000), at));
      at += 3200;
    }
    if (mercy.levelDrop > 0) {
      timers.push(
        window.setTimeout(
          () => showBanner(`Tough one last time? ${enemy.name}'s questions will be a little easier now.`, 3500, '💛'),
          at,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemy?.instanceId, loading]);

  // Every one-shot battle timer (hit landings, pop-ups, delayed sounds) goes
  // through `later`, so leaving the battle cancels whatever is still pending —
  // no stray impact/heal sound or state update after the arena is gone.
  const pendingTimers = useRef(new Set<number>());
  // False once the arena unmounts — late fetches (the speed-boost pool) bail.
  const live = useRef(true);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      pendingTimers.current.delete(id);
      fn();
    }, ms);
    pendingTimers.current.add(id);
  }, []);
  useEffect(() => {
    const timers = pendingTimers.current;
    live.current = true;
    return () => {
      live.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const float = useCallback(
    (text: string, side: 'hero' | 'enemy', color: string) => {
      const id = ++floatId.current;
      setFloats((f) => [...f, { id, text, side, color }]);
      later(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
    },
    [later],
  );

  // Fiends monologue before the first command (#37 story pass).
  const bossIntroDone = useRef(false);
  useEffect(() => {
    if (loading || !enemy?.isBoss || bossIntroDone.current) return;
    bossIntroDone.current = true;
    const lines = keyBoss ? keyBoss.bossIntro : BOSS_LINES[enemy.topic as keyof typeof BOSS_LINES].intro;
    const chain = lines.reduceRight<() => void>(
      (next, line) => () => setTurn({ kind: 'message', text: line, next }),
      () => setTurn({ kind: 'command' }),
    );
    chain();
  }, [loading, enemy, keyBoss]);

  // Flip acting flags on for each motion's duration.
  useEffect(() => {
    if (!enemyLunge) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: transient attack/hurt flag for the lunge animation window
    setEnemyActing(true);
    const t = setTimeout(() => setEnemyActing(false), 520);
    return () => clearTimeout(t);
  }, [enemyLunge]);

  useEffect(() => {
    if (!heroLunge) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: transient attack/hurt flag for the lunge animation window
    setHeroActing(true);
    const t = setTimeout(() => setHeroActing(false), actingMs(HERO_MOTION[heroMotion]));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heroMotion is set in the same batch as the counter
  }, [heroLunge]);

  useEffect(() => {
    if (!companionLunge) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: transient attack flag for the companion's lunge window
    setCompanionActing(true);
    const t = setTimeout(() => setCompanionActing(false), actingMs(COMPANION_MOTION[companionMotion]));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- companionMotion is set in the same batch as the counter
  }, [companionLunge]);

  useEffect(() => {
    if (!cheer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: transient cheer while a streak is celebrated
    setCheering(true);
    const t = setTimeout(() => setCheering(false), 1200);
    return () => clearTimeout(t);
  }, [cheer]);

  useEffect(() => {
    if (!enemyHit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: transient hurt flag while the enemy flinches
    setEnemyHurt(true);
    const t = setTimeout(() => setEnemyHurt(false), 420);
    return () => clearTimeout(t);
  }, [enemyHit]);

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

  const viewPlayerHp = shownHp?.p ?? playerHp;
  const viewEnemyHp = shownHp?.e ?? enemyHp;
  const phase = enemy.isBoss ? bossPhase(enemyHp, enemy.maxHp) : 0;
  const canCastAny = spellQs.length > 0 && spells.some((s) => charge >= s.cost);
  const powerMove = powerMoveName(enemy.id);
  const nextQuestion = () => {
    // After a speed boost, draw from the harder pool once it has arrived.
    const bp = boostPool.current;
    if (bp.qs.length > 0) return bp.qs[bp.i++ % bp.qs.length];
    const q = questions[qIndex % questions.length];
    setQIndex((i) => i + 1);
    return q;
  };
  /** The level this battle's regular questions are asked at (before any speed boost). */
  const baseQLevel = clampLevel(enemy.level - mercy.levelDrop);
  /** Pose a question turn, spending Pip's peek on it if one is waiting. */
  const ask = (t: QuestionTurn) => {
    setTurn({ ...t, hide: peek.current, seq: ++askSeq.current });
    helped.current = peek.current > 0;
    peek.current = 0;
    askedAt.current = nowMs();
  };
  /** Streak bonus applied to every hero-side hit. */
  const boost = (dmg: number) => Math.round(dmg * streakMultiplier(streak));
  const burst = (opts: confetti.Options) => confetti({ ...opts, disableForReducedMotion: true });

  /**
   * Write HP to the store NOW (the source of truth every later action reads),
   * but keep showing the old values until the blow lands `revealMs` later.
   * A newer commit supersedes an older pending reveal.
   */
  function commitHp(p: number, e: number, revealMs: number) {
    const seq = ++shownSeq.current;
    if (revealMs > 0) {
      setShownHp({ p: viewPlayerHp, e: viewEnemyHp });
      later(() => {
        if (shownSeq.current === seq) setShownHp(null);
      }, revealMs);
    } else {
      setShownHp(null);
    }
    setHp(p, e);
  }

  function recordAnswer(correct: boolean, q: Question, picked: number) {
    setAnswers((a) => [...a, correct]);
    // A hinted / peeked answer isn't evidence the questions are too easy.
    const ms = helped.current ? Infinity : nowMs() - askedAt.current;
    const step = speedStep(speedRun.current, correct, ms, age, speedBoost.current);
    speedRun.current = step.run;
    if (step.boosted) raiseQuestionLevel();
    if (correct) {
      setCharge((c) => Math.min(CHARGE_MAX, c + 1));
      const next = streak + 1;
      setStreak(next);
      if (next === STREAK_START || next === STREAK_MAX) {
        sfx('streak');
        float(`🔥 ${next} in a row!`, 'hero', 'text-orange-300');
        setCheer((n) => n + 1);
      }
    } else {
      setStreak(0);
      misses.current.push({ question: q, picked });
    }
  }

  // --- Command handlers ------------------------------------------------------

  function commandAttack() {
    ask({ kind: 'question', mode: 'attack', question: nextQuestion() });
  }
  function commandGuard() {
    ask({ kind: 'question', mode: 'guard', question: nextQuestion() });
  }
  function commandCompanion() {
    if (cReady) setTurn({ kind: 'companion' });
  }
  function commandCompanionStrike() {
    ask({ kind: 'question', mode: 'companion', question: nextQuestion() });
  }
  function startPair(pair: PairAttack) {
    if (charge < pair.cost || spellQs.length === 0) return;
    const q = spellQs[spellIdx % spellQs.length];
    setSpellIdx((i) => i + 1);
    ask({ kind: 'question', mode: 'pair', pair, question: q });
  }
  function castSpell(spell: Spell) {
    if (charge < spell.cost || spellQs.length === 0) return;
    const q = spellQs[spellIdx % spellQs.length];
    setSpellIdx((i) => i + 1);
    ask({ kind: 'question', mode: 'spell', spell, question: q });
  }
  /** Swap companions — a free action: the turn stays on the command menu. */
  function swapTo(id: CompanionId) {
    if (id !== companionId && party.includes(id)) {
      const c = COMPANIONS[id];
      updateSave((s) => ({ ...s, companionId: id }));
      setSwapIn((n) => n + 1);
      sfx('swap');
      showBanner(`${c.name} tags in — still your move!`, 1800, c.emoji);
    }
    setTurn({ kind: 'command' });
  }
  /** Why a battle item can't be used right now (null = usable). */
  function itemBlocked(id: ConsumableId): string | null {
    if (!save || save.items[id] <= 0) return 'None left';
    if ((id === 'potion' || id === 'elixir') && playerHp >= playerMaxHp) return 'HP is full';
    if (id === 'spark' && charge >= CHARGE_MAX) return 'Charge is full';
    if (id === 'ward' && guarded) return 'Already warded';
    if (id === 'snack' && playerHp >= playerMaxHp && charge >= CHARGE_MAX) return 'HP and charge are full';
    if (id === 'coil' && charge >= CHARGE_MAX) return 'Charge is full';
    if (id === 'mirror' && mirrored) return 'Mirror is up';
    if (id === 'tea' && focused) return 'Already focused';
    if (id === 'clover' && lucky) return 'Already lucky';
    return null;
  }
  /** Use a battle item (#73). Like any command, it spends the hero's turn. */
  function applyItem(id: ConsumableId) {
    if (itemBlocked(id)) return;
    updateSave((s) => ({ ...s, items: { ...s.items, [id]: Math.max(0, s.items[id] - 1) } }));
    const { name, emoji } = CONSUMABLES[id];
    if (id === 'potion' || id === 'elixir') {
      const healed = id === 'elixir' ? playerMaxHp : Math.min(playerMaxHp, playerHp + POTION_HEAL);
      commitHp(healed, enemyHp, 0);
      sfx('heal');
      float(`+${healed - playerHp}`, 'hero', 'text-emerald-300');
    } else if (id === 'spark') {
      setCharge((c) => Math.min(CHARGE_MAX, c + SPARK_CHARGE));
      sfx('spell');
      float(`+${SPARK_CHARGE}◆`, 'hero', 'text-amber-300');
    } else if (id === 'ward') {
      setGuarded(true);
      sfx('guard');
      float('🌈', 'hero', 'text-sky-300');
    } else if (id === 'snack') {
      const healed = Math.min(playerMaxHp, playerHp + SNACK_HEAL);
      commitHp(healed, enemyHp, 0);
      setCharge((c) => Math.min(CHARGE_MAX, c + 1));
      sfx('heal');
      float(`+${healed - playerHp} +1◆`, 'hero', 'text-emerald-300');
    } else if (id === 'coil') {
      setCharge(CHARGE_MAX);
      sfx('spell');
      float('◆ MAX', 'hero', 'text-amber-300');
    } else if (id === 'mirror') {
      setMirrored(true);
      sfx('guard');
      float('🪞', 'hero', 'text-sky-300');
    } else if (id === 'tea') {
      setFocused(true);
      sfx('spell');
      float('🍵 Focus!', 'hero', 'text-lime-300');
    } else if (id === 'clover') {
      setLucky(true);
      sfx('streak');
      float('🍀 Lucky!', 'hero', 'text-emerald-300');
    }
    setTurn({ kind: 'message', text: `${avatar!.name} uses a ${name}! ${emoji}`, next: enemyTurn });
  }
  function commandFlee() {
    updateSave((s) => ({ ...s, hp: useBattleStore.getState().playerHp }));
    // Fleeing skips the battle ramp, but a level the speed trigger earned stays earned.
    if (profile && speedBoost.current > 0) {
      const current = skillLevelFor(profile.skillLevels, topic, age);
      const next = skillAfterBattle(current, [], speedBoost.current);
      if (next !== current) void setSkillLevel(topic, next);
    }
    sendFlow({ type: 'BATTLE_END', result: 'lose' });
    endBattle();
  }

  // --- Turn resolution --------------------------------------------------------

  function resolvePlayerQuestion(mode: 'attack' | 'guard', wasCorrect: boolean) {
    if (mode === 'guard') {
      if (wasCorrect) {
        setGuarded(true);
        sfx('guard');
        float('🛡️', 'hero', 'text-sky-300');
        const warn = intent === 'power' ? ` ${powerMove} won't get through!` : '';
        setTurn({ kind: 'message', text: `${avatar!.name} braces behind a wall of knowing!${warn}`, next: enemyTurn });
      } else {
        setTurn({ kind: 'message', text: 'The guard slips… stay sharp!', next: enemyTurn });
      }
      return;
    }
    let dmg = boost(attackDamage(wasCorrect, style, powerUps));
    let text = wasCorrect ? `${avatar!.name} strikes true!` : 'A glancing blow…';
    if (focused && dmg > 0) {
      if (enemyShielded) {
        // The shield would swallow the doubled hit — keep the focus for later.
        text += ' 🍵 (Your focus holds for the next swing!)';
      } else {
        // Focus Tea: the next Attack hits extra hard (then the focus is spent).
        setFocused(false);
        dmg *= TEA_DAMAGE_MULT;
        text += ' 🍵 Focused — double damage!';
      }
    }
    dealHeroDamage(dmg, text, 'text-red-300', { sound: 'attack' });
  }

  /**
   * The companion's strike. A correct answer also triggers its perk — Ember
   * stokes an extra ◆, Pip crosses out a wrong answer on the next question,
   * Wisp mends the hero. A wrong answer is a glancing blow (effort never zero).
   */
  function resolveCompanionStrike(wasCorrect: boolean) {
    const dmg = boost(companionAttackDamage(wasCorrect, cPower));
    let note = '';
    let heroHp = playerHp;
    if (wasCorrect && companion.perk === 'charge') {
      setCharge((c) => Math.min(CHARGE_MAX, c + EMBER_BONUS_CHARGE));
      later(() => float(`+${EMBER_BONUS_CHARGE}◆`, 'hero', 'text-amber-300'), 260);
      note = ' The fire stokes your spell charge!';
    } else if (wasCorrect && companion.perk === 'peek') {
      peek.current = PIP_PEEK_HIDES;
      note = ' Pip peeks ahead — one wrong answer on the next question is crossed out! 👀';
    } else if (wasCorrect && companion.perk === 'mend') {
      heroHp = Math.min(playerMaxHp, playerHp + WISP_MEND);
      if (heroHp > playerHp) {
        later(() => {
          sfx('heal');
          float(`+${heroHp - playerHp}`, 'hero', 'text-emerald-300');
        }, 260);
        note = ` Wisp's light mends ${heroHp - playerHp} HP!`;
      }
    }
    const text = wasCorrect
      ? `${cMove.emoji} ${companion.name} uses ${cMove.name}!${note}`
      : `${cMove.emoji} ${companion.name}'s ${cMove.name} just grazes it… a glancing blow.`;
    dealHeroDamage(dmg, text, 'text-orange-300', {
      choreo: COMPANION_STRIKE,
      sound: companion.sound,
      playerHpAfter: heroHp,
    });
  }

  /** Fire a Pair Attack once its super-hard question resolves. */
  function resolvePair(pair: PairAttack, wasCorrect: boolean) {
    if (!wasCorrect) {
      // Same promise as spells: a miss fizzles and the charge is safe.
      setTurn({
        kind: 'message',
        text: `${pair.emoji} ${pair.name} falls out of step… the charge is safe. Try again together!`,
        next: enemyTurn,
      });
      return;
    }
    setCharge((c) => Math.max(0, c - pair.cost));
    burst({ particleCount: 140, spread: 120, origin: { y: 0.4 }, colors: ['#fb923c', '#fbbf24', '#f87171', '#fde68a'] });
    showBanner(`PAIR ATTACK — ${pair.name.toUpperCase()}!`, 1800, pair.emoji);
    const dmg = boost(pairDamage(style, powerUps, cPower, pair.multiplier));
    const heroHp = pair.heal ? Math.min(playerMaxHp, playerHp + pair.heal) : playerHp;
    if (heroHp > playerHp) {
      later(() => {
        sfx('heal');
        float(`+${heroHp - playerHp}`, 'hero', 'text-emerald-300');
      }, 400);
    }
    const healNote = heroHp > playerHp ? ` Its light mends ${heroHp - playerHp} HP!` : '';
    dealHeroDamage(dmg, `${pair.emoji} ${avatar!.name} and ${companion.name} unleash ${pair.name}!${healNote}`, pair.color, {
      refundCharge: pair.cost,
      choreo: pairChoreo(pair.id),
      sound: 'pair',
      playerHpAfter: heroHp,
    });
  }

  /** Cast the chosen spell once its super-hard question resolves. */
  function resolveSpell(spell: Spell, wasCorrect: boolean) {
    if (!wasCorrect) {
      // A miss never punishes effort: the charge is safe, the spell just fizzles.
      setTurn({ kind: 'message', text: `${spell.emoji} ${spell.name} fizzles… the charge is safe. Try again!`, next: enemyTurn });
      return;
    }
    setCharge((c) => Math.max(0, c - spell.cost));
    burst({ particleCount: 90, spread: 100, origin: { y: 0.4 } });

    if (spell.effect.kind === 'heal') {
      const healed = Math.min(playerMaxHp, playerHp + spell.effect.amount);
      commitHp(healed, enemyHp, 0);
      setHeroMotion('lunge');
      setHeroLunge((n) => n + 1);
      sfx('spell');
      later(() => {
        sfx('heal');
        float(`+${healed - playerHp}`, 'hero', spell.color);
      }, 260);
      setTurn({ kind: 'message', text: `${spell.emoji} ${spell.name}! Bright knowing knits your wounds.`, next: enemyTurn });
      return;
    }
    if (spell.effect.kind === 'shield') {
      setGuarded(true);
      const healed = Math.min(playerMaxHp, playerHp + spell.effect.heal);
      commitHp(healed, enemyHp, 0);
      sfx('spell');
      later(() => sfx('guard'), 260);
      float('🛡️', 'hero', spell.color);
      setTurn({ kind: 'message', text: `${spell.emoji} ${spell.name}! A shield of knowing rises — the next hit will glance away.`, next: enemyTurn });
      return;
    }
    // Offensive spell — super effective when a Sage's topic matches the enemy's.
    const weak = spell.topic !== undefined && spell.topic === enemy!.topic;
    const dmg = boost(Math.round(spellDamage(style, powerUps, spell.effect.multiplier) * (weak ? SUPER_EFFECTIVE : 1)));
    const breath = spell.id === 'ember-breath';
    const lead =
      breath && emberActive
        ? `${spell.emoji} ${spell.name}! Ember rears back and breathes dragonfire!`
        : breath
          ? `${spell.emoji} ${spell.name}! Ember swoops in from the sidelines, breathing dragonfire!`
          : emberActive
            ? `${spell.emoji} ${spell.name}! Ember roars as your answer blazes!`
            : `${spell.emoji} ${spell.name}! A brilliant answer erupts!`;
    // Ember's Breath is Ember's own move when Ember is fighting: inhale, then a fireball volley.
    const choreo = breath && emberActive ? EMBER_BREATH : HERO_STRIKE;
    dealHeroDamage(dmg, weak ? `${lead} It's super effective!` : lead, spell.color, {
      refundCharge: spell.cost,
      choreo,
      sound: 'spell',
      superEffective: weak,
    });
  }

  /**
   * Shared damage-dealing path for Attack, companion strikes, Pair Attacks and
   * offensive spells (rules in lib/battleTurn resolveHeroHit). Charge-spending
   * moves pass `refundCharge` so a shield-absorbed cast gives the charge back —
   * a correct super-hard answer must never buy less than a free glancing blow
   * would. `choreo` says who moves and when the blow lands; `sound` is the
   * wind-up SFX (the 'pair' sound carries its own impacts). `playerHpAfter`
   * carries a heal that rides on the move (Wisp).
   */
  function dealHeroDamage(
    dmg: number,
    text: string,
    floatColor: string,
    {
      refundCharge = 0,
      choreo = HERO_STRIKE,
      sound,
      playerHpAfter = playerHp,
      superEffective = false,
    }: { refundCharge?: number; choreo?: Choreo; sound: SfxName; playerHpAfter?: number; superEffective?: boolean },
  ) {
    perform(choreo, sound);
    const hit = resolveHeroHit({
      dmg,
      enemyHp,
      enemyMaxHp: enemy!.maxHp,
      shielded: enemyShielded,
      isBoss: enemy!.isBoss,
      lastPhase: lastPhase.current,
    });
    commitHp(playerHpAfter, hit.newEnemyHp, choreo.hitMs);
    later(() => {
      setEnemyHit((n) => n + 1);
      if (hit.shieldBroke) {
        sfx('shatter');
        float('Shield shattered!', 'enemy', 'text-amber-300');
        return;
      }
      if (sound !== 'pair') sfx('impact');
      float(`-${dmg}`, 'enemy', floatColor);
      if (superEffective) float('Super effective!', 'enemy', 'text-yellow-200');
    }, choreo.hitMs);

    // Shielded archetype: the shield absorbs the first landed hit (any hit —
    // even a glancing blow shatters it), then the enemy fights unprotected.
    if (hit.shieldBroke) {
      setEnemyShielded(false);
      if (refundCharge > 0) setCharge((c) => Math.min(CHARGE_MAX, c + refundCharge));
      setTurn({
        kind: 'message',
        text:
          `${text} The stony shield takes the blow — and SHATTERS! ${enemy!.name} is wide open now!` +
          (refundCharge > 0 ? ' The spell-light flows back to you — charge refunded!' : ''),
        next: enemyTurn,
      });
      return;
    }
    if (hit.defeated) {
      setTurn({ kind: 'message', text, next: () => victory() });
      return;
    }
    if (hit.phaseCrossed) announcePhase(hit.phaseCrossed);
    setTurn({ kind: 'message', text, next: enemyTurn });
  }

  /** Boss enrage callout when the enemy's HP crosses into phase `p`. */
  function announcePhase(p: number) {
    lastPhase.current = p;
    showBanner(p === 1 ? `${enemy!.name} growls — it's getting serious!` : `${enemy!.name} is furious!`);
  }

  /** Enrage check for damage that isn't a hero hit (a Mirror Charm bounce). */
  function checkBossPhase(newEnemyHp: number) {
    if (!enemy!.isBoss || newEnemyHp <= 0) return;
    const p = bossPhase(newEnemyHp, enemy!.maxHp);
    if (p > lastPhase.current) announcePhase(p);
  }

  /** Start a move's motions, fireball volley and wind-up sound. */
  function perform(c: Choreo, sound: SfxName) {
    const h = heroRef.current?.getBoundingClientRect();
    const e = enemyRef.current?.getBoundingClientRect();
    if (h && e && h.width > 0) setReachGap(h.left - e.right);
    if (c.hero) {
      setHeroMotion(c.hero);
      setHeroLunge((n) => n + 1);
    }
    if (c.companion) {
      setCompanionMotion(c.companion);
      setCompanionLunge((n) => n + 1);
    }
    if (c.fireballs > 0 && !reduceMotion) {
      const big = c.companion === 'breath' || ember === 'dragon';
      const volley = Array.from({ length: c.fireballs }, (_, i) => ({
        id: ++floatId.current,
        delayMs: fireballLaunchMs(c, i),
        big,
      }));
      setFireballs((f) => [...f, ...volley]);
      const ids = new Set(volley.map((v) => v.id));
      later(() => setFireballs((f) => f.filter((x) => !ids.has(x.id))), c.hitMs + 200);
    }
    if (c.soundMs > 0) later(() => sfx(sound), c.soundMs);
    else sfx(sound);
  }

  /** Move the enemy's plan on to its next turn (lib/battleTurn nextIntent). */
  function advanceIntent(current: EnemyIntent) {
    enemyTurnNo.current += 1;
    setIntent(nextIntent(current, enemyTurnNo.current, enemy!.isBoss));
  }

  function enemyTurn() {
    if (intent === 'charge') {
      // Telegraph: this turn the enemy only gathers power — and says so.
      sfx('charge');
      showBanner(`${enemy!.name} is gathering power for ${powerMove}!`, 2800, '💢');
      advanceIntent('charge');
      setTurn({
        kind: 'message',
        text: `${enemy!.name} is gathering power… ${powerMove} is coming next turn! 🛡️ Guard (or a Rainbow Ward) will block it completely.`,
        next: () => setTurn({ kind: 'command' }),
      });
      return;
    }
    ask({ kind: 'enemy-question', question: nextQuestion() });
  }

  /**
   * The defend countdown ran out before an answer was picked: the blow lands
   * exactly as for a wrong answer (the streak breaks, the question goes to the
   * Library), with a "Time's up!" message.
   */
  function defendTimedOut(q: Question) {
    sfx('wrong');
    speedRun.current = 0;
    setAnswers((a) => [...a, false]);
    setStreak(0);
    misses.current.push({ question: q, picked: -1 }); // no pick — the Library never shows it
    resolveEnemyQuestion(false, true);
  }

  function resolveEnemyQuestion(wasCorrect: boolean, timedOut = false) {
    const blow = intent === 'power' ? 'power' : 'attack';
    const r = resolveEnemyAttack({
      level: enemy!.level,
      isBoss: enemy!.isBoss,
      phase,
      intent: blow,
      guarded,
      mirrored,
      enemyShielded,
      wasCorrect,
      style,
      powerUps,
      behavior: enemy!.behavior,
      playerHp,
      enemyHp,
      enemyMaxHp: enemy!.maxHp,
    });
    // A Mirror Charm takes the blow first; the Guard stays up for the next one.
    if (mirrored) setMirrored(false);
    else if (guarded) setGuarded(false);
    if (r.shieldBroke) setEnemyShielded(false);
    advanceIntent(blow);

    setEnemyLunge((n) => n + 1);
    sfx('enemyAttack');
    commitHp(r.newPlayerHp, r.newEnemyHp, 260);
    later(() => {
      float(r.dmg === 0 ? 'Blocked!' : `-${r.dmg}`, 'hero', r.dmg === 0 ? 'text-sky-300' : 'text-red-300');
      if (r.shieldBroke) {
        float('Shield shattered!', 'enemy', 'text-amber-300');
        sfx('shatter');
      } else if (r.reflected > 0) {
        float(`-${r.reflected}`, 'enemy', 'text-sky-300');
        sfx('impact');
      }
      if (r.mended > 0) float(`+${r.mended}`, 'enemy', 'text-emerald-300');
      sfx(r.dmg === 0 ? 'block' : 'hit');
    }, 260);
    // A healer's mend chimes just after the hit lands, so the two don't blur.
    if (r.mended > 0) later(() => sfx('heal'), 600);

    const who = blow === 'power' ? `${enemy!.name} unleashes ${powerMove}` : `${enemy!.name} attacks`;
    const text =
      (timedOut ? "⏰ Time's up! " : '') +
      (r.shieldBroke
        ? `${who} — the Mirror Charm bounces it back, and its shield SHATTERS! 🪞`
        : r.reflected > 0
          ? `${who} — the Mirror Charm bounces it right back! 🪞`
          : r.dmg === 0
            ? `${who} — completely blocked!`
            : wasCorrect
              ? `${who} — you soften the hit!`
              : `${who} and lands a hit!`) +
      (r.mended > 0 ? ` It glows softly and mends ${r.mended} HP!` : '');

    checkBossPhase(r.newEnemyHp);
    if (r.defeated) {
      setTurn({ kind: 'message', text, next: () => victory() });
    } else if (r.knockedOut) {
      setTurn({ kind: 'message', text, next: () => defeat() });
    } else {
      setTurn({ kind: 'message', text, next: () => setTurn({ kind: 'command' }) });
    }
  }

  /**
   * The speed trigger fired: FAST_STREAK quick correct answers in a row. The
   * level is earned now (saved at the end, or on Flee — skillAfterBattle); the
   * rest of the battle is asked one level harder once that pool arrives (the
   * current pool keeps serving until then). The banner + ⚡ badge wait for the
   * harder questions so they never promise questions that aren't there yet.
   */
  function raiseQuestionLevel() {
    const from = clampLevel(baseQLevel + speedBoost.current);
    const to = clampLevel(from + 1);
    if (to === from) return; // already at the top level
    speedBoost.current += 1;
    const wanted = speedBoost.current;
    const name = enemy!.name;
    const announce = (text: string) => {
      sfx('streak');
      showBanner(text, 3200, '⚡');
    };
    fetchQuestions(topic, age, to, BATTLE_QUESTION_COUNT, `a quick-thinking hero battling ${name}`)
      .then((qs) => {
        // Gone, or a newer boost superseded this one (an older, easier pool
        // arriving late must never replace a harder one).
        if (!live.current || speedBoost.current !== wanted) return;
        if (qs.length === 0) {
          announce(`So quick! Your level goes up to ${to} after this battle`);
          return;
        }
        boostPool.current = { qs, i: 0 };
        setBoostShown(wanted);
        announce(`So quick! The questions just got harder — level ${from} → ${to}`);
      })
      .catch(() => {
        // Keep asking from the current pool — the level still saves at the end.
        if (live.current && speedBoost.current === wanted) {
          announce(`So quick! Your level goes up to ${to} after this battle`);
        }
      });
  }

  // --- Battle end --------------------------------------------------------------

  function settleCommon() {
    const correct = answers.filter(Boolean).length;
    const xp = correct * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps));
    void recordActivity();
    if (profile) {
      const current = skillLevelFor(profile.skillLevels, topic, age);
      // The usual battle ramp (never lowers), but never below what speed earned.
      const next = skillAfterBattle(current, answers, speedBoost.current);
      if (next !== current) void setSkillLevel(topic, next);
    }
    return xp;
  }

  function victory() {
    burst({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
    stopMusic(); // silence the battle loop under the victory jingle
    sfx('victory');
    const xp = settleCommon() + npcDefeatXp(enemy!.level) + (enemy!.isBoss ? BOSS_XP_BONUS : 0);
    void addXp(xp);
    markDefeated(enemy!.instanceId);
    const killsBefore = save!.kills[enemy!.id] ?? 0;
    const coins = victoryCoins(enemy!.coins, killsBefore) * (lucky ? CLOVER_COIN_MULT : 1);
    const drop = rollDrop(enemy!.isBoss);
    setReward({ coins, firstWin: killsBefore === 0, drop, lucky });
    // Read HP from the store, not this render: victory() runs from a message
    // callback created before a finishing move's heal (Wisp) was committed.
    const finalHp = useBattleStore.getState().playerHp;
    updateSave((s) => ({
      ...s,
      hp: finalHp,
      coins: s.coins + coins,
      items: drop ? { ...s.items, [drop]: s.items[drop] + 1 } : s.items,
      // Lifetime kill counts drive defeat quests (#42).
      kills: { ...s.kills, [enemy!.id]: (s.kills[enemy!.id] ?? 0) + 1 },
      library: pushLibrary(s.library, misses.current),
      // A warden boss (#58) awards its gate key as a trophy badge too.
      badges: keyBoss ? [...new Set([...s.badges, keyBoss.id])] : s.badges,
      flags: {
        ...s.flags,
        // The first victory warms the egg — the hatch scene plays back in
        // the world (#37 story pass).
        [EMBER_HATCHED]: true,
        // Crystal Fiends restore a crystal; wardens grant a gate key instead.
        ...(enemy!.isBoss && !keyBoss ? { [crystalFlag(topic)]: true } : {}),
        ...(keyBoss ? { [keyFlag(keyBoss.id)]: true } : {}),
      },
    }));
    setTurn({ kind: 'victory' });
  }

  function defeat() {
    const xp = settleCommon();
    void addXp(xp);
    // Remember the loss: after a couple, this enemy eases off (mercy).
    recordLoss(enemy!.id);
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
    // Battle outcomes are precious (crystals, coins, Ember's hatch) — push
    // them to Supabase now instead of trusting the debounce to get a chance.
    void useSaveStore.getState().flush();
    // Transition first, then clear the session — clearing first would
    // re-render this screen enemy-less while still in the battle state.
    sendFlow({ type: 'BATTLE_END', result });
    endBattle();
  }

  // --- Render -------------------------------------------------------------------

  const correctCount = answers.filter(Boolean).length;
  const won = turn.kind === 'victory';
  const isEgg = companionId === 'ember' && ember === 'egg';
  const hpPct = (hp: number, max: number) => `${Math.max(0, (hp / max) * 100)}%`;
  const bob = (y: number, duration: number) =>
    reduceMotion ? { animate: {} } : { animate: { y: [0, y, 0] }, transition: { repeat: Infinity, duration } };
  const floatUp = reduceMotion ? { opacity: 0 } : { y: -54, opacity: 0 };
  const companionAnim = companionActing
    ? COMPANION_CLIP[companionMotion]
    : won || cheering
      ? 'cheer'
      : enemyActing
        ? 'hurt'
        : 'idle';
  const perkLabel = { charge: `+${EMBER_BONUS_CHARGE}◆`, peek: '👀 peek', mend: `+${WISP_MEND} HP` }[companion.perk];
  const charging = intent === 'power';
  // Identifies the current question card (remounts QuestionCard + DefendTimer).
  const qKey = turn.kind === 'question' || turn.kind === 'enemy-question' ? `${turn.question.id}:${turn.seq}` : '';

  return (
    // overflow-clip (not hidden): a hidden-overflow box is still programmatically
    // scrollable, so focusing/scrolling to a button could slide the whole arena
    // sideways; clip can't scroll. overflow-hidden stays as the fallback.
    <div
      className={`min-h-screen flex flex-col bg-gradient-to-b ${info.skyGradient} overflow-hidden supports-[overflow:clip]:overflow-clip relative`}
    >
      {/* 16-bit zone backdrop (the sky gradient stays underneath as a fallback) */}
      {enemy && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${battleBackdrop(enemy.zoneId)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
            imageRendering: 'pixelated',
          }}
        />
      )}
      {/* Parallax backdrop + pseudo-3D ground plane */}
      <div className="absolute inset-x-0 bottom-0 h-[46%] pointer-events-none">
        <div className="absolute -top-10 left-[8%] w-52 h-24 bg-black/20 rounded-full blur-md" />
        <div className="absolute -top-6 right-[12%] w-64 h-20 bg-black/25 rounded-full blur-md" />
        <div
          className="absolute inset-x-[-20%] bottom-0 h-full rounded-[100%_100%_0_0]"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.18), rgba(0,0,0,0.35) 70%)',
            transform: 'perspective(500px) rotateX(30deg) scale(1.25)',
            transformOrigin: 'bottom',
          }}
        />
      </div>

      {/* Status panels (FF-style boxes) */}
      <div className="relative z-10 flex justify-between gap-2 p-2 sm:gap-4 sm:p-4">
        <div className="bg-indigo-950/90 border-2 border-white/70 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 text-white w-60 min-w-0">
          <div className="flex justify-between items-baseline gap-2 text-[13px] sm:text-sm font-bold">
            <span className="min-w-0 truncate" title={enemy.name}>
              {enemy.isBoss && '👑 '}
              {enemyShielded && '🛡️ '}
              {enemy.name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-white/70">
              Lv {enemy.level}
              {boostShown > 0 && (
                <span className="ml-1 text-yellow-300" title="Questions raised by quick answers">
                  ⚡+{boostShown}
                </span>
              )}
            </span>
          </div>
          <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
            <motion.div className="h-full bg-red-400 rounded-full" animate={{ width: hpPct(viewEnemyHp, enemy.maxHp) }} />
          </div>
          <div className="flex justify-between gap-2 text-xs mt-0.5">
            <span className="text-amber-300 font-bold animate-pulse">{charging && `💢 ${powerMove} next!`}</span>
            <span className="text-white/60">
              {viewEnemyHp}/{enemy.maxHp}
            </span>
          </div>
        </div>
        <div className="bg-indigo-950/90 border-2 border-white/70 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 text-white w-60 min-w-0">
          <div className="flex justify-between items-baseline gap-2 text-[13px] sm:text-sm font-bold">
            <span className="min-w-0 truncate">
              <CharacterPortrait
                spriteId={avatar.spriteId}
                emoji={avatar.sprite}
                scale={0.75}
                className="inline-block align-middle mr-1"
              />
              {avatar.name}
            </span>
            <span className="shrink-0 flex gap-0.5 items-center" title="Special charge">
              {Array.from({ length: CHARGE_MAX }).map((_, i) => (
                <span key={i} className={i < charge ? 'text-amber-300' : 'text-white/25'}>
                  ◆
                </span>
              ))}
            </span>
          </div>
          <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
            <motion.div className="h-full bg-green-400 rounded-full" animate={{ width: hpPct(viewPlayerHp, playerMaxHp) }} />
          </div>
          <div className="flex justify-between gap-2 text-xs mt-0.5">
            <span className="text-orange-300 font-bold" title="Answers in a row">
              {streak >= STREAK_START && `🔥×${streak} streak`}
            </span>
            <span className="text-white/60">
              {viewPlayerHp}/{playerMaxHp}
            </span>
          </div>
        </div>
      </div>

      {/* Callout banner (archetypes, enrage, power moves, pair attacks, swaps) */}
      <AnimatePresence>
        {phaseBanner && (
          <motion.p
            initial={reduceMotion ? { opacity: 0 } : { y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center text-amber-300 font-extrabold tracking-wide px-4"
          >
            {phaseBanner}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Combatants on the ground plane */}
      {/* Phones: a smaller floor for the arena so menus + question cards fit on
          screen; flex-1 still grows it into any spare height (e.g. messages). */}
      <div className="relative z-10 flex-1 flex items-end justify-between px-[12%] min-h-[112px] pb-1 sm:min-h-[220px] sm:pb-[8%]">
        <div className="relative" ref={enemyRef}>
          <motion.div
            key={`el${enemyLunge}`}
            animate={enemyLunge && !reduceMotion ? { x: [0, 70, 0] } : {}}
            transition={{ duration: 0.5 }}
            className={enemy.isBoss ? 'text-[7rem] leading-none' : 'text-8xl leading-none'}
            style={{
              filter: charging
                ? 'drop-shadow(0 0 12px rgba(255,90,60,0.9)) drop-shadow(0 14px 10px rgba(0,0,0,0.45))'
                : 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))',
            }}
          >
            {/* knocked back a step whenever a blow lands */}
            <motion.div
              key={`eh${enemyHit}`}
              animate={enemyHit && !reduceMotion ? { x: [0, -14, 6, 0] } : {}}
              transition={{ duration: 0.35 }}
            >
              <motion.div {...bob(-6, 2.2)}>
                <SpriteSheet
                  view={enemySprite.def?.battle ?? null}
                  anim={enemyActing ? 'attack' : enemyHurt ? 'hurt' : 'idle'}
                  emoji={enemySprite.emoji}
                  scale={enemy.isBoss ? 3 : 2.5}
                  className="leading-none"
                />
              </motion.div>
            </motion.div>
          </motion.div>
          {floats
            .filter((f) => f.side === 'enemy')
            .map((f) => (
              <motion.span
                key={f.id}
                initial={{ y: 0, opacity: 1 }}
                animate={floatUp}
                transition={{ duration: 1 }}
                className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-extrabold text-2xl ${f.color}`}
              >
                {f.text}
              </motion.span>
            ))}
        </div>

        <div className="relative" ref={heroRef}>
          <motion.div
            key={`hl${heroLunge}`}
            {...motionProps(heroLunge ? fitReach(HERO_MOTION[heroMotion], reachGap) : null, reduceMotion)}
            className="relative text-8xl leading-none"
            style={{ filter: 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))' }}
          >
            {/* Blazing Comet: the hero streaks down wrapped in fire */}
            {heroActing && heroMotion === 'comet' && !reduceMotion && fireballSprite.def?.battle && (
              <div className="absolute left-[35%] top-1/2 -translate-y-1/2 scale-x-[-1] opacity-90 pointer-events-none">
                <SpriteSheet view={fireballSprite.def.battle} emoji="🔥" scale={4.5} />
              </div>
            )}
            <motion.div {...bob(-5, 1.8)}>
              <SpriteSheet
                view={heroSprite.def?.battle ?? null}
                anim={heroActing ? 'attack' : enemyActing ? 'hurt' : 'idle'}
                emoji={heroSprite.emoji}
                scale={2.5}
                className="leading-none scale-x-[-1]"
              />
            </motion.div>
          </motion.div>
          {guarded && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl">🛡️</span>}
          <motion.div
            key={`ml${companionLunge}`}
            {...motionProps(companionLunge ? fitReach(COMPANION_MOTION[companionMotion], reachGap) : null, reduceMotion)}
            className="absolute -right-10 bottom-0"
          >
            {/* A swapped-in companion drops into place */}
            <motion.div
              key={`sw${swapIn}-${companionId}`}
              initial={swapIn ? (reduceMotion ? { opacity: 0 } : { y: -70, opacity: 0 }) : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              <motion.span
                // The egg wobbles with joy on a win; everyone else cheers (sprite clip).
                {...(won && isEgg && !reduceMotion
                  ? { animate: { rotate: [0, -12, 12, -8, 0] }, transition: { repeat: Infinity, duration: 0.8 } }
                  : bob(-4, 1.4))}
                className={`block ${isEgg ? 'text-2xl' : ember === 'dragon' && companionId === 'ember' ? 'text-5xl' : 'text-3xl'}`}
                title={companion.name}
                style={{ filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.4))' }}
              >
                <SpriteSheet
                  view={cSprite.def?.battle ?? null}
                  anim={companionAnim}
                  emoji={cSprite.emoji}
                  scale={companionId !== 'ember' ? 1.8 : isEgg ? 1.5 : ember === 'dragon' ? 3 : 2}
                  // Sheets face right; the companion stands on the hero's side, so face the enemy.
                  className="scale-x-[-1]"
                />
              </motion.span>
            </motion.div>
          </motion.div>
          {floats
            .filter((f) => f.side === 'hero')
            .map((f) => (
              <motion.span
                key={f.id}
                initial={{ y: 0, opacity: 1 }}
                animate={floatUp}
                transition={{ duration: 1 }}
                className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-extrabold text-2xl ${f.color}`}
              >
                {f.text}
              </motion.span>
            ))}
        </div>

        {/* Ember's fireballs, flying right → left from Ember to the enemy */}
        {fireballSprite.def?.battle &&
          fireballs.map((f) => (
            <motion.div
              key={f.id}
              initial={{ right: '14%', opacity: 0 }}
              animate={{ right: ['14%', '72%'], opacity: [1, 1, 0] }}
              transition={{
                right: { delay: f.delayMs / 1000, duration: FIREBALL_FLIGHT_MS / 1000, ease: 'easeIn' },
                opacity: { delay: f.delayMs / 1000, duration: FIREBALL_FLIGHT_MS / 1000 + 0.05, times: [0, 0.85, 1] },
              }}
              className="absolute bottom-[22%] pointer-events-none scale-x-[-1]"
            >
              <SpriteSheet view={fireballSprite.def.battle} emoji="🔥" scale={f.big ? 3 : 2} />
            </motion.div>
          ))}
      </div>

      {/* Bottom box: commands / question / message / results */}
      <div className="relative z-20 flex justify-center p-2 pb-4 sm:p-4 sm:pb-6">
        {turn.kind === 'command' && (
          <div className="bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-4 w-full max-w-xl text-white shadow-2xl">
            <p className="text-xs text-white/60 mb-3 uppercase tracking-widest">
              {charging ? (
                `💢 ${powerMove} is coming — Guard to block it!`
              ) : (
                <>
                  <span className="sm:hidden">Your move!</span>
                  <span className="hidden sm:inline">Your move — every command is a question!</span>
                </>
              )}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <CommandButton emoji="⚔️" label="Attack" onClick={commandAttack} />
              <CommandButton
                emoji="📖"
                label="Spells"
                disabled={!canCastAny}
                hint={
                  spellQs.length === 0
                    ? 'Loading…'
                    : canCastAny
                      ? `◆ ${charge}/${CHARGE_MAX}`
                      : `Charge ◆ ${charge}/${CHARGE_MAX}`
                }
                onClick={() => setTurn({ kind: 'cast' })}
              />
              <CommandButton
                emoji={companion.emoji}
                label={companion.name}
                disabled={!cReady}
                hint={cReady ? `${cMove.name} · Pair Attacks` : 'Still an egg…'}
                onClick={commandCompanion}
              />
              <CommandButton
                emoji="🛡️"
                label="Guard"
                hint={charging ? `Blocks ${powerMove}!` : undefined}
                highlight={charging}
                onClick={commandGuard}
              />
              <CommandButton
                emoji="🎒"
                label="Items"
                disabled={BATTLE_ITEMS.every((id) => save.items[id] === 0)}
                hint={
                  BATTLE_ITEMS.filter((id) => save.items[id] > 0)
                    .map((id) => `${CONSUMABLES[id].emoji}×${save.items[id]}`)
                    .join(' ') || 'Empty'
                }
                onClick={() => setTurn({ kind: 'items' })}
              />
              <CommandButton
                emoji="🔄"
                label="Swap"
                hint={party.length > 1 ? 'Free — keeps your turn' : 'Friends can join you'}
                onClick={() => setTurn({ kind: 'swap' })}
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

        {turn.kind === 'swap' && (
          <div className={SUBMENU}>
            <p className="text-xs text-white/60 mb-3 uppercase tracking-widest">🔄 Swap — free, you still get your move!</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {COMPANION_IDS.map((id) => {
                const c = COMPANIONS[id];
                const joined = party.includes(id);
                const active = id === companionId;
                return (
                  <button
                    key={id}
                    onClick={() => swapTo(id)}
                    disabled={!joined}
                    className={`rounded-xl px-3 py-2 text-left transition border ${
                      active ? 'bg-sky-500/25 border-sky-300/70' : 'bg-white/10 hover:bg-white/20 border-transparent'
                    } disabled:opacity-60 disabled:hover:bg-white/10`}
                  >
                    <span className="font-bold text-sm">
                      <span className="mr-1.5">{c.emoji}</span>
                      {c.name}
                      <span className="ml-1.5 text-xs uppercase tracking-wider text-white/70">{c.role}</span>
                    </span>
                    <span className="block text-xs text-white/75 mt-0.5">
                      {!joined ? `🔒 ${c.joinHint}` : active ? '✓ Fighting now' : c.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
            <BackButton onClick={() => setTurn({ kind: 'command' })} />
          </div>
        )}

        {turn.kind === 'items' && (
          <div className={SUBMENU}>
            <p className="text-xs text-white/60 mb-3 uppercase tracking-widest">🎒 Items — using one takes your turn</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BATTLE_ITEMS.filter((id) => save.items[id] > 0).map((id) => {
                const blocked = itemBlocked(id);
                return (
                  <button
                    key={id}
                    onClick={() => applyItem(id)}
                    disabled={!!blocked}
                    className="bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:hover:bg-white/10 rounded-xl px-3 py-2 text-left transition"
                  >
                    <span className="font-bold text-sm">
                      <span className="mr-1.5">{CONSUMABLES[id].emoji}</span>
                      {CONSUMABLES[id].name}
                      <span className="ml-1.5 text-xs text-white/60">×{save.items[id]}</span>
                    </span>
                    <span className="block text-xs text-white/70 mt-0.5">{blocked ?? CONSUMABLES[id].description}</span>
                  </button>
                );
              })}
            </div>
            <BackButton onClick={() => setTurn({ kind: 'command' })} />
          </div>
        )}

        {turn.kind === 'companion' && (
          <div className={SUBMENU}>
            <p className="text-xs text-white/60 mb-1 uppercase tracking-widest">
              {companion.emoji} {companion.name} — fight side by side!
            </p>
            <ChargeRow charge={charge} />
            <button
              onClick={commandCompanionStrike}
              className="w-full mb-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-left transition"
            >
              <span className="font-bold text-sm">
                <span className="mr-1.5">{cMove.emoji}</span>
                {cMove.name}
                <span className="ml-1.5 text-xs text-amber-300">{perkLabel}</span>
              </span>
              <span className="block text-xs text-white/70 mt-0.5">
                {companion.name} attacks! {companion.perkLine}
              </span>
            </button>
            <p className="text-xs text-white/70 mb-1.5 uppercase tracking-widest">
              Pair Attacks — one super-hard answer, double the power
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pairs.map((pair) => {
                const affordable = charge >= pair.cost && spellQs.length > 0;
                return (
                  <button
                    key={pair.id}
                    onClick={() => startPair(pair)}
                    disabled={!affordable}
                    className="bg-gradient-to-r from-orange-500/20 to-amber-400/10 hover:from-orange-500/30 disabled:opacity-60 rounded-xl px-3 py-2 text-left transition border border-orange-300/30"
                  >
                    <span className="font-bold text-sm">
                      <span className="mr-1.5">{pair.emoji}</span>
                      {pair.name}
                      <span className={`ml-1.5 text-xs ${affordable ? 'text-amber-300' : 'text-white/40'}`}>◆{pair.cost}</span>
                    </span>
                    <span className="block text-xs text-white/70 mt-0.5">{pair.description}</span>
                    <NeedMore cost={pair.cost} charge={charge} loading={spellQs.length === 0} />
                  </button>
                );
              })}
            </div>
            {companionId === 'ember' && pairs.length < PAIR_ATTACKS.filter((p) => p.companion === 'ember').length && (
              <p className="text-xs text-white/60 mt-2 italic">
                Restore crystals to help Ember grow — bigger Ember, bigger combos!
              </p>
            )}
            <BackButton onClick={() => setTurn({ kind: 'command' })} />
          </div>
        )}

        {turn.kind === 'cast' && (
          <div className={SUBMENU}>
            <p className="text-xs text-white/60 mb-1 uppercase tracking-widest">
              📖 Spellbook — each spell needs one super-hard answer!
            </p>
            <ChargeRow charge={charge} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {spells.map((spell) => {
                const affordable = charge >= spell.cost && spellQs.length > 0;
                const weak = spell.topic !== undefined && spell.topic === enemy.topic;
                return (
                  <button
                    key={spell.id}
                    onClick={() => castSpell(spell)}
                    disabled={!affordable}
                    className="bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:hover:bg-white/10 rounded-xl px-3 py-2 text-left transition"
                  >
                    <span className="font-bold text-sm">
                      <span className="mr-1.5">{spell.emoji}</span>
                      {spell.name}
                      <span className={`ml-1.5 text-xs ${affordable ? 'text-amber-300' : 'text-white/40'}`}>◆{spell.cost}</span>
                    </span>
                    {weak && <span className="block text-xs font-bold text-yellow-200">✨ Super effective here!</span>}
                    <span className="block text-xs text-white/70 mt-0.5">{spell.description}</span>
                    <NeedMore cost={spell.cost} charge={charge} loading={spellQs.length === 0} />
                  </button>
                );
              })}
            </div>
            <BackButton onClick={() => setTurn({ kind: 'command' })} />
          </div>
        )}

        {(turn.kind === 'question' || turn.kind === 'enemy-question') && (
          <div className="w-full max-w-xl">
            {turn.kind === 'enemy-question' && save.defendTimer ? (
              <DefendTimer
                key={qKey}
                durationMs={defendTimeMs(age, mercy.levelDrop > 0)}
                stopped={answeredKey === qKey}
                onExpire={() => defendTimedOut(turn.question)}
                label={
                  charging
                    ? `💢 ${powerMove} — answer to soften it!`
                    : `🛡️ ${enemy.name} attacks — answer to block!`
                }
              />
            ) : (
              <p className="text-center text-white font-bold mb-2 text-sm uppercase tracking-widest">
                {turn.kind === 'enemy-question' ? (
                  charging ? (
                    `💢 ${powerMove} — answer to soften it!`
                  ) : (
                    `🛡️ ${enemy.name} attacks — answer to block!`
                  )
                ) : (
                  {
                    spell: turn.mode === 'spell' && `${turn.spell.emoji} Super-hard question — cast ${turn.spell.name}!`,
                    pair: turn.mode === 'pair' && `${turn.pair.emoji} Super-hard question — ${turn.pair.name} with ${companion.name}!`,
                    companion: `${cMove.emoji} Answer to help ${companion.name} strike!`,
                    guard: '🛡️ Answer to raise your guard!',
                    attack: '⚔️ Answer to strike!',
                  }[turn.mode]
                )}
              </p>
            )}
            {!!turn.hide && (
              <p className="text-center text-sky-200 text-xs font-semibold mb-2">👀 Pip crossed out a wrong answer for you!</p>
            )}
            <QuestionCard
              key={qKey}
              question={turn.question}
              hints={enemy.behavior === 'trickster' ? 0 : save.items.hint}
              preHidden={turn.hide ?? 0}
              onUseHint={() => {
                helped.current = true;
                useSaveStore.getState().spendHint();
              }}
              onAnswered={(correct, picked) => {
                setAnsweredKey(qKey);
                recordAnswer(correct, turn.question, picked);
              }}
              continueLabel="▶ Go!"
              onContinue={(correct) =>
                turn.kind === 'enemy-question'
                  ? resolveEnemyQuestion(correct)
                  : turn.mode === 'spell'
                    ? resolveSpell(turn.spell, correct)
                    : turn.mode === 'pair'
                      ? resolvePair(turn.pair, correct)
                      : turn.mode === 'companion'
                        ? resolveCompanionStrike(correct)
                        : resolvePlayerQuestion(turn.mode, correct)
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
                {enemy.isBoss && keyBoss && (
                  <>
                    <p className="text-white/60 italic text-sm mb-1">"{keyBoss.bossDefeat}"</p>
                    <p className="text-amber-300 font-bold mb-1">
                      {keyBoss.emoji} You won the {keyBoss.name}! It unlocks {keyBoss.fiendName}'s gate.
                    </p>
                  </>
                )}
                {enemy.isBoss && !keyBoss && (
                  <>
                    <p className="text-white/60 italic text-sm mb-1">"{BOSS_LINES[topic as keyof typeof BOSS_LINES].defeat}"</p>
                    <p className="text-emerald-300 font-bold mb-1">💎 The {info.crystalName} shines again!</p>
                  </>
                )}
                <p className="text-sm text-white/80">
                  {correctCount} correct answers · 🪙 +{reward?.coins ?? enemy.coins}
                  {reward?.lucky ? ' 🍀' : ''} · ⭐ +
                  {correctCount * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)) +
                    npcDefeatXp(enemy.level) +
                    (enemy.isBoss ? BOSS_XP_BONUS : 0)}{' '}
                  XP
                </p>
                {reward?.firstWin && (
                  <p className="text-sm text-yellow-200 font-semibold mt-1">⭐ First time beating a {enemy.name} — bonus coins!</p>
                )}
                {reward?.drop && (
                  <p className="text-sm text-emerald-200 font-semibold mt-1">
                    🎁 It dropped a {CONSUMABLES[reward.drop].emoji} {CONSUMABLES[reward.drop].name}!
                  </p>
                )}
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

/** Framer props for a choreography motion (null or reduced motion = at rest). */
function motionProps(k: Keyframes | null, reduceMotion: boolean) {
  if (!k || reduceMotion) return { animate: {} };
  return {
    animate: { x: k.x, y: k.y ?? 0 },
    transition: { duration: k.duration, times: k.times },
  };
}

function ChargeRow({ charge }: { charge: number }) {
  return (
    <p className="text-xs text-white/70 mb-3">
      Charge:{' '}
      {Array.from({ length: CHARGE_MAX }).map((_, i) => (
        <span key={i} className={i < charge ? 'text-amber-300' : 'text-white/25'}>
          ◆
        </span>
      ))}
    </p>
  );
}

/**
 * Sub-menus (Swap / Items / Companion / Spells): on phones a long list scrolls
 * inside the panel and ← Back stays pinned, instead of pushing past the screen.
 */
const SUBMENU =
  'bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-4 w-full max-w-xl text-white shadow-2xl max-h-[64dvh] overflow-y-auto overscroll-contain sm:max-h-none sm:overflow-visible';

/** Why a charge move is greyed out — "not yet", not "broken". */
function NeedMore({ cost, charge, loading }: { cost: number; charge: number; loading: boolean }) {
  if (loading) return <span className="block text-xs font-semibold text-amber-200/90 mt-0.5">Getting ready…</span>;
  if (charge >= cost) return null;
  return <span className="block text-xs font-semibold text-amber-200/90 mt-0.5">Need {cost - charge} more ◆</span>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="sticky bottom-0 mt-3 w-full min-h-[44px] bg-indigo-800 hover:bg-indigo-700 rounded-lg py-2.5 text-sm font-semibold shadow-[0_-8px_12px_rgba(30,27,75,0.9)] sm:static sm:shadow-none"
    >
      ← Back
    </button>
  );
}

function CommandButton({
  emoji,
  label,
  hint,
  disabled,
  highlight,
  onClick,
}: {
  emoji: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Pulse to draw the eye (e.g. Guard while a power move is coming). */
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${
        highlight ? 'bg-amber-400/25 ring-2 ring-amber-300 animate-pulse' : 'bg-white/10'
      } hover:bg-white/20 disabled:opacity-60 disabled:hover:bg-white/10 rounded-xl px-3 py-2.5 text-left transition`}
    >
      <span className="text-lg mr-1.5">{emoji}</span>
      <span className="font-bold text-sm">{label}</span>
      {hint && <span className="block text-xs text-white/70 mt-0.5">{hint}</span>}
    </button>
  );
}
