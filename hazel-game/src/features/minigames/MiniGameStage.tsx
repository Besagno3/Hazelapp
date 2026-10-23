import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import ModalLayer from '../../components/ModalLayer';
import LazyBoundary from '../../components/LazyBoundary';
import ErrorDetails from '../../components/ErrorDetails';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { BAND_LABEL, MINIGAMES, PLAY_BANDS, openedFlag, sealFlag, type MiniGameDef, type MiniGameId, type PlayBand } from '../../content/minigames';
import { CONSUMABLES, type ConsumableId } from '../../content/items';
import { NPC_DEFS, npcEmoji, npcName, npcSpriteId } from '../../content/npcs';
import { topicInfo } from '../../content/topics';
import { playerAge, skillLevelFor } from '../../lib/age';
import { playMusic, sfx } from '../../lib/audio';
import { useLazyRetry } from '../../lib/lazyRetry';
import { bandFor, claimPage, claimRound, forgetBand, noteRoundPlayed, pagesFound, rememberBand, rememberedBand, roundsPlayed, starsEarned, type Claim } from '../../lib/minigames';
import { cn } from '../../lib/utils';
import { sendFlow } from '../../machines/gameFlow';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { useSettingsStore } from '../../store/settingsStore';
import { GAME_SCREENS } from './games';
import { EmberSprite, HostBubble, Stars } from './parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, pixelTitleClass, windowClass } from './styles';
import type { RoundOutcome } from './types';
// Listening for the last input from the stage's load, so a key on the title card counts (`lastInputWasKey`).
import './lastInput';

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

/**
 * The Expert seal on a round's reward (§8.3): won this round — the first time,
 * or again — or won before and not this time (PR 11 code review round 1: "spot
 * on every time wins the seal" to a kid who held it).
 */
type Seal = 'new' | 'again' | 'held' | null;

function join(a: Earned, b: Earned): Earned {
  return { pages: [...a.pages, ...b.pages], xp: a.xp + b.xp, coins: a.coins + b.coins, stars: [...a.stars, ...b.stars], item: a.item ?? b.item };
}

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
  const age = playerAge(profile);
  const level = skillLevelFor(profile?.skillLevels ?? {}, def.topic, age);
  // From the level and the age (§8.2): a teen is offered Expert where the game has it, not Medium.
  const suggested = bandFor(level, age, !!def.expert);
  const [band, setBand] = useState<PlayBand>(() => rememberedBand(kidId, game) ?? suggested);
  const [phase, setPhase] = useState<Phase>('title');
  // Where this kid's orders pick up: a visit doesn't start over on the same first round (review round 2).
  const [round, setRound] = useState(() => roundsPlayed(kidId, game));
  const [reward, setReward] = useState<(RoundOutcome & Earned & { seal: Seal }) | null>(null);
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

  function pickBand(b: PlayBand) {
    setBand(b);
    // The suggested band isn't a choice to keep: it follows the kid's level as that grows.
    if (b === suggested) forgetBand(kidId, game);
    else rememberBand(kidId, game, b);
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

  // A round's pay, once: by `onClaim` before the reward (kept if the kid leaves first), or as it shows.
  const claimed = useRef<Earned | null>(null);
  const onClaim = useCallback(() => {
    if (claimed.current) return;
    const box: { c: Claim | null } = { c: null };
    update((s) => {
      box.c = claimRound(s, game);
      return box.c.save;
    });
    const c = box.c;
    // Any XP counts the day (addXp does it); a replay that pays nothing still played (§3.4).
    if (c && c.xp > 0) void addXp(c.xp);
    else void recordActivity();
    claimed.current = c ? add(earned.current, c) : earned.current;
    earned.current = NOTHING;
    noteRoundPlayed(kidId, game);
  }, [update, game, addXp, recordActivity, kidId]);

  const onFinish = useCallback(
    (outcome: RoundOutcome) => {
      onClaim();
      const total = join(claimed.current ?? NOTHING, earned.current);
      claimed.current = null;
      earned.current = NOTHING;
      // The Expert seal (§8.3): a save flag, shown, never paid.
      const spot = band === 'expert' ? outcome.spotOn : undefined;
      const sealed = !!spot && spot.of > 0 && spot.right === spot.of;
      const had = !!useSaveStore.getState().save?.flags[sealFlag(game)];
      if (sealed && !had) setFlag(sealFlag(game));
      setReward({ ...outcome, spotOn: spot, ...total, seal: sealed ? (had ? 'again' : 'new') : spot && had ? 'held' : null });
      setPhase('reward');
      sfx('victory');
      if (!still) confetti({ particleCount: 90, spread: 75, origin: { y: 0.35 }, disableForReducedMotion: true });
    },
    [onClaim, still, band, game, setFlag],
  );

  // The reward's confetti doesn't fall on into the next round, or over the map (review round 2).
  useEffect(
    () => () => {
      confetti.reset();
    },
    [],
  );

  function playAgain() {
    confetti.reset();
    setRound((r) => r + 1);
    setReward(null);
    setPhase('play');
  }

  const stars = starsEarned(flags, game);
  const found = pagesFound(flags, game).length;

  return (
    // The title card is described by the host's hello and how to play, read as focus lands on Play (review round 2).
    // The layer itself is clear: the round window grows over the map (§2.1), not over a dark screen.
    <ModalLayer
      label={def.name}
      onEscape={leave}
      focusKey={`${phase}:${round}`}
      describedBy={phase === 'title' ? 'mg-hello mg-how' : undefined}
      // touch-manipulation: quick taps on a slice or a + never zoom the page (review round 2).
      className="fixed inset-0 z-40 touch-manipulation text-white"
    >
      <motion.div
        data-testid="minigame-stage"
        className="absolute inset-0 flex flex-col overflow-hidden bg-[#120f2e]"
        initial={still ? { opacity: 0 } : { clipPath: 'circle(0% at 50% 58%)' }}
        animate={still ? { opacity: 1 } : { clipPath: 'circle(150% at 50% 58%)' }}
        transition={{ duration: (still ? 200 : ZOOM_MS) / 1000, ease: 'easeOut' }}
      >
        {phase === 'title' && (
          <TitleCard
            def={def}
            band={band}
            suggested={suggested}
            byLevel={bandFor(level)}
            level={level}
            found={found}
            stars={stars}
            sealed={!!flags[sealFlag(game)]}
            onBand={pickBand}
            onPlay={() => setPhase('play')}
            onBack={leave}
          />
        )}
        {phase === 'play' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <StageHeader def={def} stars={stars} onBack={leave} />
            <PlayArea def={def} band={band} round={round} onPage={onPage} onFinish={onFinish} onClaim={onClaim} onBack={leave} />
          </div>
        )}
        {phase === 'reward' && reward && (
          <RewardScreen def={def} reward={reward} stars={stars} still={still} onAgain={playAgain} onBack={leave} />
        )}
      </motion.div>
    </ModalLayer>
  );
}

