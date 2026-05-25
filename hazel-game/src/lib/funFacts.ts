import type { Topic } from '../types';

/**
 * Short, kid-friendly facts shown on the loading screen while Claude generates
 * questions. Topic-specific when the loading context knows which topic is
 * coming; falls back to GENERIC otherwise (e.g. world map → battle transitions).
 */
export const FUN_FACTS: Record<Topic, string[]> = {
  math: [
    'Did you know? Zero is the only number that can’t be written as a Roman numeral.',
    'A “googol” is a 1 followed by 100 zeros — more than every atom in the universe.',
    'Add up every number from 1 to 100 and you get exactly 5,050.',
    'A perfect square (like 9 or 16) has an odd number of factors. Other numbers have an even number.',
    'There are infinitely many prime numbers — and we’ll never run out of new ones.',
  ],
  science: [
    'Did you know? Bananas are technically berries, but strawberries are not.',
    'Your stomach builds a brand-new lining every 3-4 days so it doesn’t digest itself.',
    'A teaspoon of a neutron star would weigh about a billion tons on Earth.',
    'Honey never spoils — jars found in 3,000-year-old Egyptian tombs were still edible.',
    'Octopuses have three hearts and blue blood.',
  ],
  engineering: [
    'Did you know? Wi-Fi signals are just very slow microwaves.',
    'The Eiffel Tower can grow about 6 inches taller in summer because heat expands the iron.',
    'A single Lego brick can support the weight of around 375,000 other Lego bricks.',
    'The first computer mouse, built in 1964, was made of wood.',
    'Bridges have small gaps so they can expand on hot days without cracking.',
  ],
  creativity: [
    'Did you know? Van Gogh painted “The Starry Night” from his window in an asylum.',
    'The color “Vantablack” absorbs 99.965% of light — objects coated in it look 2D.',
    'There are only 12 musical notes — every song you’ve ever heard uses just those.',
    'Mozart wrote his first symphony when he was 8 years old.',
    'A new shade of blue called YInMn was discovered by accident in 2009.',
  ],
};

/** Shown when the loading screen doesn’t know which topic is loading. */
export const GENERIC_FACTS: string[] = [
  'Did you know? Reading for just 6 minutes can lower your stress level.',
  'Your brain uses about 20% of your body’s energy — even while you sleep.',
  'A group of flamingos is called a “flamboyance”.',
  'The shortest war in history lasted just 38 minutes.',
];

/** Picks a random fact for the topic (or a generic one when unknown). */
export function pickFact(topic?: Topic, seed = Math.random()): string {
  const pool = topic ? FUN_FACTS[topic] : GENERIC_FACTS;
  const idx = Math.floor(seed * pool.length) % pool.length;
  return pool[idx];
}
