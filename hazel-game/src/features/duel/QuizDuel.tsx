import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import confetti from 'canvas-confetti';
import { sendFlow } from '../../machines/gameFlow';
import { useFamilyStore } from '../../store/familyStore';
import { useProfileStore } from '../../store/profileStore';
import { usePlayerTwoStore } from '../../store/playerTwoStore';
import { useSaveStore } from '../../store/saveStore';
import { ALL_TOPIC_INFO, topicInfo } from '../../content/topics';
import { playerAge } from '../../lib/age';
import { markSeen } from '../../lib/seen';
import { pickFact } from '../../lib/funFacts';
import { cn } from '../../lib/utils';
import { kidName, playerOneSeat, playerTwoSeat, type Seat } from '../../lib/playerTwo';
import { duelScores, duelWinner, duelXp, otherSeat, DUEL_QUESTIONS_EACH, DUEL_TURNS, type BySeat, type SeatIndex } from '../../lib/duel';
import { giveKidXp, kidXpWords, xpStartsLine, xpUnknownLine, type KidXpResult } from '../../lib/kidXp';
import { useSettled } from '../../hooks/useSettled';
import { useCalmWait, FIRST_WAIT_DELAY_MS, LONG_WAIT_MS, WAIT_DELAY_MS, WAIT_MIN_MS } from '../quiz/useCalmWait';
import { SWITCH_ARM_MS, SWITCH_CONFIRM_GAP_MS } from '../auth/SwitchPlayerButton';
import { useDuelRound } from './useDuelRound';
import PlayerTwoPicker from './PlayerTwoPicker';
import FlagButton from '../../components/FlagButton';
import ScreenTopBar from '../../components/ScreenTopBar';
import type { Question, Topic } from '../../types';

/** A duel as it was played, kept for its results. */
interface DuelResult {
  asked: BySeat<Question[]>;
  answers: BySeat<boolean[]>;
  picks: BySeat<number[]>;
}

/** What a finished duel paid: each player's XP, and how Player 2's went to their profile (a sibling who earned some). */
interface DuelPay {
  xp: BySeat<number>;
  sibling: Promise<KidXpResult> | null;
}

type Stage =
  | { step: 'setup' }
  | { step: 'play'; topic: Topic; seats: BySeat<Seat>; game: number }
  | { step: 'results'; topic: Topic; seats: BySeat<Seat>; result: DuelResult; pay: DuelPay };

/**
 * Pays a finished duel's XP: the kid playing's through their profile (any XP
 * is a day played — and so is a duel that paid none), a sibling's straight to
 * theirs (`lib/kidXp.ts`). Once per duel, as it ends.
 */
function payDuel(seats: BySeat<Seat>, result: DuelResult): DuelPay {
  const xp = duelXp([seats[0].xpPerRight, seats[1].xpPerRight], result.asked, result.answers);
  const profile = useProfileStore.getState();
  if (xp[0] > 0) void profile.addXp(xp[0]);
  else void profile.recordActivity();
  const sibling = seats[1].kid && xp[1] > 0 ? giveKidXp(seats[1].kid, xp[1]) : null;
  return { xp, sibling };
}

/** Each player's colours: the kid playing sky, Player 2 amber — and always their name and emoji beside, never the colour alone. */
const SEAT_LOOK: BySeat<{ chip: string; on: string; text: string; button: string; pick: string; asker: string }> = [
  {
    chip: 'border-sky-200 bg-sky-50',
    on: 'border-sky-500 ring-4 ring-sky-200',
    text: 'text-sky-800',
    button: 'bg-sky-700 hover:bg-sky-800',
    pick: 'hover:border-sky-400',
    asker: 'bg-sky-100 text-sky-900',
  },
  {
    chip: 'border-amber-200 bg-amber-50',
    on: 'border-amber-500 ring-4 ring-amber-200',
    text: 'text-amber-900',
    button: 'bg-amber-700 hover:bg-amber-800',
    pick: 'hover:border-amber-400',
    asker: 'bg-amber-100 text-amber-900',
  },
];

const PAGE = 'min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-500 to-purple-600 px-4 pt-3 pb-6 sm:px-6 [@media(max-height:500px)]:pt-1';
const CARD = 'bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-lg [@media(max-height:500px)]:px-6 [@media(max-height:500px)]:py-4';

