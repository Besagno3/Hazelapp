import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { errorMessage, sessionRanOut } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { playerAge, MAX_SKILL_LEVEL } from '../../lib/age';
import { todayIso } from '../../lib/streak';
import { cn } from '../../lib/utils';
import {
  fetchFamilyProgress,
  glance,
  hasPlayed,
  levelSummary,
  missedQuestions,
  nameList,
  recentDays,
  storySummary,
  streakSummary,
  topicLevels,
  typingSummary,
  type Glance,
  type KidProgressData,
  type MissedQuestion,
  type RecentDay,
  type StorySummary,
  type TopicLevel,
  type TypingSummary,
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
 * track: 4.42:1 on white, 3.34:1 on the track) and the de-emphasis grey for a
 * starting level no round has measured (its own lighter grey as the track)
 * and a crystal not restored yet (3.59:1 on white).
 * Every bar has its value in words beside it, so colour never carries it alone.
 */
const FILL = 'bg-[#2a78d6]';
const TRACK = 'bg-[#cde2fb]';
const FILL_MUTED = 'bg-[#898781]';
const TRACK_MUTED = 'bg-[#e1e0d9]';

/** How many missed questions show before "Show all". */
const MISSED_FIRST = 3;

/** "1 day" / "3 days". */
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Every number on the page, one way: "1,100", "48,210" (#29 review round 1). */
const fmt = (n: number) => n.toLocaleString('en');

/** What a section shows when the part of the account it reads hasn't been saved (#29 review round 1). */
const NOT_SAVED = 'Nothing about this has been saved to your account yet. It shows here once their game saves it.';

/**
 * 👪 Grown-ups → 📈 Progress (#29): how each kid is doing — a few lines at a
 * glance, player level and XP, streak and the last week, question level per
 * topic, the story so far, the questions waiting at the Library and touch
 * typing. Read-only; loads the whole family at once (three reads) so switching
 * kids is instant. Lazy-loaded by `GrownUpsArea`, so the game's first load
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
        <KidProgress key={kid.id} kid={kid} data={data[kid.id] ?? { stats: null, save: null, playDays: null }} today={today} headingRef={kidHeading} />
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
  const levels = data.stats ? topicLevels(data.stats.skillLevels, playerAge(kid)) : null;
  const story = data.save ? storySummary(data.save) : null;
  const missed = data.save ? missedQuestions(data.save) : null;
  const week = data.playDays ? recentDays(today, data.playDays, data.stats?.lastPlayedOn ?? null) : null;
  const streak = data.stats ? streakSummary(data.stats, today) : null;
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">
        {name}'s progress
      </h2>
      <AtAGlance glance={glance(week, levels, missed)} lastPlayed={streak?.lastPlayed ?? null} levelsKnown={levels !== null || missed !== null} />
      <div className="mt-6 space-y-6">
        <LevelSection name={name} data={data} week={week} today={today} />
        <TopicSection name={name} levels={levels} />
        <StorySection name={name} story={story} />
        <MissedSection name={name} missed={missed} />
        <TypingSection name={name} typing={data.save ? typingSummary(data.save) : null} />
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
 * account says (a topic below their starting level, several questions of one
 * topic waiting at the Library), never a guess.
 */
function AtAGlance({ glance: g, lastPlayed, levelsKnown }: { glance: Glance; lastPlayed: string | null; levelsKnown: boolean }) {
  const lines: { emoji: string; text: ReactNode }[] = [];
  if (g.playedDays !== null) {
    lines.push({
      emoji: '📅',
      text:
        g.playedDays > 0
          ? `Played on ${g.playedDays} of the last 7 days.`
          : `No play noted in the last 7 days${lastPlayed ? ` — last played ${lastPlayedPhrase(lastPlayed)}` : ''}.`,
    });
  } else if (lastPlayed) {
    lines.push({ emoji: '📅', text: `Last played ${lastPlayedPhrase(lastPlayed)}.` });
  }
  if (g.furthest.length > 0) {
    lines.push({
      emoji: '🌟',
      text: `Furthest along: ${nameList(g.furthest.map((t) => t.label))} (question level ${g.furthest[0].level} of ${MAX_SKILL_LEVEL}).`,
    });
  }
  // Each topic once, with every reason it's here.
  const practise = new Map<string, string[]>();
  for (const t of g.belowStart) practise.set(t.label, ['below their starting level']);
  for (const m of g.missedByTopic) practise.set(m.label, [...(practise.get(m.label) ?? []), `${m.count} questions waiting at the Library`]);
  if (practise.size > 0) {
    const items = [...practise].map(([label, why]) => `${label} (${why.join('; ')})`);
    lines.push({ emoji: '💡', text: `To practise together: ${nameList(items, 3)}.` });
  } else if (levelsKnown) {
    lines.push({ emoji: '💡', text: 'Nothing stands out to practise right now.' });
  }
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
function Meter({ percent, muted = false }: { percent: number; muted?: boolean }) {
  return (
    <div aria-hidden="true" className={cn('h-2.5 w-full overflow-hidden rounded-[4px]', muted ? TRACK_MUTED : TRACK)}>
      <div className={cn('h-full rounded-r-[4px]', muted ? FILL_MUTED : FILL)} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

function LevelSection({ name, data, week, today }: { name: string; data: KidProgressData; week: RecentDay[] | null; today: string }) {
  const playedCount = week?.filter((d) => d.played).length ?? 0;
  const { stats } = data;
  const lv = stats ? levelSummary(stats) : null;
  const streak = stats ? streakSummary(stats, today) : null;
  return (
    <Section emoji="⭐" title="Player level and play">
      {lv && streak ? (
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
            <p className="mt-0.5 text-xs text-gray-600">
              Player level rises with XP, from right answers in rounds, battles, the Library and more, and from typing
              practice. It shows how much {name} has played and never makes questions harder — each topic's question level
              (below) does that.
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <Tile
              emoji="🔥"
              label="Streak"
              value={streak.current > 0 ? days(streak.current) : 'No streak now'}
              sub={streak.best > 0 ? `Best: ${days(streak.best)} in a row` : undefined}
            />
            <Tile emoji="📅" label="Last played" value={streak.lastPlayed ?? 'Not yet'} sub={streak.lastPlayedAgo ?? undefined} />
          </dl>
        </>
      ) : (
        <p className="text-sm text-gray-700">{NOT_SAVED}</p>
      )}
      {week && (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-semibold text-gray-600">
            <span className="uppercase tracking-wide">Last 7 days</span> · played on {playedCount} of 7
          </h4>
          <ol className="grid max-w-sm grid-cols-7 gap-0.5">
            {week.map((d) => (
              <li key={d.iso} className="flex flex-col items-center gap-1">
                <span aria-hidden="true" className={cn('text-xs', d.today ? 'font-bold text-gray-900' : 'text-gray-600')}>
                  {d.today ? 'Today' : d.short}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-6 w-full max-w-10 items-center justify-center rounded-[4px] text-xs font-bold',
                    d.played ? `${FILL} text-white` : `${TRACK} text-gray-500`,
                  )}
                >
                  {d.played ? '✓' : '·'}
                </span>
                <span className="sr-only">
                  {d.long}
                  {d.today ? ' (today)' : ''}: {d.played ? 'played' : 'no play noted'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
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

function TopicSection({ name, levels }: { name: string; levels: TopicLevel[] | null }) {
  if (!levels) {
    return (
      <Section emoji="🎯" title="Question level by topic">
        <p className="text-sm text-gray-700">{NOT_SAVED}</p>
      </Section>
    );
  }
  const measured = levels.filter((t) => t.measured);
  // Every topic not moved yet is at the starting level (it's set by age): one line for them all.
  const starting = levels.filter((t) => !t.measured);
  const start = levels[0]?.start ?? 1;
  return (
    <Section emoji="🎯" title="Question level by topic">
      <p className="mb-3 text-sm text-gray-700">
        Each topic has its own question level, 1 to {MAX_SKILL_LEVEL}: how hard its questions are for {name}'s age. Their
        starting level is {start} — where the game starts a player their age
        {start < 4 ? ' (younger players begin on easier questions on purpose, and climb as they play)' : ''}. Strong rounds
        move a topic up; hard ones bring it down slowly.
      </p>
      {measured.length > 0 && (
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {measured.map((t) => (
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
              <p className="mt-0.5 text-xs text-gray-600">{t.meaning}</p>
            </li>
          ))}
        </ul>
      )}
      {starting.length > 0 && (
        <div className={cn('rounded-xl bg-gray-50 p-3', measured.length > 0 && 'mt-4')}>
          <h4 className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-gray-800">
              Not moved yet<span className="sr-only">:</span>
            </span>{' '}
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              level {start} of {MAX_SKILL_LEVEL}
            </span>
          </h4>
          <Segments value={start} muted />
          <p className="mt-0.5 text-xs text-gray-600">{starting[0].meaning}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {starting.map((t) => (
              <li key={t.id} className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-800 ring-1 ring-gray-200">
                <span aria-hidden="true">{t.emoji} </span>
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** Ten cells, one per level, a 2 px gap between (the value is in the words above). */
function Segments({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <div aria-hidden="true" className="mt-1 flex gap-0.5">
      {Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => (
        <span
          key={i}
          className={cn('h-2.5 flex-1 rounded-[2px]', i < value ? (muted ? FILL_MUTED : FILL) : muted ? TRACK_MUTED : TRACK)}
        />
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

function StorySection({ name, story }: { name: string; story: StorySummary | null }) {
  if (!story) {
    return (
      <Section emoji="🗺️" title="Story">
        <p className="text-sm text-gray-700">{NOT_SAVED}</p>
      </Section>
    );
  }
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

function MissedSection({ name, missed }: { name: string; missed: MissedQuestion[] | null }) {
  const [all, setAll] = useState(false);
  const listId = useId();
  if (!missed) {
    return (
      <Section emoji="📚" title="Questions to practise">
        <p className="text-sm text-gray-700">{NOT_SAVED}</p>
      </Section>
    );
  }
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

function TypingSection({ name, typing }: { name: string; typing: TypingSummary | null }) {
  if (!typing) {
    return (
      <Section emoji="⌨️" title="Touch typing">
        <p className="text-sm text-gray-700">{NOT_SAVED}</p>
      </Section>
    );
  }
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
