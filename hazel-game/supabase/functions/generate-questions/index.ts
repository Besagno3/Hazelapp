// Supabase Edge Function: generate-questions
// ----------------------------------------------------------------------------
// Returns N age/level-appropriate quiz questions, mixing CACHED questions with
// freshly Claude-generated ones. The reuse split is random: each call randomly
// reuses 0..min(count, available) cached questions and generates the rest.
//
// - Cached questions are reused from a ±2 level band around the requested
//   skill level (a level-5 player may see level 3-7 questions).
// - Fresh questions are generated at the exact skill level and inserted into
//   the cache, then available for future reuse.
// - Every question returned has its `times_asked` counter bumped.
// - The combined set is shuffled, so cache + fresh are randomly sprinkled.
//
// The Anthropic API key stays server-side (ANTHROPIC_API_KEY secret).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.
//
// Deploy:  supabase functions deploy generate-questions
// ----------------------------------------------------------------------------

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js';

const MODEL = 'claude-haiku-4-5';
const TOPICS = ['math', 'science', 'engineering', 'creativity'] as const;
const CACHE_LOOKUP_LIMIT = 200;
/** Cached questions may be up to this many levels above/below the player. */
const LEVEL_BAND = 2;
/** Most-recent views excluded per profile (see ISSUES.md #24). */
const SEEN_HISTORY_LIMIT = 100;
/** Cache is "rich" once it has this many eligible rows per requested question (#30). */
const RICH_CACHE_MULTIPLE = 3;
/** Fraction of a batch that comes fresh from Claude when the cache is rich (#30). */
const NOVELTY_RATE = 0.2;

