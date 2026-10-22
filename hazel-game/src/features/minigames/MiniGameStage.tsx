import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import ModalLayer from '../../components/ModalLayer';
import LazyBoundary from '../../components/LazyBoundary';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { BANDS, BAND_LABEL, MINIGAMES, openedFlag, type Band, type MiniGameDef, type MiniGameId } from '../../content/minigames';
import { CONSUMABLES, type ConsumableId } from '../../content/items';
import { NPC_DEFS, npcEmoji, npcName, npcSpriteId } from '../../content/npcs';
import { topicInfo } from '../../content/topics';
import { playerAge, skillLevelFor } from '../../lib/age';
import { playMusic, sfx } from '../../lib/audio';
import { useLazyRetry } from '../../lib/lazyRetry';
import { bandFor, claimPage, claimRound, pagesFound, rememberBand, rememberedBand, starsEarned, type Claim } from '../../lib/minigames';
import { cn } from '../../lib/utils';
import { sendFlow } from '../../machines/gameFlow';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { useSettingsStore } from '../../store/settingsStore';
import { GAME_SCREENS } from './games';
import { EmberSprite, HostBubble, Stars } from './parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, pixelTitleClass, windowClass } from './styles';
import type { RoundOutcome } from './types';

/** How long the round window takes to grow from the counter to the whole screen (§2.1). */
export const ZOOM_MS = 600;

type Phase = 'title' | 'play' | 'reward';

/** What a round has earned so far: shown on its reward. */
interface Earned {
  pages: string[];
  xp: number;
  coins: number;
  stars: (1 | 2 | 3)[];
  item: ConsumableId | null;
}
const NOTHING: Earned = { pages: [], xp: 0, coins: 0, stars: [], item: null };

function add(a: Earned, c: Claim, labels: string[] = []): Earned {
  return {
    pages: [...a.pages, ...labels],
    xp: a.xp + c.xp,
    coins: a.coins + c.coins,
    stars: [...a.stars, ...c.stars],
    item: a.item ?? c.item,
  };
}

const EMPTY_FLAGS: Record<string, boolean> = {};

/**
 * A mini-game's stage (docs/DESIGN-MINIGAMES.md §2): opened from its host, it
 * takes the whole screen with a round window that grows from the middle (a
 * fade with reduced motion), then shows the title card, the game, and a reward
 * after each round. It saves and pays what the game finds (`lib/minigames.ts`:
 * only the first time), plays the game's music (`App` steps aside), and Back or
 * Escape leaves for the map at once — what was found is saved as it's found.
 */
