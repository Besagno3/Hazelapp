import { supabase } from './supabase';
import type { Question, Topic } from '../types';

/** Raw shape returned by the generate-questions edge function. */
interface GeneratedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Generates age-appropriate questions via the `generate-questions` Supabase
 * Edge Function (which calls the Claude API server-side). The caller's auth
 * token is attached automatically by supabase-js.
 */
export async function fetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count = 5,
): Promise<Question[]> {
  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: { topic, age, skillLevel, count },
  });
  if (error) throw new Error(`Question generation failed: ${error.message}`);

  const generated = (data?.questions ?? []) as GeneratedQuestion[];
  return generated.map((q, i) => ({
    id: `${topic}-l${skillLevel}-${Date.now()}-${i}`,
    topic,
    level: skillLevel,
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));
}
