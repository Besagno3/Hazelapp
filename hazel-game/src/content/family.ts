/**
 * Parent accounts (#124): the pictures a grown-up picks for each kid's tile on
 * "Who's playing?", and the privacy notice they agree to. Each kid opens their
 * profile with a 4-digit PIN (stored hashed by the database, migration 0014);
 * the database stores the picture's id.
 */

export const KID_ICONS = [
  { id: 'fox', emoji: '🦊', name: 'Fox' },
  { id: 'panda', emoji: '🐼', name: 'Panda' },
  { id: 'frog', emoji: '🐸', name: 'Frog' },
  { id: 'lion', emoji: '🦁', name: 'Lion' },
  { id: 'octopus', emoji: '🐙', name: 'Octopus' },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn' },
  { id: 'penguin', emoji: '🐧', name: 'Penguin' },
  { id: 'bunny', emoji: '🐰', name: 'Bunny' },
  { id: 'tiger', emoji: '🐯', name: 'Tiger' },
  { id: 'koala', emoji: '🐨', name: 'Koala' },
  { id: 'dino', emoji: '🦖', name: 'Dino' },
  { id: 'bee', emoji: '🐝', name: 'Bee' },
] as const;
export type KidIconId = (typeof KID_ICONS)[number]['id'];

/** A kid's tile picture (⭐ for a kid from before parent accounts, who has none). */
export function kidIcon(id: string | null): string {
  return KID_ICONS.find((i) => i.id === id)?.emoji ?? '⭐';
}

/** Digits in a kid's or a grown-up's PIN (the database checks it too). */
export const PIN_LENGTH = 4;

export function isPin(s: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(s);
}

/** Longest nickname (the database checks it too). */
export const MAX_KID_NAME = 20;

/** Birth years offered for a player aged about 3 to 18. */
export const KID_BIRTH_YEARS = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - 3 - i);

/**
 * The privacy notice's version, recorded with a grown-up's consent. Bump it
 * when the wording changes; `record_consent` stores whichever was agreed to.
 */
export const CONSENT_VERSION = '2026-10-draft';

/**
 * The shortest password the sign-up and reset forms take: Supabase Auth's
 * default minimum. Keep it equal to the project's setting (Auth → Providers →
 * Email); the server checks it too.
 */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * DRAFT, not yet reviewed by a lawyer (#124). Shown with a "Draft" badge
 * while this is true; replace the text, set a new CONSENT_VERSION and turn
 * this off before the game is offered to other families. Words in
 * [BRACKETS] are for the owner to fill in.
 */
export const PRIVACY_IS_DRAFT = true;

export const PRIVACY_NOTICE: { heading: string; body: string }[] = [
  {
    heading: 'Who we are',
    body:
      'Hazel Quest is run by [OPERATOR NAME], [ADDRESS]. Questions about privacy or your ' +
      "child's information: [CONTACT EMAIL].",
  },
  {
    heading: 'What we collect',
    body:
      'From you, the grown-up: your email address and password, to run your family account. ' +
      'For each child: a nickname, their birth month and year, the picture you pick, their PIN ' +
      '(stored scrambled, so no one can read it back) and their game progress (answers, levels, ' +
      'items and saved game). For each day they play, we also keep a note: how long they ' +
      'played, the XP they earned, their right and wrong answers in each topic, and the level ' +
      "each topic reached. We do not ask for a child's full name, email, photo, voice or location.",
  },
  {
    heading: 'How we use it',
    body:
      "To run the game: to save each child's progress, to pick questions that suit their " +
      'age and level, and to show you how they are doing in the Grown-ups area. Nothing ' +
      'else — no ads, no selling or renting information, no public profiles, and no chat ' +
      'with other players.',
  },
  {
    heading: 'Who else sees it',
    body:
      'Questions are written by an AI service (Anthropic). It is sent only the topic, an age ' +
      'in years and a difficulty level — never a name or anything that identifies your child. ' +
      'The game is hosted by service providers (Supabase for accounts and saved games, Vercel ' +
      'for the website) who keep the information on our behalf and may not use it for ' +
      'anything else.',
  },
  {
    heading: 'How long we keep it',
    body:
      "A child's information is kept while they are on your account. Each day's note is kept " +
      "for five weeks; after that your family can't see it, and it is deleted as the game tidies " +
      'up (as children play). Only the date of their first day stays, to show from when days ' +
      'played are recorded. Removing a child in the Grown-ups area deletes their information ' +
      'straight away, except a count of the new questions written for them that day, without ' +
      "their name, kept for one day so your family's daily question limit still works. Closing " +
      "your account deletes your login and every child's information straight away, keeping " +
      'only that nameless count for one day. [RETENTION PERIOD for backups.]',
  },
  {
    heading: 'Your choices',
    body:
      "You can see, change or delete your children's information at any time in the " +
      'Grown-ups area, which opens with your grown-up PIN or your password and locks again ' +
      'when you leave it (or after 15 minutes). You can change the email and password you sign ' +
      'in with there, and close your whole account there too ("Close account", at the ' +
      'bottom): after you type your password and the word DELETE, it deletes your login and everything about ' +
      'your children straight away, and we collect nothing more. If you can\'t sign in, ' +
      'email [CONTACT EMAIL] and we will close it for you.',
  },
];