/**
 * The game's own file, loaded the first time it's played; a load that fails
 * says so here, with Try again and 🗺️ Map (once Try again brings it, the game
 * takes the focus where it starts, as on any first load). A bug in the game
 * stays on the stage too (review round 2: it took the whole world to the crash
 * screen).
 */
function PlayArea({
  def,
  band,
  round,
  onPage,
  onFinish,
  onClaim,
  onBack,
}: {
  def: MiniGameDef;
  band: PlayBand;
  round: number;
  onPage: (page: string, label: string) => boolean;
  onFinish: (o: RoundOutcome) => void;
  onClaim: () => void;
  onBack: () => void;
}) {
  const screens = GAME_SCREENS[def.id];
  const [attempt, setAttempt] = useState(0);
  const loaded = useCallback(() => setAttempt((n) => n + 1), []);
  return (
    <LazyBoundary key={attempt} failed={<PlayDidNotLoad def={def} onLoaded={loaded} />} crashed={(error) => <PlayCrashed def={def} error={error} onBack={onBack} />}>
      <Suspense
        fallback={
          <p role="status" className="m-auto text-lg text-[#c9c5f2]">
            Opening the {def.name}…
          </p>
        }
      >
        <screens.Play.Component key={round} def={def} band={band} round={round} onPage={onPage} onFinish={onFinish} onClaim={onClaim} />
      </Suspense>
    </LazyBoundary>
  );
}

