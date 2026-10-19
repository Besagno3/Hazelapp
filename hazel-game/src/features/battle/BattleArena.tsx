import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import LevelBadge from '../../components/LevelBadge';
import StreakBadge from '../../components/StreakBadge';
import { BattleIntro } from './BattleIntro';
import { useBattleQuestions } from '../../hooks/useBattleQuestions';
import { fetchQuestions, shuffleAnswers, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { sfx, stopMusic, type SfxName } from '../../lib/audio';
import { bankRamp, playerAge, clampLevel, skillLevelFor } from '../../lib/age';
import { npcDefeatXp, XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import {
  attackDamage,
  spellDamage,
  companionAttackDamage,
  counterDamage,
  keenEyeHeal,
  lionheartMultiplier,
  pairDamage,
  BOSS_XP_BONUS,
  defeatXp,
} from '../../lib/battleMath';
import {
  applyFocus,
  chargeAfterAnswer,
  defendTimeMs,
  heroOpening,
  itemBlocked,
  spellBlocked,
  lossKey,
  mercyCallout,
  mercyFor,
  nextIntent,
  powerMoveName,
  resolveEnemyTurn,
  resolveHeroHit,
  resolveItem,
  resolveSpell,
  rollDrop,
  skillAfterBattle,
  speedStep,
  streakMultiplier,
  STREAK_MAX,
  STREAK_START,
  SUPER_EFFECTIVE,
  victoryCoins,
  type CombatState,
  type EnemyIntent,
} from '../../lib/battleTurn';
import { toastMs } from '../../lib/toast';
import { CHARGE_MAX } from '../../content/abilities';
import { spellsKnown, SPELL_LEVEL_BONUS, type Spell } from '../../content/spells';
import {
  companionLook,
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
import { CLOVER_COIN_MULT, CONSUMABLES, type ConsumableId } from '../../content/items';
import { topicInfo, crystalFlag } from '../../content/topics';
import { emberGrown, emberStatus, EMBER_HATCHED } from '../../content/story';
import { bossFlag, keyForBoss, keyFlag } from '../../content/keys';
import { BOSS_BADGES, ENEMY_DEFS, bossScript, rageLine } from '../../content/enemies';
import { escortsBack } from '../../content/questFlags';
import { resolveSprite } from '../../content/sprites';
import { BASE_TIER, dangerMarks, defeatTip, toughCallout, toughKey } from '../../content/regions';
import { roadTier } from '../../lib/wayfinding';
import { battleBackdrop } from '../../content/tiles';
import { avatarById } from '../../content/avatars';
import { combatState, useBattleStore } from '../../store/battleStore';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow } from '../../machines/gameFlow';
import { pushLibrary, wakeAfterDefeat, wakeInnName, wakeShelter } from '../../lib/save';
import { boatAfterDefeat, defeatBoatLine } from '../../content/boat';
import { isStarterId } from '../../content/starterQuestions';
import { FIRST_STRIKE_SHARE, NAME_RACE_MS, SCRIBE_ATTACK_MULT, SCRIBE_BLOCK_CHARGE, burstWord, enemyWord, nameRaceDue, rollTypingBonus, typingUnlocked, type TypingBonus } from '../../content/typing';
import { useKeyboardStore } from '../../store/keyboardStore';
import type { LibraryEntry, Question } from '../../types';
import { BattleHud } from './BattleHud';
import { BattleStage } from './BattleStage';
import { CommandMenu, CompanionMenu, ItemMenu, SpellMenu, SwapMenu } from './BattleMenus';
import { BattleResult } from './BattleResult';
import { DefendTimer } from './DefendTimer';
import { TypeBurst } from './TypeBurst';
import { COMPANION_STRIKE, EMBER_BREATH, HERO_STRIKE, pairChoreo, type Choreo } from './choreography';
import { IMPACT_MS, useBattleFx } from './useBattleFx';

/** Kira's Counter Strike sets off this long after the enemy's blow lands. */
const COUNTER_DELAY_MS = 280;
/** Super-hard questions warmed for spells and Pair Attacks. */
const SPELL_POOL_COUNT = 4;

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
  /** The name race (#159 item 4): type the critter's name before it moves. */
  | { kind: 'race'; word: string }
  | { kind: 'victory'; xp: number; coins: number; lucky: boolean; firstWin: boolean; drop: ConsumableId | null; badge: string | null; bonus: TypingBonus | null }
  | { kind: 'defeat'; xp: number; boatLine: string | null; shelter: { line: string; place: string } | null };

type QuestionTurn = Extract<Turn, { kind: 'question' | 'enemy-question' }>;

/** The sound each battle item makes when used. */
const ITEM_SOUND: Record<ConsumableId, SfxName> = {
  potion: 'heal',
  elixir: 'heal',
  snack: 'heal',
  spark: 'spell',
  coil: 'spell',
  tea: 'spell',
  ward: 'guard',
  mirror: 'guard',
  clover: 'streak',
  knot: 'spell',
  candle: 'spell',
  hint: 'select',
};

/**
 * FF-style side-profile command battle (#37). Enemy left, hero right, on a
 * pseudo-3D ground plane. Commands: Attack / Spells / companion / Guard /
 * Items / Swap / Flee — every command resolves through a question (the
 * educational core), and the enemy's counterattack is blocked by answering a
 * defend question (on an age-based countdown, `DefendTimer`).
 *
 * - **Spells** (the Spellbook): one *super-hard* question (SPELL_LEVEL_BONUS
 *   levels up); a miss fizzles and the charge is safe. A Sage spell matching
 *   the enemy's topic is super effective.
 * - **Companions** (`content/companion.ts`): one fights beside the hero — a
 *   question-powered strike with a perk, plus Pair Attacks. 🔄 Swap brings in
 *   another companion **without spending the turn**.
 * - **Enemy intents**: enemies sometimes gather power (announced), then land
 *   a double-strength blow next turn unless guarded.
 * - **Streaks** power up every hit; **mercy** eases the questions after a
 *   couple of losses; quick correct answers raise the question level (the
 *   **speed trigger**).
 *
 * Layout (#44): this component owns the turn flow (which box is showing and
 * what comes next). The fight's rules live in `lib/battleTurn.ts` /
 * `lib/battleMath.ts`, its live numbers in `battleStore` (read with
 * `combatState()` when a command resolves and written straight back with
 * `applyCombat` — never from a timer, #70), cosmetic effects in `useBattleFx`
 * + `./choreography`, and the view in `BattleHud` / `BattleStage` /
 * `BattleMenus` / `BattleResult`.
 */
export default function BattleArena() {
  const {
    enemy,
    playerHp,
    playerMaxHp,
    enemyHp,
    charge,
    guarded,
    enemyShielded,
    mirrored,
    focused,
    lucky,
    knotted,
    candleLit,
    candleHint,
    freeHint,
    secondWind,
    remembrance,
    applyCombat,
    markDefeated,
    recordLoss,
    endBattle,
  } = useBattleStore(
    // One shallow-compared selector: re-render only when these fields change.
    useShallow((s) => ({
      enemy: s.enemy,
      playerHp: s.playerHp,
      playerMaxHp: s.playerMaxHp,
      enemyHp: s.enemyHp,
      charge: s.charge,
      guarded: s.guarded,
      enemyShielded: s.enemyShielded,
      mirrored: s.mirrored,
      focused: s.focused,
      lucky: s.lucky,
      knotted: s.knotted,
      candleLit: s.candleLit,
      candleHint: s.candleHint,
      freeHint: s.freeHint,
      secondWind: s.secondWind,
      remembrance: s.remembrance,
      applyCombat: s.applyCombat,
      markDefeated: s.markDefeated,
      recordLoss: s.recordLoss,
      endBattle: s.endBattle,
    })),
  );
  const lossesSoFar = useBattleStore((s) => (enemy ? (s.losses[lossKey(enemy)] ?? 0) : 0));
  const save = useSaveStore((s) => s.save);
  const updateSave = useSaveStore((s) => s.update);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const setSkillLevel = useProfileStore((s) => s.setSkillLevel);
  const recordActivity = useProfileStore((s) => s.recordActivity);

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
  // - The loss count behind mercy (easier questions) — recording this fight's
  //   loss must not re-key the question pool (and flash a loading screen over
  //   the defeat).
  const liveEmber = emberStatus(save?.flags ?? {}).stage;
  const [locked, setLocked] = useState(() => ({ for: enemy?.instanceId, ember: liveEmber, losses: lossesSoFar }));
  if (enemy && locked.for !== enemy.instanceId) {
    setLocked({ for: enemy.instanceId, ember: liveEmber, losses: lossesSoFar });
  }
  const ember = locked.ember;
  const mercy = mercyFor(locked.losses);
  const mercyDrop = mercy.levelDrop;

  // The active companion (🔄 Swap) lives in the save, so it survives reloads;
  // fall back to Ember if the saved pick isn't in this save's party.
  const party = save ? companionsInParty(save) : (['ember'] as CompanionId[]);
  const savedCompanion = save?.companionId ?? 'ember';
  const companionId: CompanionId = party.includes(savedCompanion) ? savedCompanion : 'ember';
  const companion = companionLook(companionId, save?.flags);
  const cMove = companionMove(companionId, ember);
  const cPower = companionPower(companionId, ember);
  const cReady = companionCanFight(companionId, ember);
  const pairs = pairAttacksFor(companionId, ember);
  const emberActive = companionId === 'ember' && ember !== 'egg';

  const enemySprite = resolveSprite(enemy?.spriteId, enemy?.sprite ?? '❓');
  const heroSprite = resolveSprite(avatar?.spriteId, avatar?.sprite ?? '❓');
  const cSpriteIds = companionSprite(companionId, ember, save?.flags);
  const cSprite = resolveSprite(cSpriteIds.spriteId, cSpriteIds.emoji);
  // Radiant Ember breathes starfire (#75 item 15g review round 4).
  const fireballSprite = resolveSprite(ember === 'radiant' ? 'fx-starfire' : 'fx-fireball', ember === 'radiant' ? '🌟' : '🔥');

  // Never fails (#158): the starter questions cover anything the server can't give.
  const { questions, loading } = useBattleQuestions(
    topic,
    BATTLE_QUESTION_COUNT,
    enemy ? clampLevel(enemy.level - mercy.levelDrop) : undefined,
  );
  // The super-hard pool (level + SPELL_LEVEL_BONUS) shared by spells + Pair
  // Attacks, loaded the same way: saved questions first, so spells are ready
  // with the battle, and the rest as they come (#158 review). Every hero knows
  // at least Mend, so it always loads.
  const { questions: spellQs } = useBattleQuestions(
    topic,
    SPELL_POOL_COUNT,
    enemy ? clampLevel(enemy.level + SPELL_LEVEL_BONUS - mercy.levelDrop) : undefined,
    'spell',
  );
  // The encounter flash plays while the first questions load (#158 review);
  // nothing in the battle starts until both are done.
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);
  const waiting = loading || !introDone;
  // The pool and where the battle is in it, read when a question is asked:
  // a move often asks from a callback made a render earlier, before the pool
  // grew (#158 review) — the refs always hold the latest.
  const poolRef = useRef(questions);
  poolRef.current = questions;
  const qIndexRef = useRef(0);

  const fx = useBattleFx();
  const { float, showBanner, later } = fx;
  const [turn, setTurn] = useState<Turn>({ kind: 'command' });
  const spellPoolRef = useRef(spellQs);
  spellPoolRef.current = spellQs;
  const spellIdxRef = useRef(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  // The answers that move the saved skill level: bank questions only (#153).
  // Starter questions repeat — six a band — so knowing them isn't a new level.
  const rampAnswers = useRef<boolean[]>([]);
  // Every answer, bank or starter: the bank's must be most of them to move
  // the level (`bankRamp`, #153 review round 2).
  const answerCount = useRef(0);
  const misses = useRef<LibraryEntry[]>([]);
  // Correct answers in a row (any question) — powers up every hit.
  const [streak, setStreak] = useState(0);
  // Wrong options Pip will cross out on the next question. A ref, not state:
  // the next question is often posed by a `next` callback created before the
  // peek was set, and it must still see it.
  const peek = useRef(0);
  // What the enemy does on its NEXT turn (see lib/battleTurn nextIntent).
  const [intent, setIntent] = useState<EnemyIntent>('attack');
  const enemyTurnNo = useRef(0);
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
  /** The question whose defend timer a Forget-Me-Knot's second try paused (#75 item 14e). */
  const [pausedKey, setPausedKey] = useState<string | null>(null);
  // A ✍️ scribe burst (#159): the word to type after a right Attack or block
  // answer, on the card it belongs to. Typed in time, an Attack's burst sets
  // `scribeRef` for the strike that follows; a block's adds ◆ at once.
  const [scribeBurst, setScribeBurst] = useState<{ key: string; mode: 'attack' | 'block'; word: string } | null>(null);
  const scribeRef = useRef(false);
  const keyboard = useKeyboardStore((s) => s.present);
  // Displayed HP while a blow is still in the air (null = show the store's).
  // Cosmetic only: the store already holds the real numbers.
  const [shownHp, setShownHp] = useState<{ p: number; e: number } | null>(null);
  const shownSeq = useRef(0);

  // Start-of-battle callout, once the question LoadingScreen clears (the
  // banner only renders in the battle UI): the archetype twist, so it's never
  // a gotcha.
  const calloutShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (waiting || !enemy || calloutShownFor.current === enemy.instanceId) return;
    calloutShownFor.current = enemy.instanceId;
    // The hero type's opening perk, shown as the fight opens (short: it floats over the hero).
    const opening = heroOpening(style);
    const perk = opening.charge > 0
      ? `✨ +${opening.charge}◆`
      : opening.focused
        ? '💥 Battle Cry!'
        : opening.guarded
          ? '🛡️ Shell Up!'
          : null;
    if (perk) later(() => float(perk, 'hero', 'text-amber-300'), 400);
    if (enemy.behavior) {
      const callout = {
        shielded: `${enemy.name} raises a stony shield — the first hit will shatter it!`,
        // A Glimmer Candle in the bag gets you round it (#75 item 14g review).
        trickster: `${enemy.name} is too slippery for Hint Feathers!${save?.items.candle ? ' Light a 🕯️ Glimmer Candle!' : ''}`,
        healer: `${enemy.name} mends itself when it's hurt — press the attack!`,
        // Swift (#75 item 14h, decision 14: no new timers) — it strikes first.
        swift: `${enemy.name} is swift — it strikes first! Get ready to block!`,
      }[enemy.behavior];
      // Long enough to read (a young reader's two words a second), as a toast is.
      later(() => showBanner(callout, Math.max(3000, toastMs(callout))), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemy?.instanceId, waiting]);

  // Before the first command, tap-to-continue lines nothing can hurry past: a
  // Fiend's monologue (#37 story pass), then what "!" marks mean the first
  // time a tier's are met this session, then mercy if this enemy has beaten
  // the hero a couple of times (#75 item 12). A tier counts as explained only
  // once its line is on screen.
  const openingDone = useRef(false);
  useEffect(() => {
    if (waiting || !enemy || openingDone.current) return;
    openingDone.current = true;
    const tier = enemy.tier ?? BASE_TIER;
    const { toughMet, meetTough } = useBattleStore.getState();
    const lines: { text: string; shown?: () => void }[] = [];
    // A boss's monologue by its role (#75 item 14c) — a boss with no lines just fights.
    if (enemy.isBoss) for (const text of bossScript(enemy)?.intro ?? []) lines.push({ text });
    // Tiers 5–7 share one line (`toughKey`); below that, one per tier.
    const toughAs = toughKey(tier);
    if (dangerMarks(tier) && !toughMet.includes(toughAs)) lines.push({ text: `💪 ${toughCallout(tier, enemy.isBoss)}`, shown: () => meetTough(toughAs) });
    if (mercyDrop > 0) lines.push({ text: `💛 ${mercyCallout(enemy)}` });
    // A swift critter (#75 item 14h) takes the first turn: its blow, blocked by a
    // defend question as ever, comes before the hero's first command.
    const swift = enemy.behavior === 'swift';
    // The name race (#159 item 4): one regular critter in three, with a keyboard and lesson 1.
    const race = nameRaceDue(enemy, useKeyboardStore.getState().present && typingUnlocked(save?.flags ?? {}));
    if (lines.length === 0 && !swift && !race) return;
    const chain = lines.reduceRight<() => void>(
      (next, line) => () => {
        line.shown?.();
        setTurn({ kind: 'message', text: line.text, next });
      },
      swift
        ? () => setTurn({ kind: 'message', text: `⚡ ${enemy.name} darts in before you can move!`, next: enemyTurn })
        : race
          ? () => setTurn({ kind: 'race', word: enemyWord(enemy.name) })
          : () => setTurn({ kind: 'command' }),
    );
    chain();
    // `enemyTurn` (a swift critter's first move) is made afresh each render; the
    // opening runs once a battle, so the one from this render is the one wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, enemy, keyBoss, mercyDrop]);

  // Battle entered without an encounter (e.g. stale reload) — bail out.
  const invalid = !enemy || !save || !avatar;
  useEffect(() => {
    if (invalid) sendFlow({ type: 'BATTLE_END', result: 'lose' });
  }, [invalid]);
  if (invalid) return null;
  // The encounter flash, held on the foe's name if the first questions are
  // still on their way (at most QUICK_WAIT_MS in all) — no spinner flash.
  if (waiting)
    return (
      <BattleIntro
        name={enemy.name}
        sprite={enemySprite}
        isBoss={enemy.isBoss}
        backdrop={battleBackdrop(enemy.zoneId, enemy.habitat)}
        onDone={finishIntro}
      />
    );

  const viewPlayerHp = shownHp?.p ?? playerHp;
  const viewEnemyHp = shownHp?.e ?? enemyHp;
  const canCastAny = spellQs.length > 0 && spells.some((s) => charge >= s.cost);
  const powerMove = powerMoveName(enemy.id);
  // Scribe bursts need a real keyboard and the first typing lesson (#159).
  const scribe = keyboard && typingUnlocked(save.flags);
  const charging = intent === 'power';
  const nextQuestion = () => {
    // A long battle goes round its questions again; each ask gets a fresh
    // answer order, so a repeat tests the answer, not where it sat.
    // After a speed boost, draw from the harder pool once it has arrived.
    const bp = boostPool.current;
    if (bp.qs.length > 0) return shuffleAnswers(bp.qs[bp.i++ % bp.qs.length]);
    const pool = poolRef.current;
    const q = pool[qIndexRef.current % pool.length];
    qIndexRef.current += 1;
    return shuffleAnswers(q);
  };
  /** The level this battle's regular questions are asked at (before any speed boost). */
  const baseQLevel = clampLevel(enemy.level - mercy.levelDrop);
  /** Pose a question turn, spending Pip's peek on it if one is waiting. */
  const ask = (t: QuestionTurn) => {
    setTurn({ ...t, hide: peek.current, seq: ++askSeq.current });
    scribeRef.current = false;
    helped.current = peek.current > 0;
    peek.current = 0;
    askedAt.current = nowMs();
  };
  /** Continue with a message box, then `next`. */
  const say = (text: string, next: () => void) => setTurn({ kind: 'message', text, next });
  /** Streak bonus applied to every hero-side hit. */
  const boost = (dmg: number) => Math.round(dmg * streakMultiplier(streak));
  const burst = (opts: confetti.Options) => confetti({ ...opts, disableForReducedMotion: true });

  /**
   * Write the combat state NOW (the source of truth every later action reads,
   * #70), but keep showing the old HP until the blow lands `revealMs` later —
   * the enemy's until `enemyRevealMs`, when a counter lands after the blow.
   * A newer commit supersedes an older pending reveal.
   */
  function commit(next: CombatState, revealMs: number, enemyRevealMs = revealMs) {
    const seq = ++shownSeq.current;
    if (revealMs > 0 || enemyRevealMs > 0) {
      const enemyBefore = viewEnemyHp;
      setShownHp({ p: viewPlayerHp, e: enemyBefore });
      if (enemyRevealMs > revealMs) {
        later(() => {
          if (shownSeq.current === seq) setShownHp({ p: next.playerHp, e: enemyBefore });
        }, revealMs);
      }
      later(() => {
        if (shownSeq.current === seq) setShownHp(null);
      }, Math.max(revealMs, enemyRevealMs));
    } else {
      setShownHp(null);
    }
    applyCombat(next);
  }

  function recordAnswer(correct: boolean, q: Question, picked: number) {
    setAnswers((a) => [...a, correct]);
    const starter = isStarterId(q.id);
    answerCount.current += 1;
    if (!starter) rampAnswers.current.push(correct);
    const s = combatState();
    // Keen Eye (Talon): a right answer also mends a little.
    const mend = correct ? Math.min(s.playerMaxHp, s.playerHp + keenEyeHeal(style)) - s.playerHp : 0;
    applyCombat({ ...s, charge: chargeAfterAnswer(s.charge, correct), playerHp: s.playerHp + mend });
    if (mend > 0) float(`🎯 +${mend}`, 'hero', 'text-emerald-300');
    // A hinted / peeked answer isn't evidence the questions are too easy, and
    // nor is a starter question's (#153).
    const ms = helped.current || starter ? Infinity : nowMs() - askedAt.current;
    const step = speedStep(speedRun.current, correct, ms, age, speedBoost.current);
    speedRun.current = step.run;
    if (step.boosted) raiseQuestionLevel();
    if (correct) {
      const next = streak + 1;
      setStreak(next);
      if (next === STREAK_START || next === STREAK_MAX) {
        sfx('streak');
        float(`🔥 ${next} in a row!`, 'hero', 'text-orange-300');
        fx.cheer();
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
  /** The next super-hard question (spells + Pair Attacks share the pool). */
  function nextSpellQuestion() {
    const pool = spellPoolRef.current;
    const q = pool[spellIdxRef.current % pool.length];
    spellIdxRef.current += 1;
    return q;
  }
  function startPair(pair: PairAttack) {
    if (combatState().charge < pair.cost || spellQs.length === 0) return;
    ask({ kind: 'question', mode: 'pair', pair, question: nextSpellQuestion() });
  }
  function castSpell(spell: Spell) {
    if (combatState().charge < spell.cost || spellQs.length === 0 || spellBlocked(combatState(), spell)) return;
    ask({ kind: 'question', mode: 'spell', spell, question: nextSpellQuestion() });
  }
  /** Swap companions — a free action: the turn stays on the command menu. */
  function swapTo(id: CompanionId) {
    if (id !== companionId && party.includes(id)) {
      const c = companionLook(id, useSaveStore.getState().save?.flags);
      updateSave((s) => ({ ...s, companionId: id }));
      fx.dropIn();
      sfx('swap');
      showBanner(`${c.name} tags in — still your move!`, 1800, c.emoji);
    }
    setTurn({ kind: 'command' });
  }
  /** Use a battle item (#73). Like any command, it spends the hero's turn. */
  function applyItem(id: ConsumableId) {
    const s = combatState();
    if (itemBlocked(s, id, save!.items[id])) return;
    updateSave((sv) => ({ ...sv, items: { ...sv.items, [id]: Math.max(0, sv.items[id] - 1) } }));
    const r = resolveItem(s, id);
    commit(r.state, 0);
    sfx(ITEM_SOUND[id]);
    if (r.healed > 0) float(`+${r.healed}`, 'hero', 'text-emerald-300');
    if (r.chargeGained > 0) float(`+${r.chargeGained}◆`, 'hero', 'text-amber-300');
    const buffFloat: Partial<Record<ConsumableId, [string, string]>> = {
      ward: ['🌈', 'text-sky-300'],
      mirror: ['🪞', 'text-sky-300'],
      tea: ['🍵 Focus!', 'text-lime-300'],
      clover: ['🍀 Lucky!', 'text-emerald-300'],
      knot: ['🎗️', 'text-violet-300'],
    };
    const bf = buffFloat[id];
    if (bf) float(bf[0], 'hero', bf[1]);
    const { name, emoji } = CONSUMABLES[id];
    // The candle says what it did: slippery critters can't block hints now (#75 item 14g review).
    const did = id === 'candle' ? (enemy.behavior === 'trickster' ? ' Hints work now — even on this slippery critter!' : ' A free hint is ready!') : '';
    // "Light a candle!" is done: the banner says so instead of still asking.
    if (id === 'candle' && enemy.behavior === 'trickster') showBanner('Your Glimmer Candle is lit!', 2500, '🕯️');
    say(`${avatar!.name} uses a ${name}! ${emoji}${did}`, enemyTurn);
  }
  function commandFlee() {
    updateSave((s) => ({ ...s, hp: combatState().playerHp }));
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

  /**
   * A ✍️ scribe burst ended (#159): typed in time, the move it follows is
   * powered up — an Attack hits `SCRIBE_ATTACK_MULT`× (read by
   * `resolvePlayerQuestion` when ▶ Go! resolves it), a block adds
   * `SCRIBE_BLOCK_CHARGE` ◆ now (the store is the truth, #70). Too late:
   * nothing — the answer already counted.
   */
  function scribeDone(mode: 'attack' | 'block', ok: boolean) {
    if (!ok) return;
    sfx('streak');
    if (mode === 'attack') {
      scribeRef.current = true;
      float("✍️ Scribe's power!", 'hero', 'text-amber-300');
      return;
    }
    const s = combatState();
    const gained = Math.min(CHARGE_MAX, s.charge + SCRIBE_BLOCK_CHARGE) - s.charge;
    applyCombat({ ...s, charge: s.charge + gained });
    float(gained > 0 ? `✍️ +${gained}◆` : '✍️ Perfect block!', 'hero', 'text-amber-300');
  }

  function resolvePlayerQuestion(mode: 'attack' | 'guard', wasCorrect: boolean) {
    if (mode === 'guard') {
      if (wasCorrect) {
        applyCombat({ ...combatState(), guarded: true });
        sfx('guard');
        float('🛡️', 'hero', 'text-sky-300');
        const warn = charging ? ` ${powerMove} won't get through!` : '';
        say(`${avatar!.name} braces behind a wall of knowing!${warn}`, enemyTurn);
      } else {
        say('The guard slips… stay sharp!', enemyTurn);
      }
      return;
    }
    // Lionheart (Valor): below half HP his Attacks hit harder.
    const now = combatState();
    const heart = lionheartMultiplier(style, now.playerHp, now.playerMaxHp);
    // Focus Tea (#80) or Battle Cry: a landed Attack hits TEA_DAMAGE_MULT× and spends the focus.
    const focus = applyFocus(now, boost(Math.round(attackDamage(wasCorrect, style, powerUps) * heart)));
    applyCombat(focus.state);
    // A ✍️ scribe burst typed in time (#159): the strike hits harder.
    const scribed = scribeRef.current;
    scribeRef.current = false;
    const dmg = scribed ? Math.round(focus.dmg * SCRIBE_ATTACK_MULT) : focus.dmg;
    const text =
      (wasCorrect ? `${avatar!.name} strikes true!` : 'A glancing blow…') +
      (heart > 1 ? ' 🦁 Lionheart — hits harder when hurt!' : '') +
      focus.note +
      (scribed ? " ✍️ Scribe's power — the word was true!" : '');
    heroStrike(dmg, text, 'text-red-300', { sound: 'attack' });
  }

  /**
   * The companion's strike. A correct answer also triggers its perk — Ember
   * stokes an extra ◆, Pip crosses out a wrong answer on the next question,
   * Wisp mends the hero. A wrong answer is a glancing blow (effort never zero).
   */
  function resolveCompanionStrike(wasCorrect: boolean) {
    const dmg = boost(companionAttackDamage(wasCorrect, cPower));
    let note = '';
    let heal = 0;
    if (wasCorrect && companion.perk === 'charge') {
      const s = combatState();
      applyCombat({ ...s, charge: Math.min(CHARGE_MAX, s.charge + EMBER_BONUS_CHARGE) });
      later(() => float(`+${EMBER_BONUS_CHARGE}◆`, 'hero', 'text-amber-300'), IMPACT_MS);
      note = ' The fire stokes your spell charge!';
    } else if (wasCorrect && companion.perk === 'peek') {
      peek.current = PIP_PEEK_HIDES;
      note = ' Pip peeks ahead — one wrong answer on the next question is crossed out! 👀';
    } else if (wasCorrect && companion.perk === 'mend') {
      const s = combatState();
      heal = Math.min(s.playerMaxHp, s.playerHp + WISP_MEND) - s.playerHp;
      if (heal > 0) {
        later(() => {
          sfx('heal');
          float(`+${heal}`, 'hero', 'text-emerald-300');
        }, IMPACT_MS);
        note = ` Wisp's light mends ${heal} HP!`;
      }
    }
    const text = wasCorrect
      ? `${cMove.emoji} ${companion.name} uses ${cMove.name}!${note}`
      : `${cMove.emoji} ${companion.name}'s ${cMove.name} just grazes it… a glancing blow.`;
    heroStrike(dmg, text, 'text-orange-300', { choreo: COMPANION_STRIKE, sound: companion.sound, heal });
  }

  /** Fire a Pair Attack once its super-hard question resolves. */
  function resolvePair(pair: PairAttack, wasCorrect: boolean) {
    if (!wasCorrect) {
      // Same promise as spells: a miss fizzles and the charge is safe.
      say(`${pair.emoji} ${pair.name} falls out of step… the charge is safe. Try again together!`, enemyTurn);
      return;
    }
    const s = combatState();
    applyCombat({ ...s, charge: Math.max(0, s.charge - pair.cost) });
    burst({ particleCount: 140, spread: 120, origin: { y: 0.4 }, colors: ['#fb923c', '#fbbf24', '#f87171', '#fde68a'] });
    showBanner(`PAIR ATTACK — ${pair.name.toUpperCase()}!`, 1800, pair.emoji);
    const dmg = boost(pairDamage(style, powerUps, cPower, pair.multiplier));
    const heal = pair.heal ? Math.min(s.playerMaxHp, s.playerHp + pair.heal) - s.playerHp : 0;
    if (heal > 0) {
      later(() => {
        sfx('heal');
        float(`+${heal}`, 'hero', 'text-emerald-300');
      }, 400);
    }
    const healNote = heal > 0 ? ` Its light mends ${heal} HP!` : '';
    heroStrike(dmg, `${pair.emoji} ${avatar!.name} and ${companion.name} unleash ${pair.name}!${healNote}`, pair.color, {
      refundCharge: pair.cost,
      choreo: pairChoreo(pair.id),
      sound: 'pair',
      heal,
    });
  }

  /** Cast the chosen spell once its super-hard question resolves. */
  function resolveSpellQuestion(spell: Spell, wasCorrect: boolean) {
    const r = resolveSpell(combatState(), spell, wasCorrect);
    if (r.kind === 'fizzle') {
      // A miss never punishes effort: the charge is safe, the spell just fizzles.
      say(`${spell.emoji} ${spell.name} fizzles… the charge is safe. Try again!`, enemyTurn);
      return;
    }
    commit(r.state, 0);
    burst({ particleCount: 90, spread: 100, origin: { y: 0.4 } });
    if (r.kind === 'heal') {
      fx.perform(HERO_STRIKE, 'spell');
      later(() => {
        sfx('heal');
        float(`+${r.healed}`, 'hero', spell.color);
      }, IMPACT_MS);
      say(`${spell.emoji} ${spell.name}! Bright knowing knits your wounds.`, enemyTurn);
      return;
    }
    if (r.kind === 'remember') {
      sfx('spell');
      float('🏛️', 'hero', spell.color);
      say(`${spell.emoji} ${spell.name}! Every name in the Hall stands with you. If a hit would make you fall, you'll stay up with 1 HP!`, enemyTurn);
      return;
    }
    if (r.kind === 'shield') {
      sfx('spell');
      later(() => sfx('guard'), IMPACT_MS);
      float('🛡️', 'hero', spell.color);
      say(`${spell.emoji} ${spell.name}! A shield of knowing rises — the next hit will glance away.`, enemyTurn);
      return;
    }
    // Offensive spell — super effective when a Sage's topic matches the enemy's.
    const weak = spell.topic !== undefined && spell.topic === enemy!.topic;
    const dmg = boost(Math.round(spellDamage(style, powerUps, r.multiplier) * (weak ? SUPER_EFFECTIVE : 1)));
    const breath = spell.id === 'ember-breath' || spell.id === 'radiant-breath';
    const lead =
      breath && emberActive
        ? `${spell.emoji} ${spell.name}! Ember rears back and breathes ${ember === 'radiant' ? 'starfire' : 'dragonfire'}!`
        : breath
          ? `${spell.emoji} ${spell.name}! Ember swoops in from the sidelines, breathing ${ember === 'radiant' ? 'starfire' : 'dragonfire'}!`
          : emberActive
            ? `${spell.emoji} ${spell.name}! Ember roars as your answer blazes!`
            : `${spell.emoji} ${spell.name}! A brilliant answer erupts!`;
    // Ember's Breath is Ember's own move when Ember is fighting: inhale, then a fireball volley.
    // Chorus Call (#75 item 15g) sings a ◆ back as it lands.
    if (r.refunded > 0) later(() => float(`🎶 +${r.refunded}◆`, 'hero', spell.color), IMPACT_MS);
    const sung = r.refunded > 0 ? ` 🎶 The song sings ${r.refunded} ◆ back to you!` : '';
    heroStrike(dmg, (weak ? `${lead} It's super effective!` : lead) + sung, spell.color, {
      // A shield takes the blow: the charge goes back to where it began.
      refundCharge: r.shieldRefund,
      choreo: breath && emberActive ? EMBER_BREATH : HERO_STRIKE,
      sound: 'spell',
      superEffective: weak,
      skipsTurn: r.skipsTurn,
    });
  }

  /**
   * Shared damage-dealing path for Attack, companion strikes, Pair Attacks and
   * offensive spells (rules in lib/battleTurn resolveHeroHit). Charge-spending
   * moves pass `refundCharge` so a shield-absorbed cast gives the charge back.
   * `choreo` says who moves and when the blow lands; `sound` is the wind-up
   * SFX (the 'pair' sound carries its own impacts); `heal` rides on the move
   * (Wisp, Starlight Chorus).
   */
  function heroStrike(
    dmg: number,
    text: string,
    floatColor: string,
    {
      refundCharge = 0,
      choreo = HERO_STRIKE,
      sound,
      heal = 0,
      superEffective = false,
      skipsTurn = false,
      then = enemyTurn,
    }: { refundCharge?: number; choreo?: Choreo; sound: SfxName; heal?: number; superEffective?: boolean; skipsTurn?: boolean; then?: () => void },
  ) {
    fx.perform(choreo, sound, emberGrown(ember));
    const r = resolveHeroHit(combatState(), dmg, { isBoss: enemy!.isBoss, refundCharge });
    commit({ ...r.state, playerHp: Math.min(r.state.playerMaxHp, r.state.playerHp + heal) }, choreo.hitMs);
    later(() => {
      fx.hitEnemy();
      if (r.outcome === 'shield-broken') {
        sfx('shatter');
        float('Shield shattered!', 'enemy', 'text-amber-300');
        return;
      }
      if (sound !== 'pair') sfx('impact');
      float(`-${r.dealt}`, 'enemy', floatColor);
      if (superEffective) float('Super effective!', 'enemy', 'text-yellow-200');
    }, choreo.hitMs);

    if (r.outcome === 'shield-broken') {
      say(
        `${text} The stony shield takes the blow — and SHATTERS! ${enemy!.name} is wide open now!` +
          (r.refunded > 0 ? ' The spell-light flows back to you — charge refunded!' : ''),
        enemyTurn,
      );
      return;
    }
    if (r.outcome === 'defeated') {
      say(text, victory);
      return;
    }
    if (r.newPhase) announcePhase(r.newPhase);
    if (skipsTurn) {
      // Time Ripple (#75 item 14h): the enemy is caught in the ripple and loses
      // its turn — its plan (a power move gathering, say) waits for the next one.
      later(() => float('⏳ Frozen!', 'enemy', 'text-teal-200'), choreo.hitMs + 200);
      say(`${text} ⏳ Time ripples round ${enemy!.name.replace(/^The /, 'the ')} — it loses its next turn!`, () => setTurn({ kind: 'command' }));
      return;
    }
    // `then`: what follows the blow — the enemy's turn, or the hero's own (a first strike, #159 item 4).
    say(text, then);
  }

  /**
   * The name race ended (#159 item 4). Won: a free first blow at
   * `FIRST_STRIKE_SHARE` of an Attack's power, then the hero's turn as usual.
   * Lost: the critter darts in first — its turn, a defend question as ever.
   */
  function raceDone(ok: boolean) {
    if (!ok) {
      say(`⚡ ${enemy!.name} darts in before you can move!`, enemyTurn);
      return;
    }
    sfx('streak');
    const dmg = boost(Math.round(attackDamage(true, style, powerUps) * FIRST_STRIKE_SHARE));
    heroStrike(dmg, `⚡ ${avatar!.name} names it first and strikes before it can blink! Now, your move.`, 'text-amber-300', {
      sound: 'attack',
      then: () => setTurn({ kind: 'command' }),
    });
  }

  /** Boss enrage callout when the enemy's HP crosses into phase `p` (from any damage). */
  function announcePhase(p: 1 | 2) {
    // Each boss in its own words, and menacing (`rageLine`, #75 item 14g).
    showBanner(rageLine(enemy!.id, enemy!.name, p));
  }

  /** Move the enemy's plan on to its next turn (lib/battleTurn nextIntent). */
  function advanceIntent(current: EnemyIntent) {
    enemyTurnNo.current += 1;
    setIntent(nextIntent(current, enemyTurnNo.current, enemy!.isBoss, Math.random(), enemy!.tier));
  }

  function enemyTurn() {
    if (intent === 'charge') {
      // Telegraph: this turn the enemy only gathers power — and says so.
      sfx('charge');
      showBanner(`${enemy!.name} is gathering power for ${powerMove}!`, 2800, '💢');
      advanceIntent('charge');
      say(
        `${enemy!.name} is gathering power… ${powerMove} is coming next turn! 🛡️ Guard (or a Rainbow Ward) will block it completely.`,
        () => setTurn({ kind: 'command' }),
      );
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
    answerCount.current += 1;
    if (!isStarterId(q.id)) rampAnswers.current.push(false);
    setStreak(0);
    misses.current.push({ question: q, picked: -1 }); // no pick — the Library never shows it
    resolveEnemyQuestion(false, true);
  }

  function resolveEnemyQuestion(wasCorrect: boolean, timedOut = false) {
    const blow = charging ? 'power' : 'attack';
    const r = resolveEnemyTurn(combatState(), {
      wasCorrect,
      intent: blow,
      level: enemy!.level,
      isBoss: enemy!.isBoss,
      behavior: enemy!.behavior,
      tier: enemy!.tier,
      style,
      powerUps,
      // Counter Strike (Kira): a right answer strikes back — streaks power it up like any hit.
      counter: boost(counterDamage(style, powerUps)),
    });
    const counterHit = r.countered > 0 || r.counterShattered;
    const counterSets = IMPACT_MS + COUNTER_DELAY_MS;
    commit(r.state, IMPACT_MS, counterHit ? counterSets + HERO_STRIKE.hitMs : IMPACT_MS);
    advanceIntent(blow);
    fx.lungeEnemy();
    sfx('enemyAttack');
    later(() => {
      float(r.dmg === 0 ? 'Blocked!' : `-${r.dmg}`, 'hero', r.dmg === 0 ? 'text-sky-300' : 'text-red-300');
      if (r.shieldShattered) {
        float('Shield shattered!', 'enemy', 'text-amber-300');
        sfx('shatter');
      } else if (r.reflected > 0) {
        float(`-${r.reflected}`, 'enemy', 'text-sky-300');
        sfx('impact');
      }
      if (r.mended > 0) float(`+${r.mended}`, 'enemy', 'text-emerald-300');
      sfx(r.dmg === 0 ? 'block' : 'hit');
    }, IMPACT_MS);
    if (counterHit) {
      later(() => fx.perform(HERO_STRIKE, 'attack'), counterSets);
      later(() => {
        fx.hitEnemy();
        if (r.counterShattered) {
          sfx('shatter');
          float('Shield shattered!', 'enemy', 'text-amber-300');
        } else {
          sfx('impact');
          float(`⚡ -${r.countered}`, 'enemy', 'text-cyan-300');
        }
      }, counterSets + HERO_STRIKE.hitMs);
    }
    // A healer's mend chimes just after the hit lands, so the two don't blur
    // (after a counter, once that has landed too).
    if (r.mended > 0) later(() => sfx('heal'), counterHit ? counterSets + HERO_STRIKE.hitMs + 340 : 600);
    // Boss enrage callout from a Mirror Charm bounce (#80: any damage source).
    if (r.newPhase) announcePhase(r.newPhase);

    const who = blow === 'power' ? `${enemy!.name} unleashes ${powerMove}` : `${enemy!.name} attacks`;
    const text =
      (timedOut ? "⏰ Time's up! " : '') +
      (r.shieldShattered
        ? `${who} — the Mirror Charm bounces it back, and its shield SHATTERS! 🪞`
        : r.reflected > 0
          ? `${who} — the Mirror Charm bounces it right back! 🪞`
          : r.dmg === 0
            ? `${who} — completely blocked!`
            : wasCorrect
              ? `${who} — you soften the hit!`
              : `${who} and lands a hit!`) +
      (r.counterShattered
        ? ` ⚡ Counter Strike! ${avatar!.name} strikes back — and its stony shield SHATTERS!`
        : r.countered > 0
          ? ` ⚡ Counter Strike! ${avatar!.name} strikes right back for ${r.countered}!`
          : '') +
      (r.mended > 0 ? ` It glows softly and mends ${r.mended} HP!` : '') +
      (r.secondWind ? ` 🌬️ Second Wind! ${avatar!.name} hangs on with 1 HP!` : '') +
      (r.remembered ? ` 🏛️ Remembrance! The Hall's names hold you up — ${avatar!.name} hangs on with 1 HP!` : '');
    // A bounced hit can win the battle (checked first: a mirrored hero takes no damage).
    say(text, r.enemyDown ? victory : r.heroDown ? defeat : () => setTurn({ kind: 'command' }));
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
    const announce = (text: string) => {
      sfx('streak');
      showBanner(text, 3200, '⚡');
    };
    fetchQuestions(topic, age, to, BATTLE_QUESTION_COUNT, 'battle')
      .then((all) => {
        // Gone, or a newer boost superseded this one (an older, easier pool
        // arriving late must never replace a harder one).
        if (!fx.live.current || speedBoost.current !== wanted) return;
        // Only the bank's harder questions (#153 review round 2): starter
        // questions fill in when the service can't help, and they're no
        // harder than what's being asked — keep the current pool then.
        const qs = all.filter((q) => !isStarterId(q.id));
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
        if (fx.live.current && speedBoost.current === wanted) {
          announce(`So quick! Your level goes up to ${to} after this battle`);
        }
      });
  }

  // --- Battle end --------------------------------------------------------------

  function settleCommon() {
    // Right answers to bank questions only: starter questions pay no XP (#153).
    const correct = rampAnswers.current.filter(Boolean).length;
    const xp = correct * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps));
    void recordActivity();
    if (profile) {
      const current = skillLevelFor(profile.skillLevels, topic, age);
      // The usual battle ramp (never lowers), but never below what speed earned.
      const next = skillAfterBattle(current, bankRamp(rampAnswers.current, answerCount.current), speedBoost.current);
      if (next !== current) void setSkillLevel(topic, next);
    }
    return xp;
  }

  function victory() {
    burst({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
    stopMusic(); // silence the battle loop under the victory jingle
    sfx('victory');
    // Far regions pay more XP for the win (#75 item 12); the answers' XP is the same everywhere.
    const xp = settleCommon() + defeatXp(npcDefeatXp(enemy!.level), enemy!.tier) + (enemy!.isBoss ? BOSS_XP_BONUS : 0);
    void addXp(xp);
    markDefeated(enemy!.instanceId);
    // Read from the store, not this render: victory() runs from a message
    // callback created before a finishing move's heal (Wisp) was committed.
    const { playerHp: finalHp, lucky: wonLucky } = combatState();
    const killsBefore = save!.kills[enemy!.id] ?? 0;
    // First-win bonus, then a Lucky Clover (#80) doubles the lot.
    const coins = victoryCoins(enemy!.coins, killsBefore) * (wonLucky ? CLOVER_COIN_MULT : 1);
    const drop = rollDrop(enemy!.isBoss);
    // A boss's own badge (#75 item 14g: the Last Fogbank's Foglight Badge), the first time.
    const bossBadge = ENEMY_DEFS[enemy!.id]?.badge;
    const badge = bossBadge && !save!.badges.includes(bossBadge) ? bossBadge : null;
    updateSave((s) => ({
      ...s,
      hp: finalHp,
      coins: s.coins + coins,
      items: drop ? { ...s.items, [drop]: s.items[drop] + 1 } : s.items,
      // Lifetime kill counts drive defeat quests (#42).
      kills: { ...s.kills, [enemy!.id]: (s.kills[enemy!.id] ?? 0) + 1 },
      library: pushLibrary(s.library, misses.current),
      // A warden boss (#58) awards its gate key as a trophy badge too.
      badges: [...new Set([...s.badges, ...(keyBoss ? [keyBoss.id] : []), ...(badge ? [badge] : [])])],
      flags: {
        ...s.flags,
        // The first victory warms the egg — the hatch scene plays back in
        // the world (#37 story pass).
        [EMBER_HATCHED]: true,
        // By its role (#75 item 14c): a Fiend restores its crystal, a warden
        // gives up its gate key, any other boss is marked beaten on its own.
        ...(enemy!.role === 'fiend' ? { [crystalFlag(topic)]: true } : {}),
        ...(keyBoss ? { [keyFlag(keyBoss.id)]: true } : {}),
        ...(enemy!.isBoss && enemy!.role !== 'fiend' && !keyBoss ? { [bossFlag(enemy!.id)]: true } : {}),
      },
    }));
    // The bonus scroll (#159 item 3): one win in three, with a keyboard, a name to type for a little extra.
    const bonus = keyboard ? rollTypingBonus(avatar!.name, enemy!.name) : null;
    setTurn({ kind: 'victory', xp, coins, lucky: wonLucky, firstWin: killsBefore === 0, drop, badge, bonus });
  }

  /** The bonus scroll's name typed (#159 item 3): pay it. `TypingBonus` asks once. */
  function claimBonus(bonus: TypingBonus) {
    sfx('chest');
    burst({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    const r = bonus.reward;
    if (r.kind === 'xp') void addXp(r.amount);
    else updateSave((s) => (r.kind === 'coins' ? { ...s, coins: s.coins + r.amount } : { ...s, items: { ...s.items, [r.id]: s.items[r.id] + 1 } }));
  }

  function defeat() {
    const xp = settleCommon();
    void addXp(xp);
    // Remember the loss: after a couple, this enemy eases off (mercy).
    recordLoss(lossKey(enemy!));
    // No game over (#37): wake up safe and fully healed — at the last inn
    // rested at, or home in Lumina Village (#75 item 11). Lost while sailing,
    // the boat goes home too — and the defeat screen says so, from the same fact.
    const before = useSaveStore.getState().save!;
    const boatLine = defeatBoatLine(before, wakeAfterDefeat(before).zoneId);
    // Who looks after the hero is the shelter where they were beaten — read
    // before the hero is moved (after it, a rest at an inn that's also a
    // shelter would read "Binder finds you" for a loss anywhere, #75 item 14h review).
    const shelter = wakeShelter(before);
    updateSave((s) => ({
      ...s,
      hp: null,
      // Beaten at sea (#75 item 14d): Old Marlow rows the boat home to his
      // dock — a hero waking ashore could never reach it out on open water;
      // waking on an island, he brings it to that town's beach (#114o).
      ...boatAfterDefeat(s, wakeAfterDefeat(s).zoneId),
      ...wakeAfterDefeat(s),
      // An escort's walk ends (#75 item 14g): they wait at the start again.
      flags: escortsBack(s.flags),
      library: pushLibrary(s.library, misses.current),
    }));
    useBattleStore.getState().setEscortAt(null);
    setTurn({ kind: 'defeat', xp, boatLine, shelter });
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

  const liveState: CombatState = {
    playerHp,
    playerMaxHp,
    enemyHp,
    enemyMaxHp: enemy.maxHp,
    charge,
    guarded,
    enemyShielded,
    lastPhase: 0,
    mirrored,
    focused,
    lucky,
    knotted,
    candleLit,
    candleHint,
    freeHint,
    secondWind,
    remembrance,
  };
  const perkLabel = { charge: `+${EMBER_BONUS_CHARGE}◆`, peek: '👀 peek', mend: `+${WISP_MEND} HP` }[companion.perk];
  // Identifies the current question card (remounts QuestionCard + DefendTimer).
  const qKey = turn.kind === 'question' || turn.kind === 'enemy-question' ? `${turn.question.id}:${turn.seq}` : '';
  const toCommand = () => setTurn({ kind: 'command' });

  return (
    // overflow-clip (not hidden): a hidden-overflow box is still programmatically
    // scrollable, so focusing/scrolling to a button could slide the whole arena
    // sideways; clip can't scroll. overflow-hidden stays as the fallback.
    <div
      className={`min-h-screen flex flex-col bg-gradient-to-b ${info.skyGradient} overflow-hidden supports-[overflow:clip]:overflow-clip relative`}
    >
      {/* 16-bit zone backdrop (the sky gradient stays underneath as a fallback);
          out at sea against a sea critter, open water (#75 item 14d) */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${battleBackdrop(enemy.zoneId, enemy.habitat)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center bottom',
          imageRendering: 'pixelated',
        }}
      />
      {/* Parallax backdrop + pseudo-3D ground plane (its ground shadows only on land —
          over open water they'd read as smoke, #75 item 14d) */}
      <div className="absolute inset-x-0 bottom-0 h-[46%] pointer-events-none">
        {enemy.habitat !== 'sea' && (
          <>
            <div className="absolute -top-10 left-[8%] w-52 h-24 bg-black/20 rounded-full blur-md" />
            <div className="absolute -top-6 right-[12%] w-64 h-20 bg-black/25 rounded-full blur-md" />
          </>
        )}
        <div
          className="absolute inset-x-[-20%] bottom-0 h-full rounded-[100%_100%_0_0]"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.18), rgba(0,0,0,0.35) 70%)',
            transform: 'perspective(500px) rotateX(30deg) scale(1.25)',
            transformOrigin: 'bottom',
          }}
        />
      </div>

      {/* The level and streak in their own row above the status boxes, as in
          the world's top bar — floating, they covered the enemy's "!!!" on a
          phone (#75 item 14f review). Below 360 px wide or 500 px tall there's
          no room for the row without pushing 🏃 Flee off the screen (measured,
          `bench … battle`), so a fight there shows neither. */}
      <div
        data-testid="battle-topbar"
        className="relative z-10 flex flex-wrap items-center gap-1.5 px-2 pt-1 sm:px-4 sm:pt-3 max-[359px]:hidden [@media(max-height:500px)]:hidden"
      >
        <LevelBadge placement="inline" dense />
        <StreakBadge inline dense />
      </div>
      <BattleHud
        enemy={enemy}
        enemyHp={viewEnemyHp}
        enemyShielded={enemyShielded}
        speedBoost={boostShown}
        powerMoveNext={charging ? powerMove : null}
        avatar={avatar}
        playerHp={viewPlayerHp}
        playerMaxHp={playerMaxHp}
        charge={charge}
        streak={streak}
      />

      {/* Callout banner (archetypes, enrage, power moves, pair attacks, swaps, speed):
          a dark pill like the HUD's panels over the stage's sky, so it reads on
          any backdrop; out of the layout (h-0), so nothing below it — a question's
          answers — jumps when it comes and goes; read aloud as it appears. */}
      <div role="status" aria-live="polite" className="relative z-20 h-0">
        <AnimatePresence>
          {fx.banner && (
            <motion.p
              initial={fx.reduceMotion ? { opacity: 0 } : { y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 top-1 mx-auto w-fit max-w-[92%] rounded-xl border-2 border-white/70 bg-indigo-950/90 px-3 py-1.5 text-center text-amber-300 font-extrabold tracking-wide shadow-lg"
            >
              {fx.banner}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <BattleStage
        fx={fx.stage}
        heroRef={fx.heroRef}
        enemyRef={fx.enemyRef}
        enemySprite={enemySprite}
        heroSprite={heroSprite}
        companionSprite={cSprite}
        fireballSprite={fireballSprite}
        companionId={companionId}
        companionName={companion.name}
        ember={ember}
        isBoss={enemy.isBoss}
        guarded={guarded}
        remembered={remembrance === 'ready'}
        charging={charging}
        won={turn.kind === 'victory'}
        afloat={enemy.habitat === 'sea'}
        ghost={enemy.role === 'echo'}
      />

      {/* Bottom box: commands / question / message / results */}
      <div className="relative z-20 flex justify-center p-2 pb-4 sm:p-4 sm:pb-6">
        {turn.kind === 'command' && (
          <CommandMenu
            charge={charge}
            spellsLoaded={spellQs.length > 0}
            canCastAny={canCastAny}
            items={save.items}
            isBoss={enemy.isBoss}
            powerMove={charging ? powerMove : null}
            companion={companion}
            companionReady={cReady}
            companionHint={cReady ? `${cMove.name} · Pair Attacks` : 'Still an egg…'}
            canSwap={party.length > 1}
            onAttack={commandAttack}
            onSpells={() => setTurn({ kind: 'cast' })}
            onCompanion={commandCompanion}
            onGuard={commandGuard}
            onItems={() => setTurn({ kind: 'items' })}
            onSwap={() => setTurn({ kind: 'swap' })}
            onFlee={commandFlee}
          />
        )}

        {turn.kind === 'race' && (
          <div className="w-full max-w-xl bg-white text-gray-800 rounded-2xl p-4 shadow-2xl" data-testid="name-race">
            <p className="text-center font-bold text-sm uppercase tracking-widest text-indigo-900">⚡ Name it before it moves!</p>
            <TypeBurst
              key={turn.word}
              word={turn.word}
              holdRule={save.typingAnchor}
              durationMs={NAME_RACE_MS}
              label="⚡ Quick! Name the critter for first strike!"
              doneText="⚡ First strike is yours!"
              lateText="Too slow — it darts in first!"
              onEvent={(e) => {
                if (e === 'typed' || e === 'done') float('✨', 'hero', 'text-amber-200');
              }}
              // A beat to read the result, then the blow or the critter's move.
              onResult={(ok) => later(() => raceDone(ok), 700)}
            />
          </div>
        )}

        {turn.kind === 'swap' && <SwapMenu party={party} active={companionId} flags={save?.flags} onSwap={swapTo} onBack={toCommand} />}

        {turn.kind === 'items' && (
          <ItemMenu
            items={save.items}
            blocked={(id) => itemBlocked(liveState, id, save.items[id])}
            onUse={applyItem}
            onBack={toCommand}
          />
        )}

        {turn.kind === 'companion' && (
          <CompanionMenu
            companion={companion}
            move={cMove}
            perkLabel={perkLabel}
            pairs={pairs}
            growHint={companionId === 'ember' && pairs.length < PAIR_ATTACKS.filter((p) => p.companion === 'ember').length}
            charge={charge}
            spellsLoaded={spellQs.length > 0}
            onStrike={commandCompanionStrike}
            onPair={startPair}
            onBack={toCommand}
          />
        )}

        {turn.kind === 'cast' && (
          <SpellMenu
            spells={spells}
            charge={charge}
            spellsLoaded={spellQs.length > 0}
            enemyTopic={enemy.topic}
            blocked={(sp) => spellBlocked(liveState, sp)}
            onCast={castSpell}
            onBack={toCommand}
          />
        )}

        {(turn.kind === 'question' || turn.kind === 'enemy-question') && (
          <div className="w-full max-w-xl">
            {turn.kind === 'enemy-question' && save.defendTimer ? (
              <DefendTimer
                // Its own key: it sits beside the QuestionCard keyed by `qKey`.
                key={`${qKey}:timer`}
                durationMs={defendTimeMs(age, mercy.levelDrop > 0)}
                stopped={answeredKey === qKey}
                paused={pausedKey === qKey}
                onExpire={() => defendTimedOut(turn.question)}
                label={charging ? `💢 ${powerMove} — answer to soften it!` : `🛡️ ${enemy.name} attacks — answer to block!`}
              />
            ) : (
              <p className="text-center text-white font-bold mb-2 text-sm uppercase tracking-widest">
                {turn.kind === 'enemy-question'
                  ? charging
                    ? `💢 ${powerMove} — answer to soften it!`
                    : `🛡️ ${enemy.name} attacks — answer to block!`
                  : {
                      spell: turn.mode === 'spell' && `${turn.spell.emoji} Super-hard question — cast ${turn.spell.name}!`,
                      pair:
                        turn.mode === 'pair' &&
                        `${turn.pair.emoji} Super-hard question — ${turn.pair.name} with ${companion.name}!`,
                      companion: `${cMove.emoji} Answer to help ${companion.name} strike!`,
                      guard: '🛡️ Answer to raise your guard!',
                      attack: '⚔️ Answer to strike!',
                    }[turn.mode]}
              </p>
            )}
            {!!turn.hide && (
              <p className="text-center text-sky-200 text-xs font-semibold mb-2">👀 Pip crossed out a wrong answer for you!</p>
            )}
            <QuestionCard
              key={qKey}
              question={turn.question}
              // Fox Sense (Kira): a free hint on top of the feathers, used first.
              // A trickster blocks hints — unless a Glimmer Candle is lit (#75 item 14g).
              hints={enemy.behavior === 'trickster' && !candleLit ? 0 : save.items.hint + (freeHint ? 1 : 0) + (candleHint ? 1 : 0)}
              hintLabel={freeHint ? '🦊 Fox Sense — use a free hint!' : candleHint ? '🕯️ Glimmer Candle — use a free hint!' : undefined}
              // Why there's no hint button, and the way round it (#75 item 14g UX review).
              // (Items only opens when you pick your next move, so it says "next turn".)
              hintNote={enemy.behavior === 'trickster' && !candleLit && (save.items.hint > 0 || save.items.candle > 0)
                ? `🪶 Too slippery for feathers!${save.items.candle ? ' Next turn, light a 🕯️ candle from Items.' : ''}`
                : undefined}
              preHidden={turn.hide ?? 0}
              // Forget-Me-Knot (#75 item 14e): a wrong pick is crossed out and the hero picks again.
              secondChance={knotted}
              onSecondChance={() => {
                // A second try isn't evidence the questions are too easy (the speed trigger).
                helped.current = true;
                applyCombat({ ...combatState(), knotted: false });
                // A defend question's clock waits for the second pick: take your time.
                setPausedKey(qKey);
              }}
              onUseHint={() => {
                helped.current = true;
                const s = combatState();
                // The free ones first — Fox Sense's, then a Glimmer Candle's — then a feather.
                if (s.freeHint) applyCombat({ ...s, freeHint: false });
                else if (s.candleHint) applyCombat({ ...s, candleHint: false });
                else useSaveStore.getState().spendHint();
              }}
              onAnswered={(correct, picked) => {
                setAnsweredKey(qKey);
                recordAnswer(correct, turn.question, picked);
                // A ✍️ scribe burst (#159) after a right Attack or block answer.
                if (correct && scribe && (turn.kind === 'enemy-question' || turn.mode === 'attack')) {
                  setScribeBurst({ key: qKey, mode: turn.kind === 'enemy-question' ? 'block' : 'attack', word: burstWord(avatar.name, enemy.name) });
                }
              }}
              afterAnswer={
                scribeBurst && scribeBurst.key === qKey ? (
                  <TypeBurst
                    word={scribeBurst.word}
                    holdRule={save.typingAnchor}
                    // Every right key sparks on the hero: each press does something at once.
                    onEvent={(e) => {
                      if (e === 'typed' || e === 'done') float('✨', 'hero', 'text-amber-200');
                    }}
                    onResult={(ok) => scribeDone(scribeBurst.mode, ok)}
                  />
                ) : undefined
              }
              continueLabel="▶ Go!"
              onContinue={(correct) => {
                // ▶ Go! before the word is typed: no bonus, the move resolves as ever.
                setScribeBurst(null);
                if (turn.kind === 'enemy-question') resolveEnemyQuestion(correct);
                else if (turn.mode === 'spell') resolveSpellQuestion(turn.spell, correct);
                else if (turn.mode === 'pair') resolvePair(turn.pair, correct);
                else if (turn.mode === 'companion') resolveCompanionStrike(correct);
                else resolvePlayerQuestion(turn.mode, correct);
              }}
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
          <BattleResult
            result={turn.kind}
            enemy={enemy}
            keyBoss={keyBoss}
            fiendDefeatLine={enemy.isBoss && !keyBoss ? bossScript(enemy)?.defeat : undefined}
            crystalName={enemy.role === 'fiend' ? info.crystalName : undefined}
            correctCount={answers.filter(Boolean).length}
            xp={turn.xp}
            coins={turn.kind === 'victory' ? turn.coins : enemy.coins}
            lucky={turn.kind === 'victory' && turn.lucky}
            firstWin={turn.kind === 'victory' && turn.firstWin}
            drop={turn.kind === 'victory' ? turn.drop : null}
            badge={turn.kind === 'victory' && turn.badge ? BOSS_BADGES[turn.badge] ?? null : null}
            wakeInn={save ? wakeInnName(save) : null}
            shelter={turn.kind === 'defeat' ? turn.shelter : null}
            tip={turn.kind === 'defeat' ? defeatTip(enemy, roadTier(save?.flags ?? {})) : null}
            boatLine={turn.kind === 'defeat' ? turn.boatLine : null}
            bonus={turn.kind === 'victory' ? turn.bonus : null}
            holdRule={save.typingAnchor}
            onClaimBonus={claimBonus}
            onLeave={() => leave(turn.kind === 'victory' ? 'win' : 'lose')}
          />
        )}
      </div>
    </div>
  );
}
