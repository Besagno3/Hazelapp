// Supabase Edge Function: generate-questions
// ----------------------------------------------------------------------------
// Returns N age/level-appropriate quiz questions, mixing CACHED questions with
// freshly Claude-generated ones (how many of each: `chooseFreshCount`, #30).
//
// - Cached questions are reused from a ±2 level band around the requested
//   skill level (a level-5 player may see level 3-7 questions), sampled from
//   the whole band at random, leaning toward less-asked ones, and never one
//   written for a child more than AGE_SLACK years older
//   (`pick_cached_questions`, migration 0015, #134).
// - Fresh questions are generated at the exact skill level and inserted into
//   the cache with the age they were written for, then available for reuse.
// - Every question returned has its `times_asked` counter bumped.
// - The combined set is shuffled, so cache + fresh are randomly sprinkled.
// - A kid's recently SHOWN questions in the topic are held back (#24). The app
//   reports what it shows (`reportsSeen`, `mark_questions_seen`); what this
//   function hands over is only held back for RESERVE_MINUTES (#134).
//
// The Anthropic API key stays server-side (ANTHROPIC_API_KEY secret).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.
//
// Access (#88): callers must be signed in (401 otherwise), and every call goes
// through `begin_question_request` (migration 0009) — a per-kid rate limit
// (429 when exceeded) plus per-kid and project-wide daily budgets of FRESH
// questions. A login is a grown-up's family account (#124); the app must name
// the kid playing (`profileId`, one of the caller's kids — 400 without it), and
// each kid has their own budget and seen questions (migration 0014). When a
// budget is spent — or the quota check itself fails — the call is served from
// the cache only (re-using already-seen questions if it must), so play
// continues without spending more on Claude. Limits are tunable via env (see
// QUOTA_DEFAULTS).
//
// What reaches the prompt (Act I launch review B8): the topic (whitelisted),
// the level (1-10), the kid's age worked out HERE from their birth date, and
// at most one fixed flavour line picked by key (`flavor`). Nothing the caller
// types goes into the prompt; the old free-text `context` is ignored.
//
// When Claude fails (B5): a timeout, an API error, a cut-off or refused reply,
// or unparseable JSON — the batch is filled from the cache instead, and only
// when nothing is left does the kid see a friendly "try again" message.
//
// Deploy:  supabase functions deploy generate-questions
// ----------------------------------------------------------------------------

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js';

const MODEL = 'claude-haiku-4-5';

// Topic whitelist + question-writer persona lines. Kept INLINE so this
// function is a single self-contained file that deploys via any path (CLI,
// dashboard, or API) — a sibling `_shared/` import silently fails to bundle
// on non-CLI deploys (#67). The canonical copy for the app lives in
// `_shared/topics.ts`; `topicPrompts.test.ts` reads THIS file's text and
// fails if the two ever drift, so adding a topic still can't diverge silently.
const TOPIC_PROMPTS: Record<string, string> = {
  math: 'arithmetic, geometry, fractions, word problems.',
  science: 'nature, biology, physics, space, chemistry basics.',
  engineering: 'how things work, computers, materials, structures, simple logic.',
  creativity: 'art, colour, drawing, crafts, design, inventing, imagination — facts only (how colours mix, art tools, how things are made), never opinions.',
  nature: 'animals, plants, habitats, weather, the human body, the living world.',
  space: 'planets, stars, moons, the solar system, astronauts, rockets, the night sky.',
  history:
    'ancient civilizations, everyday life long ago, famous inventions and inventors, explorers, great buildings, the measurement of time — never wars, battles, disasters or religion.',
  geography: 'maps, countries, continents, oceans, rivers, mountains, landmarks, compass directions.',
  words: 'reading, spelling, rhymes, word meanings, opposites, stories, grammar basics.',
  music: 'rhythm, instruments, notes, songs, famous composers, how sound works.',
};
const TOPICS = Object.keys(TOPIC_PROMPTS);