/** A bug in the game's own screen: said here, with the way back to the map; the error folded for grown-ups. */
function PlayCrashed({ def, error, onBack }: { def: MiniGameDef; error: Error; onBack: () => void }) {
  return (
    <div className="m-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      <p role="status" className="text-lg">
        Something went wrong in the {def.name}. Everything you found is saved.
      </p>
      <div className="w-full rounded-lg bg-white px-3 py-1">
        <ErrorDetails error={error} />
      </div>
      <button type="button" onClick={onBack} aria-label="Back to the map" className={goldClass}>
        <span aria-hidden="true">🗺️ Map</span>
      </button>
    </div>
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
  // Focus starts at the top of the game while its file loads; the game then
  // moves it to where it starts (Potion Lab: the jars, with the order).
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  return (
    <header className="flex min-h-14 flex-none items-center gap-3 border-b-4 border-[#1b0f22] bg-[#1e1b4b] px-3 py-1.5 sm:px-5 [@media(max-height:500px)]:min-h-0 [@media(max-height:500px)]:py-1">
      <button type="button" onClick={onBack} aria-label="Back to the map" className={cn(outlineClass, 'min-w-11 gap-1.5 bg-[#2a2766] px-3 shadow-[0_0_0_3px_#1b0f22]')}>
        <span aria-hidden="true">🗺️ Map</span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        {/* A long name wraps, smaller on a phone, rather than run under 🗺️ Map and the stars (PR 3 review round 1); each size
            names its own range, so the smallest isn't overridden by the next (round 2). */}
        <h1
          ref={title}
          tabIndex={-1}
          className={cn(
            pixelTitleClass,
            'max-w-full text-center text-[30px] leading-none [text-wrap:balance] focus:outline-none sm:text-[38px] [@media(max-height:500px)]:text-[28px] [@media(min-width:360px)_and_(max-width:419px)]:text-[24px] [@media(max-width:359px)]:text-[22px]',
          )}
        >
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
  byLevel,
  level,
  found,
  stars,
  sealed,
  onBand,
  onPlay,
  onBack,
}: {
  def: MiniGameDef;
  band: PlayBand;
  suggested: PlayBand;
  /** The band the level alone suggests: where the age raised it, the note says so. */
  byLevel: PlayBand;
  level: number;
  found: number;
  stars: number;
  /** The Expert seal won (§8.3). */
  sealed: boolean;
  onBand: (b: PlayBand) => void;
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
      <div className="relative m-auto w-full max-w-4xl p-3 sm:p-6 sm:[@media(max-height:900px)]:py-3">
        <div className={cn(windowClass, 'flex flex-col gap-5 bg-[#1e1b4b] p-4 sm:p-7 sm:[@media(max-height:900px)]:gap-4 sm:[@media(max-height:900px)]:pt-5')}>
          <div className="flex items-center gap-4">
            <span className="hidden flex-none sm:block [@media(max-height:500px)]:hidden">
              <Logo size={104} />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="self-start rounded-full border-2 border-[#1b0f22] bg-emerald-800 px-3 py-0.5 text-sm font-bold">
                <span aria-hidden="true">{topic.emoji} </span>A mini-game · {topic.label}
              </span>
              <h1 className={cn(pixelTitleClass, 'text-6xl sm:text-[84px] sm:[@media(min-height:501px)_and_(max-height:900px)]:text-[72px] [@media(max-height:500px)]:text-6xl')}>{def.name}</h1>
              <span className="text-sm text-[#c9c5f2]">{def.place}</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:gap-7">
            <div className="sm:w-[300px] sm:flex-none">
              {/* On Expert, a teen's hello and how it's played (PR 11 UX review round 1). */}
              <HostBubble npcId={def.host} line={band === 'expert' && def.expert ? def.expert.hello : def.hello} id="mg-hello" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <h2 className={cn(pixelHeadClass, 'text-[28px]')}>How to play</h2>
              <ol id="mg-how" className="flex flex-col gap-2.5">
                {(band === 'expert' && def.expert ? def.expert.steps : def.steps).map((step, i) => {
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
            {/* Its own line on a phone, so four bands sit two by two (PR 11 UX review round 1: 1/2/1 at 320 px). */}
            <span id="mg-band-label" className="mr-1 basis-full font-bold sm:basis-auto">
              How tricky?
            </span>
            {/* Expert where the game has it (§8). */}
            {PLAY_BANDS.filter((b) => b !== 'expert' || def.expert).map((b) => (
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
              {/* Where the age lifted it, said so — the level alone suggesting less (PR 11 UX review round 1: "Picked from your
                  level (1) and your age" for Expert read oddly). */}
              {suggested === byLevel
                ? band === suggested
                  ? `Picked from your ${topic.label} level (${level}).`
                  : `Your ${topic.label} level (${level}) suggests ${BAND_LABEL[suggested]}.`
                : band === suggested
                  ? `Picked for your age — your ${topic.label} level (${level}) alone suggests ${BAND_LABEL[byLevel]}.`
                  : `For your age, ${BAND_LABEL[suggested]} — your ${topic.label} level (${level}) alone suggests ${BAND_LABEL[byLevel]}.`}
              {band === 'expert' && def.expert ? ` ${def.expert.note}` : def.bandNote ? ` ${def.bandNote}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 items-center rounded-full border-2 border-[#4b4799] bg-[#2a2766] px-4 text-[15px]">
              {def.collection}: {found} of {def.pages}
            </span>
            {/* The seal with the stars, not a pill of its own that pushed the line under the card's foot (PR 11 UX review
                round 1); what it is, said with what the stars are. */}
            <span className="flex h-10 items-center gap-2 rounded-full border-2 border-[#4b4799] bg-[#2a2766] px-3 text-[15px]">
              <Stars count={stars} size={20} />
              {sealed && (
                <>
                  <span aria-hidden="true">🏅</span>
                  <span className="sr-only">and the Expert seal</span>
                </>
              )}
            </span>
            {/* What a star is for (review round 2: star 2 came with no word of why). */}
            <p className="text-sm text-[#c9c5f2]">
              <span aria-hidden="true">🌟 </span>Stars: your first round · half the {def.collection} · the whole {def.collection}.
              {sealed && (
                <>
                  {' '}
                  <span aria-hidden="true">🏅 </span>The Expert seal: an Expert round spot on every time.
                </>
              )}
            </p>
          </div>
          {/* Back / Play stay in view at the card's foot while a phone scrolls it. */}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap justify-end gap-3 rounded-b-xl border-t-2 border-[#4b4799] bg-[#1e1b4b] px-4 py-3 sm:-mx-7 sm:-mb-7 sm:px-7 sm:pb-6">
            {/* One name for the way out, everywhere on the stage (review round 2). */}
            <button type="button" onClick={onBack} aria-label="Back to the map" className={outlineClass}>
              <span aria-hidden="true">🗺️ Map</span>
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

/** Whether a media query matches, kept up to date as the screen turns or resizes. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const change = () => setOn(m.matches);
    m.addEventListener?.('change', change);
    return () => m.removeEventListener?.('change', change);
  }, [query]);
  return on;
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
  reward: RoundOutcome & Earned & { seal: Seal };
  stars: number;
  still: boolean;
  onAgain: () => void;
  onBack: () => void;
}) {
  const host = NPC_DEFS[def.host];
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const allFound = pagesFound(flags, def.id).length >= def.pages;
  // A phone's cheer is a size smaller (or a short screen's), so Ember and the host stay on the screen — turning the phone follows.
  const small = useMedia('(max-width: 639px), (max-height: 500px)');
  // A phone on its side: smaller still, so the lesson by the buttons leaves them in view (PR 2 review round 2).
  const short = useMedia('(max-height: 500px)');
  const scale = short ? 2 : small ? 3 : 4;
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  // What's new, each with its emoji (hidden from a reader) and a short form for the line by the buttons.
  const got: { emoji: string; text: string; short: string }[] = [];
  const from = host ? npcName(host, flags) : null;
  if (reward.item) {
    const { emoji, name } = CONSUMABLES[reward.item];
    got.push({ emoji, text: `${/^[AEIOU]/i.test(name) ? 'An' : 'A'} ${name}${from ? ` from ${from}` : ''}, in your bag`, short: name });
  }
  if (reward.coins > 0) got.push({ emoji: '🪙', text: `${reward.coins} coins`, short: String(reward.coins) });
  if (reward.xp > 0) got.push({ emoji: '⭐', text: `${reward.xp} XP`, short: `${reward.xp} XP` });
  // The Expert seal won (§8.3): with what's new, so on a phone it's in the line by the buttons, not a line of its own pushing
  // them down (bench: Brew another went under the fold at 320 × 568).
  if (reward.seal === 'new') got.push({ emoji: '🏅', text: 'The Expert seal: spot on every time', short: 'Expert seal' });
  // On Expert otherwise, how many were spot on: in what was found out, and short by the buttons on a phone.
  const spot = reward.spotOn;
  const tally =
    spot && reward.seal !== 'new'
      ? reward.seal === 'again'
        ? { emoji: '🏅', text: 'Spot on every time — the Expert seal again.', short: 'Seal again' }
        : {
            emoji: '🎯',
            text: `Spot on: ${spot.right} of ${spot.of}. ${reward.seal === 'held' ? 'You won the Expert seal before — it’s yours to keep.' : 'Spot on every time wins the Expert seal.'}`,
            short: `Spot on ${spot.right} of ${spot.of}`,
          }
      : null;
  for (const n of reward.stars)
    got.push({
      emoji: '🌟',
      text: n === 1 ? 'A star for your first round' : n === 2 ? `A star for half the ${def.collection}` : `A star for the whole ${def.collection}`,
      short: 'A star',
    });
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto bg-[#1e1b4b] px-3 pb-6 pt-6 sm:pt-8 [@media(max-height:500px)]:pt-3">
      <svg aria-hidden="true" viewBox="-100 -100 200 200" className={cn('pointer-events-none fixed left-1/2 top-[38%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2', !still && 'motion-safe:animate-[spin_60s_linear_infinite]')}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const b = ((i * 30 + 15) * Math.PI) / 180;
          // Out past the corners, so no ray's far edge shows.
          return <path key={i} d={`M0 0 L${160 * Math.cos(a)} ${160 * Math.sin(a)} L${160 * Math.cos(b)} ${160 * Math.sin(b)} Z`} fill="#26236a" />;
        })}
      </svg>
      <div className="relative flex w-full max-w-4xl flex-col items-center gap-4 [@media(max-height:500px)]:gap-2">
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
          {reward.picture && <span className="mb-2">{reward.picture}</span>}
          {host && (
            <span className={cn(!still && 'motion-safe:animate-bounce [animation-delay:150ms]')}>
              <CharacterPortrait spriteId={npcSpriteId(host, flags)} emoji={npcEmoji(host, flags)} scale={scale} className="text-5xl" />
            </span>
          )}
        </div>
        <Stars count={stars} size={52} className="[@media(max-height:500px)]:[&>svg]:h-10 [@media(max-height:500px)]:[&>svg]:w-10" />
        {/* On a phone or a short screen the cards are below the fold: what was found out, and what's new, by the buttons (PR 1 / PR 2 review round 2). */}
        <p aria-hidden="true" className="max-w-xl text-center text-[17px] leading-snug sm:[@media(min-height:501px)]:hidden">
          💡 {reward.learned}
        </p>
        {(got.length > 0 || tally) && (
          <p aria-hidden="true" className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[17px] font-bold text-amber-200 sm:[@media(min-height:501px)]:hidden">
            {[...got, ...(tally ? [tally] : [])].map((g) => (
              <span key={g.text}>
                {g.emoji} {g.short}
              </span>
            ))}
          </p>
        )}
        {/* On a phone or a short screen the cards come after the buttons, so Play again is in view. */}
        <div className="order-last grid w-full gap-4 sm:order-none md:grid-cols-[1.35fr_1fr] [@media(max-height:500px)]:order-last">
          <section aria-labelledby="mg-learned" className={cn(windowClass, 'flex flex-col gap-2 p-4')}>
            <h2 id="mg-learned" className={cn(pixelHeadClass, 'text-[28px]')}>
              What you found out
            </h2>
            <p className="text-lg leading-snug">{reward.learned}</p>
            {/* New pages on their own line: one may not be the jar that filled the order (review round 2). */}
            {reward.pages.length > 0 && (
              <p className="text-[15px] font-semibold text-amber-200">
                <span aria-hidden="true">📖 </span>
                New {def.collection} page{reward.pages.length > 1 ? 's' : ''}: {reward.pages.join(', ')}.
              </p>
            )}
            {/* On Expert, how many were spot on (§8.3) — here, where there's room, not under what's new (PR 11 UX review round 1:
                it pushed the buttons off at 1366 × 650); the seal won is in that list. */}
            {tally && (
              <p className="text-[15px] font-semibold leading-snug text-amber-200">
                {tally.emoji === '🏅' && <span aria-hidden="true">🏅 </span>}
                {tally.text}
              </p>
            )}
          </section>
          <section aria-labelledby="mg-got" className={cn(windowClass, 'flex flex-col gap-2 p-4')}>
            <h2 id="mg-got" className={cn(pixelHeadClass, 'text-[28px]')}>
              {got.length > 0 ? 'You got' : 'Just for fun'}
            </h2>
            {got.length > 0 ? (
              <ul className="flex flex-col gap-1.5 text-[17px]">
                {got.map((g) => (
                  <li key={g.text}>
                    <span aria-hidden="true">{g.emoji} </span>
                    {g.text}
                  </li>
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
        {/* The buttons kept in view, on a tray at the foot where the cards run past it: Brew another was below the fold at
            1366 × 650, 1280 × 600 and 1024 × 600, the cards first there (PR 11 review round 1 bench; older than Expert). */}
        <div className="sticky bottom-0 z-10 flex w-fit max-w-full flex-wrap justify-center gap-3 rounded-2xl bg-[#1e1b4b]/90 p-2">
          <button type="button" onClick={onBack} aria-label="Back to the map" className={outlineClass}>
            <span aria-hidden="true">🗺️ Map</span>
          </button>
          <button type="button" onClick={onAgain} className={cn(goldClass, 'text-xl')}>
            {def.againLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
