import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { LoadingScreen, ErrorScreen } from '../../components/StatusScreens';
import { useGeneratedQuestions } from '../../hooks/useGeneratedQuestions';
import { fetchQuestions, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { sfx, stopMusic } from '../../lib/audio';
import { playerAge, clampLevel, nextSkillLevelFromBattle, skillLevelFor } from '../../lib/age';
import { npcDefeatXp, XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { attackDamage, spellDamage, BOSS_XP_BONUS } from '../../lib/battleMath';
import {
  applyFocus,
  chargeAfterAnswer,
  itemBlocked,
  resolveEnemyTurn,
  resolveHeroHit,
  resolveItem,
  resolveSpell,
  type CombatState,
} from '../../lib/battleTurn';
import { spellsKnown, SPELL_LEVEL_BONUS, type Spell } from '../../content/spells';
import { CLOVER_COIN_MULT, CONSUMABLES, type ConsumableId } from '../../content/items';
import { topicInfo, crystalFlag } from '../../content/topics';
import { BOSS_LINES, emberStatus, EMBER_SPRITES, EMBER_SPRITE_IDS, EMBER_HATCHED } from '../../content/story';
import { keyForBoss, keyFlag } from '../../content/keys';
import { resolveSprite } from '../../content/sprites';
import { battleBackdrop } from '../../content/tiles';
import { avatarById } from '../../content/avatars';
import { HUB_ZONE } from '../../content/zones';
import { combatState, useBattleStore } from '../../store/battleStore';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow } from '../../machines/gameFlow';
import { pushLibrary } from '../../lib/save';
import type { LibraryEntry, Question } from '../../types';
import { BattleHud } from './BattleHud';
import { BattleStage } from './BattleStage';
import { CommandMenu, ItemMenu, SpellMenu } from './BattleMenus';
import { BattleResult } from './BattleResult';
import { IMPACT_MS, useBattleFx } from './useBattleFx';

type Turn =
  | { kind: 'command' }
  | { kind: 'cast' }
  | { kind: 'items' }
  | { kind: 'question'; mode: 'attack' | 'guard'; question: Question }
  | { kind: 'question'; mode: 'spell'; spell: Spell; question: Question }
  | { kind: 'enemy-question'; question: Question }
  | { kind: 'message'; text: string; next: () => void }
  | { kind: 'victory'; xp: number; coins: number; lucky: boolean }
  | { kind: 'defeat'; xp: number };

/**
 * FF-style side-profile command battle (#37). Enemy left, hero right, on a
 * pseudo-3D ground plane. Commands: Attack / Spells / Guard / Items /
 * Flee — every command resolves through a question (the educational core),
 * and the enemy's counterattack is blocked by answering a defend question.
 * Spells (the Spellbook) let the hero pick from a growing set of abilities —
 * heal, shield, Sage strikes, Ember's Breath — each cast by answering one
 * *super-hard* question (SPELL_LEVEL_BONUS levels up); a miss fizzles
 * harmlessly and the spell's charge is refunded.
 *
 * Layout (#44): this component owns the turn flow (which box is showing and
 * what comes next). The fight's rules live in `lib/battleTurn.ts`, its live
 * numbers in `battleStore`, cosmetic effects in `useBattleFx`, and the
 * presentational pieces in `BattleHud` / `BattleStage` / `BattleMenus` /
 * `BattleResult`.
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
    applyCombat,
    markDefeated,
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
      applyCombat: s.applyCombat,
      markDefeated: s.markDefeated,
      endBattle: s.endBattle,
    })),
  );
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
  const { stage: ember } = emberStatus(save?.flags ?? {});

  const enemySprite = resolveSprite(enemy?.spriteId, enemy?.sprite ?? '❓');
  const heroSprite = resolveSprite(avatar?.spriteId, avatar?.sprite ?? '❓');
  const emberSprite = resolveSprite(EMBER_SPRITE_IDS[ember], EMBER_SPRITES[ember]);

  const { questions, loading, error, reload } = useGeneratedQuestions(
    topic,
    BATTLE_QUESTION_COUNT,
    enemy?.level,
  );

  const fx = useBattleFx();
  const { float, showBanner, later } = fx;
  const [turn, setTurn] = useState<Turn>({ kind: 'command' });
  const [qIndex, setQIndex] = useState(0);
  // Super-hard question pool (level + SPELL_LEVEL_BONUS) shared by every spell.
  const [spellQs, setSpellQs] = useState<Question[]>([]);
  const [spellIdx, setSpellIdx] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const misses = useRef<LibraryEntry[]>([]);

  // Warm the super-hard spell-tier pool (level + SPELL_LEVEL_BONUS). Every
  // hero knows at least Mend, so this always loads; spells stay castable.
  useEffect(() => {
    if (!enemy) return;
    let active = true;
    fetchQuestions(
      topic,
      age,
      clampLevel(enemy.level + SPELL_LEVEL_BONUS),
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

  // Archetype callout (Wave 0.5) so the twist is announced, never a gotcha.
  // Waits for the question LoadingScreen to clear — the banner only renders in
  // the battle UI, so a mount-anchored timer would expire unseen on a slow
  // generation (the exact gotcha this callout exists to prevent).
  const calloutShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !enemy?.behavior || calloutShownFor.current === enemy.instanceId) return;
    calloutShownFor.current = enemy.instanceId;
    const callout = {
      shielded: `${enemy.name} raises a stony shield — the first hit will shatter it!`,
      trickster: `${enemy.name} is too slippery for Hint Feathers!`,
      healer: `${enemy.name} mends itself when it's hurt — press the attack!`,
    }[enemy.behavior];
    later(() => showBanner(callout, 3000), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemy?.instanceId, loading]);

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

  const canCastAny = spellQs.length > 0 && spells.some((s) => charge >= s.cost);
  const nextQuestion = () => {
    const q = questions[qIndex % questions.length];
    setQIndex((i) => i + 1);
    return q;
  };
  /** Continue with a message box, then `next`. */
  const say = (text: string, next: () => void) => setTurn({ kind: 'message', text, next });

  function recordAnswer(correct: boolean, q: Question, picked: number) {
    setAnswers((a) => [...a, correct]);
    const s = combatState();
    applyCombat({ ...s, charge: chargeAfterAnswer(s.charge, correct) });
    if (!correct) misses.current.push({ question: q, picked });
  }

  // --- Command handlers ------------------------------------------------------

  function commandAttack() {
    setTurn({ kind: 'question', mode: 'attack', question: nextQuestion() });
  }
  function commandGuard() {
    setTurn({ kind: 'question', mode: 'guard', question: nextQuestion() });
  }
  function castSpell(spell: Spell) {
    if (combatState().charge < spell.cost || spellQs.length === 0) return;
    const q = spellQs[spellIdx % spellQs.length];
    setSpellIdx((i) => i + 1);
    setTurn({ kind: 'question', mode: 'spell', spell, question: q });
  }
  /** Use a battle item (#73). Like any command, it spends the hero's turn. */
  function applyItem(id: ConsumableId) {
    const s = combatState();
    if (itemBlocked(s, id, save!.items[id])) return;
    updateSave((sv) => ({ ...sv, items: { ...sv.items, [id]: Math.max(0, sv.items[id] - 1) } }));
    const r = resolveItem(s, id);
    applyCombat(r.state);
    if (r.healed > 0) float(`+${r.healed}`, 'hero', 'text-emerald-300');
    if (r.chargeGained > 0) float(`+${r.chargeGained}◆`, 'hero', 'text-amber-300');
    const buffFloat: Partial<Record<ConsumableId, [string, string]>> = {
      ward: ['🌈', 'text-sky-300'],
      mirror: ['🪞', 'text-sky-300'],
      tea: ['🍵 Focus!', 'text-lime-300'],
      clover: ['🍀 Lucky!', 'text-emerald-300'],
    };
    const bf = buffFloat[id];
    if (bf) float(bf[0], 'hero', bf[1]);
    const { name, emoji } = CONSUMABLES[id];
    say(`${avatar!.name} uses a ${name}! ${emoji}`, enemyTurn);
  }
  function commandFlee() {
    updateSave((s) => ({ ...s, hp: combatState().playerHp }));
    sendFlow({ type: 'BATTLE_END', result: 'lose' });
    endBattle();
  }

  // --- Turn resolution --------------------------------------------------------

  function resolvePlayerQuestion(mode: 'attack' | 'guard', wasCorrect: boolean) {
    if (mode === 'guard') {
      if (wasCorrect) {
        applyCombat({ ...combatState(), guarded: true });
        float('🛡️', 'hero', 'text-sky-300');
        say(`${avatar!.name} braces behind a wall of knowing!`, enemyTurn);
      } else {
        say('The guard slips… stay sharp!', enemyTurn);
      }
      return;
    }
    // Focus Tea (#80): a landed Attack hits TEA_DAMAGE_MULT× and spends the focus.
    const focus = applyFocus(combatState(), attackDamage(wasCorrect, style, powerUps));
    applyCombat(focus.state);
    const text = (wasCorrect ? `${avatar!.name} strikes true!` : 'A glancing blow…') + focus.note;
    heroStrike(focus.dmg, text, 'text-red-300');
  }

  /** Cast the chosen spell once its super-hard question resolves. */
  function resolveSpellQuestion(spell: Spell, wasCorrect: boolean) {
    const r = resolveSpell(combatState(), spell, wasCorrect);
    if (r.kind === 'fizzle') {
      // A miss never punishes effort: the charge is safe, the spell just fizzles.
      say(`${spell.emoji} ${spell.name} fizzles… the charge is safe. Try again!`, enemyTurn);
      return;
    }
    applyCombat(r.state);
    confetti({ particleCount: 90, spread: 100, origin: { y: 0.4 } });
    if (r.kind === 'heal') {
      fx.lungeHero();
      later(() => float(`+${r.healed}`, 'hero', spell.color), IMPACT_MS);
      say(`${spell.emoji} ${spell.name}! Bright knowing knits your wounds.`, enemyTurn);
      return;
    }
    if (r.kind === 'shield') {
      float('🛡️', 'hero', spell.color);
      say(`${spell.emoji} ${spell.name}! A shield of knowing rises — the next hit will glance away.`, enemyTurn);
      return;
    }
    const text =
      ember !== 'egg' && spell.id === 'ember-breath'
        ? `${spell.emoji} ${spell.name}! Ember rears back and breathes dragonfire!`
        : ember !== 'egg'
          ? `${spell.emoji} ${spell.name}! Ember roars as your answer blazes!`
          : `${spell.emoji} ${spell.name}! A brilliant answer erupts!`;
    heroStrike(spellDamage(style, powerUps, r.multiplier), text, spell.color, spell.cost);
  }

  /** Shared damage-dealing path for Attack and offensive spells. */
  function heroStrike(dmg: number, text: string, floatColor: string, refundCharge = 0) {
    const r = resolveHeroHit(combatState(), dmg, { isBoss: enemy!.isBoss, refundCharge });
    applyCombat(r.state);
    fx.lungeHero();
    if (r.outcome === 'shield-broken') {
      later(() => float('Shield shattered!', 'enemy', 'text-amber-300'), IMPACT_MS);
      say(
        `${text} The stony shield takes the blow — and SHATTERS! ${enemy!.name} is wide open now!` +
          (r.refunded > 0 ? ' The spell-light flows back to you — charge refunded!' : ''),
        enemyTurn,
      );
      return;
    }
    later(() => float(`-${r.dealt}`, 'enemy', floatColor), IMPACT_MS);
    if (r.outcome === 'defeated') {
      say(text, victory);
      return;
    }
    // Boss enrage callout when crossing a phase boundary.
    if (r.newPhase) {
      showBanner(r.newPhase === 1 ? `${enemy!.name} growls — it's getting serious!` : `${enemy!.name} is furious!`);
    }
    say(text, enemyTurn);
  }

  function enemyTurn() {
    setTurn({ kind: 'enemy-question', question: nextQuestion() });
  }

  function resolveEnemyQuestion(wasCorrect: boolean) {
    const r = resolveEnemyTurn(combatState(), {
      wasCorrect,
      level: enemy!.level,
      isBoss: enemy!.isBoss,
      behavior: enemy!.behavior,
      style,
      powerUps,
    });
    applyCombat(r.state);
    fx.lungeEnemy();
    later(() => {
      float(r.dmg === 0 ? 'Blocked!' : `-${r.dmg}`, 'hero', r.dmg === 0 ? 'text-sky-300' : 'text-red-300');
      if (r.shieldShattered) float('Shield shattered!', 'enemy', 'text-amber-300');
      else if (r.reflected > 0) float(`-${r.reflected}`, 'enemy', 'text-sky-300');
      if (r.mended > 0) float(`+${r.mended}`, 'enemy', 'text-emerald-300');
      if (r.dmg > 0) sfx('hit');
    }, IMPACT_MS);
    // Boss enrage callout from a Mirror Charm bounce (#80: any damage source).
    if (r.newPhase) {
      showBanner(r.newPhase === 1 ? `${enemy!.name} growls — it's getting serious!` : `${enemy!.name} is furious!`);
    }

    const text =
      (r.shieldShattered
        ? `${enemy!.name} attacks — the Mirror Charm bounces it back, and its shield SHATTERS! 🪞`
        : r.reflected > 0
          ? `${enemy!.name} attacks — the Mirror Charm bounces it right back! 🪞`
          : r.dmg === 0
            ? `${enemy!.name} attacks — completely blocked!`
            : wasCorrect
              ? `${enemy!.name} attacks — you soften the hit!`
              : `${enemy!.name} lands a hit!`) + (r.mended > 0 ? ` It glows softly and mends ${r.mended} HP!` : '');
    // A bounced hit can win the battle (checked first: a mirrored hero takes no damage).
    say(text, r.enemyDown ? victory : r.heroDown ? defeat : () => setTurn({ kind: 'command' }));
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
    stopMusic(); // silence the battle loop under the victory jingle
    sfx('victory');
    const xp = settleCommon() + npcDefeatXp(enemy!.level) + (enemy!.isBoss ? BOSS_XP_BONUS : 0);
    void addXp(xp);
    markDefeated(enemy!.instanceId);
    const { playerHp: finalHp, lucky: wonLucky } = combatState();
    // Lucky Clover (#80): the win pays CLOVER_COIN_MULT× coins.
    const coins = enemy!.coins * (wonLucky ? CLOVER_COIN_MULT : 1);
    updateSave((s) => ({
      ...s,
      hp: finalHp,
      coins: s.coins + coins,
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
    setTurn({ kind: 'victory', xp, coins, lucky: wonLucky });
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
    setTurn({ kind: 'defeat', xp });
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
  };

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-b ${info.skyGradient} overflow-hidden relative`}>
      {/* 16-bit zone backdrop (the sky gradient stays underneath as a fallback) */}
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

      <BattleHud
        enemy={enemy}
        enemyHp={enemyHp}
        enemyShielded={enemyShielded}
        avatar={avatar}
        playerHp={playerHp}
        playerMaxHp={playerMaxHp}
        charge={charge}
      />

      {/* Boss enrage / archetype banner */}
      <AnimatePresence>
        {fx.banner && (
          <motion.p
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center text-amber-300 font-extrabold tracking-wide"
          >
            ⚠️ {fx.banner}
          </motion.p>
        )}
      </AnimatePresence>

      <BattleStage
        enemySprite={enemySprite}
        heroSprite={heroSprite}
        emberSprite={emberSprite}
        ember={ember}
        isBoss={enemy.isBoss}
        guarded={guarded}
        floats={fx.floats}
        heroLunge={fx.heroLunge}
        enemyLunge={fx.enemyLunge}
        heroActing={fx.heroActing}
        enemyActing={fx.enemyActing}
      />

      {/* Bottom box: commands / question / message / results */}
      <div className="relative z-20 p-4 pb-6 flex justify-center">
        {turn.kind === 'command' && (
          <CommandMenu
            charge={charge}
            spellsLoaded={spellQs.length > 0}
            canCastAny={canCastAny}
            items={save.items}
            isBoss={enemy.isBoss}
            onAttack={commandAttack}
            onSpells={() => setTurn({ kind: 'cast' })}
            onGuard={commandGuard}
            onItems={() => setTurn({ kind: 'items' })}
            onFlee={commandFlee}
          />
        )}

        {turn.kind === 'items' && (
          <ItemMenu
            items={save.items}
            blocked={(id) => itemBlocked(liveState, id, save.items[id])}
            onUse={applyItem}
            onBack={() => setTurn({ kind: 'command' })}
          />
        )}

        {turn.kind === 'cast' && (
          <SpellMenu
            spells={spells}
            charge={charge}
            spellsLoaded={spellQs.length > 0}
            onCast={castSpell}
            onBack={() => setTurn({ kind: 'command' })}
          />
        )}

        {(turn.kind === 'question' || turn.kind === 'enemy-question') && (
          <div className="w-full max-w-xl">
            <p className="text-center text-white font-bold mb-2 text-sm uppercase tracking-widest">
              {turn.kind === 'enemy-question'
                ? `🛡️ ${enemy.name} attacks — answer to block!`
                : turn.mode === 'spell'
                  ? `${turn.spell.emoji} Super-hard question — cast ${turn.spell.name}!`
                  : turn.mode === 'guard'
                    ? '🛡️ Answer to raise your guard!'
                    : '⚔️ Answer to strike!'}
            </p>
            <QuestionCard
              key={turn.question.id + qIndex + spellIdx}
              question={turn.question}
              hints={enemy.behavior === 'trickster' ? 0 : save.items.hint}
              onUseHint={useSaveStore.getState().spendHint}
              onAnswered={(correct, picked) => recordAnswer(correct, turn.question, picked)}
              continueLabel="▶ Go!"
              onContinue={(correct) =>
                turn.kind === 'enemy-question'
                  ? resolveEnemyQuestion(correct)
                  : turn.mode === 'spell'
                    ? resolveSpellQuestion(turn.spell, correct)
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
          <BattleResult
            result={turn.kind}
            enemy={enemy}
            keyBoss={keyBoss}
            fiendDefeatLine={
              enemy.isBoss && !keyBoss ? BOSS_LINES[topic as keyof typeof BOSS_LINES]?.defeat : undefined
            }
            crystalName={info.crystalName}
            correctCount={answers.filter(Boolean).length}
            xp={turn.xp}
            coins={turn.kind === 'victory' ? turn.coins : enemy.coins}
            lucky={turn.kind === 'victory' && turn.lucky}
            onLeave={() => leave(turn.kind === 'victory' ? 'win' : 'lose')}
          />
        )}
      </div>
    </div>
  );
}
