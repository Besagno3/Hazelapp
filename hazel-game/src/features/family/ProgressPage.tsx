import { useEffect, useId, useState, type ReactNode } from 'react';
import { errorMessage, sessionRanOut } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { playerAge, MAX_SKILL_LEVEL } from '../../lib/age';
import { todayIso } from '../../lib/streak';
import { cn } from '../../lib/utils';
import {
  fetchFamilyProgress,
  hasPlayed,
  levelSummary,
  missedQuestions,
  recentDays,
  storySummary,
  streakSummary,
  topicLevels,
  typingSummary,
  type KidProgressData,
  type MissedQuestion,
  type StorySummary,
  type TopicLevel,
  type TypingSummary,
} from '../../lib/progress';
import { kidIcon } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
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

/**
 * 👪 Grown-ups → 📈 Progress (#29): how each kid is doing — level and XP,
 * streak and the last week, question level per topic, the story so far, the
 * questions waiting at the Library and touch typing. Read-only; loads the
 * whole family at once (three reads) so switching kids is instant. Lazy-loaded
 * by `GrownUpsArea`, so the game's first load doesn't carry it.
 */
export default function ProgressPage({ kidId, onBack }: { kidId: string; onBack: () => void }) {
  const kids = useFamilyStore((s) => s.kids);
  const [shown, setShown] = useState(kidId);
  const [data, setData] = useState<Record<string, KidProgressData> | null>(null);
  const [error, setError] = useState<{ words: string; signedOut: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The day the page opened: every "today" on it agrees.
  const [today] = useState(todayIso);
  const kid = kids.find((k) => k.id === shown) ?? kids[0];
  const kidIds = kids.map((k) => k.id).join(',');

  useEffect(() => {
    let live = true;
    fetchFamilyProgress(kidIds ? kidIds.split(',') : [], today).then(
      (got) => {
        if (live) setData(got);
      },
      (err: unknown) => {
        console.warn('Loading progress failed:', errorMessage(err));
        if (live) {
          setError({
            words: plainErrorOr(err, `We couldn't load their progress just now. Tap "Try again".`),
            signedOut: sessionRanOut(err),
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [kidIds, today, attempt]);

  function retry() {
    setError(null);
    setData(null);
    setAttempt((n) => n + 1);
  }

  const name = kid?.name ?? 'This player';
  const status = error ? error.words : data === null && kid ? `Loading ${name}'s progress…` : '';

  return (
    <FamilyCard extraWide focusTitle title="📈 Progress" subtitle="How your players are doing. Only grown-ups can see this.">
      <button onClick={onBack} className={cn(gateLinkClass, 'mb-2 w-auto px-1 text-left text-purple-700')}>
        ← Back to 👪 Grown-ups
      </button>
      {kids.length > 1 && <KidPicker kids={kids} shown={kid?.id ?? ''} onPick={setShown} />}
      {/* Always there, so a screen reader hears it as it changes. */}
      <div role="status" className={cn('text-sm', status ? 'my-3' : 'sr-only')}>
        {status && <p className={error ? 'text-red-700' : 'text-gray-600'}>{status}</p>}
      </div>
      {error && (
        <div className="mb-3">
          {error.signedOut ? (
            <SignInAgainButton />
          ) : (
            <button onClick={retry} className="min-h-11 rounded-lg border border-purple-300 px-4 font-semibold text-purple-700 hover:bg-purple-50">
              Try again
            </button>
          )}
        </div>
      )}
      {!kid && <p className="text-sm text-gray-600">Add a player in 👪 Grown-ups and their progress shows here.</p>}
      {kid && data && <KidProgress key={kid.id} kid={kid} data={data[kid.id] ?? { stats: null, save: null, playDays: null }} today={today} />}
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
              'flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition',
              on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-purple-50',
            )}
          >
            <span aria-hidden="true">{kidIcon(k.icon)}</span>
            <span className="max-w-[9rem] truncate">{k.name ?? 'Player'}</span>
          </button>
        );
      })}
    </div>
  );
}

function KidProgress({ kid, data, today }: { kid: Kid; data: KidProgressData; today: string }) {
  const name = kid.name ?? 'This player';
  if (!hasPlayed(data)) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
        <p className="text-3xl" aria-hidden="true">
          🌱
        </p>
        <h2 className="mt-1 font-bold text-gray-800">{name} hasn't played yet</h2>
        <p className="mt-1 text-sm text-gray-600">
          Their level, streak, story and missed questions show here after their first game.
        </p>
      </div>
    );
  }
  const age = playerAge(kid);
  return (
    <div className="space-y-6">
      <LevelSection name={name} data={data} today={today} />
      <TopicSection name={name} levels={topicLevels(data.stats?.skillLevels ?? {}, age)} />
      <StorySection name={name} story={data.save ? storySummary(data.save) : null} />
      <MissedSection name={name} missed={data.save ? missedQuestions(data.save) : []} />
      <TypingSection name={name} typing={data.save ? typingSummary(data.save) : null} />
    </div>
  );
}