/**
 * 🆚 Quiz Duel (#186), from the Training Grounds: two players on one screen.
 * Pick Player 2 (`PlayerTwoPicker`) and a topic, then take turns — the kid
 * playing, then Player 2, five questions each, every question at that
 * player's own level (`lib/playerTwo.ts`) — and the most right answers wins.
 * Just for fun: no XP, no levels moved, nothing for the Library — the kid
 * playing's own rounds are where those come from.
 */
export default function QuizDuel() {
  const [stage, setStage] = useState<Stage>({ step: 'setup' });
  const kids = useFamilyStore((s) => s.kids);
  const activeKidId = useFamilyStore((s) => s.activeKidId);
  const profile = useProfileStore((s) => s.profile);
  const playerTwo = usePlayerTwoStore((s) => s.playerTwo);
  const worldOpen = useSaveStore((s) => s.save?.worldUnlocked === true);
  const oneKid = kids.find((k) => k.id === activeKidId);
  const oneName = kidName(oneKid, 'Player 1');

  function start(topic: Topic) {
    if (!playerTwo) return;
    const one = playerOneSeat(oneKid, profile, playerAge(profile), topic, worldOpen);
    setStage({ step: 'play', topic, seats: [one, playerTwoSeat(playerTwo, one, topic)], game: Date.now() });
  }

  if (stage.step === 'play') {
    return (
      <DuelPlay
        key={stage.game}
        topic={stage.topic}
        seats={stage.seats}
        onDone={(result) => setStage({ step: 'results', topic: stage.topic, seats: stage.seats, result, pay: payDuel(stage.seats, result) })}
        onEnd={() => setStage({ step: 'setup' })}
      />
    );
  }
  if (stage.step === 'results') {
    return (
      <DuelResults
        topic={stage.topic}
        seats={stage.seats}
        result={stage.result}
        pay={stage.pay}
        onRematch={() => setStage({ step: 'play', topic: stage.topic, seats: stage.seats, game: Date.now() })}
        onChange={() => setStage({ step: 'setup' })}
      />
    );
  }
  return <DuelSetup playerOne={oneName} onStart={start} />;
}

