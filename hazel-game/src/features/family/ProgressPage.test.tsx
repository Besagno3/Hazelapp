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

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'frog', hasPin: true, birthYear: 2019, birthMonth: 8 };
const ren: Kid = { id: 'kid-ren', name: 'Ren', icon: 'koala', hasPin: true, birthYear: 2015, birthMonth: 1 };

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
  it('a kid mid-Act-II: level and XP, streak and the week, every topic, the story, eight missed questions, typing', async () => {
    family();
    await open();
    expect(screen.getByRole('heading', { level: 1, name: '📈 Progress' })).toHaveFocus();
    await screen.findByText('Level 12');
    expect(screen.getByText('2,340 XP in all')).toBeInTheDocument();
    expect(screen.getByText(/80 of 375 XP toward level 13 — 295 more to go/)).toBeInTheDocument();
    // Streak tile: yesterday counts.
    const tiles = screen.getAllByRole('definition').map((d) => d.textContent);
    expect(tiles).toEqual(['3 days', 'Best: 7 days in a row', 'Yesterday']);
    // The week, read out day by day.
    const weekHeading = screen.getByRole('heading', { name: /Last 7 days/ });
    expect(weekHeading).toHaveTextContent('Last 7 days · played on 3 of 7');
    const week = weekHeading.nextElementSibling as HTMLElement;
    const daysRead = within(week).getAllByRole('listitem').map((li) => li.querySelector('.sr-only')?.textContent);
    expect(daysRead).toHaveLength(7);
    expect(daysRead.filter((t) => t?.endsWith(': played'))).toHaveLength(3);
    expect(daysRead.at(-1)).toMatch(/\(today\): no play noted$/);
    // Every topic, in plain words.
    const topicRegion = screen.getByRole('region', { name: '🎯 Question level by topic' });
    const [moved, notMoved] = within(topicRegion).getAllByRole('list');
    const topics = within(moved).getAllByRole('listitem');
    expect(topics.map((t) => t.textContent)).toEqual([
      '🔢 Math: level 6 of 10Right for their age',
      '🔬 Science: level 8 of 10A stretch for their age',
      '⚙️ Engineering: level 4 of 10Right for their age',
      '🎨 Creativity: level 3 of 10Easy questions for their age',
      '⏳ Time & History: level 5 of 10Right for their age',
      '🦋 Nature & Animals: level 9 of 10For the strongest at their age',
    ]);
    // The four no round has moved, in one line: Sam (9) starts every topic at 4.
    expect(within(topicRegion).getByRole('heading', { name: 'Not moved yet: level 4 of 10' })).toBeInTheDocument();
    expect(within(notMoved).getAllByRole('listitem').map((t) => t.textContent)).toEqual([
      '📚 Words & Stories',
      '🪐 Space',
      '🧭 Maps & Places',
      '🎸 Music',
    ]);
    // The story: Act II, the crystals so far, never a later act's.
    const story = screen.getByRole('region', { name: '🗺️ Story' });
    expect(within(story).getByText('Act II · The Crystal of Memory')).toBeInTheDocument();
    expect(story).toHaveTextContent('Crystals restored: 4 of 5 so far');
    expect(story).toHaveTextContent('Crystal of Memory (Time & History) — not yet');
    expect(story).toHaveTextContent('Crystal Spire: climbed and won');
    expect(story).toHaveTextContent('Trophies and badges (5)');
    expect(story).not.toHaveTextContent(/Voices|not-a-real-badge/);
    // Missed questions: three, then all eight.
    const missed = screen.getByRole('region', { name: '📚 Missed questions (8)' });
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
    expect(screen.getByRole('region', { name: '⌨️ Touch typing' })).toHaveTextContent('Lessons done: 4 of 13. Next: E and I: reach up!');
    // Never a raw id, the birth date or a PIN.
    expect(document.body).not.toHaveTextContent(/q-math|kid-sam|2017|PIN|verdara-key/);
  });

  it('a brand-new kid says so; switching kids is instant (one read for the whole family)', async () => {
    family();
    await open();
    await screen.findByText('Level 12');
    const picker = screen.getByRole('group', { name: 'Whose progress' });
    const buttons = within(picker).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['🦊Sam', expect.stringContaining('Kit'), expect.stringContaining('Ren')]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: "Kit hasn't played yet" })).toBeInTheDocument();
    expect(screen.queryByText('Level 1')).toBeNull();
    // The toggle keeps the keyboard (the page title doesn't change, so nothing takes the focus).
    buttons[2].focus();
    fireEvent.click(buttons[2]);
    expect(buttons[2]).toHaveFocus();
    expect(screen.getByRole('region', { name: '🗺️ Story' })).toHaveTextContent('Still at the Training Grounds: 1 of 3 practice rounds passed.');
    expect(screen.getByRole('region', { name: '⌨️ Touch typing' })).toHaveTextContent('Not started yet.');
    expect(screen.getByRole('region', { name: '📚 Missed questions (0)' })).toHaveTextContent('None waiting.');
    expect(reads).toEqual(['profiles', 'saves', 'play_days']);
  });

  it('one kid: no picker; opens on the kid asked for', async () => {
    family();
    useFamilyStore.setState({ kids: [ren] });
    await open(ren.id);
    await screen.findByText('Level 1');
    expect(screen.queryByRole('group', { name: 'Whose progress' })).toBeNull();
  });

  it('while loading it says so, out loud', async () => {
    family();
    let release: () => void = () => {};
    answers.saves = () => new Promise((r) => (release = () => r({ data: [], error: null })));
    await open();
    expect(screen.getByRole('status')).toHaveTextContent("Loading Sam's progress…");
    await act(async () => release());
    expect(await screen.findByText('Level 12')).toBeInTheDocument();
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
    expect(await screen.findByText('Level 12')).toBeInTheDocument();
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
    await screen.findByText('Level 12');
    expect(screen.queryByRole('heading', { name: /Last 7 days/ })).toBeNull();
    expect(screen.queryByText(/played on/)).toBeNull();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('both Back buttons go back to 👪 Grown-ups', async () => {
    family();
    const onBack = await open();
    await screen.findByText('Level 12');
    const backs = screen.getAllByRole('button', { name: '← Back to 👪 Grown-ups' });
    expect(backs).toHaveLength(2);
    fireEvent.click(backs[0]);
    fireEvent.click(backs[1]);
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