export default function MiniGameStage({ game }: { game: MiniGameId }) {
  const def = MINIGAMES[game];
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const recordActivity = useProfileStore((s) => s.recordActivity);
  const kidId = profile?.id ?? null;
  const level = skillLevelFor(profile?.skillLevels ?? {}, def.topic, playerAge(profile));
  const suggested = bandFor(level);
  const [band, setBand] = useState<Band>(() => rememberedBand(kidId, game) ?? suggested);
  const [phase, setPhase] = useState<Phase>('title');
  const [round, setRound] = useState(0);
  const [reward, setReward] = useState<(RoundOutcome & Earned) | null>(null);
  const earned = useRef<Earned>(NOTHING);
  const still = useReducedMotion() ?? false;

  // The game's music while the stage is up; App picks the map's back up after.
  const music = useSettingsStore((s) => s.music);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  useEffect(() => {
    playMusic(def.music);
  }, [def.music, music, musicVolume]);

  // Found, for the 📜 Menu's list.
  useEffect(() => {
    if (!useSaveStore.getState().save?.flags[openedFlag(game)]) setFlag(openedFlag(game));
  }, [game, setFlag]);

  const leave = useCallback(() => sendFlow({ type: 'CLOSE' }), []);

  function pickBand(b: Band) {
    setBand(b);
    rememberBand(kidId, game, b);
  }

  const onPage = useCallback(
    (page: string, label: string): boolean => {
      const box: { c: Claim | null } = { c: null };
      update((s) => {
        box.c = claimPage(s, game, page);
        return box.c.save;
      });
      const c = box.c;
      if (!c || c.pages.length === 0) return false;
      if (c.xp > 0) void addXp(c.xp);
      earned.current = add(earned.current, c, [label]);
      return true;
    },
    [update, game, addXp],
  );

  const onFinish = useCallback(
    (outcome: RoundOutcome) => {
      const box: { c: Claim | null } = { c: null };
      update((s) => {
        box.c = claimRound(s, game);
        return box.c.save;
      });
      const c = box.c;
      // Any XP counts the day (addXp does it); a replay that pays nothing still played (§3.4).
      if (c && c.xp > 0) void addXp(c.xp);
      else void recordActivity();
      const total = c ? add(earned.current, c) : earned.current;
      earned.current = NOTHING;
      setReward({ ...outcome, ...total });
      setPhase('reward');
      sfx('victory');
      if (!still) confetti({ particleCount: 90, spread: 75, origin: { y: 0.35 }, disableForReducedMotion: true });
    },
    [update, game, addXp, recordActivity, still],
  );

  function playAgain() {
    setRound((r) => r + 1);
    setReward(null);
    setPhase('play');
  }

  const stars = starsEarned(flags, game);
  const found = pagesFound(flags, game).length;

  return (
    <ModalLayer label={def.name} onEscape={leave} focusKey={`${phase}:${round}`} className="fixed inset-0 z-40 bg-[#120f2e] text-white">
      <motion.div
        data-testid="minigame-stage"
        className="absolute inset-0 flex flex-col overflow-hidden"
        initial={still ? { opacity: 0 } : { clipPath: 'circle(0% at 50% 58%)' }}
        animate={still ? { opacity: 1 } : { clipPath: 'circle(150% at 50% 58%)' }}
        transition={{ duration: (still ? 200 : ZOOM_MS) / 1000, ease: 'easeOut' }}
      >
        {phase === 'title' && (
          <TitleCard
            def={def}
            band={band}
            suggested={suggested}
            level={level}
            found={found}
            stars={stars}
            onBand={pickBand}
            onPlay={() => setPhase('play')}
            onBack={leave}
          />
        )}
        {phase === 'play' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <StageHeader def={def} stars={stars} onBack={leave} />
            <PlayArea def={def} band={band} round={round} onPage={onPage} onFinish={onFinish} />
          </div>
        )}
        {phase === 'reward' && reward && (
          <RewardScreen def={def} reward={reward} stars={stars} still={still} onAgain={playAgain} onBack={leave} />
        )}
      </motion.div>
    </ModalLayer>
  );
}

/** The game's own file, loaded the first time it's played; a load that fails says so here, with Try again and Back. */
function PlayArea({
  def,
  band,
  round,
  onPage,
  onFinish,
}: {
  def: MiniGameDef;
  band: Band;
  round: number;
  onPage: (page: string, label: string) => boolean;
  onFinish: (o: RoundOutcome) => void;
}) {
  const screens = GAME_SCREENS[def.id];
  const [attempt, setAttempt] = useState(0);
  const loaded = useCallback(() => setAttempt((n) => n + 1), []);
  return (
    <LazyBoundary key={attempt} failed={<PlayDidNotLoad def={def} onLoaded={loaded} />}>
      <Suspense
        fallback={
          <p role="status" className="m-auto text-lg text-[#c9c5f2]">
            Opening the {def.name}…
          </p>
        }
      >
        <screens.Play.Component key={round} def={def} band={band} round={round} onPage={onPage} onFinish={onFinish} />
      </Suspense>
    </LazyBoundary>
  );
}

function PlayDidNotLoad({ def, onLoaded }: { def: MiniGameDef; onLoaded: () => void }) {
  const { busy, words, tryAgain } = useLazyRetry(GAME_SCREENS[def.id].Play, onLoaded);
  return (
    <div className="m-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      <p role="status" className="text-lg">
        The {def.name} didn’t open. {words ?? 'Try again.'}
      </p>
      <button
        type="button"
        aria-disabled={busy || undefined}
        onClick={busy ? undefined : () => void tryAgain()}
        className={goldClass}
      >
        {busy ? 'Trying…' : 'Try again'}
      </button>
    </div>
  );
}

