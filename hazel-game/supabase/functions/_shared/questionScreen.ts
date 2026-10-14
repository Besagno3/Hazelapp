/**
 * Screening AI questions for kids (Act I launch review B10). The canonical,
 * tested copy of the block between the markers below; generate-questions keeps
 * an identical copy INLINE (single-file deploys, #67), and
 * `src/lib/questionScreen.test.ts` fails if the two ever differ.
 *
 * Three layers, all in the function:
 *   1. CONTENT_RULES go into the question writer's system prompt.
 *   2. `screenQuestion` drops anything malformed or plainly unsuitable — fresh
 *      questions and saved ones alike, so rows cached before these rules are
 *      screened too.
 *   3. A blind second check: another call answers each fresh question without
 *      being told the answer and says whether it suits a child
 *      (`CHECK_SCHEMA`); `keepChecked` keeps only the ones it agrees with.
 *
 * Deliberately dependency-free: imported by vitest through this file.
 */

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

export { CONTENT_RULES, CHECK_SCHEMA, checkPrompt, keepChecked, screenQuestion };
export type { CheckVerdict, ScreenableQuestion };
