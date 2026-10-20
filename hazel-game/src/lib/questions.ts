import { supabase } from './supabase';
import { errorMessage, resolveErrorMessage } from './errors';
import { useFamilyStore } from '../store/familyStore';
import { isStarterId, starterQuestions } from '../content/starterQuestions';
import type { Question, Topic } from '../types';
import type { FlavorId } from '../../supabase/functions/_shared/flavors';

export type { FlavorId } from '../../supabase/functions/_shared/flavors';

/** Questions per quiz round. */
export const QUIZ_QUESTION_COUNT = 5;
/** Questions fetched per battle (cycled across the battle's rounds). */
export const BATTLE_QUESTION_COUNT = 9;

/** A question as returned by the generate-questions edge function. */
interface ApiQuestion {
  id: string;
  level: number;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  timesAsked: number;
}

/**
 * The start of the edge function's error for a topic it doesn't accept
 * (generate-questions/index.ts — the two must keep the same wording).
 */
const UNKNOWN_TOPIC = 'topic must be one of';

/** What a child sees when their topic isn't ready on the server yet (#135). */
export const TOPIC_NOT_READY = "These questions aren't ready yet — pick another topic for now!";

/** Calls the generate-questions edge function and adapts the result. */
async function invokeGenerate(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  flavor?: FlavorId,
  cacheOnly = false,
): Promise<Question[]> {
  // The kid playing (#124): their seen questions are their own. This app tells
  // the server what it shows (`markSeen`, #134), so a batch handed over here is
  // only held back, not counted as seen.
  const profileId = useFamilyStore.getState().activeKidId;
  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: {
      topic,
      age,
      skillLevel,
      count,
      reportsSeen: true,
      ...(flavor ? { flavor } : {}),
      // A look-ahead (B5): saved questions only, never a Claude call.
      ...(cacheOnly ? { cacheOnly: true } : {}),
      ...(profileId ? { profileId } : {}),
    },
  });
  // Surface the edge function's real {error, detail} body, not the generic
  // "non-2xx status code" message (see lib/errors.ts).
  if (error) {
    const reason = await resolveErrorMessage(error);
    // A topic the deployed function doesn't know yet (a new topic shipped
    // before `generate-questions` was redeployed, #135): no developer text for a child.
    if (reason.startsWith(UNKNOWN_TOPIC)) throw new Error(TOPIC_NOT_READY);
    throw new Error(`Question generation failed — ${reason}`);
  }

  const api = (data?.questions ?? []) as ApiQuestion[];
  return api.map((q) =>
    shuffleAnswers({
      id: q.id,
      topic,
      level: q.level,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      timesAsked: q.timesAsked,
    }),
  );
}

/**
 * The same question with its options in a random order and `correctIndex`
 * following the right answer. The model that writes the questions tends to
 * put the right answer in the same spot (most often B), so a kid could learn
 * the position instead of the answer. Every question is shuffled as it
 * arrives — cached ones too, which were stored in the model's order — and the
 * Library shuffles again each time it re-asks a miss.
 */
export function shuffleAnswers<T extends Pick<Question, 'options' | 'correctIndex'>>(
  q: T,
  random: () => number = Math.random,
): T {
  // A malformed index would make every option wrong once shuffled; leave it be.
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) return q;
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
}

// --- Prefetch cache ---------------------------------------------------------
// A consume-once promise cache: prefetchQuestions() starts a request ahead of
// time; fetchQuestions() uses a matching prefetched promise if one is waiting,
// otherwise it requests fresh. Entries are consumed (deleted) on use, so a
// repeat request triggers a new generation — the server re-randomises the
// cache/fresh mix on every call anyway.

/**
 * How long a question handed over for later is kept for this kid (#163
 * review): well inside the server's hold on what it hands over but isn't
 * shown (`RESERVE_MINUTES`, an hour), so it can't have been handed over
 * again — and shown — somewhere else meanwhile. A look-ahead warmed longer
 * ago than this isn't used, nor is a carried-over question.
 */
export const HELD_FOR_MS = 45 * 60 * 1000;

const prefetched = new Map<string, { promise: Promise<Question[]>; at: number }>();

