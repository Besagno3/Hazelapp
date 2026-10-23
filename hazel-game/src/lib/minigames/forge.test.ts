import { describe, it, expect } from 'vitest';
import { BAND_FAMILIES, FAMILIES, FAMILY_BY_ID, FAMILY_IDS, JOBS_PER_ROUND, PART_MEANS, forgeWords, hintFor, jobFor, jobWords, learnedLine, roundQueue, type Job } from './forge';
import { BANDS, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 6): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

describe('the word families (docs/DESIGN-MINIGAMES.md §5.10)', () => {
  it('nine, three a band, three words each; every word its two parts joined', () => {
    expect(FAMILIES.map((f) => f.id)).toEqual([...FAMILY_IDS]);
    expect(new Set(BANDS.flatMap((b) => BAND_FAMILIES[b]))).toEqual(new Set(FAMILY_IDS));
    for (const f of FAMILIES) {
      expect(f.note.length, f.id).toBeGreaterThan(40);
      for (const x of f.words) {
        expect(x.parts.join(''), x.word).toBe(x.word);
        expect(x.meaning.length, x.word).toBeGreaterThan(5);
      }
    }
    expect(new Set(FAMILIES.flatMap((f) => f.words.map((x) => x.word))).size).toBe(27);
  });

  it('Gentle joins two words or adds -s / -es; Medium builds on a root word; Tricky’s every part says what it means', () => {
    for (const id of BAND_FAMILIES.medium) for (const x of FAMILY_BY_ID[id].words) expect(x.parts).toContain(id);
    for (const id of BAND_FAMILIES.tricky) for (const x of FAMILY_BY_ID[id].words) for (const p of x.parts) expect(PART_MEANS[p], p).toBeTruthy();
    for (const p of ['un', 're', 'pre', 'ful', 'less', 'est']) expect(PART_MEANS[p], p).toBeTruthy();
  });
});

describe('the jobs', () => {
  it('a tray of the word’s parts and others — four, five, six by band — each part once; the same tray each time', () => {
    const size: Record<Band, number> = { gentle: 4, medium: 5, tricky: 6 };
    for (const band of BANDS)
      for (const j of jobs(band)) {
        expect(j.tiles, j.word.word).toHaveLength(size[band]);
        expect(new Set(j.tiles).size).toBe(j.tiles.length);
        for (const p of j.word.parts) expect(j.tiles).toContain(p);
        expect(BAND_FAMILIES[band]).toContain(j.family);
      }
    expect(jobFor('medium', 2, 1)).toEqual(jobFor('medium', 2, 1));
  });

  it('families not on the wall first; a round’s three are three families; each round its own word of each', () => {
    expect(roundQueue('gentle', () => false, 0)).toEqual(['sun', 'rain', 'more']);
    expect(roundQueue('gentle', (id) => id === 'sun', 0)).toEqual(['rain', 'more', 'sun']);
    for (const band of BANDS) for (let r = 0; r < 4; r++) expect(new Set([0, 1, 2].map((i) => jobFor(band, r, i).family)).size).toBe(3);
    expect(new Set([0, 1, 2].map((r) => jobFor('tricky', r, 0, ['tele', 'micro', 'graph']).word.word))).toEqual(new Set(['telescope', 'telephone', 'television']));
  });
});

describe('the forge’s words', () => {
  const sunflower = jobFor('gentle', 0, 0);
  const foxes: Job = { band: 'gentle', family: 'more', word: FAMILY_BY_ID.more.words[1], tiles: [] };
  const cats: Job = { ...foxes, word: FAMILY_BY_ID.more.words[0] };
  const unkind: Job = { band: 'medium', family: 'kind', word: FAMILY_BY_ID.kind.words[0], tiles: [] };
  const helper: Job = { band: 'medium', family: 'help', word: FAMILY_BY_ID.help.words[2], tiles: [] };
  const telescope: Job = { band: 'tricky', family: 'tele', word: FAMILY_BY_ID.tele.words[0], tiles: [] };

  it('right; the other way round; a real word meaning something else; -s for -es; no word at all, with a hint', () => {
    expect(sunflower.word.word).toBe('sunflower');
    expect(forgeWords(sunflower, ['sun', 'flower'])).toEqual({ right: true, said: 'Sunflower! A tall flower that turns to face the sun.' });
    expect(forgeWords(sunflower, ['flower', 'sun'])).toEqual({ right: false, said: 'Flowersun isn’t a word — try them the other way round!' });
    expect(forgeWords(sunflower, ['sun', 'rise']).said).toBe('Sunrise is a real word — it means when the sun comes up in the morning. Dot wants “a tall flower that turns to face the sun”.');
    expect(forgeWords(sunflower, ['sun', 'coat']).said).toBe('Suncoat isn’t a word. It starts with “sun”.');
    expect(forgeWords(foxes, ['fox', 's']).said).toBe('After “x” it’s -es — easier to say: foxes.');
    expect(forgeWords(cats, ['cat', 'es']).said).toBe('Just -s here: cats.');
    expect(forgeWords(unkind, ['kind', 'er']).said).toBe('Kinder is a real word — it means more kind. Dot wants “not kind”.');
    expect(forgeWords(unkind, ['re', 'kind']).said).toBe('Rekind isn’t a word. It starts with a part meaning “not”.');
    expect(forgeWords(helper, ['help', 'est']).said).toBe('Helpest isn’t a word. It ends with -er.');
    expect(forgeWords(telescope, ['tele', 'graph']).said).toBe('Telegraph is a real word — it means a way to send writing far away. Dot wants “a tube for looking at things far away”.');
    expect(forgeWords(telescope, ['micro', 'phone']).said).toContain('Microphone is a real word');
    expect(forgeWords(telescope, ['bio', 'scope']).said).toBe('Bioscope isn’t a word. You need a part meaning “far” and one meaning “look”.');
    expect(hintFor(foxes)).toBe('Start with “fox”, then make it more than one.');
  });

  it('the ticket and what a word teaches', () => {
    expect(jobWords(sunflower)).toBe('Forge a word that means “a tall flower that turns to face the sun”: put two parts on the anvil, in order, and hammer!');
    expect(learnedLine(sunflower)).toBe(`Sunflower: sun + flower. ${FAMILY_BY_ID.sun.note}`);
    expect(learnedLine(telescope)).toBe(`Telescope: tele (“far”) + scope (“look”). ${FAMILY_BY_ID.tele.note}`);
  });
});