/**
 * 🗺️ Map · the title plate · the topic · the stars (§2.2). The way out says
 * where it goes (review round 1: a bare ← read as "undo" on a phone); on a
 * short screen the header is one slim row.
 */
function StageHeader({ def, stars, onBack }: { def: MiniGameDef; stars: number; onBack: () => void }) {
  const topic = topicInfo(def.topic);
  const title = useRef<HTMLHeadingElement>(null);
  // Focus starts at the top of the game, so a reader hears its name and Tab goes on into it.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  return (
    <header className="flex min-h-14 flex-none items-center gap-3 border-b-4 border-[#1b0f22] bg-[#1e1b4b] px-3 py-1.5 sm:px-5 [@media(max-height:500px)]:min-h-0 [@media(max-height:500px)]:py-1">
      <button type="button" onClick={onBack} aria-label="Back to the map" className={cn(outlineClass, 'min-w-11 gap-1.5 bg-[#2a2766] px-3 shadow-[0_0_0_3px_#1b0f22]')}>
        <span aria-hidden="true">🗺️</span>
        <span aria-hidden="true">Map</span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <h1 ref={title} tabIndex={-1} className={cn(pixelTitleClass, 'truncate text-[30px] focus:outline-none sm:text-[38px] [@media(max-height:500px)]:text-[28px]')}>
          {def.name}
        </h1>
        <span className="mt-1 hidden text-sm leading-none text-[#c9c5f2] sm:block [@media(max-height:500px)]:hidden">{def.place}</span>
      </div>
      <span className="hidden h-9 items-center gap-1.5 rounded-full border-[3px] border-[#1b0f22] bg-emerald-800 px-3 text-sm font-bold md:flex">
        <span aria-hidden="true">{topic.emoji}</span>
        {topic.label}
      </span>
      <Stars count={stars} size={22} className="sm:[&>svg]:h-8 sm:[&>svg]:w-8" />
    </header>
  );
}

