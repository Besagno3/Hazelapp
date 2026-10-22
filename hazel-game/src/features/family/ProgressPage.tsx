import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { errorMessage, sessionRanOut } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { ageToStartLevel, playerAge, MAX_SKILL_LEVEL } from '../../lib/age';
import { todayIso } from '../../lib/streak';
import { cn } from '../../lib/utils';
import {
  answersNote,
  bestXpDay,
  climbedText,
  countedFromText,
  fetchFamilyProgress,
  forgetMissingProgress,
  glance,
  hasPlayed,
  levelSummary,
  minutesText,
  minutesWords,
  missedQuestions,
  nameList,
  practiseText,
  recentDays,
  sharedStart,
  storySummary,
  streakSummary,
  topicLevels,
  topicStartsOf,
  topicWeekParts,
  topicWeeks,
  typingSummary,
  windowEnd,
  xpBrief,
  xpWeeks,
  XP_WEEKS,
  type Glance,
  type KidProgressData,
  type MissedQuestion,
  type RecentDay,
  type StorySummary,
  type TopicLevel,
  type TypingSummary,
  type XpWeek,
} from '../../lib/progress';
import { kidIcon } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
import { useLiveMessage } from '../auth/useLiveMessage';
import FamilyCard from './FamilyCard';
import SignInAgainButton from './SignInAgainButton';
import { gateLinkClass } from './familyStyles';
import type { Kid } from '../../types';

/*
 * The page's chart colours (#29, the dataviz method; validated with its
 * palette script against the card's white surface — see ISSUES #29):
 * one sequential hue for magnitude (blue 450 on its own 100 step as the
 * track: 4.42:1 on white, 3.34:1 on the track), and the de-emphasis grey
 * ring for a crystal not restored yet (3.59:1 on white) — and, in the XP
 * chart (#169), the dot for a day played whose XP wasn't recorded. A played
 * day is one mark however it's known (round 3 dropped round 2's lighter
 * "streak" step). Topics not moved yet have no bar (review round 2). Every
 * bar has its value in words beside it, so colour never carries it alone.
 */
const FILL = 'bg-[#2a78d6]';
const TRACK = 'bg-[#cde2fb]';
const GREY = 'bg-[#898781]';

/** How many missed questions show before "Show all". */
const MISSED_FIRST = 3;