const SYSTEM_PROMPT = `You are a question writer for "Hazel Quest", an educational quiz-battle game for children.

Generate multiple-choice questions that are:
- Factually accurate — every correct answer must be genuinely correct.
- Age-appropriate in vocabulary, concepts, and framing for the stated age.
- Calibrated to the stated difficulty level (1 = easiest, 10 = hardest).
- Fair: exactly one correct option; the other three are plausible but clearly wrong to someone who knows the material.
- Self-contained: no images, no "all of the above", no trick wording.

Each question has exactly 4 options. "correctIndex" is the 0-based index of the correct option.
"explanation" is one short, encouraging, kid-friendly sentence explaining the answer.

Topics:
- math: arithmetic, geometry, fractions, word problems.
- science: nature, biology, physics, space, chemistry basics.
- engineering: how things work, computers, materials, structures, simple logic.
- creativity: art, music, colour, writing, design, imagination.

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
  context?: string,
): Promise<FreshQuestion[]> {
  // Optional flavor hint from the game (#37): lightly themes fresh questions
  // (gatekeeper riddles, boss battles…). Questions must stay self-contained —
  // the flavor is tone, not content — so cached reuse elsewhere still works.
  const flavor = context
    ? ` Give the questions a light, fun adventure-story tone fitting this moment: ${context}. ` +
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

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No content returned from the model');
  }

  const parsed = JSON.parse(textBlock.text) as { questions: FreshQuestion[] };
  return parsed.questions.filter(
    (q) =>
      typeof q.text === 'string' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < 4,
  );
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
    context?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { topic, age, skillLevel } = body;
  const count = Math.min(Math.max(body.count ?? 5, 1), 15);
  // Optional flavor hint (#37) — clamp length so it can't bloat the prompt.
  const context =
    typeof body.context === 'string' && body.context.trim()
      ? body.context.trim().slice(0, 300)
      : undefined;

  if (!topic || !TOPICS.includes(topic as (typeof TOPICS)[number])) {
    return json({ error: `topic must be one of: ${TOPICS.join(', ')}` }, 400);
  }
  if (typeof age !== 'number' || age < 3 || age > 100) {
    return json({ error: 'age must be a number between 3 and 100' }, 400);
  }
  if (typeof skillLevel !== 'number' || skillLevel < 1 || skillLevel > 10) {
    return json({ error: 'skillLevel must be a number between 1 and 10' }, 400);
  }

  // Service-role client for the question cache (bypasses RLS).
  const dbUrl = Deno.env.get('SUPABASE_URL');
  const dbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const db: SupabaseClient | null = dbUrl && dbKey ? createClient(dbUrl, dbKey) : null;

  // Identify the caller (for per-player dedupe, #24). Anonymous calls skip dedupe.
  let profileId: string | null = null;
  if (dbUrl && anonKey) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const userClient = createClient(dbUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await userClient.auth.getUser();
        profileId = userData?.user?.id ?? null;
      } catch (e) {
        console.error('auth lookup failed:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  try {
    // 1. Read cached questions for this topic, within ±LEVEL_BAND of the player.
    let cached: CacheRow[] = [];
    if (db) {
      const { data, error } = await db
        .from('questions')
        .select('id, level, text, options, correct_index, explanation, times_asked')
        .eq('topic', topic)
        .gte('level', skillLevel - LEVEL_BAND)
        .lte('level', skillLevel + LEVEL_BAND)
        .limit(CACHE_LOOKUP_LIMIT);
      if (error) console.error('cache read failed:', error.message);
      else cached = (data ?? []) as CacheRow[];
    }

    // 1a. Exclude flagged questions (#26) and the player's recently-seen ones (#24).
    if (db && cached.length > 0) {
      const cachedIds = cached.map((r) => r.id);

      const { data: flagRows, error: flagErr } = await db
        .from('question_flags')
        .select('question_id')
        .in('question_id', cachedIds);
      if (flagErr) console.error('flag read failed:', flagErr.message);
      const flaggedSet = new Set((flagRows ?? []).map((r) => r.question_id as string));

      let seenSet = new Set<string>();
      if (profileId) {
        const { data: viewRows, error: viewErr } = await db
          .from('question_views')
          .select('question_id')
          .eq('profile_id', profileId)
          .order('seen_at', { ascending: false })
          .limit(SEEN_HISTORY_LIMIT);
        if (viewErr) console.error('view read failed:', viewErr.message);
        seenSet = new Set((viewRows ?? []).map((r) => r.question_id as string));
      }

      cached = cached.filter((r) => !flaggedSet.has(r.id) && !seenSet.has(r.id));
    }

    // 2. Split the batch using the cache-richness policy (#30): a rich cache
    //    leans heavily on reuse with a sprinkle of fresh for novelty; a thin
    //    cache uses what's available and generates the rest.
    const freshCount = chooseFreshCount(count, cached.length);
    const reuseCount = count - freshCount;
    const reused = shuffle(cached).slice(0, reuseCount);

    // 3. Generate the fresh questions (at the exact level) and cache them.
    let fresh: OutQuestion[] = [];
    if (freshCount > 0) {
      const anthropic = new Anthropic({ apiKey });
      const generated = await generateFresh(anthropic, topic, age, skillLevel, freshCount, context);

      if (db && generated.length > 0) {
        const rows = generated.map((q) => ({
          topic,
          level: skillLevel,
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
            level: skillLevel,
            timesAsked: 1,
          }));
        } else {
          fresh = (inserted as CacheRow[]).map(rowToOut);
        }
      } else {
        fresh = generated.map((q, i) => ({
          ...q,
          id: `fresh-${Date.now()}-${i}`,
          level: skillLevel,
          timesAsked: 0,
        }));
      }
    }

    // 4. Bump the ask-counter on every reused question.
    if (db && reused.length > 0) {
      const { error: rpcErr } = await db.rpc('increment_question_usage', {
        ids: reused.map((r) => r.id),
      });
      if (rpcErr) console.error('counter update failed:', rpcErr.message);
    }

    // 5. Sprinkle reused + fresh together randomly.
    const reusedOut = reused.map((r) => ({ ...rowToOut(r), timesAsked: r.times_asked + 1 }));
    const questions = shuffle([...reusedOut, ...fresh]);

    // 6. Record this delivery in question_views so the player won't see the
    // same ones for the next SEEN_HISTORY_LIMIT views (#24). Best-effort —
    // a write failure is logged but does not break the response.
    if (db && profileId && questions.length > 0) {
      // Synthetic IDs (fresh-…) only appear when the cache insert failed and
      // the question isn't in the questions table — skip those so the FK holds.
      const viewRows = questions
        .filter((q) => !q.id.startsWith('fresh-'))
        .map((q) => ({ profile_id: profileId, question_id: q.id }));
      if (viewRows.length > 0) {
        const { error: viewInsErr } = await db.from('question_views').insert(viewRows);
        if (viewInsErr) console.error('view insert failed:', viewInsErr.message);
      }
    }

    return json({
      topic,
      age,
      skillLevel,
      reused: reused.length,
      generated: fresh.length,
      questions,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}:`, err.message);
      return json(
        { error: 'Question generation failed', detail: `Anthropic ${err.status}: ${err.message}` },
        502,
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Unexpected error generating questions:', err);
    return json({ error: 'Unexpected server error', detail }, 500);
  }
});