// Question flavours (B8): the app sends a key, never text. Kept INLINE like
// TOPIC_PROMPTS (single-file deploys, #67); the canonical copy for the app is
// `_shared/flavors.ts`, and `questionFlavors.test.ts` fails if these drift.
const QUESTION_FLAVORS: Record<string, string> = {
  battle: 'a quick-thinking hero battling a critter',
  spell: 'a hero casting a powerful spell in battle',
  gate: "a gatekeeper's challenge on a path through a fantasy world",
  chest: "a magical treasure chest's riddle",
  shrine: 'a riddle from a shrine keeper teaching a spell',
  spire: "the final climb up a dark wizard's tower",
};
// Screening for kids (B10): the content rules for the prompt, the checks every
// question passes before a child sees it, and the blind second check. Kept
// INLINE (single-file deploys, #67); the canonical, tested copy is
// `_shared/questionScreen.ts`, and `questionScreen.test.ts` fails if the text
// between the markers ever differs.
// --- screen:start (identical in generate-questions/index.ts)
const CONTENT_RULES = `Content rules — these questions are for young children. Never break them:
- Nothing violent, scary or sad: no weapons, wars, fighting, death, injury, illness, disasters, crime or cruelty.
- No religion, gods or beliefs; no politics, governments, elections, current events or rivalries between countries.
- No real people who are alive today, and no one controversial. Famous people only from long ago, for what they made or discovered.
- No romance or dating. The body only as simple science (what the heart or lungs do); nothing medical, about diets or about weight.
- No brands, products, apps, video games, films, websites, links, phone numbers or email addresses.
- Facts only, each with one clear right answer — never opinions, tastes or "the best".
- The game's adventure tone (heroes, critters, riddles) is playful: nobody in a question is ever hurt.`;

const MAX_TEXT_CHARS = 220;
const MAX_OPTION_CHARS = 80;
const MAX_EXPLANATION_CHARS = 280;

/** Words a question for kids never needs (whole words, any case). The prompt's rules come first; this is the net. */
const BLOCKED_WORDS =
  /\b(kill(s|ed|ing)?|murder\w*|suicid\w*|rap(e|ed|es|ing|ist)|sex(y|ual\w*)?|porn\w*|nak(ed)|nude\w*|drugs?|cocaine|heroin|marijuana|alcohol\w*|beers?|wines?|vodka|whiske?y|cigarettes?|tobacco|guns?|rifles?|pistols?|shotguns?|bomb(s|ed|ing)?|terror\w*|genocide|holocaust|slave(s|ry)?|nazi\w*|hitler|wars?|warfare|bloody|corpses?|tortur\w*|execut(ed|ion|ions)|behead\w*|massacre\w*|stupid|idiots?|dumb|hell|damn\w*|crap|shit\w*|fuck\w*|bitch\w*|bastards?)\b/i;
/** A link, an email address or a phone number. */
const CONTACT_PATTERN =
  /(https?:\/\/|www\.|\b[\w.-]+\.(com|org|net|io|co|uk|gov|edu)\b|\S+@\S+\.\w+|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b)/i;

interface ScreenableQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
}

/** Why a question can't be shown to a child, or null when it passes. */
function screenQuestion(q: ScreenableQuestion): string | null {
  if (typeof q.text !== 'string' || q.text.trim() === '') return 'no question text';
  if (q.text.length > MAX_TEXT_CHARS) return 'question too long';
  if (!Array.isArray(q.options) || q.options.length !== 4) return 'not 4 options';
  if (q.options.some((o) => typeof o !== 'string' || o.trim() === '')) return 'an empty option';
  if (q.options.some((o) => o.length > MAX_OPTION_CHARS)) return 'an option too long';
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) return 'two options the same';
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) return 'no right answer';
  const explanation = q.explanation ?? '';
  if (typeof explanation !== 'string' || explanation.length > MAX_EXPLANATION_CHARS) return 'explanation too long';
  const all = [q.text, ...q.options, explanation].join('\n');
  if (CONTACT_PATTERN.test(all)) return 'a link, email or phone number';
  if (BLOCKED_WORDS.test(all)) return 'a word not for kids';
  return null;
}

/** The blind second check's instructions: answer each question, and judge it against the rules. */
function checkPrompt(age: number): string {
  return (
    `You check multiple-choice questions for a children's learning game, for a ${age}-year-old. ` +
    'For each question, in order, pick the option you think is right (0-based index), ' +
    'and say whether the question keeps every rule below and suits a child of that age.\n\n' +
    CONTENT_RULES
  );
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          answer: { type: 'integer', enum: [0, 1, 2, 3], description: '0-based index of the option you think is right.' },
          kidSafe: { type: 'boolean', description: 'True only if the question keeps every content rule.' },
        },
        required: ['answer', 'kidSafe'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
};