/** "1 day" / "3 days". */
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Every number on the page, one way: "1,100", "48,210" (#29 review round 1). */
const fmt = (n: number) => n.toLocaleString('en');

/**
 * What the page says, once under the kid's name, when a part of the account
 * it reads hasn't been saved (#29 review rounds 1–2: it said the same
 * sentence in each section) — those sections are left out.
 */
function notSavedLine(stats: boolean, save: boolean): string | null {
  const what = [!stats && 'player level and question levels', !save && 'story, questions to practise and touch typing'].filter(Boolean);
  if (what.length === 0) return null;
  return `Nothing about their ${what.join(' or their ')} has been saved to your account yet. It shows here once their game saves it.`;
}

/**
 * 👪 Grown-ups → 📈 Progress (#29): how each kid is doing — a few lines at a
 * glance, player level and XP, streak and the last week, question level per
 * topic with the week's answers (#173), XP over the last 4 weeks (#169 —
 * after the topics since review round 1: a game's currency, not what a
 * grown-up acts on), the story so far, the questions waiting at the Library
 * and touch typing.
 * Read-only; loads the whole family at once (four reads) so switching kids
 * is instant. Lazy-loaded by `GrownUpsArea`, so the game's first load
 * doesn't carry it.
 */
export default function ProgressPage({ kidId, onBack }: { kidId: string; onBack: () => void }) {
  const kids = useFamilyStore((s) => s.kids);
  const [shown, setShown] = useState(kidId);
  const [data, setData] = useState<Record<string, KidProgressData> | null>(null);
  const [error, setError] = useState<{ words: string; signedOut: boolean } | null>(null);
  // "Try again" stays where it is while it tries, so the keyboard keeps its place (#29 review round 1).
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A switch of kid, said out loud (the page below changes with nothing else to announce it).
  const [said, say] = useLiveMessage();
  // After a retry loads, the kid's heading takes the focus (the button that had it is gone).
  const kidHeading = useRef<HTMLHeadingElement>(null);
  const focusLoaded = useRef(false);
  // The day the page opened: every "today" on it agrees.
  const [today] = useState(todayIso);
  const kid = kids.find((k) => k.id === shown) ?? kids[0];
  const kidIds = kids.map((k) => k.id).join(',');

  useEffect(() => {
    let live = true;
    fetchFamilyProgress(kidIds ? kidIds.split(',') : [], today).then(
      (got) => {
        if (!live) return;
        setError(null);
        setRetrying(false);
        setData(got);
      },
      (err: unknown) => {
        console.warn('Loading progress failed:', errorMessage(err));
        if (!live) return;
        focusLoaded.current = false;
        setRetrying(false);
        setError({
          words: plainErrorOr(err, `We couldn't load their progress just now. Tap "Try again".`),
          signedOut: sessionRanOut(err),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [kidIds, today, attempt]);

  useEffect(() => {
    if (data && focusLoaded.current) {
      focusLoaded.current = false;
      kidHeading.current?.focus();
    }
  }, [data]);

  function retry() {
    // What a read found the database lacks (0026 not applied) is asked for again — it may be there now (review round 2).
    forgetMissingProgress();
    focusLoaded.current = true;
    setRetrying(true);
    setAttempt((n) => n + 1);
  }

  function pick(id: string) {
    setShown(id);
    const picked = kids.find((k) => k.id === id);
    say(`Showing ${picked?.name ?? 'this player'}'s progress.`);
  }

  const name = kid?.name ?? 'This player';
  const loading = retrying || (data === null && !error && !!kid);
  const status = loading ? `Loading ${name}'s progress…` : error ? error.words : '';

  return (
    <FamilyCard extraWide focusTitle title="📈 Progress" subtitle="How your players are doing. Only grown-ups can see this.">
      <button onClick={onBack} className={cn(gateLinkClass, 'mb-2 w-auto px-1 text-left text-purple-700')}>
        ← Back to 👪 Grown-ups
      </button>
      {kids.length > 1 && <KidPicker kids={kids} shown={kid?.id ?? ''} onPick={pick} />}
      {/* Always there, so a screen reader hears it as it changes: loading and errors shown, a switch of kid read out. */}
      <div role="status" className={cn('text-sm', status ? 'my-3' : 'sr-only')}>
        {status ? (
          <p className={error && !loading ? 'text-red-700' : 'text-gray-600'}>{status}</p>
        ) : (
          said && <p key={said.key}>{said.text}</p>
        )}
      </div>
      {error && (
        <div className="mb-3">
          {error.signedOut ? (
            <SignInAgainButton />
          ) : (
            <button
              onClick={retrying ? undefined : retry}
              aria-disabled={retrying || undefined}
              className="min-h-11 rounded-lg border border-purple-300 px-4 font-semibold text-purple-700 hover:bg-purple-50 aria-disabled:cursor-default aria-disabled:opacity-60"
            >
              {retrying ? 'Trying…' : 'Try again'}
            </button>
          )}
        </div>
      )}
      {!kid && <p className="text-sm text-gray-600">Add a player in 👪 Grown-ups and their progress shows here.</p>}
      {kid && data && !error && (
        <KidProgress key={kid.id} kid={kid} data={data[kid.id] ?? { stats: null, save: null, playDays: null, history: null, countedSince: null }} today={today} headingRef={kidHeading} />
      )}
      <button onClick={onBack} className={cn(gateLinkClass, 'mt-6 text-purple-700')}>
        ← Back to 👪 Grown-ups
      </button>
    </FamilyCard>
  );
}

/** Whose progress is shown: one toggle per kid (each 44 px tall), the page below follows. */
function KidPicker({ kids, shown, onPick }: { kids: Kid[]; shown: string; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label="Whose progress" className="mb-3 flex flex-wrap gap-2">
      {kids.map((k) => {
        const on = k.id === shown;
        return (
          <button
            key={k.id}
            aria-pressed={on}
            onClick={() => onPick(k.id)}
            className={cn(
              'flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-3xl border px-3 py-1 text-left text-sm font-semibold transition',
              on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-purple-50',
            )}
          >
            <span aria-hidden="true">{kidIcon(k.icon)}</span>
            {/* The whole name, wrapped if it must — never cut off (two long names would look alike). */}
            <span className="min-w-0 [overflow-wrap:anywhere]">{k.name ?? 'Player'}</span>
          </button>
        );
      })}
    </div>
  );
}

function KidProgress({ kid, data, today, headingRef }: { kid: Kid; data: KidProgressData; today: string; headingRef: Ref<HTMLHeadingElement> }) {
  const name = kid.name ?? 'This player';
  if (!hasPlayed(data)) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
        <p className="text-3xl" aria-hidden="true">
          🌱
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-bold text-gray-800 focus:outline-none">
          {name} hasn't played yet
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Their level, streak, story and questions to practise show here after their first game. Pick {name} on "Who's
          playing?" to start.
        </p>
      </div>
    );
  }
  const age = playerAge(kid);
  const story = data.save ? storySummary(data.save) : null;
  const missed = data.save ? missedQuestions(data.save) : null;
  const streak = data.stats ? streakSummary(data.stats, today) : null;
  // Their device's date set ahead: the days it noted can't be placed either — "not sure", like the tiles (#29 review round 3).
  const clockAhead = streak?.clockAhead ?? false;
  // Each day's play (migration 0026), where it can be placed; null on a database without it.
  const history = data.history && !clockAhead ? data.history : null;
  const days = (n: number) =>
    recentDays(today, data.playDays ?? [], data.stats?.lastPlayedOn ?? null, data.stats?.currentStreak ?? 0, {
      history,
      countedSince: data.countedSince ?? null,
      days: n,
    });
  const week = data.playDays && !clockAhead ? days(7) : null;
  const month = history ? days(XP_WEEKS * 7) : null;
  // The kid's today, as the week and the chart end on it (a day ahead when their device is — review round 2).
  const end = windowEnd(today, { playDays: data.playDays, lastPlayedOn: data.stats?.lastPlayedOn ?? null, history });
  const levels = data.stats ? topicLevels(data.stats.skillLevels, age, topicStartsOf(data), topicWeeks(history, today, end)) : null;
  // What the week's answers cover, said once above the topics (review round 2).
  const answers = history && week && levels ? answersNote(week, levels.some((t) => t.answers !== null)) : null;
  // "Days played are recorded from…" is said once (review round 1): under the week when it falls in it, else under the XP chart.
  const countedInWeek = !!week && countedFromText(week) !== null;
  const notSaved = notSavedLine(!!data.stats, !!data.save);
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">
        {name}'s progress
      </h2>
      {notSaved && <p className="mt-1 text-sm text-gray-700">{notSaved}</p>}
      {/* "Nothing stands out" only when both what it judges are known (#29 review round 2: either was enough). */}
      <AtAGlance
        glance={glance(week, levels, missed)}
        minutes={week && history ? minutesText(week) : null}
        lastPlayed={streak?.lastPlayed ?? null}
        clockAhead={clockAhead}
        judged={levels !== null && missed !== null}
      />
      <div className="mt-6 space-y-6">
        {(data.stats || week) && <LevelSection name={name} data={data} week={week} weekUnsure={clockAhead && data.playDays !== null} today={today} />}
        {levels && <TopicSection name={name} levels={levels} ageStart={ageToStartLevel(age)} answersNote={answers} />}
        {/* Not with their device's date set ahead: the glance already says "Not sure…" (review round 2). */}
        {month && <XpSection days={month} countedSaid={countedInWeek} />}
        {story && <StorySection name={name} story={story} />}
        {missed && <MissedSection name={name} missed={missed} />}
        {data.save && <TypingSection name={name} typing={typingSummary(data.save)} />}
      </div>
    </div>
  );
}

/** "today", "yesterday", "on Monday", "on 14 October" — the last day played, mid-sentence. */
function lastPlayedPhrase(words: string): string {
  if (words === 'Today' || words === 'Yesterday') return words.toLowerCase();
  return `on ${words}`;
}

/**
 * The few lines a grown-up reads first (#29 review round 1): how much they've
 * played, what's going well, and what could use a hand — only what the
 * account says (a topic against the start the game noted for it, several
 * questions of one topic waiting at the Library), never a guess. `judged`:
 * both the levels and the Library were read, so "nothing stands out" is true.
 * `clockAhead`: their device's date is set ahead, so which days they played
 * isn't known — said so, as the tiles do (#29 review round 3).
 */
function AtAGlance({
  glance: g,
  minutes,
  lastPlayed,
  clockAhead,
  judged,
}: {
  glance: Glance;
  /** How long they played in the last 7 days (#172), when the database keeps it. */
  minutes: string | null;
  lastPlayed: string | null;
  clockAhead: boolean;
  judged: boolean;
}) {
  const lines: { emoji: string; text: ReactNode }[] = [];
  if (clockAhead) {
    lines.push({ emoji: '📅', text: "Not sure which days they played — their device's date is set ahead." });
  } else if (g.playedDays !== null) {
    lines.push({
      emoji: '📅',
      text:
        g.playedDays > 0
          ? `Played on ${g.playedDays} of the last 7 days.`
          : `No play recorded in the last 7 days${lastPlayed ? ` — last played ${lastPlayedPhrase(lastPlayed)}` : ''}.`,
    });
  } else if (lastPlayed) {
    lines.push({ emoji: '📅', text: `Last played ${lastPlayedPhrase(lastPlayed)}.` });
  }
  if (minutes) lines.push({ emoji: '⏱️', text: minutes });
  const climbed = climbedText(g.climbed, g.ranked);
  if (climbed) lines.push({ emoji: '🌟', text: climbed });
  const practise = practiseText(g);
  if (practise) lines.push({ emoji: '💡', text: practise });
  else if (judged) lines.push({ emoji: '💡', text: 'Nothing stands out to practise right now.' });
  if (g.missedCount > 0) {
    lines.push({
      emoji: '📚',
      text: `${g.missedCount} ${g.missedCount === 1 ? 'question' : 'questions'} to try again at the Library (listed below).`,
    });
  }
  if (lines.length === 0) return null;
  return (
    <ul aria-label="At a glance" className="mt-2 space-y-1 rounded-xl bg-purple-50 p-3 text-sm text-gray-800">
      {lines.map((l) => (
        <li key={l.emoji} className="flex gap-2">
          <span aria-hidden="true">{l.emoji}</span>
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A section with its own heading (h3, under the kid's h2), so a screen reader can jump between them; the emoji isn't read out. */
function Section({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-2 text-base font-bold text-purple-700">
        <span aria-hidden="true">{emoji} </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A thin bar for a number against its limit; the words beside it carry the value (it's decoration for a screen reader). */
function Meter({ percent }: { percent: number }) {
  return (
    <div aria-hidden="true" className={cn('h-2.5 w-full overflow-hidden rounded-[4px]', TRACK)}>
      <div className={cn('h-full rounded-r-[4px]', FILL)} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

function LevelSection({
  name,
  data,
  week,
  weekUnsure,
  today,
}: {
  name: string;
  data: KidProgressData;
  week: RecentDay[] | null;
  /** The days were read, but their device's date is set ahead: the week is "not sure" (#29 review round 3). */
  weekUnsure: boolean;
  today: string;
}) {
  const playedCount = week?.filter((d) => d.played).length ?? 0;
  const { stats } = data;
  const lv = stats ? levelSummary(stats) : null;
  const streak = stats ? streakSummary(stats, today) : null;
  return (
    <Section emoji="⭐" title={stats ? 'Player level and play' : 'Days played'}>
      {lv && streak && (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="leading-none text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Player level</span>{' '}
              <span className="mt-1 block text-5xl font-bold [@media(max-height:500px)]:text-4xl">{fmt(lv.level)}</span>
            </p>
            <p className="pb-1 text-sm text-gray-600">{fmt(lv.totalXp)} XP in all</p>
          </div>
          <div className="mt-3">
            <Meter percent={lv.percent} />
            <p className="mt-1 text-sm text-gray-700">
              {fmt(lv.into)} of {fmt(lv.needed)} XP toward player level {fmt(lv.level + 1)} — {fmt(lv.toNext)} more to go.
            </p>
            {/* Said in half the words (#29 review round 2: six lines of small print on a phone). */}
            <p className="mt-0.5 text-xs text-gray-600">
              Player level grows with the XP {name} earns. It never makes questions harder — each topic's question level
              (below) does.
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <Tile
              emoji="🔥"
              label="Streak"
              value={streak.clockAhead ? 'Not sure' : streak.current > 0 ? days(streak.current) : 'No streak now'}
              sub={streak.best > 0 ? `Best: ${days(streak.best)} in a row` : undefined}
            />
            <Tile
              emoji="📅"
              label="Last played"
              value={streak.clockAhead ? 'Not sure' : (streak.lastPlayed ?? 'Not yet')}
              sub={streak.clockAhead ? "Their device's date is set ahead" : (streak.lastPlayedAgo ?? undefined)}
            />
          </dl>
        </>
      )}
      {weekUnsure && (
        <h4 className="mt-3 text-xs font-semibold text-gray-600">
          <span className="uppercase tracking-wide">Last 7 days</span> · not sure
        </h4>
      )}
      {week && (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-semibold text-gray-600">
            <span className="uppercase tracking-wide">Last 7 days</span> · played on {playedCount} of 7
          </h4>
          <ol className="grid max-w-sm grid-cols-7 gap-0.5">
            {week.map((d) => (
              // A day before recording began isn't read out (review round 2: a kid added today heard six "not
              // recorded"); the note under the strip says from when.
              <li key={d.iso} aria-hidden={d.counted ? undefined : true} className="flex flex-col items-center gap-1">
                <span aria-hidden="true" className={cn('text-xs', d.today ? 'font-bold text-gray-900' : 'text-gray-600')}>
                  {d.today ? 'Today' : d.short}
                </span>
                {/* Before recording began (#170): no mark at all — not "no play recorded". */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-6 w-full max-w-10 items-center justify-center rounded-[4px] text-xs font-bold',
                    d.played ? `${FILL} text-white` : d.counted ? `${TRACK} text-gray-500` : 'ring-1 ring-inset ring-gray-200',
                  )}
                >
                  {d.played ? '✓' : d.counted ? '·' : ''}
                </span>
                <span className="sr-only">
                  {d.long}
                  {d.today ? ' (today)' : ''}: {dayPlay(d)}
                </span>
              </li>
            ))}
          </ol>
          <CountedFrom days={week} />
        </div>
      )}
    </Section>
  );
}

/** A day as read out (#29, #170, #172): "played · about 15 minutes", "played", "no play recorded" or "not recorded". */
function dayPlay(d: RecentDay): string {
  if (d.played) return d.minutes !== null ? `played · ${minutesWords(d.minutes, 1)}` : 'played';
  return d.counted ? 'no play recorded' : 'not recorded';
}

/** "Days played are recorded from Tuesday 21 October." under a chart whose first days came before it (#170). */
function CountedFrom({ days }: { days: RecentDay[] }) {
  const note = countedFromText(days);
  return note ? <p className="mt-1 text-xs text-gray-600">{note}</p> : null;
}

/** Bar heights in the XP chart: the plot is 48 px tall over its 1 px baseline; a day with any XP shows at least a sliver. */
const XP_PLOT = 48;

/**
 * XP over the last 4 weeks (#169; the dataviz method): columns, one per day —
 * many days have no play, and a line would draw through them as if there
 * were — a row for each week, oldest first, its dates and its XP in words
 * beside it, one scale for all four. A day without play has no mark; a day
 * played whose XP wasn't recorded (an older app, or one only the streak
 * proves) a grey dot, keyed below, and the week's words say what its number
 * leaves out: "At least 220 XP", plain (review rounds 1–2). A week with no
 * day played is its words alone (round 2: an empty plot). Weeks wholly
 * before recording began are left out (#170), and the title says how many
 * are shown ("XP, the last 7 days" for one — a rolling week, round 2); with
 * fewer than two days of XP recorded the section is one line instead
 * (`xpBrief`). The columns are decoration for a screen reader: the week rows
 * read their totals, and the table under them has every day. `countedSaid`:
 * the week above already said "Days played are recorded from…", so it isn't
 * said twice.
 */
function XpSection({ days, countedSaid }: { days: RecentDay[]; countedSaid: boolean }) {
  const all = xpWeeks(days);
  const counted = all.filter(recorded);
  const weeks = counted.length > 0 ? counted : all.slice(-1);
  const shown = weeks.flatMap((w) => w.days);
  const span = weeks.length === 1 ? 'the last 7 days' : `the last ${weeks.length} weeks`;
  const brief = xpBrief(shown, `in ${span}`);
  const note = countedSaid ? null : countedFromText(days);
  return (
    <Section emoji="📊" title={`XP, ${span}`}>
      {brief ? (
        <div className="max-w-sm space-y-0.5 text-sm text-gray-700">
          <p>{brief}</p>
          {note && <p className="text-xs text-gray-600">{note}</p>}
        </div>
      ) : (
        <XpChart weeks={weeks} note={note} />
      )}
    </Section>
  );
}

/** Any of the week's days recorded (or played): else it came wholly before recording began (#170). */
const recorded = (w: XpWeek) => w.days.some((d) => d.counted || d.played);

/** A day of the week was played: only then does it get a plot (review round 2: an empty one for a week without play). */
const anyPlayed = (w: XpWeek) => w.days.some((d) => d.played);

/**
 * Words with a shorter twin in the table (#169): "Thu 24 Sep", "about 5 min"
 * shown, the whole words read out. The table is never wider than `max-w-sm`
 * (24rem), where the whole words wrap at any screen width (review round 1:
 * they switched on the screen's width, so a tablet's rows wrapped).
 */
function Short({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{long}</span>
    </>
  );
}

/**
 * A week's row heading: its dates, and its XP on the right — bold when it's
 * the whole week, plain when it's "At least …" (review rounds 1–2: a part in
 * bold down the edge read as a drop) — with what it leaves out on a line of
 * its own under them, left-aligned (round 2: right-aligned it wrapped into a
 * ragged block at 320 px). With no number, what's known instead, on the right.
 */
function WeekHeading({ week: w }: { week: XpWeek }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="text-gray-600">{w.label}</span>
      <span className="sr-only">: </span>
      {w.amount ? (
        <span className={cn('ml-auto text-right tabular-nums', w.partial ? 'text-gray-600' : 'font-semibold text-gray-900')}>{w.amount}</span>
      ) : (
        <span className="ml-auto text-right text-gray-600">{w.note}</span>
      )}
      {w.amount && w.note && (
        <>
          <span className="sr-only"> · </span>
          <span className="basis-full text-gray-600">{w.note}</span>
        </>
      )}
    </p>
  );
}

/** "Thu 24 Sep" (or "Today") for "Thursday 24 September". */
const shortDay = (d: RecentDay) => (d.today ? 'Today' : `${d.short} ${d.long.split(' ')[1]} ${d.long.split(' ')[2].slice(0, 3)}`);

/** "about 1 hr 20 min" for "about 1 hour 20 minutes" — a day's, to the minute. */
const shortMinutes = (m: number) => minutesWords(m, 1).replace(/ minutes?$/, ' min').replace(/ hours?/, ' hr');

/** A day's XP in words: "120 XP", "played, XP not recorded", "no play recorded", "not recorded". */
function dayXp(d: RecentDay): string {
  if (d.xp !== null) return `${fmt(d.xp)} XP`;
  if (d.played) return 'played, XP not recorded';
  return d.counted ? 'no play recorded' : 'not recorded';
}

/** "Most in a day" only with this many days of XP to pick from (review round 2: the larger of two isn't a highlight). */
const BEST_FROM = 3;

function XpChart({ weeks, note }: { weeks: XpWeek[]; note: string | null }) {
  const days = weeks.flatMap((w) => w.days);
  const best = days.filter((d) => (d.xp ?? 0) > 0).length >= BEST_FROM ? bestXpDay(days) : null;
  const max = bestXpDay(days)?.xp ?? 0;
  const unnoted = days.some((d) => d.played && d.xp === null);
  const thisWeek = weeks.at(-1)?.days ?? [];
  return (
    <div className="max-w-sm">
      {/* The weekdays over the columns, read top-down with the weeks (review round 2: under the last week only,
          they were off a sideways phone's screen while the first weeks were read). */}
      <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-0.5 text-center text-xs text-gray-600">
        {thisWeek.map((d) => (
          <span key={d.iso}>{d.short}</span>
        ))}
      </div>
      <ol aria-label="XP each week, oldest first" className="space-y-2">
        {weeks.map((w) => (
          <li key={w.label}>
            <WeekHeading week={w} />
            {/* A week with no day played is its words alone — no empty plot to scroll past. */}
            {anyPlayed(w) && (
              <div aria-hidden="true" className="mt-0.5 grid grid-cols-7 gap-0.5">
                {w.days.map((d) => (
                  <span
                    key={d.iso}
                    title={`${d.long}: ${dayXp(d)}`}
                    className={cn('flex items-end justify-center border-b', d.counted || d.played ? 'border-gray-300' : 'border-transparent')}
                    style={{ height: XP_PLOT + 1 }}
                  >
                    {d.xp !== null && d.xp > 0 && (
                      <span className={cn('w-full max-w-6 rounded-t-[4px]', FILL)} style={{ height: Math.max(3, Math.round((d.xp / max) * XP_PLOT)) }} />
                    )}
                    {d.played && d.xp === null && <span className={cn('mb-0.5 h-2 w-2 rounded-full', GREY)} />}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-2 space-y-0.5 text-xs text-gray-600">
        {/* The best of the days recorded — said so when some weren't (review round 1). */}
        {best && (
          <p>
            {unnoted ? 'Most on a recorded day' : 'Most in a day'}: {fmt(max)} XP, {best.long}.
          </p>
        )}
        {/* The key to the dots, which a screen reader doesn't get: the week rows say it in words (review round 2). */}
        {unnoted && (
          <p aria-hidden="true" className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', GREY)} />
            Played, but that day's XP wasn't recorded.
          </p>
        )}
        {note && <p>{note}</p>}
      </div>
      <XpTable weeks={weeks} />
    </div>
  );
}

/** The chart's twin (the dataviz method): every day of the 4 weeks in a table, under a fold — with the time played (#172). */
function XpTable({ weeks }: { weeks: XpWeek[] }) {
  return (
    <details className="group mt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block w-4 text-center leading-none transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ▸
        </span>
        Every day in a table
      </summary>
      <table className="mt-1 w-full text-left text-sm">
        <caption className="sr-only">XP and time played each day, the last 4 weeks, oldest first</caption>
        <thead className="text-xs text-gray-600">
          <tr>
            <th scope="col" className="py-1 pr-2 font-semibold">
              Day
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-semibold">
              XP
            </th>
            <th scope="col" className="py-1 font-semibold">
              Time played
            </th>
          </tr>
        </thead>
        {weeks.map((w) => (
          <tbody key={w.label}>
            <tr>
              <th scope="rowgroup" colSpan={3} className="border-b border-gray-200 pb-1 pt-3 text-xs font-semibold text-gray-600">
                {w.label} · {w.total}
              </th>
            </tr>
            {/* A week wholly before recording began: its heading says so, once. */}
            {recorded(w) &&
              w.days.map((d) => (
                <tr key={d.iso} className="border-b border-gray-100 align-top">
                  <th scope="row" className="py-1 pr-2 font-normal text-gray-800">
                    <Short short={shortDay(d)} long={`${d.long}${d.today ? ' (today)' : ''}`} />
                  </th>
                  {d.xp !== null ? (
                    <>
                      <td className="py-1 pr-2 text-right tabular-nums text-gray-900">{fmt(d.xp)}</td>
                      <td className="py-1 text-gray-700">
                        {d.minutes !== null ? <Short short={shortMinutes(d.minutes)} long={minutesWords(d.minutes, 1)} /> : 'not recorded'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="py-1 text-gray-600">
                      {d.played ? 'played, XP not recorded' : d.counted ? 'no play recorded' : 'not recorded'}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        ))}
      </table>
    </details>
  );
}

/** A stat tile: label, value (proportional figures, it stands alone), optional line under it. */
function Tile({ emoji, label, value, sub }: { emoji: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <dt className="text-xs font-semibold text-gray-600">
        <span aria-hidden="true">{emoji} </span>
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-bold leading-tight text-gray-900">{value}</dd>
      {sub && <dd className="text-xs text-gray-600">{sub}</dd>}
    </div>
  );
}

function TopicSection({
  name,
  levels,
  ageStart,
  answersNote,
}: {
  name: string;
  levels: TopicLevel[];
  ageStart: number;
  /** What the week's answers cover, when some days played had none recorded — said once, here (review round 2). */
  answersNote: string | null;
}) {
  const measured = levels.filter((t) => t.measured);
  // Read against where each really started (round 2) — apart from those whose start wasn't recorded, so
  // their bare levels never read as a step back from "Not moved yet" (#29 review round 3).
  const noted = measured.filter((t) => t.start !== null);
  const unnoted = measured.filter((t) => t.start === null);
  // Every topic not moved yet is at the start for their age now (it's set by age): one line for them all.
  const starting = levels.filter((t) => !t.measured);
  const answered = starting.filter((t) => t.answers !== null);
  const shared = sharedStart(levels);
  const youngStart = ageStart < 4;
  return (
    <Section emoji="🎯" title="Question level by topic">
      {/* Two or three short lines, no history of the game (#29 review round 3: it ran 7–12 lines on a phone). */}
      <p className="mb-3 text-sm text-gray-700">
        Each topic has its own question level, 1 to {MAX_SKILL_LEVEL}.{' '}
        {youngStart ? 'Young players start low on purpose, then climb.' : 'Strong rounds move it up; hard ones bring it down slowly.'}
      </p>
      {answersNote && <p className="-mt-2 mb-3 text-xs text-gray-600">{answersNote}</p>}
      {noted.length > 0 && (
        <TopicGroup
          title="Since they started"
          note={shared ? `${noted.length === 2 ? 'Both' : `All ${noted.length}`} started at level ${shared.level}, when ${name} was ${shared.age}.` : null}
          topics={noted}
        />
      )}
      {unnoted.length > 0 && (
        <TopicGroup
          title="Levels now"
          className={noted.length > 0 ? 'mt-4' : undefined}
          note={`Where these began wasn't recorded.${
            starting.length > 0 && unnoted.some((t) => t.level < ageStart)
              ? ` Any first played when ${name} was younger may have started lower than level ${ageStart}.`
              : ''
          }`}
          topics={unnoted}
        />
      )}
      {/* No bar for these (#29 review round 2): a grey bar at today's start outgrew the bars a long-time player
          earned from a lower start, as if playing had made them worse. The words carry it. */}
      {starting.length > 0 && (
        <div className={cn('rounded-xl bg-gray-50 p-3', measured.length > 0 && 'mt-4')}>
          <h4 className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-gray-800">
              Not moved yet<span className="sr-only">:</span>
            </span>{' '}
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              level {ageStart} of {MAX_SKILL_LEVEL}
            </span>
          </h4>
          <p className="mt-0.5 text-xs text-gray-600">
            Where the game starts a player {name}'s age. Each moves once they play rounds in it.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {starting.map((t) => (
              <li key={t.id} className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-800 ring-1 ring-gray-200">
                <span aria-hidden="true">{t.emoji} </span>
                {t.label}
              </li>
            ))}
          </ul>
          {/* Answered, but no round moved the level yet (#173): a gate's or a chest's questions don't save one. */}
          {answered.length > 0 && (
            <p className="mt-2 text-xs text-gray-600">
              Answered in the last 7 days:{' '}
              {nameList(answered.map((t) => `${t.label} (${t.answers?.right} of ${t.answers?.asked} right)`), Infinity)}.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/** A group of measured topics under its own small heading: its rows (bar, level, meaning, the week's answers) and a line about them all. */
function TopicGroup({ title, note, topics, className }: { title: string; note: string | null; topics: TopicLevel[]; className?: string }) {
  return (
    <div className={className}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h4>
      {note && <p className="mt-0.5 text-xs text-gray-600">{note}</p>}
      <ul className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {topics.map((t) => (
          <li key={t.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-gray-800">
                <span aria-hidden="true">{t.emoji} </span>
                {t.label}
                <span className="sr-only">:</span>
              </span>{' '}
              <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                level {t.level} of {MAX_SKILL_LEVEL}
              </span>
            </div>
            <Segments value={t.level} />
            {t.meaning && <p className="mt-0.5 text-xs text-gray-600">{t.meaning}</p>}
            <WeekLine parts={topicWeekParts(t)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A topic's week (#173) on its own line, a little apart from its meaning, and
 * "Down 2 since last week" never broken across lines (review round 1: at 320
 * px the two ran together into one grey block).
 */
function WeekLine({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-gray-600">
      {/* The "·" stays at the end of a line, never the start of the next. */}
      {parts.map((part, i) => (
        <span key={part}>
          <span className={part.endsWith('last week') ? 'whitespace-nowrap' : undefined}>{part}</span>
          {i < parts.length - 1 && '\u00a0· '}
        </span>
      ))}
    </p>
  );
}

/** Ten cells, one per level, a 2 px gap between (the value is in the words above). */
function Segments({ value }: { value: number }) {
  return (
    <div aria-hidden="true" className="mt-1 flex gap-0.5">
      {Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => (
        <span key={i} className={cn('h-2.5 flex-1 rounded-[2px]', i < value ? FILL : TRACK)} />
      ))}
    </div>
  );
}

/** "4 crystals restored so far — 1 more to find in the story they've reached." */
function crystalLine(story: StorySummary): string {
  const restored = `${story.restored} ${story.restored === 1 ? 'crystal' : 'crystals'} restored`;
  if (story.stage === 'finished') return `${restored}.`;
  if (story.left > 0) return `${restored} so far — ${story.left} more to find in the part of the story they've reached.`;
  return `${restored} — every one they've found so far.`;
}

function StorySection({ name, story }: { name: string; story: StorySummary }) {
  if (story.stage === 'training') {
    return (
      <Section emoji="🗺️" title="Story">
        <p className="text-sm text-gray-700">
          Still at the Training Grounds: {story.practiceRounds} of {story.roundsToOpen} practice rounds passed. The world of
          Lumina opens after {story.roundsToOpen}.
        </p>
      </Section>
    );
  }
  return (
    <Section emoji="🗺️" title="Story">
      {story.stage === 'finished' ? (
        <p className="font-semibold text-gray-900">
          <span aria-hidden="true">🎉 </span>
          {name} has finished the whole story!
        </p>
      ) : (
        <p className="font-semibold text-gray-900">{story.actLabel}</p>
      )}
      <p className="mt-1 text-sm text-gray-700">{crystalLine(story)}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {story.crystals.map((c) => (
          <li key={c.topic} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                c.restored ? `${FILL} text-white` : 'border-2 border-[#898781] text-transparent',
              )}
            >
              ✓
            </span>
            {c.crystal ? (
              <span className="text-gray-800">
                {c.crystal} <span className="text-gray-600">({c.topicLabel})</span>
                <span className="text-gray-600"> — {c.restored ? 'restored' : 'not yet'}</span>
              </span>
            ) : (
              <span className="text-gray-600">A crystal they haven't found yet</span>
            )}
          </li>
        ))}
      </ul>
      {story.spire !== 'hidden' && (
        <p className="mt-2 text-sm text-gray-700">
          <span aria-hidden="true">🗼 </span>Crystal Spire: {story.spire === 'cleared' ? 'climbed and won' : 'open — not climbed yet'}
        </p>
      )}
      {story.goal && (
        <p className="mt-2 text-sm text-gray-700">
          <span aria-hidden="true">🚩 </span>Next in the story: <span className="font-semibold">{story.goal}</span>
          <span className="text-gray-600"> (the goal their guide in the game shows them)</span>
        </p>
      )}
      <h4 className="mt-3 text-sm font-semibold text-gray-800">
        <span aria-hidden="true">🏆 </span>Trophies and badges ({story.trophies.length})
      </h4>
      {story.trophies.length === 0 ? (
        <p className="text-sm text-gray-600">None yet.</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {story.trophies.map((t) => (
            <li key={t.name} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-800">
              <span aria-hidden="true">{t.emoji} </span>
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MissedSection({ name, missed }: { name: string; missed: MissedQuestion[] }) {
  const [all, setAll] = useState(false);
  const listId = useId();
  const shown = all ? missed : missed.slice(0, MISSED_FIRST);
  return (
    <Section emoji="📚" title={missed.length > 0 ? `Questions to practise (${missed.length})` : 'Questions to practise'}>
      {missed.length === 0 ? (
        <p className="text-sm text-gray-700">
          None waiting right now. A question {name} gets wrong waits at the Library in the game until they answer it again.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-700">
            Questions {name} hasn't got right yet, newest first. They wait at the Library in the game, where {name} can try
            each one again. Talking one through together helps.
          </p>
          <ol id={listId} className="space-y-2">
            {shown.map((m) => (
              <li key={m.key} className="rounded-xl border border-gray-200 p-3 text-sm">
                <p className="text-xs font-semibold text-gray-600">
                  <span aria-hidden="true">{m.emoji} </span>
                  {m.topicLabel}
                </p>
                <p className="mt-1 break-words font-semibold text-gray-900">{m.question}</p>
                <p className="mt-1 break-words text-gray-800">
                  <span aria-hidden="true">✅ </span>Right answer: <span className="font-semibold">{m.rightAnswer}</span>
                </p>
                {m.theirAnswer && <p className="break-words text-gray-600">They picked: {m.theirAnswer}</p>}
                {m.timedOut && <p className="text-gray-600">Time ran out before they answered.</p>}
                {m.explanation && <p className="mt-1 break-words text-gray-600">Why: {m.explanation}</p>}
              </li>
            ))}
          </ol>
          {missed.length > MISSED_FIRST && (
            <button
              aria-expanded={all}
              aria-controls={listId}
              onClick={() => setAll((v) => !v)}
              className={cn(gateLinkClass, 'mt-1 font-semibold text-purple-700')}
            >
              {all ? 'Show fewer' : `Show all ${missed.length}`}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function TypingSection({ name, typing }: { name: string; typing: TypingSummary }) {
  if (typing.cleared === 0) {
    return (
      <Section emoji="⌨️" title="Touch typing">
        <p className="text-sm text-gray-700">
          Not started yet. Librarian Sage teaches touch typing at the Library in Lumina Village — it needs a real keyboard.
        </p>
      </Section>
    );
  }
  return (
    <Section emoji="⌨️" title="Touch typing">
      <Meter percent={(typing.cleared / typing.total) * 100} />
      <p className="mt-1 text-sm text-gray-700">
        Lessons done: {typing.cleared} of {typing.total}.{' '}
        {typing.next ? (
          <>
            Next: <span className="font-semibold">{typing.next}</span>
          </>
        ) : (
          `${name} has done every lesson.`
        )}
      </p>
      <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
        {typing.badge && (
          <li>
            <span aria-hidden="true">✍️ </span>Scribe's Quill badge earned
          </li>
        )}
        {typing.pagesCopied > 0 && (
          <li>
            <span aria-hidden="true">📜 </span>Pages copied at the Scriptorium: {typing.pagesCopied}
          </li>
        )}
        {typing.leavesBest !== null && (
          <li>
            <span aria-hidden="true">🍂 </span>Falling Leaves: {typing.leavesBest} caught in one round
          </li>
        )}
      </ul>
    </Section>
  );
}