/** Who's Player 2, and the topic — the topics only once Player 2 is picked. */
function DuelSetup({ playerOne, onStart }: { playerOne: string; onStart: (topic: Topic) => void }) {
  const playerTwo = usePlayerTwoStore((s) => s.playerTwo);
  const loading = usePlayerTwoStore((s) => s.loading);
  // A sibling typing their PIN: the topics wait until they're in.
  const [asking, setAsking] = useState(false);
  return (
    <div className={PAGE}>
      <ScreenTopBar />
      <div className="flex-1 w-full flex flex-col items-center justify-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-1 text-center">
          <span aria-hidden>🆚 </span>Quiz Duel
        </h1>
        <p className="text-indigo-100 mb-5 text-center max-w-md">
          Two players take turns. Everyone gets questions at their own level — most right answers wins!
        </p>
        <div className={CARD}>
          <h2 className="text-lg font-bold text-gray-800 mb-3">Who's playing with {playerOne}?</h2>
          <PlayerTwoPicker playerOne={playerOne} onAsking={setAsking} />

          {playerTwo && !asking && (
            <section aria-labelledby="duel-topic" className="mt-6">
              <h2 id="duel-topic" className="text-lg font-bold text-gray-800 mb-3">
                Pick a topic
              </h2>
              <p role="status" className="sr-only">
                {loading ? 'One moment…' : ''}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_TOPIC_INFO.map((t) => (
                  <button
                    key={t.id}
                    aria-disabled={loading}
                    onClick={() => {
                      if (!loading) onStart(t.id);
                    }}
                    className={cn(
                      t.buttonColor,
                      'text-white rounded-xl px-3 py-3 font-bold text-sm sm:text-base shadow transition',
                      loading && 'opacity-60 cursor-wait',
                    )}
                  >
                    <span className="block text-2xl" aria-hidden>
                      {t.emoji}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <p className="mt-5 text-xs text-gray-500 text-center">{DUEL_XP_NOTE}</p>
        </div>
        <button
          onClick={() => sendFlow({ type: 'EXIT_DUEL' })}
          className="mt-4 min-h-11 px-3 text-sm font-semibold text-white/90 hover:text-white hover:underline"
        >
          ← Back to the Training Grounds
        </button>
      </div>
    </div>
  );
}

/** The two players, their scores, and whose turn it is. */
function Scoreboard({ seats, scores, active }: { seats: BySeat<Seat>; scores: BySeat<number>; active: SeatIndex | null }) {
  return (
    <ul aria-label="Score" className="grid grid-cols-2 gap-2 mb-4 [@media(max-height:500px)]:mb-2">
      {([0, 1] as const).map((s) => (
        <li
          key={s}
          data-testid={`duel-score-${s}`}
          className={cn('rounded-xl border-2 px-3 py-2 flex items-center gap-2 min-w-0 transition', SEAT_LOOK[s].chip, active === s && SEAT_LOOK[s].on)}
        >
          <span className="text-2xl" aria-hidden>
            {seats[s].icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block font-bold truncate', SEAT_LOOK[s].text)}>{seats[s].name}</span>
            {/* The thick ring and the heading under the board say whose turn it is; a screen reader hears it here too. */}
            <span className="block text-xs text-gray-600">
              {scores[s]} right{active === s && <span className="sr-only"> · their turn</span>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The duel being played: turns, the question, Next to hand over. */
function DuelPlay({
  topic,
  seats,
  onDone,
  onEnd,
}: {
  topic: Topic;
  seats: BySeat<Seat>;
  onDone: (result: DuelResult) => void;
  onEnd: () => void;
}) {
  const { turn, seat, number, question, waiting, asked, advance } = useDuelRound(topic, seats);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<BySeat<boolean[]>>([[], []]);
  const [picks, setPicks] = useState<BySeat<number[]>>([[], []]);
  // The question Next was tapped on is still sliding out: the wait hasn't begun (as the quiz, #163 review round 2).
  const [leaving, setLeaving] = useState(false);
  const waitShown = useCalmWait(waiting && !leaving, turn === 0 ? FIRST_WAIT_DELAY_MS : WAIT_DELAY_MS, WAIT_MIN_MS);
  const longShown = useCalmWait(waiting, LONG_WAIT_MS, 0);
  const q = waitShown ? null : question;
  const player = seats[seat];
  const next = seats[otherSeat(seat)];
  const isLast = turn + 1 >= DUEL_TURNS;
  const scores = duelScores(answers);

  // On screen = seen, for whoever it was asked for (#134): a family kid's are theirs.
  const shownId = q?.id ?? null;
  const seenBy = player.kid;
  useEffect(() => {
    if (shownId) markSeen(shownId, seenBy ?? undefined);
  }, [shownId, seenBy]);

  // Each new turn says whose it is, and takes the focus there: the Next just
  // tapped is gone, so a keyboard would otherwise start from the top. The
  // card's top — the scoreboard and "<name>'s turn" — comes into view first:
  // on a sideways phone they sat above the screen for the whole duel (#191).
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const top = card.current;
    if (typeof top?.scrollIntoView === 'function') {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      top.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
    heading.current?.focus({ preventScroll: true });
  }, [turn]);

  // On a small or sideways phone the 💡 explanation pushes Next below the
  // fold once an answer is picked: bring it into view (as the quiz does), and
  // give it the focus — the answer just picked is out of play (#191).
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected === null) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const raf = requestAnimationFrame(() => {
      const btn = nextButton.current;
      if (typeof btn?.scrollIntoView === 'function') btn.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      btn?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  const status = longShown
    ? 'This is taking a while. You can end the duel and pick again.'
    : waitShown
      ? `One moment… ${player.name}'s question is on its way.`
      : q
        ? `${player.name}'s turn! Question ${number + 1} of ${DUEL_QUESTIONS_EACH}.`
        : '';

  const finished = useRef(false);

  function handleAnswer(idx: number) {
    if (selected !== null || !q) return;
    setSelected(idx);
    const right = idx === q.correctIndex;
    // The kid playing's answers count in their 📈 Progress tally, as a quiz round's do (#173); Player 2's aren't theirs.
    if (seat === 0) useProfileStore.getState().noteAnswer(q, right);
    setAnswers((a) => (seat === 0 ? [[...a[0], right], a[1]] : [a[0], [...a[1], right]]));
    setPicks((p) => (seat === 0 ? [[...p[0], idx], p[1]] : [p[0], [...p[1], idx]]));
  }

  function goNext() {
    if (isLast) {
      // Once: the duel's end pays its XP.
      if (finished.current) return;
      finished.current = true;
      onDone({ asked, answers, picks });
      return;
    }
    // From this turn only: a second tap can't skip a player's question.
    advance(turn);
    setSelected(null);
    setLeaving(true);
  }

  return (
    <div className={PAGE}>
      {/* Two players on one screen: no Switch mid-duel (End duel is the way out), and not the kid playing's level beside Player 2 (#191). */}
      <ScreenTopBar badges={false} switchable={false} />
      <div className="flex-1 w-full flex items-center justify-center">
        <div ref={card} className={cn(CARD, 'scroll-mt-2')}>
          <Scoreboard seats={seats} scores={scores} active={seat} />
          <div className="flex items-baseline justify-between gap-2 mb-3 [@media(max-height:500px)]:mb-2">
            <h2 ref={heading} tabIndex={-1} className={cn('text-xl font-extrabold focus:outline-none', SEAT_LOOK[seat].text)}>
              <span aria-hidden>{player.icon} </span>
              {player.name}'s turn
            </h2>
            <span className="text-sm text-gray-500 shrink-0">
              {number + 1}/{DUEL_QUESTIONS_EACH}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-3 [@media(max-height:500px)]:mb-2">
            {topicInfo(topic).label} · Lvl {player.skillLevel}
          </p>

          {/* In the page and empty at first, so a screen reader hears what's put in it. */}
          <p role="status" data-testid="duel-status" className="sr-only">
            {status}
          </p>

          <AnimatePresence mode="wait" onExitComplete={() => setLeaving(false)}>
            {!q ? (
              <motion.div
                key="waiting"
                data-testid="duel-waiting"
                exit={{ opacity: 0, transition: { duration: 0 } }}
                className="min-h-[18rem] flex flex-col items-center justify-center text-center [@media(max-height:500px)]:min-h-[14rem]"
              >
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: waitShown || longShown ? 1 : 0, transition: { duration: waitShown || longShown ? 0.2 : 0 } }}
                  className="flex flex-col items-center"
                >
                  {longShown ? (
                    <p className="text-lg font-semibold text-gray-700">This is taking a while.</p>
                  ) : (
                    <>
                      <span className="w-9 h-9 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin motion-reduce:animate-none" />
                      <p className="mt-4 text-lg font-semibold text-gray-700">One moment…</p>
                      <p className="mt-1 text-sm text-gray-500">{player.name}'s question is on its way!</p>
                    </>
                  )}
                </motion.div>
              </motion.div>
            ) : (
              <DuelQuestion
                key={`${turn}-${q.id}`}
                q={q}
                seat={seat}
                player={player}
                selected={selected}
                nextLabel={isLast ? 'See who won! 🏆' : `Next: ${next.name}'s turn →`}
                onAnswer={handleAnswer}
                onNext={goNext}
                nextButton={nextButton}
              />
            )}
          </AnimatePresence>

          <EndDuelButton onEnd={onEnd} />
        </div>
      </div>
    </div>
  );
}

/** A turn's question, its answers, and Next once one is picked — inert while it slides out (as the quiz's). */
function DuelQuestion({
  q,
  seat,
  player,
  selected,
  nextLabel,
  onAnswer,
  onNext,
  nextButton,
}: {
  q: Question;
  seat: SeatIndex;
  /** Whose question it is — said on the question too, so the next player knows it's theirs wherever the page sits (#191). */
  player: Seat;
  selected: number | null;
  nextLabel: string;
  onAnswer: (idx: number) => void;
  onNext: () => void;
  nextButton: RefObject<HTMLButtonElement>;
}) {
  const isPresent = useIsPresent();
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (isPresent) card.current?.removeAttribute('inert');
    else card.current?.setAttribute('inert', '');
  }, [isPresent]);
  const right = selected !== null && selected === q.correctIndex;

  return (
    <motion.div ref={card} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }}>
      <p
        data-testid="duel-asker"
        className={cn(
          'inline-block rounded-full px-3 py-0.5 mb-2 text-sm font-extrabold [@media(max-height:500px)]:mb-1 [@media(max-height:500px)]:text-xs',
          SEAT_LOOK[seat].asker,
        )}
      >
        <span aria-hidden>{player.icon} </span>
        {player.name}'s question
      </p>
      <h3 className="text-lg sm:text-xl font-semibold mb-4 min-h-[3.5rem] [@media(max-height:500px)]:mb-2 [@media(max-height:500px)]:min-h-0">{q.text}</h3>
      <div className="space-y-2.5 [@media(max-height:500px)]:space-y-2">
        {q.options.map((opt, idx) => {
          let cls = 'w-full text-left border-2 rounded-lg px-4 py-3 [@media(max-height:500px)]:py-2.5 transition font-medium ';
          if (selected === null) cls += `border-gray-200 ${SEAT_LOOK[seat].pick}`;
          else if (idx === q.correctIndex) cls += 'border-green-500 bg-green-50 text-green-700';
          else if (idx === selected) cls += 'border-red-400 bg-red-50 text-red-600';
          else cls += 'border-gray-200 opacity-50';
          return (
            <button key={idx} onClick={() => onAnswer(idx)} aria-disabled={selected !== null} className={cls}>
              {opt}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('mt-3 font-bold', right ? 'text-green-700' : 'text-red-600')}>
          {right ? '✅ Right!' : '❌ Not this time.'}
        </motion.p>
      )}
      {selected !== null && q.explanation && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          💡 {q.explanation}
        </motion.p>
      )}
      {selected !== null && (
        <div className="mt-3">
          <FlagButton questionId={q.id} />
        </div>
      )}
      {selected !== null && (
        <motion.button
          ref={nextButton}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onNext}
          className={cn('mt-4 w-full text-white font-semibold rounded-lg py-2.5 transition', SEAT_LOOK[otherSeat(seat)].button)}
        >
          {nextLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

/** Ends the duel — two taps, as Switch player in the world, so a slip never ends a close game. */
function EndDuelButton({ onEnd }: { onEnd: () => void }) {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  useEffect(() => {
    if (armedAt === null) return;
    const t = setTimeout(() => setArmedAt(null), SWITCH_ARM_MS);
    return () => clearTimeout(t);
  }, [armedAt]);
  function onClick() {
    if (armedAt === null) {
      setArmedAt(Date.now());
      return;
    }
    // The second half of a double-tap isn't a yes.
    if (Date.now() - armedAt < SWITCH_CONFIRM_GAP_MS) return;
    onEnd();
  }
  return (
    <div className="mt-5 text-center [@media(max-height:500px)]:mt-3">
      <button onClick={onClick} className="text-sm text-gray-500 hover:text-gray-700 hover:underline min-h-11 px-3">
        {armedAt === null ? 'End duel' : 'Tap again to end the duel'}
      </button>
    </div>
  );
}

/** Who earns what in a duel, said on the setup and results screens. */
export const DUEL_XP_NOTE = 'Family players earn XP for right answers. Question levels stay as they are, and guests play just for fun.';

/** One player's XP line on the results: what they earned, and where Player 2's went. */
function XpLine({ seat, s, xp, sibling }: { seat: Seat; s: SeatIndex; xp: number; sibling: Promise<KidXpResult> | null }) {
  const saved = useSettled(sibling);
  if (xp > 0) {
    return (
      <li className={cn('font-semibold', SEAT_LOOK[s].text)}>
        <span aria-hidden="true">{seat.icon} </span>
        {seat.name}: +{xp} XP
        {sibling && <span className="block text-xs font-normal text-gray-600">{kidXpWords(seat.name, saved)}</span>}
      </li>
    );
  }
  // A family kid whose world isn't open yet: XP starts there (#122) — or whose save couldn't be read.
  const family = s === 0 || seat.kid !== null;
  if (family && seat.worldOpen !== true) {
    return (
      <li className="text-gray-600">
        <span aria-hidden="true">{seat.icon} </span>
        {seat.worldOpen === null ? xpUnknownLine(seat.name) : xpStartsLine(seat.name)}
      </li>
    );
  }
  return null;
}

/** Who won, both scores, the XP each earned, what each missed, and the way on. */
function DuelResults({
  topic,
  seats,
  result,
  pay,
  onRematch,
  onChange,
}: {
  topic: Topic;
  seats: BySeat<Seat>;
  result: DuelResult;
  pay: DuelPay;
  onRematch: () => void;
  onChange: () => void;
}) {
  const scores = duelScores(result.answers);
  const winner = duelWinner(scores);
  const [fact] = useState(() => pickFact(topic).replace(/^Did you know\?\s*/, ''));
  useEffect(() => {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  }, []);
  // The heading takes the focus as the results open (the last Next is gone).
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const title = winner === 'tie' ? "It's a tie!" : `${seats[winner].name} wins!`;
  const cheer =
    winner === 'tie'
      ? `You both got ${scores[0]} right. What a match!`
      : `${scores[winner]} to ${scores[otherSeat(winner)]}. Great try, ${seats[otherSeat(winner)].name}!`;

  return (
    <div className={PAGE}>
      <ScreenTopBar badges={false} />
      <div className="flex-1 w-full flex items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={CARD}>
          <div className="text-center mb-4">
            <div className="text-6xl mb-2 [@media(max-height:500px)]:text-4xl" aria-hidden>
              {winner === 'tie' ? '🤝' : '🏆'}
            </div>
            <h2 ref={heading} tabIndex={-1} className="text-2xl font-extrabold text-gray-800 focus:outline-none">
              {title}
            </h2>
            <p className="mt-1 text-gray-600">{cheer}</p>
          </div>

          <Scoreboard seats={seats} scores={scores} active={null} />

          <ul aria-label="XP earned" aria-live="polite" className="mb-4 space-y-1 text-sm empty:hidden">
            {([0, 1] as const).map((s) => (
              <XpLine key={s} seat={seats[s]} s={s} xp={pay.xp[s]} sibling={s === 1 ? pay.sibling : null} />
            ))}
          </ul>

          {([0, 1] as const).map((s) => {
            const missed = result.asked[s]
              .map((question, i) => ({ question, picked: result.picks[s][i], right: result.answers[s][i] }))
              .filter((m) => m.right === false);
            if (missed.length === 0) return null;
            return (
              <details key={s} className="mb-3 rounded-lg border border-gray-200 p-3 text-sm">
                <summary className={cn('cursor-pointer font-semibold', SEAT_LOOK[s].text)}>
                  What {seats[s].name} missed ({missed.length})
                </summary>
                <ul className="mt-2 space-y-3">
                  {missed.map(({ question, picked }) => (
                    <li key={question.id}>
                      <p className="font-medium text-gray-800 mb-1">{question.text}</p>
                      {picked !== undefined && (
                        <p className="text-red-600">
                          Picked: <span className="font-medium">{question.options[picked]}</span>
                        </p>
                      )}
                      <p className="text-green-700">
                        Correct: <span className="font-medium">{question.options[question.correctIndex]}</span>
                      </p>
                      {question.explanation && <p className="text-gray-500 mt-1">💡 {question.explanation}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}

          <p className="mb-4 rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-900">
            <span aria-hidden="true">🌟 </span>
            <span className="font-semibold">Did you know?</span> {fact}
          </p>

          <div className="flex flex-col gap-2">
            <button onClick={onRematch} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg px-6 py-2.5 transition">
              🔁 Rematch
            </button>
            <button
              onClick={onChange}
              className="w-full border-2 border-purple-200 hover:border-purple-400 text-purple-800 font-semibold rounded-lg px-6 py-2 transition"
            >
              New players or topic
            </button>
            <button onClick={() => sendFlow({ type: 'EXIT_DUEL' })} className="w-full min-h-11 text-sm text-gray-600 hover:underline py-1.5">
              Back to the Training Grounds
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500 text-center">{DUEL_XP_NOTE}</p>
        </motion.div>
      </div>
    </div>
  );
}