/** The look-ahead warmed under `key`, consumed (once) — none when it's older than `HELD_FOR_MS`. */
function takePrefetched(key: string): Promise<Question[]> | undefined {
  const warm = prefetched.get(key);
  if (!warm) return undefined;
  prefetched.delete(key);
  return Date.now() - warm.at < HELD_FOR_MS ? warm.promise : undefined;
}

function cacheKey(topic: Topic, skillLevel: number, count: number, flavor?: FlavorId): string {
  // Per kid, so a batch warmed for one never goes to a sibling after a switch.
  return `${useFamilyStore.getState().activeKidId ?? ''}|${topic}|${skillLevel}|${count}|${flavor ?? ''}`;
}

export interface PrefetchOptions {
  /**
   * Saved questions only (B5): the server hands over what its bank already
   * has, never asking Claude, so warming a battle that may never happen
   * costs nothing. A short batch is finished when it's used.
   */
  cacheOnly?: boolean;
  /**
   * How many to ask for when fewer than `count` are needed — the quiz's next
   * round, whose carried-over questions are already here (#163 review). It
   * is still found under `count`.
   */
  ask?: number;
}

/** Warms a question request so it is ready before the screen needs it. */
export function prefetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  flavor?: FlavorId,
  { cacheOnly = false, ask = count }: PrefetchOptions = {},
): void {
  const key = cacheKey(topic, skillLevel, count, flavor);
  const warm = prefetched.get(key);
  if (warm && Date.now() - warm.at < HELD_FOR_MS) return;
  const promise = invokeGenerate(topic, age, skillLevel, ask, flavor, cacheOnly);
  prefetched.set(key, { promise, at: Date.now() });
  // Drop a failed prefetch so a real request retries cleanly; this also marks
  // the rejection handled if the prefetch is never consumed.
  promise.catch(() => {
    if (prefetched.get(key)?.promise === promise) prefetched.delete(key);
  });
}

/** The server's questions, or none when it fails — the starters fill in (B5). */
async function fromServer(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  flavor?: FlavorId,
): Promise<Question[]> {
  try {
    return await invokeGenerate(topic, age, skillLevel, count, flavor);
  } catch (e) {
    console.warn('Questions unavailable — using starter questions:', errorMessage(e));
    return [];
  }
}

/**
 * Gets questions for a topic — consuming a prefetched batch if one is waiting,
 * otherwise requesting fresh. `flavor` optionally names the adventure moment
 * (a gate, a spell, the Spire…) by key; the edge function picks its own words
 * for it, so no text from here reaches the prompt (Act I launch review B8). It
 * shapes freshly-generated questions only; cached reuse is unaffected (#37).
 *
 * Never fails and never comes back short (B5): a prefetched batch that's short
 * (a saved-questions-only look-ahead) is finished with a request for the rest,
 * and whatever the server can't give — it's down, offline, out of today's
 * budget, or doesn't know the topic yet — comes from the starter questions
 * (`content/starterQuestions.ts`).
 */
export async function fetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count = QUIZ_QUESTION_COUNT,
  flavor?: FlavorId,
): Promise<Question[]> {
  const pre = takePrefetched(cacheKey(topic, skillLevel, count, flavor));
  let have: Question[] = [];
  if (pre) {
    have = await pre.catch(() => []); // failed: ask again below
    if (have.length >= count) return have;
  }
  const ids = new Set(have.map((q) => q.id));
  const more = await fromServer(topic, age, skillLevel, count - have.length, flavor);
  have = [...have, ...more.filter((q) => !ids.has(q.id))];
  if (have.length >= count) return have;
  return [...have, ...starterQuestions(topic, skillLevel, count - have.length).map((q) => shuffleAnswers(q))];
}

// --- A battle that starts at once (#158) ------------------------------------
// A battle used to wait for its whole batch, and when the bank was short the
// server asked Claude for the rest: 15–20 seconds of "… approaches". Now it
// starts on saved questions (`quickQuestions`: the zone's look-ahead, or a
// saved-questions-only request — no Claude call) and the rest arrive while
// the kid plays (`moreQuestions`).

/** Questions a battle needs before it can start. */
export const BATTLE_START_COUNT = 3;
/** With fewer saved questions than that, starter questions fill the pool to this many, so a quick kid isn't going round three while the rest load. */
export const BATTLE_START_FILL = 6;
/** How long a battle waits for the saved questions before starting on starters. */
export const QUICK_WAIT_MS = 3000;

