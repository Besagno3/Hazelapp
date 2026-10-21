import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { Kid } from '../../types';

// The database: one canned answer per table, swappable per test.
const answers = vi.hoisted(() => ({} as Record<string, () => Promise<{ data: unknown; error: unknown }>>));
const reads = vi.hoisted(() => [] as string[]);
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      reads.push(table);
      const chain = {
        select: () => chain,
        in: () => chain,
        gte: () => chain,
        then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          (answers[table]?.() ?? Promise.resolve({ data: [], error: null })).then(ok, bad),
      };
      return chain;
    },
  },
}));

const { default: ProgressPage } = await import('./ProgressPage');
const { useFamilyStore } = await import('../../store/familyStore');
const { todayIso, isoOffset } = await import('../../lib/streak');
const { midActTwoRow, midActTwoSave, newKidRow, trainingSave } = await import('../../test/progressFixtures');

// Ages by this year (born in January, so the birthday has passed): Sam 9, Kit 7, Ren 11.
const YEAR = new Date().getFullYear();
const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: YEAR - 9, birthMonth: 1 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'frog', hasPin: true, birthYear: YEAR - 7, birthMonth: 1 };
const ren: Kid = { id: 'kid-ren', name: 'Ren', icon: 'koala', hasPin: true, birthYear: YEAR - 11, birthMonth: 1 };

/** The hero: "Player level" over the number, read as one. */
const hero = (n: number | string) => screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === `Player level ${n}`);

const ok = (data: unknown) => () => Promise.resolve({ data, error: null });
const today = todayIso();

/** A family of three: Sam mid-Act-II, Kit brand new, Ren just through one practice round. */
function family() {
  answers.profiles = ok([midActTwoRow(sam.id, today), newKidRow(kit.id), { ...newKidRow(ren.id), last_played_on: today, skill_levels: { math: 2 } }]);
  answers.saves = ok([
    { profile_id: sam.id, data: midActTwoSave() },
    { profile_id: ren.id, data: trainingSave() },
  ]);
  answers.play_days = ok([
    { profile_id: sam.id, day: isoOffset(today, -1) },
    { profile_id: sam.id, day: isoOffset(today, -3) },
    { profile_id: sam.id, day: isoOffset(today, -4) },
  ]);
}

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  reads.length = 0;
  vi.restoreAllMocks();
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
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '⭐ Player level and play',
      '🎯 Question level by topic',
      '🗺️ Story',
      '📚 Questions to practise (8)',
      '⌨️ Touch typing',
    ]);
    // At a glance: what's going well and what to practise together — from what's stored.
    const glanceList = screen.getByRole('list', { name: 'At a glance' });
    // Days noted 1, 3 and 4 days back, and a 3-day streak to yesterday: the day 2 back is the streak's (review round 2) —
    // played, like the rest (round 3). Time & History has no noted start, so no topic is crowned "most" (round 3).
    expect(within(glanceList).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '📅Played on 4 of the last 7 days.',
      '🌟Up since they started: Math (level 3 → 6), Science (level 4 → 8) and Nature & Animals (level 4 → 9).',
      '💡To practise together — below where they started: Creativity.',
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
    // One kind of played day, read "played" (round 3: the streak's lighter ✓ and its key are gone).
    expect(daysRead.filter((t) => t?.endsWith(': played'))).toHaveLength(4);
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
    expect(topics.map((t) => t.textContent)).toEqual([
      '🔢 Math: level 6 of 10Up 3 from level 3, where they started at age 8',
      '🔬 Science: level 8 of 10Up 4 from level 4, where they started at age 9 — a stretch for their age',
      '⚙️ Engineering: level 4 of 10At level 4, where they started at age 9',
      '🎨 Creativity: level 3 of 10Below level 4, where they started at age 9 — a good one to practise together',
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
    expect(reads).toEqual(['profiles', 'saves', 'play_days']);
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
