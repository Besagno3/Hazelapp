import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react';
import type { Kid } from '../../types';

// The database: one canned answer per table (given what the read selects), swappable per test.
const answers = vi.hoisted(() => ({} as Record<string, (select: string) => Promise<{ data: unknown; error: unknown }>>));
const reads = vi.hoisted(() => [] as string[]);
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      reads.push(table);
      let select = '';
      const chain = {
        select: (cols: string) => ((select = cols), chain),
        in: () => chain,
        gte: () => chain,
        then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          (answers[table]?.(select) ?? Promise.resolve({ data: [], error: null })).then(ok, bad),
      };
      return chain;
    },
  },
}));

const { default: ProgressPage } = await import('./ProgressPage');
const { useFamilyStore } = await import('../../store/familyStore');
const { todayIso, isoOffset } = await import('../../lib/streak');
const { dayRange, forgetMissingProgress } = await import('../../lib/progress');
const { midActTwoRow, midActTwoSave, newKidRow, trainingSave } = await import('../../test/progressFixtures');

// Ages by this year (born in January, so the birthday has passed): Sam 9, Kit 7, Ren 11.
const YEAR = new Date().getFullYear();
const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: YEAR - 9, birthMonth: 1 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'frog', hasPin: true, birthYear: YEAR - 7, birthMonth: 1 };
const ren: Kid = { id: 'kid-ren', name: 'Ren', icon: 'koala', hasPin: true, birthYear: YEAR - 11, birthMonth: 1 };

/** The hero: "Player level" over the number, read as one. */
const hero = (n: number | string) => screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === `Player level ${n}`);

const ok = (data: unknown) => () => Promise.resolve({ data, error: null });
const refuse = (code: string, message: string) => Promise.resolve({ data: null, error: { code, message } });
const today = todayIso();
/** "Monday 20 October", as the page says a day. */
const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
/** What a screen reader hears of an element: its text without the parts hidden from it. */
const heard = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
};
/** A day's play as \`play_days\` holds it (migration 0026). */
const played = (profile_id: string, back: number, xp: number, minutes: number, topics = {}) => ({ profile_id, day: isoOffset(today, -back), xp, minutes, topics });

/** A family of three: Sam mid-Act-II, Kit brand new, Ren just through one practice round. */
function family() {
  answers.profiles = ok([midActTwoRow(sam.id, today), newKidRow(kit.id), { ...newKidRow(ren.id), last_played_on: today, skill_levels: { math: 2 } }]);
  answers.saves = ok([
    { profile_id: sam.id, data: midActTwoSave() },
    { profile_id: ren.id, data: trainingSave() },
  ]);
  // Sam's play: yesterday, 3 and 4 days back (4 by an app that didn't note its play), the week before, and 20 back.
  answers.play_days = ok([
    played(sam.id, 1, 120, 25, { math: { a: 10, r: 7, l: 6 }, creativity: { a: 6, r: 2, l: 3 }, space: { a: 2, r: 1 } }),
    played(sam.id, 3, 60, 12, { science: { a: 4, r: 4, l: 8 } }),
    played(sam.id, 4, 0, 0),
    played(sam.id, 9, 200, 40, { math: { a: 5, r: 4, l: 5 }, science: { a: 2, r: 2, l: 8 }, creativity: { a: 3, r: 1, l: 4 } }),
    played(sam.id, 20, 90, 15),
  ]);
  // Counted from before the 4 weeks shown: no note.
  answers.play_history_since = ok([{ profile_id: sam.id, since: isoOffset(today, -30) }]);
}

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  reads.length = 0;
  vi.restoreAllMocks();
  forgetMissingProgress();
  useFamilyStore.setState({ kids: [sam, kit, ren] });
});

async function open(kidId = sam.id, onBack = vi.fn()) {
  render(<ProgressPage kidId={kidId} onBack={onBack} />);
  return onBack;
}