interface CheckVerdict {
  answer: number;
  kidSafe: boolean;
}

/**
 * The questions the second check agrees with: it picked the same answer and
 * found the question fit for a child. A reply that doesn't line up one verdict
 * per question keeps none — when unsure, a question isn't shown.
 */
function keepChecked<Q extends { correctIndex: number }>(questions: Q[], verdicts: CheckVerdict[] | null | undefined): Q[] {
  if (!Array.isArray(verdicts) || verdicts.length !== questions.length) return [];
  return questions.filter((q, i) => verdicts[i]?.kidSafe === true && verdicts[i]?.answer === q.correctIndex);
}
// --- screen:end

const TOPIC_PROMPT_BLOCK = TOPICS.map((id) => `- ${id}: ${TOPIC_PROMPTS[id]}`).join('\n');
const CACHE_LOOKUP_LIMIT = 200;
/** Cached questions may be up to this many levels above/below the player. */
const LEVEL_BAND = 2;
/**
 * A kid's most recently shown questions in a topic held back from reuse (#24,
 * #134) — per topic now; the old window was this many views of any topic.
 */
const SEEN_HISTORY_LIMIT = 100;
/** A question handed over but not shown yet is held back from that kid this long (#134). */
const RESERVE_MINUTES = 60;
/** Reuse skips questions written for a child more than this many years older (#134). */
const AGE_SLACK = 1;
/** Error codes for "pick_cached_questions doesn't exist" (PostgREST, Postgres): 0015 not applied. */
const PICKER_MISSING = ['PGRST202', '42883'];
/** Cache is "rich" once it has this many eligible rows per requested question (#30). */
const RICH_CACHE_MULTIPLE = 3;
/** Fraction of a batch that comes fresh from Claude when the cache is rich (#30). */
const NOVELTY_RATE = 0.2;
/**
 * Quota defaults (#88), overridable with the same-named Supabase secrets.
 * A battle asks for ~6 questions + 4 spell-tier ones, so 20 calls/minute is
 * far above real play; 200 fresh/day per player and 5000 fresh/day overall
 * cap the Claude bill while the shared cache keeps growing.
 */
const QUOTA_DEFAULTS = {
  QUESTION_RATE_PER_MINUTE: 20,
  FRESH_PER_PLAYER_PER_DAY: 200,
  FRESH_GLOBAL_PER_DAY: 5000,
};
function quotaSetting(name: keyof typeof QUOTA_DEFAULTS): number {
  const n = Number(Deno.env.get(name));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : QUOTA_DEFAULTS[name];
}
/** Claude calls give up after this long, with one retry (B5): a slow reply
 *  falls back to the cache well inside the function's own time limit. */
const ANTHROPIC_TIMEOUT_MS = 20_000;
const ANTHROPIC_MAX_RETRIES = 1;
/** Ages a kid profile can have (family.ts); a birth date outside is clamped. */
const MIN_AGE = 3;
const MAX_AGE = 18;
/** A player id as the app sends it (a uuid). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kid-facing message when the per-minute limit trips (shown on the retry screen). */
const SLOW_DOWN = 'The question wizards need a short rest — try again in a minute!';
/** Kid-facing message when questions can't be had right now (Claude down, quota
 *  check failed, nothing saved to fall back on). Never a raw error (B5, S6). */
const TRY_LATER = 'The question wizards are busy right now — try again in a minute!';
/** Kid-facing message when today's budget is spent and nothing saved is left. */
const COME_BACK_TOMORROW =
  "You've answered so many questions today that the question wizards need to write more! Try another topic, or come back tomorrow.";

const SYSTEM_PROMPT = `You are a question writer for "Hazel Quest", an educational quiz-battle game for children.

Generate multiple-choice questions that are:
- Factually accurate — every correct answer must be genuinely correct.
- Age-appropriate in vocabulary, concepts, and framing for the stated age.
- Calibrated to the stated difficulty level (1 = easiest, 10 = hardest).
- Fair: exactly one correct option; the other three are plausible but clearly wrong to someone who knows the material.
- Self-contained: no images, no "all of the above", no trick wording.

Each question has exactly 4 options. "correctIndex" is the 0-based index of the correct option.
"explanation" is one short, encouraging, kid-friendly sentence explaining the answer.

${CONTENT_RULES}

Topics:
${TOPIC_PROMPT_BLOCK}

Difficulty guidance: level 1-3 = simple recall for young children; 4-6 = applied
understanding; 7-10 = multi-step reasoning and harder concepts. A question must
always stay answerable by a child of the given age at that level.`;