/** Resolves with null after `ms` — the "too slow" side of a race. */
export const waitFor = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

/** The questions a battle starts on, and any saved ones that came too late to start with. */
export interface QuickStart {
  questions: Question[];
  /**
   * The saved batch that lost the race against `waitMs`, when it arrives
   * (already handed over by the server, so it's used rather than wasted);
   * none when it was in time.
   */
  late: Promise<Question[]>;
}

export interface QuickOptions {
  start?: number;
  fill?: number;
  waitMs?: number;
  flavor?: FlavorId;
  /**
   * Questions already in hand, which go first: the quiz's carried over from
   * an earlier round (#163 review). Only the rest are asked for, and with
   * `start` of them the pool starts at once, the saved ones coming as `late`.
   */
  have?: Question[];
}

/**
 * Saved questions to start on, quickly: the warmed look-ahead if one is
 * waiting, else a saved-questions-only request (never Claude) for the whole
 * `count` (less any `have`). Never fewer than `start` — with fewer saved ones
 * (a thin bank, a slow or failed request, `waitMs`), starter questions fill
 * the pool to `fill` — and maybe the whole `count` when the bank has them.
 */
export async function quickQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  { start = BATTLE_START_COUNT, fill = BATTLE_START_FILL, waitMs = QUICK_WAIT_MS, flavor, have = [] }: QuickOptions = {},
): Promise<QuickStart> {
  const pre = takePrefetched(cacheKey(topic, skillLevel, count, flavor));
  const need = count - have.length;
  const ids = new Set(have.map((q) => q.id));
  const source = (pre ?? (need > 0 ? invokeGenerate(topic, age, skillLevel, need, flavor, true) : Promise.resolve([]))).then(
    (qs) => qs.filter((q) => !ids.has(q.id)).slice(0, count),
    () => [] as Question[],
  );
  if (have.length >= start) return { questions: have, late: source };
  const got = await Promise.race([source, waitFor(waitMs)]);
  const saved = [...have, ...(got ?? [])];
  const late = got === null ? source : Promise.resolve([] as Question[]);
  if (saved.length >= start) return { questions: saved, late };
  const fillTo = Math.min(count, Math.max(start, fill));
  const starters = starterQuestions(topic, skillLevel, fillTo - saved.length).map((q) => shuffleAnswers(q));
  return { questions: [...saved, ...starters], late };
}

/**
 * The rest of a batch, for a pool that started with `have`: enough bank
 * questions to make `count` (starter questions in `have` don't count — they
 * only filled in), asked of the server as usual (Claude may write them), none
 * repeating what's there. What the server can't give comes from the starter
 * questions, so the pool still ends up full. Never fails.
 */
export async function moreQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  have: Question[],
  flavor?: FlavorId,
): Promise<Question[]> {
  const missing = count - have.filter((q) => !isStarterId(q.id)).length;
  if (missing <= 0) return [];
  const ids = new Set(have.map((q) => q.id));
  const fresh = (await fromServer(topic, age, skillLevel, missing, flavor)).filter((q) => !ids.has(q.id)).slice(0, missing);
  fresh.forEach((q) => ids.add(q.id));
  const short = count - have.length - fresh.length;
  if (short <= 0) return fresh;
  const starters = starterQuestions(topic, skillLevel, count + short)
    .filter((q) => !ids.has(q.id))
    .slice(0, short)
    .map((q) => shuffleAnswers(q));
  return [...fresh, ...starters];
}

// --- A quiz round that starts at once (#163) --------------------------------
// The Training Grounds quiz waited for its whole round too ("Building your
// questions…", up to 15–30 s on a thin bank — the first screen a new kid
// sees). It now loads the battle's way (`useBattleQuestions`: saved questions
// first, starters for a thin, slow or down bank, the rest while the kid
// answers) and takes each question as the kid reaches it (`useQuizRound`).

/**
 * The next question for a round that has asked `asked`, from `pool`: the
 * first bank question not asked yet — bank questions move the level and pay
 * XP (#153) — else the first starter not asked yet; null while the pool has
 * nothing new (the rest are still on their way).
 */
