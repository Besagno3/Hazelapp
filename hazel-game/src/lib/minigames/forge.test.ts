import { describe, it, expect } from 'vitest';
import { ALSO, BAND_FAMILIES, EXPERT_PAGES, EXPERT_WORDS, FAMILIES, FAMILY_BY_ID, FAMILY_IDS, JOBS_PER_ROUND, PART_MEANS, ROOT_CLUE, ROOT_KIN, ROOT_MEANS, ROOT_NOTE, builtLine, forgeWords, hintFor, jobFor, jobWords, keepHyphens, learnedLine, partText, realWord, rootAsk, rootChoices, rootWords, roundQueue, type ExpertWord, type Job } from './forge';
import { BANDS, MINIGAMES, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 6): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
const pool = (band: Band) => [...new Set(BAND_FAMILIES[band].flatMap((id) => FAMILY_BY_ID[id].words.flatMap((x) => x.parts)))];
const expertPool = [...new Set(FAMILY_IDS.flatMap((id) => EXPERT_WORDS[id].flatMap((x) => x.parts)))];
// A meaning as a reader would catch it in a line: each of its words but the little ones, by its first four letters (code
// review round 2: "measures" beside a question on “meter”, "into a club" on “in”) — a little word alone, quoted.
const LITTLE = ['with', 'to', 'do', 'of', 'the', 'one', 'who'];
const caught = (m: string) => {
  const words = m.split(' ').filter((x) => !LITTLE.includes(x));
  return words.length ? new RegExp(`\\b(${words.map((x) => x.slice(0, 4)).join('|')})`, 'i') : new RegExp(`“${m}”`);
};
const expertJobs = (): Job[] => FAMILY_IDS.flatMap((family) => EXPERT_WORDS[family].map((word) => ({ band: 'expert' as const, family, word, tiles: [] })));
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
    'bowcat bowcoat bowdrop bowflower bowfox bowrain bowrise bowshine bowsun bowwish catbow catcoat catdrop catflower catfox catrain catrise catshine catsun catwish coatbow coatcat coatdrop coatflower coatfox coatrain coatrise coatshine coatsun coatwish dropbow dropcat dropcoat dropflower dropfox droprain droprise dropshine dropsun dropwish esbow escat escoat esdrop esflower esfox esrain esrise esshine essun eswish flowerbow flowercat flowercoat flowerdrop flowerfox flowerrain flowerrise flowershine flowersun flowerwish foxbow foxcat foxcoat foxdrop foxflower foxrain foxrise foxshine foxsun foxwish raincat rainflower rainfox rainrise rainshine rainsun rainwish risebow risecat risecoat risedrop riseflower risefox riserain riseshine risesun risewish sbow scoat sdrop ses sflower sfox shinebow shinecat shinecoat shinedrop shineflower shinefox shinerain shinerise shinesun shinewish srain srise sshine ssun suncat suncoat sundrop sunfox sunrain sunwish wishbow wishcat wishcoat wishdrop wishflower wishfox wishrain wishrise wishshine wishsun',
  medium:
    'erest erful erhelp erkind erless erview estful esthelp estkind estless estview fuler fulest fulhelp fulkind fulless fulview helpest helpkind helppre helpre helpun helpview kindful kindhelp kindpre kindre kindun kindview lessest lessful lesshelp lesskind lessview preer preest preful prehelp prekind preless prere preun reer reest reful rehelp rekind reless repre reun uner unest unful unhelp unpre unre unview viewest viewful viewhelp viewkind viewpre viewre viewun',
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
    const pairs = (parts: string[]) => parts.flatMap((a) => parts.filter((b) => b !== a).map((b) => a + b));
    const made = new Set([...BANDS.flatMap((band) => pairs(pool(band))), ...pairs(expertPool)]);
    for (const word of Object.keys(ALSO)) expect(made.has(word), word).toBe(true);
  });

  it('Expert: every pair of its 40 roots a tray can make — its 27 words and 20 others said to be real words, the rest not-words, the rarest looked at', () => {
    expect(expertPool).toHaveLength(40);
    const not = new Set<string>();
    const real = new Set<string>();
    for (const job of expertJobs())
      for (const a of expertPool)
        for (const b of expertPool) {
          if (a === b) continue;
          const { right, said } = forgeWords(job, [a, b]);
          if (right) expect(a + b).toBe(job.word.word);
          else if (realWord(a + b)) {
            expect(said, a + b).toMatch(/ is a real word: /);
            real.add(a + b);
          } else not.add(a + b);
        }
    // Its 27 words (each one hammered for another word: a real word, said so), Expert's 17 others — multimeter and induct
    // since code review round 1, multiport and multifactor since round 2 — and 3 of Tricky's.
    const words = expertJobs().map((job) => job.word.word);
    expect(words.filter((w) => !real.has(w))).toEqual([]);
    expect([...real].filter((w) => !words.includes(w)).sort()).toEqual(['argon', 'chronograph', 'chronology', 'dictator', 'geometer', 'indict', 'induct', 'insist', 'micrograph', 'micrography', 'multifactor', 'multimeter', 'multiport', 'paragon', 'paragraph', 'parameter', 'polygraph', 'supply', 'telegraphy', 'telemeter']);
    // In a big dictionary but rare, old or a name: left as not-words, each looked at.
    const rare = ['aquameter', 'arnaut', 'asport', 'benedict', 'calligraph', 'chronography', 'inport', 'micrology', 'multigraph', 'multipara', 'multivolent', 'paralogy', 'paramarine', 'parapathy', 'polygraphy', 'polylogy', 'polymeter', 'prefactor', 'solas', 'symar'];
    for (const w of rare) expect(not.has(w), w).toBe(true);
    // A new root makes new pairs: each real one into ALSO, or here, looked at.
    expect(real.size + not.size).toBe(40 * 39);
    expect(not.size).toBe(40 * 39 - 27 - 20);
  });

  it('right; a real word meaning something else — keeping a part that’s right; the other way round; -s for -es; two add-ons; an add-on astray; no word, with a hint', () => {
    const sunflower = jobOf('gentle', 'sunflower');
    const cats = jobOf('gentle', 'cats');
    const said = (job: Job, parts: [string, string]) => forgeWords(job, parts).said;
    expect(forgeWords(sunflower, ['sun', 'flower'])).toEqual({ right: true, said: 'Sunflower! A tall flower with a big round face like the sun.' });
    expect(forgeWords(sunflower, ['flower', 'sun'])).toEqual({ right: false, said: 'Flowersun isn’t a word — try them the other way round!' });
    // A real word with a part right says which to keep (UX review round 2: "Not this one!" lost the part that was right).
    expect(said(sunflower, ['sun', 'rise'])).toBe('Sunrise is a real word: when the sun comes up in the morning. Keep “sun”!');
    expect(said(sunflower, ['flower', 's'])).toBe('Flowers is a real word: more than one flower. Not this one!');
    expect(said(cats, ['s', 'cat'])).toBe('Scat is a real word: “go away!”, said to a cat. Try them the other way round!');
    expect(said(cats, ['cat', 'es'])).toBe('Just -s here: cats.');
    expect(said(jobOf('gentle', 'foxes'), ['fox', 's'])).toBe('After “x” it’s -es — easier to say: foxes.');
    expect(said(jobOf('gentle', 'wishes'), ['wish', 's'])).toBe('After “sh” it’s -es — easier to say: wishes.');
    expect(said(cats, ['sun', 'es'])).toBe('Just -s here: suns. Not this one, though!');
    // Two endings: a word to start with, not "try it second" round and round (code and UX review round 2).
    expect(said(sunflower, ['s', 'es'])).toBe('Both are endings! It starts with “sun”.');
    expect(said(cats, ['s', 'es'])).toBe('Both are endings! “-s” is in it — but second!');
    expect(hintFor(cats)).toBe('Start with “cat”, then make it more than one.');
    expect(said(jobOf('gentle', 'wishes'), ['es', 's'])).toBe('Ess is a real word: the name of the letter S. Start with a word!');
    expect(said(jobOf('gentle', 'foxes'), ['s', 'es'])).toBe('Ses isn’t a word. “-es” second is right — now the first part.');
    expect(said(cats, ['cat', 'fox'])).toBe('Catfox isn’t a word. “cat” first is right — now make it more than one.');
    expect(said(cats, ['s', 'sun'])).toBe('Ssun isn’t a word. “-s” is in it — but second!');
    expect(said(sunflower, ['sun', 'coat'])).toBe('Suncoat isn’t a word. “sun” first is right — the meaning tells you the rest.');
    expect(said(sunflower, ['rain', 'flower'])).toBe('Rainflower isn’t a word. “flower” second is right — now the first part.');
    expect(said(sunflower, ['flower', 'rain'])).toBe('Flowerrain isn’t a word. “flower” is in it — but second!');
    expect(said(sunflower, ['rain', 'cat'])).toBe('Raincat isn’t a word. It starts with “sun”.');

    const unkind = jobOf('medium', 'unkind');
    expect(said(unkind, ['un', 'less'])).toBe('Unless is a real word: as in “We’ll play outside unless it rains”. Keep “un-”!');
    expect(said(unkind, ['kind', 'er'])).toBe('Kinder is a real word: more kind. Not this one!');
    expect(said(unkind, ['re', 'kind'])).toBe('Rekind isn’t a word. “kind” second is right — now a front part meaning “not”.');
    expect(said(unkind, ['un', 'help'])).toBe('Unhelp isn’t a word. “un-” first is right — now the root word.');
    // An add-on astray: said where it goes only when it's not in the word, with what's right kept (code review round 2:
    // "“-less” … try it second!" led to "Kindless").
    expect(said(unkind, ['less', 'kind'])).toBe('Lesskind isn’t a word. “kind” second is right — now a front part meaning “not”.');
    expect(said(unkind, ['less', 'help'])).toBe('“-less” goes at the end. It starts with a part meaning “not”.');
    expect(said(unkind, ['help', 'un'])).toBe('Helpun isn’t a word. “un-” is in it — but first!');
    expect(said(jobOf('medium', 'kinder'), ['kind', 're'])).toBe('Kindre isn’t a word. “kind” first is right — now an end part meaning “more”.');
    expect(said(jobOf('medium', 'helpful'), ['re', 'un'])).toBe('Both are add-ons — it needs a root word! It ends with a part meaning “full of”.');
    expect(said(jobOf('medium', 'helpful'), ['ful', 'est'])).toBe('Both are add-ons — it needs a root word! “-ful” is in it — but second!');
    expect(said(jobOf('medium', 'helper'), ['help', 'est'])).toBe('Helpest isn’t a word. “help” first is right — now an end part meaning “one who”.');
    expect(said(jobOf('medium', 'kinder'), ['view', 'est'])).toBe('Viewest isn’t a word. It ends with a part meaning “more”.');

    const telescope = jobOf('tricky', 'telescope');
    expect(said(telescope, ['tele', 'graph'])).toBe('Telegraph is a real word: an old machine that sent messages by wire. Keep “tele”!');
    expect(said(jobOf('tricky', 'photograph'), ['photo', 'graphy'])).toBe('Photography is a real word: taking pictures with a camera. Keep “photo”!');
    expect(said(jobOf('tricky', 'autograph'), ['auto', 'graphy'])).toBe('Autography is a real word: handwriting itself, not a name signed. Keep “auto”!');
    expect(said(telescope, ['tele', 'micro'])).toBe('Telemicro isn’t a word. “tele” first is right — now a part meaning “look”.');
    expect(said(telescope, ['auto', 'scope'])).toBe('Autoscope isn’t a word. “scope” second is right — now a part meaning “far” first.');
    // One part's meaning, not both printed on the tiles (UX review round 2).
    expect(said(telescope, ['photo', 'wave'])).toBe('Photowave isn’t a word. It starts with a part meaning “far”.');
  });

  it('no advice sends the kid round: doing what an add-on line says never gets the same line again (UX review round 2: a loop)', () => {
    for (const band of ['gentle', 'medium'] as const)
      for (const id of BAND_FAMILIES[band])
        for (const word of FAMILY_BY_ID[id].words) {
          const job: Job = { band, family: id, word, tiles: [] };
          for (const x of pool(band))
            for (const y of pool(band)) {
              if (x === y) continue;
              const first = forgeWords(job, [x, y]).said;
              expect(first, `${word.word} ${x}+${y}`).not.toMatch(/try it (first|second)/);
              if (/goes at the (end|front)/.test(first)) expect(forgeWords(job, [y, x]).said, `${word.word} ${y}+${x}`).not.toMatch(/goes at the (end|front)/);
            }
        }
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
    expect(longest.length, longest).toBeLessThanOrEqual(95);
  });

  it('the ticket and what a word teaches: an add-on with its hyphen, a root with its meaning', () => {
    const sunflower = jobOf('gentle', 'sunflower');
    expect(jobWords(sunflower)).toBe('Forge a word that means “a tall flower with a big round face like the sun”: put two parts on the anvil, in order, and hammer!');
    expect(learnedLine(sunflower)).toBe(`Sunflower: sun + flower. ${FAMILY_BY_ID.sun.note}`);
    expect(learnedLine(jobOf('gentle', 'cats'))).toBe(`Cats: cat + -s. ${FAMILY_BY_ID.more.note}`);
    expect(learnedLine(jobOf('medium', 'unkind'))).toBe(`Unkind: un- + kind. ${FAMILY_BY_ID.kind.note}`);
    expect(learnedLine(jobOf('tricky', 'telescope'))).toBe(`Telescope: tele (“far”) + scope (“look”). ${FAMILY_BY_ID.tele.note}`);
    expect(['un', 'ful', 'tele', 'sun'].map((p) => partText(p, p === 'tele' ? 'tricky' : 'medium'))).toEqual(['un-', '-ful', 'tele', 'sun']);
    // The reward recaps each word's build (UX review round 2: only the last word's line).
    expect(builtLine(jobOf('gentle', 'cats'))).toBe('Cats: cat + -s.');
    expect(builtLine(jobOf('tricky', 'biography'))).toBe('Biography: bio (“life”) + graphy (“writing”).');
  });

  it('an end part’s hyphen kept with it on a line (UX review round 2: "add -" / "es"); a front part’s, and a word’s own, left be', () => {
    expect(keepHyphens('Add -s; after s, add -es. Un- turns it: word-smith, “-ful” (-less).')).toBe('Add -\u2060s; after s, add -\u2060es. Un- turns it: word-smith, “-\u2060ful” (-\u2060less).');
  });
});

