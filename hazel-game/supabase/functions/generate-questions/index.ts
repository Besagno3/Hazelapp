// Supabase Edge Function: generate-questions
// ----------------------------------------------------------------------------
// Generates age-appropriate quiz questions with the Claude API.
// The Anthropic API key stays server-side — it is NEVER exposed to the browser.
//
// Deploy:  supabase functions deploy generate-questions
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// JWT verification is on by default, so only signed-in Hazel Quest players can
// call this. The client invokes it via supabase.functions.invoke (see
// src/lib/questions.ts).
// ----------------------------------------------------------------------------

// Pin a specific version for production reproducibility, e.g.
// 'npm:@anthropic-ai/sdk@0.69.0' — left unpinned here to resolve the latest.
import Anthropic from 'npm:@anthropic-ai/sdk';

// Per the claude-api guidance: default to the most capable model. For lower
// cost/latency you may switch to 'claude-haiku-4-5' — that is a deliberate
// downgrade, so it's left as the strong default.
const MODEL = 'claude-opus-4-7';

const TOPICS = ['math', 'science', 'engineering', 'creativity'] as const;

// Stable instruction prefix — kept byte-identical across requests so it can be
// prompt-cached. Caching only engages once this prefix exceeds the model's
// minimum cacheable size; structuring it stably costs nothing and pays off as
// the prompt grows. Volatile inputs (topic/age/level) go in the user message.
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

// JSON Schema for structured output. Note: structured-output schemas do not
// support array length constraints, so "exactly 4 options" is enforced by the
// prompt and re-checked below.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Server is missing ANTHROPIC_API_KEY' }, 500);

  let body: { topic?: string; age?: number; skillLevel?: number; count?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { topic, age, skillLevel } = body;
  const count = Math.min(Math.max(body.count ?? 5, 1), 15);

  if (!topic || !TOPICS.includes(topic as (typeof TOPICS)[number])) {
    return json({ error: `topic must be one of: ${TOPICS.join(', ')}` }, 400);
  }
  if (typeof age !== 'number' || age < 3 || age > 100) {
    return json({ error: 'age must be a number between 3 and 100' }, 400);
  }
  if (typeof skillLevel !== 'number' || skillLevel < 1 || skillLevel > 10) {
    return json({ error: 'skillLevel must be a number between 1 and 10' }, 400);
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: QUESTION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content:
            `Generate ${count} "${topic}" questions for a ${age}-year-old ` +
            `at difficulty level ${skillLevel} of 10.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return json({ error: 'No content returned from the model' }, 502);
    }

    const parsed = JSON.parse(textBlock.text) as {
      questions: Array<{
        text: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;
    };

    // Keep only well-formed 4-option questions with a valid answer index.
    const questions = parsed.questions.filter(
      (q) =>
        typeof q.text === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < 4,
    );

    return json({ topic, age, skillLevel, questions });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}:`, err.message);
      return json({ error: 'Question generation failed', detail: err.message }, 502);
    }
    console.error('Unexpected error generating questions:', err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