export function nextRoundQuestion(pool: Question[], asked: Question[]): Question | null {
  const ids = new Set(asked.map((q) => q.id));
  const unasked = pool.filter((q) => !ids.has(q.id));
  return unasked.find((q) => !isStarterId(q.id)) ?? unasked[0] ?? null;
}

/**
 * A starter question the round hasn't asked, its answers shuffled: for a kid
 * who reached a question before the rest of the round arrived.
 */
export function spareStarter(topic: Topic, skillLevel: number, asked: Question[]): Question {
  const ids = new Set(asked.map((q) => q.id));
  // One more than the round has asked, so at least one of them is new.
  const starters = starterQuestions(topic, skillLevel, ids.size + 1);
  return shuffleAnswers(starters.find((q) => !ids.has(q.id)) ?? starters[0]);
}

/**
 * `asked` with a spare starter in the kid's slot (`number`) and in any slot
 * before it still empty — and unchanged when a question already came for it
 * (#163 review: a bank question landing in the same tick as the timer, or a
 * slot the kid got past without one).
 */
export function withSpareStarters(asked: Question[], number: number, topic: Topic, skillLevel: number): Question[] {
  let out = asked;
  while (out.length <= number) out = [...out, spareStarter(topic, skillLevel, out)];
  return out;
}

// --- Carried over to the next round (#163 review) ----------------------------
// A round takes each question as the kid reaches it, so on a thin bank the
// questions Claude writes for it can land after their slot went to a starter,
// or after the round ends. The server holds back what it hands over from this
// kid for an hour, so a question dropped here is lost to them for that hour:
// they're kept for the kid's next round of the topic instead, and go first.

/** At most this many carried a topic. */
const CARRY_MAX = 2 * QUIZ_QUESTION_COUNT;
/** Used in a round within this many levels of the question's own — the band the server reuses saved questions from. */
const CARRY_LEVEL_BAND = 2;

const carried = new Map<string, { question: Question; at: number }[]>();
/** Topics with a round's fresh request on its way (`askFreshForNextRound`), one at a time. */
const freshOnTheWay = new Set<string>();

const carryKey = (kid: string | null, topic: Topic) => `${kid ?? ''}|${topic}`;
const activeKid = () => useFamilyStore.getState().activeKidId;

/** The topic's carried questions, the ones older than `HELD_FOR_MS` dropped. */
function stillHeld(key: string) {
  const now = Date.now();
  const list = (carried.get(key) ?? []).filter((c) => now - c.at < HELD_FOR_MS);
  if (list.length) carried.set(key, list);
  else carried.delete(key);
  return list;
}

/**
 * Keeps questions a quiz round was handed but couldn't use for `kid`'s next
 * round of `topic`: bank questions only (the starters are always there), none
 * twice, at most `CARRY_MAX`. `kid` is the one the round was for — it may end
 * after a switch of player.
 */
export function carryOver(kid: string | null, topic: Topic, questions: Question[]): void {
  const key = carryKey(kid, topic);
  const list = stillHeld(key);
  const ids = new Set(list.map((c) => c.question.id));
  const at = Date.now();
  for (const q of questions) {
    if (list.length >= CARRY_MAX) break;
    if (isStarterId(q.id) || ids.has(q.id)) continue;
    ids.add(q.id);
    list.push({ question: q, at });
  }
  if (list.length) carried.set(key, list);
}

/** The kid playing's carried questions a round of `topic` at `skillLevel` can use, oldest first. */
function usable(topic: Topic, skillLevel: number) {
  const key = carryKey(activeKid(), topic);
  return { key, list: stillHeld(key), fits: (q: Question) => Math.abs(q.level - skillLevel) <= CARRY_LEVEL_BAND };
}

/** Up to `count` of the kid playing's carried questions for a round of `topic` at `skillLevel`, oldest first — taken, so no other round gets them. */
export function takeCarried(topic: Topic, skillLevel: number, count: number): Question[] {
  const { key, list, fits } = usable(topic, skillLevel);
  const taken = list.filter((c) => fits(c.question)).slice(0, count);
  const rest = list.filter((c) => !taken.includes(c));
  if (rest.length) carried.set(key, rest);
  else carried.delete(key);
  return taken.map((c) => c.question);
}