describe('🔨 Expert (docs/DESIGN-MINIGAMES.md §8.5): Latin and Greek roots, their tiles plain; what a root means once forged', () => {
  const solar = (): Job => expertJobs()[0];
  const word = (w: string): Job => expertJobs().find((job) => job.word.word === w)!;
  const each = (f: (job: Job) => void) => expertJobs().forEach(f);

  it('three words a family, all nine families; each its two roots joined, one asked about; every root §8.5 names', () => {
    expect(expertJobs()).toHaveLength(27);
    each((job) => {
      const w = job.word as ExpertWord;
      expect(w.parts.join(''), w.word).toBe(w.word);
      expect(w.parts, w.word).toContain(w.ask);
      for (const p of w.parts) expect(ROOT_MEANS[p], p).toBeTruthy();
      // The meaning asked never says the asked root's, so the question isn't read off the ticket.
      expect(w.meaning, w.word).not.toMatch(caught(ROOT_MEANS[w.ask]));
    });
    for (const root of ['port', 'dict', 'spect', 'aqua', 'chrono', 'geo', 'logy', 'meter']) expect(expertPool, root).toContain(root);
    // No split that isn't the word's own (code review round 1: aqua + tic, aqua + rium).
    for (const p of ['tic', 'rium']) expect(expertPool).not.toContain(p);
    expect(ROOT_MEANS.as).toBe('towards');
    // A root's other words have it in them; the word itself is left out where it's said.
    for (const [root, kin] of Object.entries(ROOT_KIN)) for (const k of kin) expect(k, root).toContain(root);
    // Each root's other words are said in a lesson (code review round 2: aque's, marine's, tele's never were).
    for (const root of Object.keys(ROOT_KIN)) expect(expertJobs().some((job) => learnedLine(job).includes(`More with “${root}”`)), root).toBe(true);
    expect(learnedLine(solar())).not.toMatch(/More with “sol”: solar/);
  });

  it('every word in turn: a round from three families, rounds 0–2 all nine, rounds 0–8 each of the 27 once (UX review round 1: words back three rounds on)', () => {
    expect(BAND_FAMILIES.expert).toEqual(FAMILY_IDS);
    const words = (from: number, to: number) => Array.from({ length: (to - from) * 3 }, (_, k) => jobFor('expert', from + Math.floor(k / 3), k % 3).word.word);
    expect(new Set(Array.from({ length: 9 }, (_, k) => jobFor('expert', Math.floor(k / 3), k % 3).family))).toEqual(new Set(FAMILY_IDS));
    expect(new Set(words(0, 9)).size).toBe(27);
    expect(words(9, 18)).toEqual(words(0, 9));
    expect(words(0, 1)).toEqual(['solar', 'aqueduct', 'polygon']);
    // The wall's queue doesn't change it.
    expect(jobFor('expert', 1, 0, ['graph', 'micro', 'tele']).word.word).toBe('support');
  });

  it('every tray: the word’s roots and four others, each once, from Expert’s roots, shown plain (code review round 1: one tray checked)', () => {
    for (let r = 0; r < 18; r++)
      for (const i of [0, 1, 2]) {
        const job = jobFor('expert', r, i);
        expect(job.tiles, `${r}.${i}`).toHaveLength(6);
        expect(new Set(job.tiles).size, `${r}.${i}`).toBe(6);
        for (const p of job.word.parts) expect(job.tiles).toContain(p);
        for (const p of job.tiles) expect(expertPool).toContain(p);
        expect(job.tiles.map((p) => partText(p, 'expert'))).toEqual(job.tiles);
      }
    expect(jobFor('expert', 0, 0)).toEqual(jobFor('expert', 0, 0));
  });

  it('a word with a root of the same meaning as another’s — poly and multi, aqua and aque — has that one in its tray (UX review round 2: 1 word in 27 met it)', () => {
    const twin: Record<string, string> = { poly: 'multi', multi: 'poly', aqua: 'aque', aque: 'aqua' };
    const met: string[] = [];
    for (let r = 0; r < 18; r++)
      for (const i of [0, 1, 2]) {
        const job = jobFor('expert', r, i);
        const t = job.word.parts.map((p) => twin[p]).find(Boolean);
        if (!t) continue;
        expect(job.tiles, job.word.word).toContain(t);
        met.push(job.word.word);
      }
    expect([...new Set(met)].sort()).toEqual(['aquamarine', 'aquanaut', 'aqueduct', 'multiply', 'polyglot', 'polygon']);
    expect(met).toHaveLength(12);
    expect(forgeWords(jobFor('expert', 0, 2), ['multi', 'gon']).said).toBe('Multigon isn’t a word. “multi” means “many” too — but polygon takes the other one.');
  });

  it('the question: four meanings — the root’s, the other part’s, two others, none alike — the same each time; the answer in every place', () => {
    expect(rootAsk(solar())).toBe('What does “sol” mean in solar?');
    expect(rootChoices(solar())).toEqual(['of the sea', 'people', 'to do with', 'sun']);
    const places = [0, 0, 0, 0];
    each((job) => {
      const w = job.word as ExpertWord;
      const all = rootChoices(job);
      expect(all, w.word).toHaveLength(4);
      expect(all.map((m) => m.slice(0, 4)).filter((m, k, a) => a.indexOf(m) !== k), w.word).toEqual([]);
      expect(all, w.word).toContain(ROOT_MEANS[w.ask]);
      expect(all, w.word).toContain(ROOT_MEANS[w.parts.find((p) => p !== w.ask)!]);
      expect(rootChoices(job)).toEqual(all);
      places[all.indexOf(ROOT_MEANS[w.ask])]++;
    });
    for (const n of places) expect(n).toBeGreaterThan(0);
    for (const n of places) expect(n).toBeLessThanOrEqual(27 / 2);
    // Only an Expert word has a root asked about (code review round 1: a cast).
    expect(() => rootAsk(jobFor('tricky', 0, 0))).toThrow(/isn't an Expert word/);
  });

  it('a meaning picked: right, with the build and more words; the other part’s said so; another, a word to think of — or, with none, a clue', () => {
    expect(rootWords(solar(), 'sun')).toEqual({ right: true, said: 'Yes: “sol” means “sun”. Solar: sol (“sun”) + ar (“to do with”). More with “sol”: parasol and solstice.' });
    expect(rootWords(solar(), 'to do with')).toEqual({ right: false, said: 'Not “to do with”: that’s “ar”, the other part of solar.' });
    expect(rootWords(solar(), 'people')).toEqual({ right: false, said: 'Not “people”. Think of parasol: what does it share with solar?' });
    // No other word to think of: a clue (code and UX review round 1: "Read what solstice means again." said nothing).
    expect(rootWords(word('solstice'), 'well').said).toBe('Not “well”. At a solstice the sun seems to stop, then turn back.');
    expect(rootWords(word('polyglot'), 'angle').said).toBe('Not “angle”. It’s the part of your mouth that talks.');
    expect(rootWords(word('calligraphy'), 'sun').said).toBe('Not “sun”. Think what fancy handwriting is meant to be.');
    for (const r of Object.keys(ROOT_CLUE)) expect(ROOT_KIN[r], r).toBeUndefined();
    // The lesson: the build, then more words with the asked root — or the other part's — and para's other meaning.
    expect(learnedLine(word('calligraphy'))).toBe('Calligraphy: calli (“beauty”) + graphy (“writing”). More with “graphy”: biography and photography.');
    expect(learnedLine(word('parasol'))).toBe('Parasol: para (“shield against”) + sol (“sun”). More with “para”: parachute. Greek para, “beside”, is another: paragraph.');
    expect(learnedLine(word('aqueduct'))).toBe('Aqueduct: aque (“water”) + duct (“lead”). More with “duct”: conduct and viaduct.');
    let longest = '';
    each((job) => {
      for (const m of rootChoices(job)) {
        const { right, said } = rootWords(job, m);
        expect(said).not.toContain('!');
        if (!right && said.length > longest.length) longest = said;
      }
      expect(learnedLine(job)).toMatch(/ More with “[a-z]+”: [a-z]+( and [a-z]+)?\.( Greek .*)?$/);
    });
    expect(longest.length, longest).toBeLessThanOrEqual(95);
  });

  it('a hint never gives the asked root’s meaning (code review round 1: 44% did) — a part by its first letter; a same-meaning part said so (UX review round 1)', () => {
    expect(hintFor(solar())).toBe('The second part means “to do with”.');
    expect(hintFor(word('polygon'))).toBe('The first part means “many”.');
    expect(forgeWords(word('polygon'), ['multi', 'gon']).said).toBe('Multigon isn’t a word. “multi” means “many” too — but polygon takes the other one.');
    expect(forgeWords(word('aqueduct'), ['aqua', 'duct']).said).toBe('Aquaduct isn’t a word. “aqua” means “water” too — but aqueduct takes the other one.');
    expect(forgeWords(word('multiply'), ['poly', 'ply']).said).toBe('Polyply isn’t a word. “poly” means the same — but multiply takes the other one.');
    expect(forgeWords(word('polygon'), ['poly', 'sol']).said).toBe('Polysol isn’t a word. “poly” first is right — the second part starts with “g”.');
    // No Medium add-on rule (code review round 1: "“pre” goes at the front").
    expect(forgeWords(solar(), ['ar', 'pre']).said).toBe('Arpre isn’t a word. “ar” is in it — but second.');
    each((job) => {
      const w = job.word as ExpertWord;
      expect(hintFor(job)).not.toMatch(caught(ROOT_MEANS[w.ask]));
      // Nor a real word's meaning, said of a wrong try, in any words (code review round 2: "Induct … into a club" on “in”).
      for (const a of expertPool)
        for (const b of expertPool) {
          if (a === b) continue;
          const { right, said } = forgeWords(job, [a, b]);
          if (!right) expect(said, `${w.word}: ${a}+${b}`).not.toMatch(caught(ROOT_MEANS[w.ask]));
        }
    });
  });

  it('the asked root by as few of its first letters as no other tile starts with — or whole — so a hint never points at two (code and UX review round 2: “s” for sol beside sup, again once sup was tried)', () => {
    const solar = jobFor('expert', 0, 0);
    expect(solar.tiles).toEqual(expect.arrayContaining(['sol', 'sup']));
    expect(forgeWords(solar, ['sup', 'ar']).said).toBe('Supar isn’t a word. “ar” second is right — the first part starts with “so”.');
    expect(forgeWords(jobFor('expert', 3, 1), ['dict', 'marine']).said).toBe('Dictmarine isn’t a word. “marine” second is right — the first part is “aqua”.');
    let named = 0;
    for (let r = 0; r < 9; r++)
      for (const i of [0, 1, 2]) {
        const job = jobFor('expert', r, i);
        const { ask } = job.word as ExpertWord;
        for (const a of job.tiles)
          for (const b of job.tiles) {
            if (a === b) continue;
            const { right, said } = forgeWords(job, [a, b]);
            const start = !right && said.match(/starts with “([a-z]+)”/)?.[1];
            if (start) {
              named++;
              expect(job.tiles.filter((t) => t.startsWith(start)), said).toEqual([ask]);
            }
            const whole = !right && said.match(/part is “([a-z]+)”/)?.[1];
            if (whole) expect(whole).toBe(ask);
          }
      }
    expect(named).toBeGreaterThan(50);
  });

  it('the forge’s words plain: the ticket, a hint, a wrong try — never "!", each short enough for the bar', () => {
    expect(jobWords(solar())).toBe('Forge a word that means “powered by daylight, like a panel on a roof”: two roots on the anvil, in order, and hammer. Then: what does one of its roots mean?');
    expect(forgeWords(solar(), ['ar', 'sol']).said).toBe('Arsol isn’t a word — try them the other way round.');
    expect(forgeWords(solar(), ['sol', 'ar'])).toEqual({ right: true, said: 'Solar. Powered by daylight, like a panel on a roof.' });
    let longest = '';
    each((job) => {
      expect(jobWords(job)).not.toContain('!');
      expect(hintFor(job)).not.toContain('!');
      for (const a of expertPool)
        for (const b of expertPool) {
          if (a === b) continue;
          const { right, said } = forgeWords(job, [a, b]);
          expect(said).not.toContain('!');
          if (!right && said.length > longest.length) longest = said;
        }
    });
    expect(longest.length, longest).toBeLessThanOrEqual(95);
  });

  it('the wall’s pages on Expert: names without a meaning, each note tying the family’s three words; no wars, disasters or religion anywhere (code and UX review round 1)', () => {
    for (const id of FAMILY_IDS) {
      const page = EXPERT_PAGES[id];
      expect(page.name, id).not.toMatch(/“/);
      // Nor an asked root's meaning in any words (code review round 2: "Water words" beside the question on “aqua”).
      for (const job of expertJobs()) expect(page.name, `${id}: ${job.word.word}`).not.toMatch(caught(ROOT_MEANS[(job.word as ExpertWord).ask]));
      for (const x of EXPERT_WORDS[id]) expect(page.note, `${id}: ${x.word}`).toContain(x.word);
    }
    const text = [...Object.values(ALSO), ...Object.keys(ALSO), ...Object.values(ROOT_KIN).flat(), ...Object.values(ROOT_CLUE), ...Object.values(ROOT_NOTE), ...Object.values(EXPERT_PAGES).map((p) => p.note), ...expertJobs().map((j) => j.word.meaning)]
      .join(' ')
      .toLowerCase();
    for (const bad of ['war', 'battle', 'army', 'soldier', 'weapon', 'armistice', 'flood', 'earthquake', 'plague', 'god', 'temple', 'church', 'religio', 'pray', 'bless']) expect(text, bad).not.toMatch(new RegExp(`\\b${bad}`));
  });
});