const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The question, one sentence.' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exactly 4 answer choices.',
          },
          correctIndex: {
            type: 'integer',
            enum: [0, 1, 2, 3],
            description: '0-based index of the correct option.',
          },
          explanation: {
            type: 'string',
            description: 'One kid-friendly sentence explaining the answer.',
          },
        },
        required: ['text', 'options', 'correctIndex', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Whole-years age from a birth year + month (1-12), as the app's `calcAge`
 *  works it out (lib/age.ts), clamped to the ages a kid profile can have. */
function ageFrom(birthYear: number, birthMonth: number, now = new Date()): number {
  let age = now.getUTCFullYear() - birthYear;
  if (now.getUTCMonth() + 1 < birthMonth) age -= 1;
  return Math.min(MAX_AGE, Math.max(MIN_AGE, age));
}

/** Logs why a Claude call failed, most specific first (the SDK's typed errors). */
function logGenerationError(err: unknown): void {
  if (err instanceof Anthropic.APIConnectionError) {
    console.error('Claude unreachable or timed out:', err.message);
  } else if (err instanceof Anthropic.APIError) {
    console.error(`Claude API error ${err.status}:`, err.message);
  } else {
    console.error('Question generation failed:', err instanceof Error ? err.message : String(err));
  }
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * How many of `count` questions should come fresh from Claude, given how many
 * eligible cached rows are available for this player. (#30)
 *
 * - Empty cache  → all fresh.
 * - Rich cache   → prefer reuse, sprinkle ~NOVELTY_RATE for novelty.
 * - Thin cache   → use what we have, generate the rest.
 *
 * Pure for testability (validation happens manually since this is Deno).
 */
function chooseFreshCount(count: number, cacheSize: number): number {
  if (cacheSize === 0) return count;
  if (cacheSize >= count * RICH_CACHE_MULTIPLE) {
    return Math.max(0, Math.round(count * NOVELTY_RATE));
  }
  return Math.max(0, count - cacheSize);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface FreshQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface CacheRow {
  id: string;
  level: number;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  times_asked: number;
}

interface OutQuestion extends FreshQuestion {
  id: string;
  level: number;
  timesAsked: number;
}

/** Bank rows ready to reuse, each list in a random order. */
interface CachePool {
  /** Not seen by this kid lately. */
  cached: CacheRow[];
  /** Seen lately — used only when the fresh budget can't fill the batch (#88). */
  seenFallback: CacheRow[];
}

/**
 * The bank lookup from before migration 0015, used only when
 * `pick_cached_questions` is missing (fail-open, like the quota): the first
 * CACHE_LOOKUP_LIMIT rows of the band in whatever order Postgres returns them,
 * minus flagged ones and the kid's last SEEN_HISTORY_LIMIT views of any topic.
 */
async function legacyCachePool(
  db: SupabaseClient,
  topic: string,
  skillLevel: number,
  profileId: string,
): Promise<CachePool> {
  const { data, error } = await db
    .from('questions')
    .select('id, level, text, options, correct_index, explanation, times_asked')
    .eq('topic', topic)
    .gte('level', skillLevel - LEVEL_BAND)
    .lte('level', skillLevel + LEVEL_BAND)
    .limit(CACHE_LOOKUP_LIMIT);
  if (error) console.error('cache read failed:', error.message);
  const rows = (data ?? []) as CacheRow[];
  if (rows.length === 0) return { cached: [], seenFallback: [] };

  const { data: flagRows, error: flagErr } = await db
    .from('question_flags')
    .select('question_id')
    .in('question_id', rows.map((r) => r.id));
  if (flagErr) console.error('flag read failed:', flagErr.message);
  const flaggedSet = new Set((flagRows ?? []).map((r) => r.question_id as string));

  const { data: viewRows, error: viewErr } = await db
    .from('question_views')
    .select('question_id')
    .eq('profile_id', profileId)
    .order('seen_at', { ascending: false })
    .limit(SEEN_HISTORY_LIMIT);
  if (viewErr) console.error('view read failed:', viewErr.message);
  const seenSet = new Set((viewRows ?? []).map((r) => r.question_id as string));

  const unflagged = rows.filter((r) => !flaggedSet.has(r.id));
  return {
    cached: shuffle(unflagged.filter((r) => !seenSet.has(r.id))),
    seenFallback: shuffle(unflagged.filter((r) => seenSet.has(r.id))),
  };
}

function rowToOut(r: CacheRow): OutQuestion {
  return {
    id: r.id,
    level: r.level,
    text: r.text,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation ?? '',
    timesAsked: r.times_asked,
  };
}

/** Generates fresh questions with Claude and keeps only well-formed ones. */
async function generateFresh(
  anthropic: Anthropic,
  topic: string,
  age: number,
  level: number,
  n: number,
  flavorLine?: string,
): Promise<FreshQuestion[]> {
  // Optional flavour from the game (#37): lightly themes fresh questions
  // (gatekeeper riddles, boss battles…). Questions must stay self-contained —
  // the flavour is tone, not content — so cached reuse elsewhere still works.
  // `flavorLine` is always one of QUESTION_FLAVORS, never caller text (B8).
  const flavor = flavorLine
    ? ` Give the questions a light, fun adventure-story tone fitting this moment: ${flavorLine}. ` +
      'The questions must still stand alone and test the topic.'
    : '';
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: QUESTION_SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Generate ${n} "${topic}" questions for a ${age}-year-old ` +
          `at difficulty level ${level} of 10.` +
          flavor,
      },
    ],
  });

  // A reply cut off at max_tokens is broken JSON, and a refusal has no
  // questions: either way the caller falls back to the cache (B5).
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`Claude stopped early (stop_reason: ${message.stop_reason})`);
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No content returned from the model');
  }

  const parsed = JSON.parse(textBlock.text) as { questions: FreshQuestion[] };
  // Only questions that pass the screen (B10): shape, lengths, four different
  // options, no links or contact details, no words a kid's question never needs.
  return (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter((q) => {
      const why = screenQuestion(q);
      if (why) console.warn(`dropped a fresh question (${why}):`, JSON.stringify(q.text).slice(0, 120));
      return why === null;
    })
    .map(shuffleOptions);
}

/**
 * The blind second check (B10): another call answers each question without
 * being told the answer, and says whether it keeps the content rules. Only the
 * questions it agrees with are kept (`keepChecked`); a reply that doesn't line
 * up keeps none. A failed call throws, like a failed generation.
 */
async function checkFresh(anthropic: Anthropic, age: number, questions: FreshQuestion[]): Promise<FreshQuestion[]> {
  if (questions.length === 0) return [];
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: checkPrompt(age),
    output_config: { format: { type: 'json_schema', schema: CHECK_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: JSON.stringify(questions.map((q, i) => ({ number: i + 1, question: q.text, options: q.options }))),
      },
    ],
  });
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`The question check stopped early (stop_reason: ${message.stop_reason})`);
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No content returned from the question check');
  const { verdicts } = JSON.parse(textBlock.text) as { verdicts: CheckVerdict[] };
  const kept = keepChecked(questions, verdicts);
  if (kept.length < questions.length) {
    console.warn(`the question check dropped ${questions.length - kept.length} of ${questions.length}`);
  }
  return kept;
}

/** The second check runs unless the QUESTION_SECOND_CHECK secret is "off". */
function secondCheckOn(): boolean {
  return (Deno.env.get('QUESTION_SECOND_CHECK') ?? '').toLowerCase() !== 'off';
}

/**
 * The options in a random order, `correctIndex` following the right one. The
 * model tends to put the right answer in the same spot (most often B), so the
 * cache would teach kids a position instead of an answer. The app shuffles
 * again on arrival (`shuffleAnswers`), which also covers rows cached before this.
 */
function shuffleOptions(q: FreshQuestion): FreshQuestion {
  const order = shuffle([0, 1, 2, 3]);
  return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Server is missing ANTHROPIC_API_KEY' }, 500);

  let body: {
    topic?: string;
    age?: number;
    skillLevel?: number;
    count?: number;
    /** One of QUESTION_FLAVORS' keys (B8). */
    flavor?: string;
    /** Free-text flavour from apps before B8 — ignored, never sent to Claude. */
    context?: string;
    profileId?: string;
    /** The app marks what it shows (#134); an older app doesn't. */
    reportsSeen?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { topic, skillLevel } = body;
  const count = Math.min(Math.max(Math.round(Number(body.count ?? 5)) || 1, 1), 15);
  // Flavour by key only (B8): an unknown key, or the old free-text `context`,
  // just means no flavour. `Object.hasOwn` so "constructor" isn't a key.
  const flavorLine =
    typeof body.flavor === 'string' && Object.hasOwn(QUESTION_FLAVORS, body.flavor)
      ? QUESTION_FLAVORS[body.flavor]
      : undefined;

  if (!topic || !TOPICS.includes(topic as (typeof TOPICS)[number])) {
    // The app matches this wording (`UNKNOWN_TOPIC`, src/lib/questions.ts) to tell a
    // child a topic isn't ready yet — keep it, and add no `detail`, or they see this text.
    return json({ error: `topic must be one of: ${TOPICS.join(', ')}` }, 400);
  }
  if (typeof skillLevel !== 'number' || !Number.isFinite(skillLevel) || skillLevel < 1 || skillLevel > 10) {
    return json({ error: 'skillLevel must be a number between 1 and 10' }, 400);
  }
  // Levels are whole numbers 1-10; the cache is keyed by them.
  const level = Math.round(skillLevel);
  // The caller's `age` is not trusted: it's worked out from the kid's birth
  // date below (B8). It's still accepted so older apps don't get a 400.

  // Service-role client for the question cache (bypasses RLS).
  const dbUrl = Deno.env.get('SUPABASE_URL');
  const dbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const db: SupabaseClient | null = dbUrl && dbKey ? createClient(dbUrl, dbKey) : null;

  // Identify the caller (#88): signed-in players only. The anon key is public
  // (it ships in the web bundle), so without this anyone could spend the
  // project's Claude budget.
  if (!dbUrl || !anonKey || !db) {
    return json({ error: 'Server is missing Supabase configuration' }, 500);
  }
  const authHeader = req.headers.get('Authorization');
  let callerId: string | null = null;
  if (authHeader) {
    try {
      const userClient = createClient(dbUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      callerId = userData?.user?.id ?? null;
    } catch (e) {
      console.error('auth lookup failed:', e instanceof Error ? e.message : String(e));
    }
  }
  if (!callerId) return json({ error: 'Please sign in to play.' }, 401);

  // Which kid is playing (#124): the app must name one of the grown-up's kids
  // (B9). The per-kid budget, the dedupe (#24) and the age in the prompt all
  // follow them. Without a kid there is no budget to charge, so the call is
  // refused rather than let through unlimited; an app from before parent
  // accounts (the only one that sent none) needs a refresh anyway.
  if (body.profileId === undefined) {
    return json({ error: 'profileId is required', detail: 'Please refresh the page to keep playing.' }, 400);
  }
  if (typeof body.profileId !== 'string' || !UUID_RE.test(body.profileId)) {
    return json({ error: 'profileId must be a player id' }, 400);
  }
  const { data: kid, error: kidErr } = await db
    .from('profiles')
    .select('id, birth_year, birth_month')
    .eq('id', body.profileId)
    .eq('parent_id', callerId)
    .maybeSingle();
  if (kidErr) {
    console.error('player lookup failed (is migration 0013 applied?):', kidErr.message);
    return json({ error: 'player_lookup_failed', detail: TRY_LATER }, 503);
  }
  if (!kid) return json({ error: 'That player belongs to another account.' }, 403);
  const profileId = kid.id as string;
  const age = ageFrom(Number(kid.birth_year), Number(kid.birth_month));

  // Rate limit + fresh-question budget (#88). If the check itself fails (the
  // migration isn't applied, the database is unwell) it fails CLOSED (B9):
  // no fresh questions from Claude, only the cache — so a broken check can
  // never mean an unlimited bill. Logged loudly either way.
  let freshAllowance = count;
  let requestId: number | null = null;
  let quotaUnavailable = false;
  {
    const { data: quota, error: quotaErr } = await db.rpc('begin_question_request', {
      p_profile: profileId,
      p_max_per_minute: quotaSetting('QUESTION_RATE_PER_MINUTE'),
      p_fresh_per_day: quotaSetting('FRESH_PER_PLAYER_PER_DAY'),
      p_fresh_global: quotaSetting('FRESH_GLOBAL_PER_DAY'),
    });
    const row = Array.isArray(quota) ? quota[0] : quota;
    if (quotaErr || !row) {
      console.error(
        'QUOTA CHECK FAILED — serving saved questions only (is migration 0009 applied?):',
        quotaErr?.message ?? 'no row',
      );
      freshAllowance = 0;
      quotaUnavailable = true;
    } else if (!row.allowed) {
      return json({ error: 'rate_limited', detail: SLOW_DOWN }, 429);
    } else {
      freshAllowance = Math.max(0, Number(row.fresh_allowance) || 0);
      requestId = row.request_id ?? null;
    }
  }

  try {
    // 1. Reusable questions for this topic within ±LEVEL_BAND of the player,
    // sampled from the whole band (#134): only 'active' and 'approved' ones,
    // approved first, none this kid's family has reported (B10, migration
    // 0016 — a report hides a question from everyone only through its
    // status), none written for a child more than AGE_SLACK years older, and
    // the kid's recently shown ones in the topic (#24) set aside as a last
    // resort for when the fresh budget (#88) can't cover the batch. Without
    // migration 0015 the old lookup runs instead (fail-open, logged loudly).
    let pool: CachePool;
    let has0015 = false;
    const { data: picked, error: pickErr } = await db.rpc('pick_cached_questions', {
      p_topic: topic,
      p_min_level: level - LEVEL_BAND,
      p_max_level: level + LEVEL_BAND,
      p_max_age: age + AGE_SLACK,
      p_profile: profileId,
      p_seen_limit: SEEN_HISTORY_LIMIT,
      p_reserve: `${RESERVE_MINUTES} minutes`,
      p_limit: CACHE_LOOKUP_LIMIT,
    });
    if (pickErr) {
      // Only "no such function" means 0015 isn't applied. Any other failure
      // (a timeout, say) still stores ages and holds, or the questions made
      // now would escape the age rule for good.
      has0015 = !PICKER_MISSING.includes(pickErr.code ?? '');
      console.error(
        has0015
          ? 'QUESTION PICKER FAILED — using the old lookup:'
          : 'QUESTION PICKER MISSING (is migration 0015 applied?) — using the old lookup:',
        pickErr.code,
        pickErr.message,
      );
      pool = await legacyCachePool(db, topic, level, profileId);
    } else {
      has0015 = true;
      const rows = (picked ?? []) as (CacheRow & { seen: boolean })[];
      pool = { cached: rows.filter((r) => !r.seen), seenFallback: rows.filter((r) => r.seen) };
    }
    // Saved questions pass the same screen as fresh ones (B10), so rows cached
    // before the screen existed are checked too. The lists keep their order.
    const passes = (r: CacheRow) => screenQuestion(rowToOut(r)) === null;
    const cached = pool.cached.filter(passes);
    const seenFallback = pool.seenFallback.filter(passes);

    // 2. Split the batch using the cache-richness policy (#30): a rich cache
    //    leans heavily on reuse with a sprinkle of fresh for novelty; a thin
    //    cache uses what's available and generates the rest.
    //    The fresh share is capped by the caller's remaining budget (#88);
    //    anything the budget can't cover is topped up from already-seen
    //    cached questions, so the batch stays full whenever the bank can.
    //    Both lists are already in a random order (the picker's leans toward
    //    less-asked questions), so take them from the front.
    const freshCount = Math.min(chooseFreshCount(count, cached.length), freshAllowance);
    const reuseCount = count - freshCount;
    // Approved questions come first (B10) — the picker orders them so.
    const reused = cached.slice(0, reuseCount);
    if (reused.length < reuseCount) {
      reused.push(...seenFallback.slice(0, reuseCount - reused.length));
    }

    // 3. Generate the fresh questions (at the exact level) and cache them. A
    //    failed call is not the kid's problem (B5): it's logged, and the batch
    //    is filled from the cache below.
    let fresh: OutQuestion[] = [];
    let generated: FreshQuestion[] = [];
    let generationFailed = false;
    if (freshCount > 0) {
      try {
        const anthropic = new Anthropic({
          apiKey,
          timeout: ANTHROPIC_TIMEOUT_MS,
          maxRetries: ANTHROPIC_MAX_RETRIES,
        });
        // A few spare, since the screen and the second check may drop some (B10).
        const asked = freshCount + Math.ceil(freshCount / 3);
        generated = await generateFresh(anthropic, topic, age, level, asked, flavorLine);
        if (secondCheckOn()) generated = await checkFresh(anthropic, age, generated);
        generated = generated.slice(0, freshCount);
      } catch (err) {
        generated = [];
        generationFailed = true;
        logGenerationError(err);
      }

      if (db && generated.length > 0) {
        const rows = generated.map((q) => ({
          topic,
          level,
          // The age it was written for (#134) — only once 0015 added the column.
          ...(has0015 ? { age } : {}),
          text: q.text,
          options: q.options,
          correct_index: q.correctIndex,
          explanation: q.explanation,
          times_asked: 1,
        }));
        const { data: inserted, error: insErr } = await db
          .from('questions')
          .insert(rows)
          .select('id, level, text, options, correct_index, explanation, times_asked');
        if (insErr || !inserted) {
          console.error('cache insert failed:', insErr?.message);
          fresh = generated.map((q, i) => ({
            ...q,
            id: `fresh-${Date.now()}-${i}`,
            level,
            timesAsked: 1,
          }));
        } else {
          fresh = (inserted as CacheRow[]).map(rowToOut);
        }
      } else {
        fresh = generated.map((q, i) => ({
          ...q,
          id: `fresh-${Date.now()}-${i}`,
          level,
          timesAsked: 0,
        }));
      }
    }

    // 3a. Claude delivered fewer than asked (it failed, or dropped malformed
    //     ones): top the batch up from the bank — unseen first, then seen.
    const shortBy = freshCount - fresh.length;
    if (shortBy > 0) {
      const taken = new Set(reused.map((r) => r.id));
      // Already in a random order (the picker's leans toward less-asked ones, #134).
      const spare = [...cached, ...seenFallback].filter((r) => !taken.has(r.id));
      reused.push(...spare.slice(0, shortBy));
    }

    // 4. Bump the ask-counter on every reused question.
    if (db && reused.length > 0) {
      const { error: rpcErr } = await db.rpc('increment_question_usage', {
        ids: reused.map((r) => r.id),
      });
      if (rpcErr) console.error('counter update failed:', rpcErr.message);
    }

    // 4a. Charge the fresh questions to the caller's daily budget (#88).
    if (requestId !== null && fresh.length > 0) {
      const { error: usageErr } = await db
        .from('question_requests')
        .update({ fresh_count: fresh.length })
        .eq('id', requestId);
      if (usageErr) console.error('usage update failed:', usageErr.message);
    }

    // 5. Sprinkle reused + fresh together randomly.
    const reusedOut = reused.map((r) => ({ ...rowToOut(r), timesAsked: r.times_asked + 1 }));
    const questions = shuffle([...reusedOut, ...fresh]);

    // Nothing to give: say why in words a kid can read (never a raw error).
    if (questions.length === 0) {
      if (!generationFailed && !quotaUnavailable && freshAllowance === 0) {
        return json({ error: 'budget_exhausted', detail: COME_BACK_TOMORROW }, 429);
      }
      return json({ error: 'questions_unavailable', detail: TRY_LATER }, 503);
    }

    // 6. Record this delivery in question_views (#24). An app that reports
    // what it shows (#134) gets a hold for RESERVE_MINUTES (`shown: false`) —
    // a batch fetched ahead for a battle that never happens doesn't count as
    // seen; an older app's delivery counts as seen, as before. Best-effort —
    // a write failure is logged but does not break the response.
    if (db) {
      const onlyHeld = has0015 && body.reportsSeen === true;
      // Synthetic IDs (fresh-…) only appear when the cache insert failed and
      // the question isn't in the questions table — skip those so the FK holds.
      const viewRows = questions
        .filter((q) => !q.id.startsWith('fresh-'))
        .map((q) => ({ profile_id: profileId, question_id: q.id, ...(onlyHeld ? { shown: false } : {}) }));
      if (viewRows.length > 0) {
        const { error: viewInsErr } = await db.from('question_views').insert(viewRows);
        if (viewInsErr) console.error('view insert failed:', viewInsErr.message);
      }
    }

    return json({
      topic,
      age,
      skillLevel: level,
      reused: reused.length,
      generated: fresh.length,
      questions,
    });
  } catch (err) {
    // Claude's own failures are handled above; this is anything else. The
    // details go to the log, never to a kid's screen (S6).
    console.error('Unexpected error serving questions:', err);
    return json({ error: 'Unexpected server error', detail: TRY_LATER }, 500);
  }
});