/** How many carried questions a round of `topic` at `skillLevel` would start with. */
export function carriedCount(topic: Topic, skillLevel: number): number {
  const { list, fits } = usable(topic, skillLevel);
  return list.filter((c) => fits(c.question)).length;
}

/** Forgets every carried question and fresh request (each test starts clean). */
export function clearCarried(): void {
  carried.clear();
  freshOnTheWay.clear();
}

/**
 * A round's fresh question on a rich bank (#30, #163 review). The quiz starts
 * on saved questions, so when the bank covers a round nothing asks Claude and
 * the bank would only grow when it runs short. This asks the way a round
 * always did — `count` questions, of which the server writes about one in
 * five fresh (`chooseFreshCount`, `NOVELTY_RATE`) — in the background, for the
 * kid's next round of the topic (`carryOver`): nothing waits for it. One at a
 * time a topic, and none while the next round is already covered.
 */
export function askFreshForNextRound(topic: Topic, age: number, skillLevel: number, count: number): void {
  const kid = activeKid();
  const key = carryKey(kid, topic);
  if (freshOnTheWay.has(key) || carriedCount(topic, skillLevel) >= count) return;
  freshOnTheWay.add(key);
  invokeGenerate(topic, age, skillLevel, count)
    .then(
      (qs) => carryOver(kid, topic, qs),
      (e) => console.warn("The next round's questions didn't come:", errorMessage(e)),
    )
    .finally(() => freshOnTheWay.delete(key));
}

/**
 * Warms the kid's next round of `topic` (#163): saved questions only, like a
 * zone's critters (B5) — nothing is written for a round the kid may never
 * play — and only as many as its carried-over questions, and a round's fresh
 * request still on its way, leave missing.
 */
export function warmNextRound(topic: Topic, age: number, skillLevel: number, count: number): void {
  const coming = freshOnTheWay.has(carryKey(activeKid(), topic)) ? count : 0;
  const ask = count - carriedCount(topic, skillLevel) - coming;
  if (ask > 0) prefetchQuestions(topic, age, skillLevel, count, undefined, { cacheOnly: true, ask });
}

/**
 * Whether a question is in the server's question bank — not a starter
 * question (B5), nor one that failed to cache ("fresh-…").
 */
export function inQuestionBank(id: string): boolean {
  return !!id && !id.startsWith('fresh-') && !isStarterId(id);
}

/** Reasons surfaced in the flag UI; free-form `reason` strings are also accepted. */
export type FlagReason = 'not_for_kids' | 'wrong_answer' | 'confusing' | 'difficulty';

/**
 * Flags a question for review (B10). The reporting family never gets it again
 * (the edge function); everyone else stops getting it once it's held back for
 * review — at once for "not OK for kids", after three families for any other
 * reason (migration 0015's trigger). Sent as the kid playing — the
 * `question_flags` RLS policy only accepts one of the signed-in grown-up's
 * kids (#124).
 */
export async function flagQuestion(questionId: string, reason?: FlagReason): Promise<void> {
  // A starter question (B5), or one that failed to cache ("fresh-…"), isn't
  // in the server's bank, so the FK insert would fail. Treat as no-op.
  if (!inQuestionBank(questionId)) return;

  const profile_id = useFamilyStore.getState().activeKidId;
  if (!profile_id) throw new Error('Please sign in to flag a question.');

  const { error } = await supabase
    .from('question_flags')
    .insert({ question_id: questionId, profile_id, reason: reason ?? null });
  if (error) throw new Error(`Couldn't flag question — ${errorMessage(error)}`);

  // A report gets the question checked again (#147): Claude Haiku, then a
  // stronger model if Haiku finds nothing. Not awaited — the child shouldn't
  // wait, and a check that never starts (the tab closed) is picked up later by
  // the owner's recheck script (`--reported`).
  void Promise.resolve()
    .then(() =>
      supabase.functions.invoke('generate-questions', {
        body: { action: 'check-report', questionId, profileId: profile_id },
      }),
    )
    .then((result) => {
      if (result?.error) console.warn('report check not started:', errorMessage(result.error));
    })
    .catch((err) => console.warn('report check not started:', errorMessage(err)));
}
