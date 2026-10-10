/**
 * Parent accounts (#118): the pictures a grown-up picks for each kid's tile on
 * "Who's playing?", and the privacy notice they agree to. Each kid opens their
 * profile with a 4-digit PIN (stored hashed by the database, migration 0013);
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
 * DRAFT, not yet reviewed by a lawyer (#118). Shown with a "Draft" badge
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
      'For each child you add: a nickname, their birth month and year, the picture you pick ' +
      'for them, their PIN (stored scrambled, so no one can read it back), and their game ' +
      'progress (answers, levels, items and saved game). We do not ' +
      "ask for a child's full name, email, photo, voice or location.",
  },
  {
    heading: 'How we use it',
    body:
      "To run the game: to save each child's progress and to pick questions that suit their " +
      'age and level. Nothing else — no ads, no selling or renting information, no public ' +
      'profiles, and no chat with other players.',
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
      "A child's information is kept while they are on your account. Removing a child in the " +
      'Grown-ups area deletes their information straight away. [RETENTION PERIOD for backups ' +
      'and closed accounts.]',
  },
  {
    heading: 'Your choices',
    body:
      "You can see, change or delete your children's information at any time in the " +
      'Grown-ups area. To close your whole account, or to stop us collecting anything more, ' +
      'email [CONTACT EMAIL] and we will delete it.',
  },
];