describe('📈 Progress (#29)', () => {
  it('a kid mid-Act-II: their name, at a glance, player level and XP, streak and the week, every topic, the story, eight questions to practise, typing', async () => {
    family();
    await open();
    expect(screen.getByRole('heading', { level: 1, name: '📈 Progress' })).toHaveFocus();
    await hero(12);
    // The kid's own heading, then the sections under it (review round 1).
    expect(screen.getByRole('heading', { level: 2, name: "Sam's progress" })).toBeInTheDocument();
    // XP after the topics (#89 review round 1): a game's currency, not what a grown-up acts on.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '⭐ Player level and play',
      '🎯 Question level by topic',
      '📊 XP, the last 4 weeks',
      '🗺️ Story',
      '📚 Questions to practise (8)',
      '⌨️ Touch typing',
    ]);
    // At a glance: what's going well and what to practise together — from what's stored.
    const glanceList = screen.getByRole('list', { name: 'At a glance' });
    // Days noted 1, 3 and 4 days back, and a 3-day streak to yesterday: the day 2 back is the streak's (review round 2) —
    // played, like the rest (round 3). Time & History has no noted start, so no topic is crowned "most" (round 3).
    // Minutes from the two days whose play was noted, said as theirs, not the week's (#172, #89 review round 1);
    // Creativity also under half right (#173), named first with its reasons.
    expect(within(glanceList).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '📅Played on 4 of the last 7 days.',
      "⏱️About 35 minutes of play on 2 recorded days · 2 days played weren't recorded.",
      '🌟Up since they started: Math (level 3 → 6), Science (level 4 → 8) and Nature & Animals (level 4 → 9).',
      '💡To practise together: Creativity (below their start, under half right).',
      '📚8 questions to try again at the Library (listed below).',
    ]);
    expect(screen.getByText('2,340 XP in all')).toBeInTheDocument();
    expect(screen.getByText(/80 of 375 XP toward player level 13 — 295 more to go/)).toBeInTheDocument();
    // What XP is, and that the two kinds of level differ — in two short sentences (review round 2).
    expect(screen.getByText(/Player level grows with the XP Sam earns\./)).toHaveTextContent(
      "Player level grows with the XP Sam earns. It never makes questions harder — each topic's question level (below) does.",
    );
    // Streak tile: yesterday counts.
    const tiles = screen.getAllByRole('definition').map((d) => d.textContent);
    expect(tiles).toEqual(['3 days', 'Best: 7 days in a row', 'Yesterday']);
    // The week, read out day by day.
    const weekHeading = screen.getByRole('heading', { name: /Last 7 days/ });
    expect(weekHeading).toHaveTextContent('Last 7 days · played on 4 of 7');
    const week = weekHeading.nextElementSibling as HTMLElement;
    const daysRead = within(week).getAllByRole('listitem').map((li) => li.querySelector('.sr-only')?.textContent);
    expect(daysRead).toHaveLength(7);
    // One kind of played day, read "played" (round 3: the streak's lighter ✓ and its key are gone) — with how long, where noted (#172).
    expect(daysRead.filter((t) => t?.includes(': played'))).toHaveLength(4);
    expect(daysRead[5]).toBe(`${longDay(isoOffset(today, -1))}: played · about 25 minutes`);
    expect(daysRead[3]).toBe(`${longDay(isoOffset(today, -3))}: played · about 10 minutes`);
    expect(daysRead[2]).toBe(`${longDay(isoOffset(today, -4))}: played`);
    expect(daysRead.at(-1)).toMatch(/\(today\): no play noted$/);
    expect(screen.queryByText(/streak shows|wasn't noted/)).toBeNull();
    // Every topic, in plain words, against where it really started (review round 2) — never "their starting level".
    const topicRegion = screen.getByRole('region', { name: 'Question level by topic' });
    // The intro in two short sentences, with no history of the game (round 3).
    expect(topicRegion).toHaveTextContent('Each topic has its own question level, 1 to 10. Strong rounds move it up; hard ones bring it down slowly.');
    expect(topicRegion).not.toHaveTextContent(/recent update|their starting level|above their/);
    // Time & History has no noted start: apart, under "Levels now", its level alone (round 3).
    expect(within(topicRegion).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Since they started',
      'Levels now',
      'Not moved yet: level 4 of 10',
    ]);
    const [moved, unnoted, notMoved] = within(topicRegion).getAllByRole('list');
    const topics = within(moved).getAllByRole('listitem');
    // With the last 7 days' answers and the level against the week before (#173), where the days noted them —
    // two days played this week weren't recorded, so the counts are of the days that were (#89 review round 1).
    expect(topics.map((t) => t.textContent?.replace(/\u00a0/g, ' '))).toEqual([
      '🔢 Math: level 6 of 10Up 3 from level 3, where they started at age 8Last 7 days: 7 of 10 right on recorded days · Up 1 since last week',
      '🔬 Science: level 8 of 10Up 4 from level 4, where they started at age 9 — a stretch for their ageLast 7 days: 4 of 4 right on recorded days · Same as last week',
      '⚙️ Engineering: level 4 of 10At level 4, where they started at age 9',
      '🎨 Creativity: level 3 of 10Below level 4, where they started at age 9 — a good one to practise togetherLast 7 days: 2 of 6 right on recorded days · Down 1 since last week',
      '🦋 Nature & Animals: level 9 of 10Up 5 from level 4, where they started at age 9 — for the strongest at their age',
    ]);
    expect(within(unnoted).getAllByRole('listitem').map((t) => t.textContent)).toEqual(['⏳ Time & History: level 5 of 10']);
    expect(unnoted.parentElement).toHaveTextContent("Where these began wasn't recorded.");
    expect(unnoted.parentElement).not.toHaveTextContent(/younger/);
    // The four no round has moved, in one line — and no bar (review round 2).
    const notMovedHeading = within(topicRegion).getByRole('heading', { name: 'Not moved yet: level 4 of 10' });
    expect(notMovedHeading.parentElement?.querySelector('[aria-hidden="true"].flex')).toBeNull();
    expect(notMovedHeading.parentElement).toHaveTextContent("Where the game starts a player Sam's age. Each moves once they play rounds in it.");
    expect(within(notMoved).getAllByRole('listitem').map((t) => t.textContent)).toEqual([
      '📚 Words & Stories',
      '🪐 Space',
      '🧭 Maps & Places',
      '🎸 Music',
    ]);
    // Answered at a gate or a chest, but no round moved its level yet (#173).
    expect(notMovedHeading.parentElement).toHaveTextContent('Answered in the last 7 days, on recorded days: Space (1 of 2 right).');
    // "Down 1 since last week" never breaks across lines (#89 review round 1).
    expect(within(moved).getByText('Down 1 since last week')).toHaveClass('whitespace-nowrap');
    // The story: "Act II" only, the crystals the game has named, never one it hasn't (review round 1).
    const story = screen.getByRole('region', { name: 'Story' });
    expect(within(story).getByText('Act II')).toBeInTheDocument();
    expect(story).toHaveTextContent("4 crystals restored so far — 1 more to find in the part of the story they've reached.");
    expect(story).toHaveTextContent("A crystal they haven't found yet");
    expect(story).toHaveTextContent('Crystal Spire: climbed and won');
    expect(story).toHaveTextContent('Next in the story: Help Old Marlow (the goal their guide in the game shows them)');
    expect(story).toHaveTextContent('Trophies and badges (5)');
    expect(story).not.toHaveTextContent(/Memory|Voices|Starfall|The Name|not-a-real-badge|of 5/);
    // Questions to practise: three, then all eight, and how the kid gets back to them.
    const missed = screen.getByRole('region', { name: 'Questions to practise (8)' });
    expect(missed).toHaveTextContent('They wait at the Library in the game, where Sam can try each one again. Talking one through together helps.');
    expect(within(missed).getAllByRole('listitem')).toHaveLength(3);
    expect(missed).toHaveTextContent('Which word means the same as "happy"?');
    expect(missed).toHaveTextContent('Right answer: Joyful');
    expect(missed).toHaveTextContent('They picked: Tired');
    const more = within(missed).getByRole('button', { name: 'Show all 8' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(within(missed).getAllByRole('listitem')).toHaveLength(8);
    expect(within(missed).getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
    expect(missed).toHaveTextContent('Time ran out before they answered.');
    expect(missed).toHaveTextContent('Why: 7 × 8 = 56: seven eights make fifty-six.');
    expect(missed).toHaveTextContent('Words & Stories');
    // Typing.
    expect(screen.getByRole('region', { name: 'Touch typing' })).toHaveTextContent('Lessons done: 4 of 13. Next: E and I: reach up!');
    // Heading and term emoji are hidden from screen readers.
    for (const h of screen.getAllByRole('heading', { level: 3 })) expect(h.querySelector('[aria-hidden="true"]')).not.toBeNull();
    for (const dt of screen.getAllByRole('term')) expect(dt.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Never a raw id, the birth date or a PIN.
    expect(document.body).not.toHaveTextContent(new RegExp(`q-math|kid-sam|${sam.birthYear}|PIN|verdara-key`));
  });

  it('a brand-new kid says so, and what to do; switching kids is instant (one read for the whole family) and said out loud', async () => {
    family();
    await open();
    await hero(12);
    const picker = screen.getByRole('group', { name: 'Whose progress' });
    const buttons = within(picker).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['🦊Sam', expect.stringContaining('Kit'), expect.stringContaining('Ren')]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent("Showing Kit's progress.");
    expect(screen.getByRole('heading', { level: 2, name: "Kit hasn't played yet" })).toBeInTheDocument();
    expect(screen.getByText(/Pick Kit on "Who's playing\?" to start\./)).toBeInTheDocument();
    expect(screen.queryByText(/Player level/)).toBeNull();
    // The toggle keeps the keyboard (the page title doesn't change, so nothing takes the focus).
    buttons[2].focus();
    fireEvent.click(buttons[2]);
    expect(buttons[2]).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent("Showing Ren's progress.");
    expect(screen.getByRole('heading', { level: 2, name: "Ren's progress" })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Story' })).toHaveTextContent('Still at the Training Grounds: 1 of 3 practice rounds passed.');
    expect(screen.getByRole('region', { name: 'Touch typing' })).toHaveTextContent('Not started yet.');
    expect(screen.getByRole('region', { name: 'Questions to practise' })).toHaveTextContent('None waiting right now.');
    expect(reads).toEqual(['profiles', 'saves', 'play_days', 'play_history_since']);
  });

  it('one kid: no picker; opens on the kid asked for', async () => {
    family();
    useFamilyStore.setState({ kids: [ren] });
    await open(ren.id);
    await hero(1);
    expect(screen.queryByRole('group', { name: 'Whose progress' })).toBeNull();
  });

  it("a 7-year-old's page says young players start lower on purpose, and reads their levels against where they started (review rounds 1–2)", async () => {
    answers.profiles = ok([{ ...newKidRow(kit.id), xp: 90, level: 1, level_xp: 90, last_played_on: today, skill_levels: { math: 3, science: 2 } }]);
    answers.saves = ok([{ profile_id: kit.id, data: { ...trainingSave(), topicStarts: { math: { level: 2, age: 7 }, science: { level: 2, age: 7 } } } }]);
    useFamilyStore.setState({ kids: [kit] });
    await open(kit.id);
    await hero(1);
    const topics = screen.getByRole('region', { name: 'Question level by topic' });
    expect(topics).toHaveTextContent('Each topic has its own question level, 1 to 10. Young players start low on purpose, then climb.');
    expect(topics).not.toHaveTextContent(/recent update|Levels now/);
    // Both started at the same place: said once above them, the rows shorter (round 3).
    expect(topics).toHaveTextContent('Both started at level 2, when Kit was 7.');
    expect(topics).toHaveTextContent('Math: level 3 of 10Up 1 since they started');
    expect(topics).toHaveTextContent('Science: level 2 of 10At the level they started on');
    expect(topics).not.toHaveTextContent(/easy questions for their age|below/i);
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('Nothing stands out to practise right now.');
  });

  it("after a birthday, a long-time player's topics read against where they really started — never below a start they never had (review round 2)", async () => {
    // Ada, 9, started every topic at 6 (level 1) and climbed them to 2–3; a new 9-year-old would start at 4.
    const ada: Kid = { ...sam, id: 'kid-ada', name: 'Ada' };
    const starts = Object.fromEntries(['math', 'science', 'nature', 'words', 'history'].map((t) => [t, { level: 1, age: 6 }]));
    answers.profiles = ok([{ ...newKidRow(ada.id), xp: 5200, level: 18, level_xp: 120, current_streak: 4, longest_streak: 21, last_played_on: today, skill_levels: { math: 3, science: 3, nature: 3, words: 2, history: 2 } }]);
    answers.saves = ok([{ profile_id: ada.id, data: { ...trainingSave(), passedRounds: 30, worldUnlocked: true, topicStarts: starts } }]);
    useFamilyStore.setState({ kids: [ada] });
    await open(ada.id);
    await hero(18);
    const topics = screen.getByRole('region', { name: 'Question level by topic' });
    expect(topics).not.toHaveTextContent(/[Bb]elow/);
    expect(topics).toHaveTextContent('All 5 started at level 1, when Ada was 6.');
    expect(topics).not.toHaveTextContent(/where they started at age/);
    expect(topics).toHaveTextContent('Math: level 3 of 10Up 2 since they started');
    expect(topics).toHaveTextContent('Words & Stories: level 2 of 10Up 1 since they started');
    const glanceList = screen.getByRole('list', { name: 'At a glance' });
    expect(glanceList).toHaveTextContent('Most progress: Math, Science and Nature & Animals — up 2 levels each since they started.');
    expect(glanceList).toHaveTextContent('Nothing stands out to practise right now.');
    expect(glanceList).not.toHaveTextContent(/below/);
  });

  it('a kid whose topics were saved before starts were noted (a teen from before #156): the level alone, no above/below, no "most progress" (review round 2)', async () => {
    answers.profiles = ok([{ ...midActTwoRow(ren.id, today), skill_levels: { math: 10, science: 10, words: 5 } }]);
    answers.saves = ok([{ profile_id: ren.id, data: trainingSave() }]);
    useFamilyStore.setState({ kids: [ren] });
    await open(ren.id);
    await hero(12);
    const topics = screen.getByRole('region', { name: 'Question level by topic' });
    expect(topics).toHaveTextContent('Math: level 10 of 10For the strongest at their age');
    expect(topics).toHaveTextContent('Words & Stories: level 5 of 10');
    expect(topics).not.toHaveTextContent(/above|below|where they started|recent update/i);
    // Apart, under "Levels now" — and the bare 5 beside "Not moved yet: level 6" isn't left to read as a step back (round 3).
    expect(within(topics).getByRole('heading', { level: 4, name: 'Levels now' })).toBeInTheDocument();
    expect(topics).toHaveTextContent("Where these began wasn't recorded. Any first played when Ren was younger may have started lower than level 6.");
    expect(screen.getByRole('list', { name: 'At a glance' })).not.toHaveTextContent(/Most progress|Furthest|below/);
  });

  it("launch week (Lia 9, round 3): a topic first tried since the update is never crowned \"most progress\" over topics the page can't compare", async () => {
    const lia: Kid = { ...sam, id: 'kid-lia', name: 'Lia' };
    answers.profiles = ok([
      { ...newKidRow(lia.id), xp: 4000, level: 15, level_xp: 10, last_played_on: today, skill_levels: { math: 7, science: 8, history: 6, words: 5, creativity: 2, engineering: 3, geography: 5, music: 3 } },
    ]);
    answers.saves = ok([{ profile_id: lia.id, data: { ...trainingSave(), worldUnlocked: true, topicStarts: { geography: { level: 4, age: 9 }, music: { level: 4, age: 9 } } } }]);
    useFamilyStore.setState({ kids: [lia] });
    await open(lia.id);
    await hero(15);
    const glanceList = screen.getByRole('list', { name: 'At a glance' });
    expect(glanceList).toHaveTextContent('Up since they started: Maps & Places (level 4 → 5).');
    expect(glanceList).not.toHaveTextContent(/Most progress/);
    // Her six older topics sit apart, under "Levels now"; the two since, against where they started.
    const topics = screen.getByRole('region', { name: 'Question level by topic' });
    const [since, now] = within(topics).getAllByRole('list');
    expect(within(since).getAllByRole('listitem').map((t) => t.textContent)).toEqual([
      '🧭 Maps & Places: level 5 of 10Up 1 since they started',
      '🎸 Music: level 3 of 10Below where they started — a good one to practise together',
    ]);
    expect(within(now).getAllByRole('listitem')).toHaveLength(6);
  });

  it("a last day played more than a day ahead is a device clock set wrong: not sure, never \"Today\" (review round 2)", async () => {
    answers.profiles = ok([{ ...midActTwoRow(sam.id, today), current_streak: 999, last_played_on: '2099-12-31' }]);
    answers.saves = ok([{ profile_id: sam.id, data: midActTwoSave() }]);
    answers.play_days = ok([]);
    useFamilyStore.setState({ kids: [sam] });
    await open(sam.id);
    await hero(12);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['Not sure', 'Best: 7 days in a row', 'Not sure', "Their device's date is set ahead"]);
    expect(screen.queryByText(/999/)).toBeNull();
    // The week and the glance say "not sure" too — never "0 of 7" or "no play noted" (round 3).
    expect(screen.getByRole('heading', { name: /Last 7 days/ })).toHaveTextContent('Last 7 days · not sure');
    expect(screen.queryByText(/of 7/)).toBeNull();
    expect(screen.queryByText(/no play noted/i)).toBeNull();
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent("Not sure which days they played — their device's date is set ahead.");
    // XP by day can't be placed either (#169); no minutes or answers "in the last 7 days" (#172, #173).
    expect(screen.getByRole('region', { name: 'XP, the last 4 weeks' })).toHaveTextContent("Not sure which days they earned it — their device's date is set ahead.");
    expect(screen.queryByText(/minutes|Last 7 days:/)).toBeNull();
  });

  it('big numbers are written one way; a week since they played says so (review round 1)', async () => {
    answers.profiles = ok([
      { ...midActTwoRow(sam.id, today), xp: 48210, level: 41, level_xp: 940, current_streak: 5, longest_streak: 9, last_played_on: isoOffset(today, -7) },
    ]);
    answers.saves = ok([{ profile_id: sam.id, data: midActTwoSave() }]);
    answers.play_days = ok([]);
    useFamilyStore.setState({ kids: [sam] });
    await open(sam.id);
    await hero(41);
    expect(screen.getByText('48,210 XP in all')).toBeInTheDocument();
    expect(screen.getByText(/940 of 1,100 XP toward player level 42 — 160 more to go/)).toBeInTheDocument();
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['No streak now', 'Best: 9 days in a row', expect.any(String), '7 days ago']);
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent(/No play noted in the last 7 days — last played on \d+ \w+\./);
  });

  it("a missing profile or save is said honestly — never as level 1, 0 of 3 rounds or nothing waiting (review round 1)", async () => {
    // A save but no profile row.
    answers.profiles = ok([]);
    answers.saves = ok([{ profile_id: sam.id, data: midActTwoSave() }]);
    useFamilyStore.setState({ kids: [sam] });
    const { unmount } = render(<ProgressPage kidId={sam.id} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 2, name: "Sam's progress" });
    // Said once, under their name; the sections it would fill are left out (review round 2).
    expect(
      screen.getByText('Nothing about their player level and question levels has been saved to your account yet. It shows here once their game saves it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Player level and play' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Question level by topic' })).toBeNull();
    expect(screen.queryByText(/Player level 1|Not yet|No streak now/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Story' })).toHaveTextContent('Act II');
    // Half of what it judges is unknown: never "nothing stands out" (review round 2).
    expect(screen.getByRole('list', { name: 'At a glance' })).not.toHaveTextContent(/Nothing stands out/);
    unmount();
    // A profile but no save.
    answers.profiles = ok([midActTwoRow(sam.id, today)]);
    answers.saves = ok([]);
    render(<ProgressPage kidId={sam.id} onBack={vi.fn()} />);
    await hero(12);
    expect(screen.getAllByText(/has been saved to your account yet/)).toHaveLength(1);
    expect(
      screen.getByText('Nothing about their story, questions to practise and touch typing has been saved to your account yet. It shows here once their game saves it.'),
    ).toBeInTheDocument();
    for (const region of ['Story', 'Questions to practise', 'Touch typing']) expect(screen.queryByRole('region', { name: region })).toBeNull();
    expect(screen.queryByText(/Training Grounds|None waiting|Not started yet/)).toBeNull();
    const glanceList = screen.getByRole('list', { name: 'At a glance' });
    expect(glanceList).not.toHaveTextContent(/questions to try again/);
    expect(glanceList).not.toHaveTextContent(/Nothing stands out/);
  });

  it('a long name is shown whole in the picker, never cut off', async () => {
    family();
    const long = { ...ren, name: 'Alexandrina-Rosemary' };
    useFamilyStore.setState({ kids: [sam, long] });
    await open();
    await hero(12);
    const button = within(screen.getByRole('group', { name: 'Whose progress' })).getByRole('button', { name: /Alexandrina-Rosemary/ });
    expect(button.innerHTML).not.toMatch(/truncate/);
  });

  it('while loading it says so, out loud', async () => {
    family();
    let release: () => void = () => {};
    answers.saves = () => new Promise((r) => (release = () => r({ data: [], error: null })));
    await open();
    expect(screen.getByRole('status')).toHaveTextContent("Loading Sam's progress…");
    await act(async () => release());
    expect(await hero(12)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it("a failed read says it plainly, logs the real error, and Try again loads it", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    family();
    answers.profiles = () => Promise.resolve({ data: null, error: { message: 'permission denied for table profiles', code: '42501' } });
    await open();
    const status = screen.getByRole('status');
    await vi.waitFor(() => expect(status).toHaveTextContent(`We couldn't load their progress just now. Tap "Try again".`));
    expect(status).not.toHaveTextContent('permission denied');
    expect(warn.mock.calls[0].join(' ')).toContain('permission denied for table profiles [42501]');
    family();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await hero(12)).toBeInTheDocument();
  });

  it('Try again keeps the keyboard: the button waits in place, then the loaded page takes the focus at the kid’s heading (review round 1)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    family();
    answers.profiles = () => Promise.resolve({ data: null, error: { message: 'boom', code: '500' } });
    await open();
    const button = await screen.findByRole('button', { name: 'Try again' });
    button.focus();
    // A second failure: the button never left, the focus with it.
    let release: (() => void) | null = null;
    answers.profiles = () => new Promise((r) => (release = () => r({ data: null, error: { message: 'boom again', code: '500' } })));
    fireEvent.click(button);
    await vi.waitFor(() => expect(release).not.toBeNull());
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('Trying…');
    expect(button).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent("Loading Sam's progress…");
    await act(async () => release!());
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    expect(button).toHaveTextContent('Try again');
    expect(button).toHaveFocus();
    // This time it loads: the button goes, the kid's heading has the focus.
    family();
    fireEvent.click(button);
    await hero(12);
    expect(screen.getByRole('heading', { level: 2, name: "Sam's progress" })).toHaveFocus();
  });

  it('offline and signed out get their own words; signed out offers "Sign in again"', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    family();
    answers.saves = () => Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    const { unmount } = render(<ProgressPage kidId={sam.id} onBack={vi.fn()} />);
    await screen.findByText(/We couldn't reach Hazel Quest/);
    unmount();
    answers.saves = () => Promise.resolve({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } });
    render(<ProgressPage kidId={sam.id} onBack={vi.fn()} />);
    await screen.findByText('Your sign-in ran out — please sign in again.');
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('without the days-played table the week is left out, nothing else', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    family();
    answers.play_days = () => Promise.resolve({ data: null, error: { message: 'relation "public.play_days" does not exist', code: '42P01' } });
    await open();
    await hero(12);
    expect(screen.queryByRole('heading', { name: /Last 7 days/ })).toBeNull();
    expect(screen.queryByText(/[Pp]layed on/)).toBeNull();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    // At a glance says when they last played instead.
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('Last played yesterday.');
  });

  it('XP over the last 4 weeks (#169): a row per week with its dates and XP in words, no mark for a day without play, a dot for one whose XP wasn\'t noted, every day in a table', async () => {
    family();
    await open();
    await hero(12);
    const region = screen.getByRole('region', { name: 'XP, the last 4 weeks' });
    const weeks = within(region).getByRole('list', { name: 'XP each week, oldest first' });
    const range = (from: number) => dayRange(isoOffset(today, -from), isoOffset(today, -(from - 6)));
    expect(within(weeks).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      // Counted from 30 days back: the oldest week had no play — never "0 XP".
      `${range(27)}: No play noted`,
      `${range(20)}: 90 XP`,
      `${range(13)}: 200 XP`,
      // 120 + 60 on the two days recorded; the days 2 and 4 back were played, their XP not noted — never counted
      // as 0, never left out of the words (#89 review round 1: "180 XP" read as the whole week), and keyed.
      `${range(6)}: 180 XP on 2 recorded days · 2 days played weren't recorded`,
    ]);
    // Only the number stands out; a week's words without one are plain, like absence (#89 review round 1).
    const [quiet, , , partial] = within(weeks).getAllByRole('listitem');
    expect(within(partial).getByText('180 XP')).toHaveClass('font-semibold');
    expect(within(quiet).getByText('No play noted')).not.toHaveClass('font-semibold');
    expect(within(quiet).getByText('No play noted')).toHaveClass('text-gray-600');
    // The columns are decoration (the words and the table carry the values); the tallest recorded day is said — as that.
    for (const li of within(weeks).getAllByRole('listitem')) expect(li.querySelector('.grid')).toHaveAttribute('aria-hidden', 'true');
    expect(region).toHaveTextContent(`Most on a recorded day: 200 XP, ${longDay(isoOffset(today, -9))}.`);
    expect(region).toHaveTextContent("Played, but that day's XP wasn't recorded.");
    expect(region).not.toHaveTextContent(/Counted from/);
    const bars = region.querySelectorAll('.grid [style*="height"] > span[style]');
    // A bar for each day with XP (yesterday, 3, 9 and 20 back) — none for a day without.
    expect(bars).toHaveLength(4);
    // A grey dot for each day played whose XP wasn't noted: 4 back (an older app's note) and 2 back (the streak's).
    const dots = Array.from(region.querySelectorAll('.grid .rounded-full')).map((d) => d.parentElement?.getAttribute('title'));
    expect(dots).toEqual([`${longDay(isoOffset(today, -4))}: played, XP not recorded`, `${longDay(isoOffset(today, -2))}: played, XP not recorded`]);
    // The table twin, folded: every day of the 4 weeks.
    const fold = within(region).getByText('Every day in a table');
    expect(fold.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(fold);
    const table = within(region).getByRole('table', { name: 'XP and time played each day, the last 4 weeks, oldest first' });
    const rows = within(table).getAllByRole('row');
    const row = (back: number) => rows.map(heard).find((t) => t.startsWith(longDay(isoOffset(today, -back))));
    expect(rows.filter((r) => r.querySelector('th[scope="row"]'))).toHaveLength(28);
    expect(row(1)).toBe(`${longDay(isoOffset(today, -1))}120about 25 minutes`);
    expect(row(4)).toBe(`${longDay(isoOffset(today, -4))}played, not recorded`);
    expect(row(5)).toBe(`${longDay(isoOffset(today, -5))}no play noted`);
    expect(row(0)).toBe(`${longDay(today)} (today)no play noted`);
    // "Thu 24 Sep" and "about 25 min" at every screen width — the table is never wider than 24rem, where the whole
    // words wrap (#89 review round 1: they switched on the screen's width) — and the whole words for a screen reader.
    const yesterday = rows.find((r) => heard(r).startsWith(longDay(isoOffset(today, -1)))) as HTMLElement;
    const shown = Array.from(yesterday.querySelectorAll('[aria-hidden="true"]')).map((e) => e.textContent);
    expect(shown).toEqual([`${longDay(isoOffset(today, -1)).slice(0, 3)} ${longDay(isoOffset(today, -1)).split(' ')[1]} ${longDay(isoOffset(today, -1)).split(' ')[2].slice(0, 3)}`, 'about 25 min']);
    for (const e of Array.from(yesterday.querySelectorAll('[aria-hidden="true"]'))) expect(e.className).toBe('');
    expect(Array.from(yesterday.querySelectorAll('.sr-only')).map((e) => [e.className, e.textContent])).toEqual([
      ['sr-only', longDay(isoOffset(today, -1))],
      ['sr-only', 'about 25 minutes'],
    ]);
    expect(table).toHaveTextContent(`${range(6)} · 180 XP on 2 recorded days · 2 days played weren't recorded`);
  });

  it('counted from the first day noted (#170): the days before read "not recorded" — never "no play noted" — and a note says so once', async () => {
    answers.profiles = ok([{ ...midActTwoRow(sam.id, today), current_streak: 1, last_played_on: today }]);
    answers.saves = ok([{ profile_id: sam.id, data: midActTwoSave() }]);
    answers.play_days = ok([played(sam.id, 2, 40, 10), played(sam.id, 0, 30, 5)]);
    answers.play_history_since = ok([{ profile_id: sam.id, since: isoOffset(today, -2) }]);
    useFamilyStore.setState({ kids: [sam] });
    await open(sam.id);
    await hero(12);
    // True of a kid just starting as of one counted since the update (#89 review round 1).
    const note = `Counted from ${longDay(isoOffset(today, -2))}, the first day noted.`;
    const level = screen.getByRole('region', { name: 'Player level and play' });
    expect(level).toHaveTextContent(note);
    const week = screen.getByRole('heading', { name: /Last 7 days/ }).nextElementSibling as HTMLElement;
    const daysRead = within(week).getAllByRole('listitem').map((li) => li.querySelector('.sr-only')?.textContent ?? '');
    expect(daysRead.map((t) => t.replace(/^.*: /, ''))).toEqual(['not recorded', 'not recorded', 'not recorded', 'not recorded', 'played · about 10 minutes', 'no play noted', 'played · about 5 minutes']);
    // Said once (#89 review round 1): the week above says it, so the XP section doesn't — and it leaves out the
    // weeks wholly before counting rather than listing three "Not recorded" rows; the title says what's shown.
    expect(document.body.textContent?.split('Counted from')).toHaveLength(2);
    const xp = screen.getByRole('region', { name: 'XP this week' });
    expect(xp).not.toHaveTextContent(/Counted from|Not recorded/);
    const weekRows = within(within(xp).getByRole('list', { name: /XP each week/ })).getAllByRole('listitem');
    // The week's 70 XP is from the first day counted, said so.
    const from = longDay(isoOffset(today, -2)).split(' ')[0];
    expect(weekRows.map((li) => li.textContent?.replace(/^.*: /, ''))).toEqual([`70 XP from ${from}`]);
    fireEvent.click(within(xp).getByText('Every day in a table'));
    const table = within(xp).getByRole('table');
    expect(within(table).getAllByRole('row').map(heard).find((t) => t.startsWith(longDay(isoOffset(today, -3))))).toBe(`${longDay(isoOffset(today, -3))}not recorded`);
    // …and in the table: this week's seven days under its heading, and the column heads.
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 1 + 7);
    expect(document.body).not.toHaveTextContent(/(^|[^\d,])0 XP/);
  });

  it('a new kid, the first weeks after 0026, a kid gone quiet: the XP section is a line, not rows of nothing (#89 review round 1)', async () => {
    const kid = (over: Record<string, unknown>) => ({ ...midActTwoRow(sam.id, today), ...over });
    answers.saves = ok([{ profile_id: sam.id, data: midActTwoSave() }]);
    useFamilyStore.setState({ kids: [sam] });
    // First play today: one day of XP — no chart round one bar, no "most in a day", no table.
    answers.profiles = ok([kid({ current_streak: 1, last_played_on: today })]);
    answers.play_days = ok([played(sam.id, 0, 35, 6)]);
    answers.play_history_since = ok([{ profile_id: sam.id, since: today }]);
    await open(sam.id);
    await hero(12);
    let xp = screen.getByRole('region', { name: 'XP this week' });
    expect(xp).toHaveTextContent(`35 XP and about 5 minutes of play on ${longDay(today)} (today).`);
    expect(within(xp).queryByRole('list')).toBeNull();
    expect(within(xp).queryByRole('table')).toBeNull();
    expect(xp).not.toHaveTextContent(/Most|Not recorded|Counted from/);
    // "Counted from…" once, under the week.
    expect(document.body.textContent?.split('Counted from')).toHaveLength(2);
    cleanup();
    // 0026 applied this week: the 0025 days carry its zeros, today is the first recorded — and the note is the XP section's.
    answers.profiles = ok([kid({ current_streak: 4, last_played_on: today })]);
    answers.play_days = ok([...[12, 10, 9, 7, 5, 3, 2, 1].map((back) => played(sam.id, back, 0, 0)), played(sam.id, 0, 25, 4)]);
    answers.play_history_since = ok([{ profile_id: sam.id, since: isoOffset(today, -12) }]);
    await open(sam.id);
    await hero(12);
    xp = screen.getByRole('region', { name: 'XP, the last 2 weeks' });
    expect(xp).toHaveTextContent(`25 XP and a few minutes of play on ${longDay(today)} (today) · 8 other days played weren't recorded.`);
    expect(xp).toHaveTextContent(`Counted from ${longDay(isoOffset(today, -12))}, the first day noted.`);
    expect(document.body.textContent?.split('Counted from')).toHaveLength(2);
    // ⏱️ says what its number covers — never "a few minutes of play in the last 7 days" over five days played.
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent(
      "⏱️A few minutes of play on 1 recorded day · 4 days played weren't recorded.",
    );
    cleanup();
    // Idle for 20 days, no day noted since 0026: one line.
    answers.profiles = ok([kid({ current_streak: 0, last_played_on: isoOffset(today, -20) })]);
    answers.play_days = ok([]);
    answers.play_history_since = ok([]);
    await open(sam.id);
    await hero(12);
    xp = screen.getByRole('region', { name: 'XP, the last 4 weeks' });
    expect(xp).toHaveTextContent('Played on 1 day in the last 4 weeks, XP not recorded.');
    expect(within(xp).queryByRole('list')).toBeNull();
  });

  it('a topic reads against where the profile says it started first, then the save (#174)', async () => {
    // The profile noted Math at 7 (level 2); the save says 8 (level 3) — the database keeps the first.
    answers.profiles = ok([{ ...midActTwoRow(sam.id, today), skill_starts: { math: { level: 2, age: 7 }, history: { level: 3, age: 8 } } }]);
    answers.saves = ok([{ profile_id: sam.id, data: midActTwoSave() }]);
    useFamilyStore.setState({ kids: [sam] });
    await open(sam.id);
    await hero(12);
    const topics = screen.getByRole('region', { name: 'Question level by topic' });
    expect(topics).toHaveTextContent('Math: level 6 of 10Up 4 from level 2, where they started at age 7');
    // Time & History's start is only on the profile: it joins "Since they started", no group of its own.
    expect(topics).toHaveTextContent('Time & History: level 5 of 10Up 2 from level 3, where they started at age 8');
    expect(within(topics).queryByRole('heading', { name: 'Levels now' })).toBeNull();
    // Starts only in the save still count.
    expect(topics).toHaveTextContent('Science: level 8 of 10Up 4 from level 4, where they started at age 9');
  });

  it('a database without migration 0026: read as before it — no XP chart, no minutes, no answers per topic, the week as it was (#169–#174)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    family();
    const rows = answers.profiles;
    answers.profiles = (select) => (select.includes('skill_starts') ? refuse('42703', 'column profiles.skill_starts does not exist') : rows(select));
    answers.play_days = (select) =>
      select.includes('xp')
        ? refuse('42703', 'column play_days.xp does not exist')
        : Promise.resolve({ data: [1, 3, 4].map((back) => ({ profile_id: sam.id, day: isoOffset(today, -back) })), error: null });
    answers.play_history_since = () => refuse('PGRST205', "Could not find the table 'public.play_history_since' in the schema cache");
    await open();
    await hero(12);
    expect(reads).toEqual(['profiles', 'saves', 'play_days', 'play_history_since', 'profiles', 'play_days']);
    expect(screen.queryByRole('region', { name: /^XP/ })).toBeNull();
    expect(screen.getByRole('heading', { name: /Last 7 days/ })).toHaveTextContent('Last 7 days · played on 4 of 7');
    const glanceList = screen.getByRole('list', { name: 'At a glance' });
    expect(glanceList).toHaveTextContent('Played on 4 of the last 7 days.');
    expect(glanceList).toHaveTextContent('💡To practise together: Creativity (below their start).');
    expect(screen.queryByText(/minutes|Last 7 days:|since last week|not recorded|Answered/)).toBeNull();
    // Opened again this session: what's there is read straight away, one round, no failed reads first (#89 review round 1).
    cleanup();
    reads.length = 0;
    await open();
    await hero(12);
    expect(reads).toEqual(['profiles', 'saves', 'play_days']);
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('Played on 4 of the last 7 days.');
  });

  it('both Back buttons go back to 👪 Grown-ups', async () => {
    family();
    const onBack = await open();
    await hero(12);
    const backs = screen.getAllByRole('button', { name: '← Back to 👪 Grown-ups' });
    expect(backs).toHaveLength(2);
    fireEvent.click(backs[0]);
    fireEvent.click(backs[1]);
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