/** The title card (§2.1): the game's name, the host's hello, how to play, the band, and Play. */
function TitleCard({
  def,
  band,
  suggested,
  level,
  found,
  stars,
  onBand,
  onPlay,
  onBack,
}: {
  def: MiniGameDef;
  band: Band;
  suggested: Band;
  level: number;
  found: number;
  stars: number;
  onBand: (b: Band) => void;
  onPlay: () => void;
  onBack: () => void;
}) {
  const { Logo, steps } = GAME_SCREENS[def.id];
  const topic = topicInfo(def.topic);
  // Play has focus, so Enter starts the game as the talk's button opened it —
  // set after the talk's layer has let go, and without scrolling the card down
  // to it (review round 1: a phone opened on the buttons, the name scrolled away).
  const play = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    play.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 overflow-y-auto">
      <img src={def.backdrop} alt="" aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full object-cover [image-rendering:pixelated]" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[#120f2e]/60" />
      <div className="relative m-auto w-full max-w-4xl p-3 sm:p-6">
        <div className={cn(windowClass, 'flex flex-col gap-5 bg-[#1e1b4b] p-4 sm:p-7')}>
          <div className="flex items-center gap-4">
            <span className="hidden flex-none sm:block [@media(max-height:500px)]:hidden">
              <Logo size={104} />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="self-start rounded-full border-2 border-[#1b0f22] bg-emerald-800 px-3 py-0.5 text-sm font-bold">
                <span aria-hidden="true">{topic.emoji} </span>A mini-game · {topic.label}
              </span>
              <h1 className={cn(pixelTitleClass, 'text-6xl sm:text-[84px] [@media(max-height:500px)]:text-6xl')}>{def.name}</h1>
              <span className="text-sm text-[#c9c5f2]">{def.place}</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:gap-7">
            <div className="sm:w-[300px] sm:flex-none">
              <HostBubble npcId={def.host} line={def.hello} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <h2 className={cn(pixelHeadClass, 'text-[28px]')}>How to play</h2>
              <ol className="flex flex-col gap-2.5">
                {def.steps.map((step, i) => {
                  const Art = steps[i];
                  return (
                    <li key={step.title} className="flex items-center gap-3 rounded-lg border-[3px] border-[#4b4799] bg-[#2a2766] p-2.5">
                      <span className="flex h-16 w-16 flex-none items-center justify-center rounded-md border-[3px] border-[#1b0f22] bg-[#24215a]">
                        <Art />
                      </span>
                      <span>
                        <span className="block font-pixel text-2xl leading-none tracking-wide">
                          {i + 1} · {step.title}
                        </span>
                        <span className="text-[15px] leading-snug text-[#d8d5f5]">{step.text}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <div role="group" aria-labelledby="mg-band-label" className="flex flex-wrap items-center gap-2">
            <span id="mg-band-label" className="mr-1 font-bold">
              How tricky?
            </span>
            {BANDS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={band === b}
                onClick={() => onBand(b)}
                className={cn(
                  'min-h-11 rounded-full border-[3px] px-4 font-bold',
                  band === b ? 'border-amber-300 bg-[#3d3a8a] text-white' : 'border-[#5a55a8] bg-[#24215a] text-[#d8d5f5] hover:bg-[#2f2b70]',
                  focusRing,
                )}
              >
                {BAND_LABEL[b]}
              </button>
            ))}
            <p className="basis-full text-sm text-[#c9c5f2]">
              {band === suggested
                ? `Picked from your ${topic.label} level (${level}).`
                : `Your ${topic.label} level (${level}) suggests ${BAND_LABEL[suggested]}.`}
              {def.bandNote ? ` ${def.bandNote}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 items-center rounded-full border-2 border-[#4b4799] bg-[#2a2766] px-4 text-[15px]">
              {def.collection}: {found} of {def.pages}
            </span>
            <span className="flex h-10 items-center gap-2 rounded-full border-2 border-[#4b4799] bg-[#2a2766] px-3 text-[15px]">
              <Stars count={stars} size={20} />
            </span>
          </div>
          {/* Back / Play stay in view at the card's foot while a phone scrolls it. */}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap justify-end gap-3 rounded-b-xl border-t-2 border-[#4b4799] bg-[#1e1b4b] px-4 py-3 sm:-mx-7 sm:-mb-7 sm:px-7 sm:pb-6">
            <button type="button" onClick={onBack} className={outlineClass}>
              Back
            </button>
            <button
              ref={play}
              type="button"
              onClick={onPlay}
              // A held Enter from the talk's button doesn't skip the card.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.repeat) e.preventDefault();
              }}
              className={cn(goldClass, 'text-xl')}
            >
              {def.playLabel}
            </button>
          </div>
        </div>
      </div>
      <span aria-hidden="true" className="pointer-events-none fixed bottom-4 right-4 hidden lg:block">
        <EmberSprite scale={4} />
      </span>
    </div>
  );
}

/** The reward (§2.3): what was made, the stars, what was learned, only what's new — then Play again or Back. */
function RewardScreen({
  def,
  reward,
  stars,
  still,
  onAgain,
  onBack,
}: {
  def: MiniGameDef;
  reward: RoundOutcome & Earned;
  stars: number;
  still: boolean;
  onAgain: () => void;
  onBack: () => void;
}) {
  const host = NPC_DEFS[def.host];
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const allFound = pagesFound(flags, def.id).length >= def.pages;
  // A phone's cheer is a size smaller (or a short screen's), so Ember and the host stay on the screen.
  const [scale] = useState(() => (window.matchMedia?.('(max-width: 639px), (max-height: 500px)').matches ? 3 : 4));
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  const got: string[] = [];
  if (reward.item) {
    const { emoji, name } = CONSUMABLES[reward.item];
    got.push(`${emoji} ${/^[AEIOU]/i.test(name) ? 'An' : 'A'} ${name}, in your bag`);
  }
  if (reward.coins > 0) got.push(`🪙 ${reward.coins} coins`);
  if (reward.xp > 0) got.push(`⭐ ${reward.xp} XP`);
  for (const n of reward.stars) got.push(n === 1 ? '🌟 A star for your first round' : n === 2 ? '🌟 A star for half the ' + def.collection : '🌟 A star for the whole ' + def.collection);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto bg-[#1e1b4b] px-3 pb-6 pt-6 sm:pt-8">
      <svg aria-hidden="true" viewBox="-100 -100 200 200" className={cn('pointer-events-none fixed left-1/2 top-[38%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2', !still && 'motion-safe:animate-[spin_60s_linear_infinite]')}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const b = ((i * 30 + 15) * Math.PI) / 180;
          // Out past the corners, so no ray's far edge shows.
          return <path key={i} d={`M0 0 L${160 * Math.cos(a)} ${160 * Math.sin(a)} L${160 * Math.cos(b)} ${160 * Math.sin(b)} Z`} fill="#26236a" />;
        })}
      </svg>
      <div className="relative flex w-full max-w-4xl flex-col items-center gap-4">
        <h1 ref={title} tabIndex={-1} className={cn(pixelTitleClass, 'text-center text-5xl focus:outline-none sm:text-7xl [@media(max-height:500px)]:text-5xl')}>
          {reward.title}
        </h1>
        <div className="flex items-end gap-6" aria-hidden="true">
          <span className={cn(!still && 'motion-safe:animate-bounce')}>
            <EmberSprite anim="cheer" scale={scale} />
          </span>
          {reward.swatch && (
            <span className="mb-4 h-20 w-20 rounded-full border-4 border-[#1b0f22] shadow-[inset_-10px_-10px_0_rgba(0,0,0,0.2)]" style={{ background: reward.swatch }} />
          )}
          {host && (
            <span className={cn(!still && 'motion-safe:animate-bounce [animation-delay:150ms]')}>
              <CharacterPortrait spriteId={npcSpriteId(host, flags)} emoji={npcEmoji(host, flags)} scale={scale} className="text-5xl" />
            </span>
          )}
        </div>
        <Stars count={stars} size={52} />
        {/* On a phone or a short screen the cards come after the buttons, so Play again is in view. */}
        <div className="order-last grid w-full gap-4 sm:order-none md:grid-cols-[1.35fr_1fr] [@media(max-height:500px)]:order-last">
          <section aria-labelledby="mg-learned" className={cn(windowClass, 'flex flex-col gap-2 p-4')}>
            <h2 id="mg-learned" className={cn(pixelHeadClass, 'text-[28px]')}>
              {reward.pages.length > 0 ? `New ${def.collection} page${reward.pages.length > 1 ? 's' : ''}!` : 'What you found out'}
            </h2>
            <p className="text-lg leading-snug">{reward.learned}</p>
            {reward.pages.length > 0 && <p className="text-[15px] text-[#d8d5f5]">Added: {reward.pages.join(', ')}.</p>}
          </section>
          <section aria-labelledby="mg-got" className={cn(windowClass, 'flex flex-col gap-2 p-4')}>
            <h2 id="mg-got" className={cn(pixelHeadClass, 'text-[28px]')}>
              {got.length > 0 ? 'You got' : 'Just for fun'}
            </h2>
            {got.length > 0 ? (
              <ul className="flex flex-col gap-1.5 text-[17px]">
                {got.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] leading-snug text-[#d8d5f5]">
                {allFound
                  ? `You’ve found every page! Now it’s just for fun — and ${host ? npcName(host, flags) : 'everyone'} is always glad of the help.`
                  : `No new page this time. Try something you haven’t tried yet — it adds a page to your ${def.collection}!`}
              </p>
            )}
          </section>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onBack} className={outlineClass}>
            Back to the map
          </button>
          <button type="button" onClick={onAgain} className={cn(goldClass, 'text-xl')}>
            {def.againLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