/** A section with its own heading (h2), so a screen reader can jump between them. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 text-base font-bold text-purple-700">
        {title}
      </h2>
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

function LevelSection({ name, data, today }: { name: string; data: KidProgressData; today: string }) {
  const lv = levelSummary(data.stats);
  const streak = streakSummary(data.stats, today);
  const week = data.playDays ? recentDays(today, data.playDays, data.stats?.lastPlayedOn ?? null) : null;
  const playedCount = week?.filter((d) => d.played).length ?? 0;
  return (
    <Section title="⭐ Level and play">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="text-5xl font-bold leading-none text-gray-900 [@media(max-height:500px)]:text-4xl">
          <span className="sr-only">{name} is at </span>Level {lv.level}
        </p>
        <p className="pb-1 text-sm text-gray-600">{lv.totalXp.toLocaleString('en')} XP in all</p>
      </div>
      <div className="mt-3">
        <Meter percent={lv.percent} />
        <p className="mt-1 text-sm text-gray-700">
          {lv.into} of {lv.needed} XP toward level {lv.level + 1} — {lv.toNext} more to go.
        </p>
        <p className="mt-0.5 text-xs text-gray-600">XP comes from right answers out in the world. Levels never make the questions harder.</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Tile
          label="🔥 Streak"
          value={streak.current > 0 ? days(streak.current) : 'No streak now'}
          sub={streak.best > 0 ? `Best: ${days(streak.best)} in a row` : undefined}
        />
        <Tile label="📅 Last played" value={streak.lastPlayed ?? 'Not yet'} />
      </dl>
      {week && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-semibold text-gray-600">
            <span className="uppercase tracking-wide">Last 7 days</span> · played on {playedCount} of 7
          </h3>
          <ol className="grid max-w-sm grid-cols-7 gap-0.5">
            {week.map((d) => (
              <li key={d.iso} className="flex flex-col items-center gap-1">
                <span aria-hidden="true" className={cn('text-xs', d.today ? 'font-bold text-gray-900' : 'text-gray-600')}>
                  {d.today ? 'Today' : d.short}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-8 w-full max-w-10 items-center justify-center rounded-[4px] text-sm font-bold',
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
function Tile({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn('rounded-xl bg-gray-50 p-3', className)}>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold leading-tight text-gray-900">{value}</dd>
      {sub && <dd className="text-xs text-gray-600">{sub}</dd>}
    </div>
  );
}

function TopicSection({ name, levels }: { name: string; levels: TopicLevel[] }) {
  const measured = levels.filter((t) => t.measured);
  // Every topic not moved yet starts at the same level (it's set by age): one line for them all.
  const starting = levels.filter((t) => !t.measured);
  const start = starting[0]?.level ?? 0;
  return (
    <Section title="🎯 Question level by topic">
      <p className="mb-3 text-sm text-gray-700">
        Each topic has a level from 1 to {MAX_SKILL_LEVEL}, set against {name}'s age: 4 to 6 is right for a typical child
        their age. Strong rounds move it up; hard ones bring it down slowly. It's separate from their player level.
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
          <h3 className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-gray-800">
              Not moved yet<span className="sr-only">:</span>
            </span>{' '}
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              level {start} of {MAX_SKILL_LEVEL}
            </span>
          </h3>
          <Segments value={start} muted />
          <p className="mt-0.5 text-xs text-gray-600">Their starting level for their age, until a round moves it.</p>
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

function StorySection({ name, story }: { name: string; story: StorySummary | null }) {
  if (!story || story.stage === 'training') {
    const rounds = story?.practiceRounds ?? 0;
    const need = story?.roundsToOpen ?? 3;
    return (
      <Section title="🗺️ Story">
        <p className="text-sm text-gray-700">
          Still at the Training Grounds: {rounds} of {need} practice rounds passed. The world of Lumina opens after {need}.
        </p>
      </Section>
    );
  }
  return (
    <Section title="🗺️ Story">
      {story.stage === 'finished' ? (
        <p className="font-semibold text-gray-900">🎉 {name} has finished the whole story!</p>
      ) : (
        <p className="font-semibold text-gray-900">{story.actTitle}</p>
      )}
      <p className="mt-1 text-sm text-gray-700">
        Crystals restored: {story.restored} of {story.crystals.length}
        {story.stage === 'finished' ? '' : ' so far'}
      </p>
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
            <span className="text-gray-800">
              {c.crystal} <span className="text-gray-600">({c.topicLabel})</span>
              <span className="text-gray-600"> — {c.restored ? 'restored' : 'not yet'}</span>
            </span>
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
          <span aria-hidden="true">🚩 </span>Their next goal in the game: <span className="font-semibold">{story.goal}</span>
        </p>
      )}
      <h3 className="mt-3 text-sm font-semibold text-gray-800">
        <span aria-hidden="true">🏆 </span>Trophies and badges ({story.trophies.length})
      </h3>
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
    <Section title={`📚 Missed questions (${missed.length})`}>
      {missed.length === 0 ? (
        <p className="text-sm text-gray-700">
          None waiting. Questions {name} gets wrong wait at the Library in the game until they answer them again.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-700">
            Questions {name} got wrong and hasn't answered again at the Library yet, newest first.
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
  if (!typing || typing.cleared === 0) {
    return (
      <Section title="⌨️ Touch typing">
        <p className="text-sm text-gray-700">
          Not started yet. Librarian Sage teaches touch typing at the Library in Lumina Village — it needs a real keyboard.
        </p>
      </Section>
    );
  }
  return (
    <Section title="⌨️ Touch typing">
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
