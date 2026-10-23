import { describe, it, expect } from 'vitest';
import { ALSO, BAND_FAMILIES, FAMILIES, FAMILY_BY_ID, FAMILY_IDS, JOBS_PER_ROUND, PART_MEANS, forgeWords, hintFor, jobFor, jobWords, learnedLine, partText, realWord, roundQueue, type Job } from './forge';
import { BANDS, MINIGAMES, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 6): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
const pool = (band: Band) => [...new Set(BAND_FAMILIES[band].flatMap((id) => FAMILY_BY_ID[id].words.flatMap((x) => x.parts)))];
const jobOf = (band: Band, word: string): Job => {
  const family = BAND_FAMILIES[band].find((id) => FAMILY_BY_ID[id].words.some((x) => x.word === word))!;
  return { band, family, word: FAMILY_BY_ID[family].words.find((x) => x.word === word)!, tiles: [] };
};

/**
 * What two of a band's parts make that the forge says "isn't a word", each
 * looked at (code and UX review round 1: "suns", "unless", "photography" were
 * said not to be words). A new part makes new pairs: each must be a real word
 * in `ALSO` or added here, looked at.
 */
const NOT_WORDS: Record<Band, string> = {
  gentle:
    'bowcat bowcoat bowdrop bowflower bowfox bowrain bowrise bowshine bowsun bowwish catbow catcoat catdrop catflower catfox catrain catrise catshine catsun catwish coatbow coatcat coatdrop coatflower coatfox coatrain coatrise coatshine coatsun coatwish dropbow dropcat dropcoat dropflower dropfox droprain droprise dropshine dropsun dropwish esfox eswish flowerbow flowercat flowercoat flowerdrop flowerfox flowerrain flowerrise flowershine flowersun flowerwish foxbow foxcat foxcoat foxdrop foxflower foxrain foxrise foxshine foxsun foxwish raincat rainflower rainfox rainrise rainshine rainsun rainwish risebow risecat risecoat risedrop riseflower risefox riserain riseshine risesun risewish shinebow shinecat shinecoat shinedrop shineflower shinefox shinerain shinerise shinesun shinewish suncat suncoat sundrop sunfox sunrain sunwish wishbow wishcat wishcoat wishdrop wishflower wishfox wishrain wishrise wishshine wishsun',
  medium:
    'erhelp erkind erview estkind fulhelp helpest helpkind helpview kindful kindhelp kindun kindview lesshelp preer preest preful prehelp prekind preless reer reest reful rehelp rekind reless uner unest unful unhelp unview viewest viewful viewhelp viewkind viewpre viewre',
  tricky:
    'autobio automicro autophone autophoto autoscope autotele autovision autowave bioauto biomicro biophone biophoto biotele biovision biowave graphauto graphbio graphgraphy graphmicro graphphone graphphoto graphscope graphtele graphvision graphwave graphyauto graphybio graphygraph graphymicro graphyphone graphyphoto graphyscope graphytele graphyvision graphywave microauto microbio microphoto microtele microvision phoneauto phonebio phonegraph phonegraphy phonemicro phonephoto phonescope phonetele phonevision phonewave photoauto photobio photomicro photoscope phototele photovision photowave scopeauto scopebio scopegraph scopegraphy scopemicro scopephone scopephoto scopetele scopevision scopewave teleauto telebio telemicro telewave visionauto visionbio visiongraph visiongraphy visionmicro visionphone visionphoto visionscope visiontele visionwave waveauto wavebio wavegraph wavegraphy wavemicro wavephone wavephoto wavescope wavetele wavevision',
};

describe('the word families (docs/DESIGN-MINIGAMES.md §5.10)', () => {
  it('nine, three a band, three words each; every word its two parts joined; the wall a page each', () => {
    expect(FAMILIES.map((f) => f.id)).toEqual([...FAMILY_IDS]);
    expect(new Set(BANDS.flatMap((b) => BAND_FAMILIES[b]))).toEqual(new Set(FAMILY_IDS));
    // The stars are counted by the pages (code review round 1: nothing held the two together).
    expect(MINIGAMES['word-forge'].pages).toBe(FAMILIES.length);
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

  it('Tricky’s meanings are said in other words than its tiles’ (UX review round 1: matching words, not working out roots)', () => {
    for (const id of BAND_FAMILIES.tricky)
      for (const x of FAMILY_BY_ID[id].words)
        for (const p of x.parts) if (PART_MEANS[p] !== p) expect(x.meaning, `${x.word}: ${PART_MEANS[p]}`).not.toMatch(new RegExp(`\\b${PART_MEANS[p]}`, 'i'));
  });

  it('the family’s note names none of its words as the example for another (UX review round 1: "sun + flower" with sunrise)', () => {
    expect(learnedLine(jobOf('gentle', 'sunrise'))).toBe('Sunrise: sun + rise. Two words joined into one make a compound word. Its meaning comes from both of them.');
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

  it('the tray shuffled: the word’s parts not first and in order (code review round 1: untested)', () => {
    for (const band of BANDS) {
      const all = jobs(band, 12);
      const inOrder = all.filter((j) => j.tiles[0] === j.word.parts[0] && j.tiles[1] === j.word.parts[1]);
      expect(inOrder.length, band).toBeLessThan(all.length / 4);
    }
  });

  it('more than one: both endings in the tray, so -s or -es is the kid’s to pick (UX review round 1: in 11 rounds of 12, only the right one)', () => {
    const plural = jobs('gentle', 12).filter((j) => j.family === 'more');
    expect(plural.length).toBeGreaterThan(6);
    for (const j of plural) expect(j.tiles, j.word.word).toEqual(expect.arrayContaining(['s', 'es']));
  });

  it('families not on the wall first; each round starts at the next (code review round 1: always the first); a round’s three are three families', () => {
    expect(roundQueue('gentle', () => false, 0)).toEqual(['sun', 'rain', 'more']);
    expect(roundQueue('gentle', () => false, 1)).toEqual(['rain', 'more', 'sun']);
    expect(roundQueue('gentle', (id) => id === 'sun', 0)).toEqual(['rain', 'more', 'sun']);
    expect(roundQueue('tricky', (id) => id === 'micro', 1)).toEqual(['graph', 'tele', 'micro']);
    for (const band of BANDS) for (let r = 0; r < 4; r++) expect(new Set([0, 1, 2].map((i) => jobFor(band, r, i).family)).size).toBe(3);
    expect(new Set([0, 1, 2].map((r) => jobFor('tricky', r, 0, ['tele', 'micro', 'graph']).word.word))).toEqual(new Set(['telescope', 'telephone', 'television']));
  });
});

describe('the forge’s words', () => {
  it('every pair of a band’s parts a tray can make: a real word said so, or a not-word looked at (code and UX review round 1)', () => {
    for (const band of BANDS) {
      const not = new Set<string>();
      const parts = pool(band);
      for (const id of BAND_FAMILIES[band])
        for (const word of FAMILY_BY_ID[id].words)
          for (const a of parts)
            for (const b of parts) {
              if (a === b) continue;
              const said = forgeWords({ band, family: id, word, tiles: [] }, [a, b]).said;
              if (said.includes('isn’t a word')) not.add(a + b);
              if (realWord(a + b)) expect(said, a + b).not.toContain('isn’t a word');
            }
      expect([...not].sort().join(' '), band).toBe(NOT_WORDS[band]);
    }
    // Each real word the forge knows is one a band's tray can make.
    const made = new Set(BANDS.flatMap((band) => pool(band).flatMap((a) => pool(band).filter((b) => b !== a).map((b) => a + b))));
    for (const word of Object.keys(ALSO)) expect(made.has(word), word).toBe(true);
  });

  it('right; a real word meaning something else (the other way round too); the other way round; -s for -es; an add-on in the wrong place; no word, with a hint', () => {
    const sunflower = jobOf('gentle', 'sunflower');
    const cats = jobOf('gentle', 'cats');
    expect(forgeWords(sunflower, ['sun', 'flower'])).toEqual({ right: true, said: 'Sunflower! A tall flower with a big round face like the sun.' });
    expect(forgeWords(sunflower, ['flower', 'sun'])).toEqual({ right: false, said: 'Flowersun isn’t a word — try them the other way round!' });
    expect(forgeWords(sunflower, ['sun', 'rise']).said).toBe('Sunrise is a real word: when the sun comes up in the morning. Not this one!');
    expect(forgeWords(sunflower, ['flower', 's']).said).toBe('Flowers is a real word: more than one flower. Not this one!');
    expect(forgeWords(cats, ['s', 'cat']).said).toBe('Scat is a real word: “go away!”, said to a cat. Try them the other way round!');
    expect(forgeWords(cats, ['cat', 'es']).said).toBe('Just -s here: cats.');
    expect(forgeWords(jobOf('gentle', 'foxes'), ['fox', 's']).said).toBe('After “x” it’s -es — easier to say: foxes.');
    expect(forgeWords(jobOf('gentle', 'wishes'), ['wish', 's']).said).toBe('After “sh” it’s -es — easier to say: wishes.');
    expect(forgeWords(cats, ['sun', 'es']).said).toBe('Just -s here: suns. Not this one, though!');
    expect(forgeWords(cats, ['s', 'sun']).said).toBe('“-s” goes at the end of a word — try it second!');
    expect(forgeWords(sunflower, ['sun', 'coat']).said).toBe('Suncoat isn’t a word. “sun” first is right — the meaning tells you the rest.');
    expect(forgeWords(sunflower, ['rain', 'flower']).said).toBe('Rainflower isn’t a word. “flower” second is right — now the first part.');
    expect(forgeWords(sunflower, ['flower', 'rain']).said).toBe('Flowerrain isn’t a word. “flower” is in it — but second!');
    expect(forgeWords(sunflower, ['rain', 'cat']).said).toBe('Raincat isn’t a word. It starts with “sun”.');

    const unkind = jobOf('medium', 'unkind');
    expect(forgeWords(unkind, ['un', 'less']).said).toBe('Unless is a real word: as in “not unless it’s sunny”. Not this one!');
    expect(forgeWords(unkind, ['kind', 'er']).said).toBe('Kinder is a real word: more kind. Not this one!');
    expect(forgeWords(unkind, ['re', 'kind']).said).toBe('Rekind isn’t a word. “kind” second is right — now a front part meaning “not”.');
    expect(forgeWords(unkind, ['un', 'help']).said).toBe('Unhelp isn’t a word. “un-” first is right — now the root word.');
    expect(forgeWords(unkind, ['less', 'kind']).said).toBe('“-less” goes at the end of a word — try it second!');
    expect(forgeWords(unkind, ['help', 'un']).said).toBe('“un-” goes at the front of a word — try it first!');
    expect(forgeWords(jobOf('medium', 'helper'), ['help', 'est']).said).toBe('Helpest isn’t a word. “help” first is right — now an end part meaning “one who”.');
    expect(forgeWords(jobOf('medium', 'kinder'), ['view', 'est']).said).toBe('Viewest isn’t a word. It ends with a part meaning “more”.');

    const telescope = jobOf('tricky', 'telescope');
    expect(forgeWords(telescope, ['tele', 'graph']).said).toBe('Telegraph is a real word: an old machine that sent messages by wire. Not this one!');
    expect(forgeWords(jobOf('tricky', 'photograph'), ['photo', 'graphy']).said).toBe('Photography is a real word: taking pictures with a camera. Not this one!');
    expect(forgeWords(telescope, ['tele', 'micro']).said).toBe('Telemicro isn’t a word. “tele” first is right — now a part meaning “look”.');
    expect(forgeWords(telescope, ['auto', 'scope']).said).toBe('Autoscope isn’t a word. “scope” second is right — now a part meaning “far” first.');
    expect(forgeWords(telescope, ['photo', 'wave']).said).toBe('Photowave isn’t a word. You need a part meaning “far” and one meaning “look”.');
  });

  it('a hint before a try; every wrong try short enough for the bar on a phone (code and UX review round 1: clamped at 320 × 568)', () => {
    expect(hintFor(jobOf('gentle', 'foxes'))).toBe('Start with “fox”, then make it more than one.');
    expect(hintFor(jobOf('medium', 'helpful'))).toBe('It ends with a part meaning “full of”.');
    expect(hintFor(jobOf('medium', 'review'))).toBe('It starts with a part meaning “again”.');
    let longest = '';
    for (const band of BANDS)
      for (const id of BAND_FAMILIES[band])
        for (const word of FAMILY_BY_ID[id].words)
          for (const a of pool(band))
            for (const b of pool(band)) {
              const tried = a === b ? null : forgeWords({ band, family: id, word, tiles: [] }, [a, b]);
              if (tried && !tried.right && tried.said.length > longest.length) longest = tried.said;
            }
    expect(longest.length, longest).toBeLessThanOrEqual(92);
  });

  it('the ticket and what a word teaches: an add-on with its hyphen, a root with its meaning', () => {
    const sunflower = jobOf('gentle', 'sunflower');
    expect(jobWords(sunflower)).toBe('Forge a word that means “a tall flower with a big round face like the sun”: put two parts on the anvil, in order, and hammer!');
    expect(learnedLine(sunflower)).toBe(`Sunflower: sun + flower. ${FAMILY_BY_ID.sun.note}`);
    expect(learnedLine(jobOf('gentle', 'cats'))).toBe(`Cats: cat + -s. ${FAMILY_BY_ID.more.note}`);
    expect(learnedLine(jobOf('medium', 'unkind'))).toBe(`Unkind: un- + kind. ${FAMILY_BY_ID.kind.note}`);
    expect(learnedLine(jobOf('tricky', 'telescope'))).toBe(`Telescope: tele (“far”) + scope (“look”). ${FAMILY_BY_ID.tele.note}`);
    expect(['un', 'ful', 'tele', 'sun'].map((p) => partText(p, p === 'tele' ? 'tricky' : 'medium'))).toEqual(['un-', '-ful', 'tele', 'sun']);
  });
});
