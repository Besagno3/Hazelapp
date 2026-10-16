/**
 * Real screenshots for the public pages, taken from the game itself.
 *
 *   NODE_PATH=$(npm root -g) node site/tools/capture.cjs [world|app|all] [outDir]
 *
 * world: the real WorldCanvas on bench/world.html (one scene per place).
 * app:   the real app with Supabase stubbed (as the bench's `hud` mode does):
 *        the Training Grounds, a quiz question with its report link,
 *        "Who's playing?" and the PIN pad, the world HUD, and a battle against
 *        the Tide Colossus, filmed frame by frame for the gameplay clip.
 * Then run site/tools/prep-assets.py to turn the captures into site assets.
 * Playwright isn't a project dependency; a global install works.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const STUB = 'http://supabase.stub';
const USER = 'u-site';
const mode = process.argv[2] ?? 'all';
const out = path.resolve(process.argv[3] ?? path.join(ROOT, 'site-captures'));

function startVite(port, env = {}) {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { p.kill(); reject(new Error('vite did not start')); }, 30000);
    p.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(p); } });
    p.on('exit', (code) => reject(new Error(`vite exited (${code})`)));
  });
}

// Act I done, Ember a full-grown dragon, every story scene already seen.
const CRYSTALS = ['math', 'science', 'engineering', 'creativity'];
const SEEN = ['intro-seen', 'dawnreach-seen', 'ember-hatched', 'ember-hatch-seen', 'spire-awake-seen', 'save:v2',
  'ending-seen', 'spire-cleared', 'spire-victory-seen', 'act2-seen',
  ...CRYSTALS.flatMap((t) => [`crystal-${t}-restored`, `crystal-${t}-scene-seen`])];

// ---------- world: one scene per postcard ----------

const PLACES = [
  ['lumina-village', 'zone=lumina-village'],
  ['numbria', 'zone=numbria&at=10,6'],
  ['verdara', 'zone=verdara&at=10,6'],
  ['chromaria', 'zone=chromaria&at=10,6'],
  ['moonwell-grove', 'zone=moonwell-grove&at=10,8'],
  ['silver-shallows', 'zone=silver-shallows&aboard=1&boat=silver-shallows,21,17&at=21,17'],
];

async function world(browser) {
  const port = 5199;
  const vite = await startVite(port);
  try {
    fs.mkdirSync(path.join(out, 'world'), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    for (const [name, query] of PLACES) {
      await page.goto(`http://localhost:${port}/bench/world.html?${query}&paused=1&flags=${SEEN.join(',')}`);
      await page.waitForFunction(() => window.__bench && document.querySelector('canvas'), null, { timeout: 180000 });
      await page.waitForTimeout(2500);
      await page.locator('canvas').screenshot({ path: path.join(out, 'world', `place-${name}.png`) });
      console.log('✓ world', name);
    }
  } finally {
    vite.kill();
  }
}

// ---------- app: the real screens, Supabase stubbed ----------

// Sample questions served by the stub (the real game asks Claude for its own).
const QUESTIONS = {
  space: [
    ['Which planet is called the Red Planet?', ['Mars', 'Venus', 'Jupiter', 'Neptune'], 'Mars is covered in reddish dust with iron in it, a bit like rust.'],
    ['What is the Sun?', ['A star', 'A planet', 'A moon', 'A comet'], 'The Sun is a star. It is the closest star to Earth.'],
    ['Which planet has the biggest rings?', ['Saturn', 'Mars', 'Mercury', 'Earth'], "Saturn's rings are made of ice and rock."],
    ['What do we call a picture made of stars?', ['A constellation', 'A crater', 'An orbit', 'A meteor'], 'People joined stars into shapes long ago, like the Big Dipper.'],
  ],
};
const RIGHT = /^(Mars|A star|Saturn|A constellation)$/;
const ITEMS = { potion: 2, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0, knot: 0 };
const save = (over) => ({
  version: 3, avatarId: 'a4', hp: null, coins: 120, items: ITEMS, badges: [], sages: ['math', 'science'], openedChests: [], kills: {},
  questItems: [], passedRounds: 3, worldUnlocked: true, library: [], companionId: 'ember', defendTimer: true, lastRest: null,
  boat: null, vehicle: 'foot', flags: Object.fromEntries(SEEN.map((f) => [f, true])), ...over,
});
const profile = {
  id: USER, birth_year: 2016, birth_month: 3, skill_levels: { space: 4, math: 4 }, xp: 640, level: 6, level_xp: 40,
  power_ups: { attack: 2, defense: 1, vitality: 1, scholar: 1 }, current_streak: 4, longest_streak: 6,
  last_played_on: new Date().toISOString().slice(0, 10),
};
// Sample children for "Who's playing?".
const kids = [
  { ...profile, display_name: 'Juno', icon: 'fox', has_pin: true },
  { ...profile, id: 'u-kid2', display_name: 'Theo', icon: 'dino', has_pin: true },
  { ...profile, id: 'u-kid3', display_name: 'Maya', icon: 'bunny', has_pin: true },
];

async function stubbed(browser, port, viewport, sv, { pickKid = true, ready = 'button' } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const session = {
    access_token: 'stub', refresh_token: 'stub', token_type: 'bearer', expires_in: 31536000,
    expires_at: Math.floor(Date.now() / 1000) + 31536000,
    user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'grownup@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await page.addInitScript(([s, kid, pick]) => {
    localStorage.setItem('sb-supabase-auth-token', s);
    if (pick) sessionStorage.setItem(`hazel-active-kid-${kid}`, kid);
  }, [JSON.stringify(session), USER, pickKid]);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.route(`${STUB}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/rest/v1/rpc/')) return json(true);
    if (req.method() !== 'GET' && url.includes('/rest/v1/')) return route.fulfill({ status: 201, body: '' });
    if (url.includes('/rest/v1/parents')) return json([{ consent_at: '2026-10-10T00:00:00Z', has_pin: false }]);
    if (url.includes('/rest/v1/profiles')) return json(one ? profile : kids);
    if (url.includes('/rest/v1/saves')) return json(one ? { data: sv } : [{ data: sv }]);
    if (url.includes('/functions/v1/generate-questions')) {
      const bank = QUESTIONS.space;
      const questions = Array.from({ length: 8 }, (_, i) => {
        const [text, options, explanation] = bank[i % bank.length];
        return { id: `q-${i}`, level: 4, text, options, correctIndex: 0, explanation, timesAsked: 0 };
      });
      return json({ questions });
    }
    return json({});
  });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector(ready, { timeout: 120000, state: 'attached' });
  await page.waitForTimeout(1500);
  return { page, ctx };
}

/** Screenshot the page over and over until stopped; writes frames and an ffconcat list with each frame's real duration. */
function filmer(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let filming = true;
  const loop = (async () => {
    while (filming) {
      const name = `f${String(frames.length).padStart(4, '0')}.jpg`;
      await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 88, scale: 'css' });
      frames.push({ name, at: Date.now() });
    }
  })();
  // If a step fails mid-film, the browser closes under the loop: keep that
  // from crashing Node before the step's own error is printed. stop() still
  // throws the loop's error when it's the loop that failed.
  loop.catch(() => {});
  return {
    async stop() {
      filming = false;
      await loop;
      if (!frames.length) throw new Error(`filmer: no frames in ${dir}`);
      const lines = ['ffconcat version 1.0'];
      frames.forEach((f, i) => {
        lines.push(`file '${f.name}'`);
        lines.push(`duration ${(((frames[i + 1]?.at ?? f.at + 100) - f.at) / 1000).toFixed(3)}`);
      });
      lines.push(`file '${frames[frames.length - 1].name}'`); // the concat demuxer drops the last duration otherwise
      fs.writeFileSync(path.join(dir, 'frames.ffconcat'), `${lines.join('\n')}\n`);
    },
  };
}

async function app(browser) {
  const port = 5198;
  const vite = await startVite(port, { VITE_SUPABASE_URL: STUB, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' });
  const dir = path.join(out, 'app');
  const shot = (page, name) => page.screenshot({ path: path.join(dir, `${name}.png`) });
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const [w, h, tag] of [[1024, 720, 'desk'], [390, 844, 'phone']]) {
      // A battle: walk west into the Tide Colossus on Starfall Coast (a boss stands still).
      let { page, ctx } = await stubbed(browser, port, { width: w, height: h }, save({ zoneId: 'starfall-coast', pos: { x: 15 * 32 + 16, y: 3 * 32 + 16 } }),
        { ready: '[data-testid=world-topbar], [data-testid=battle-topbar]' });
      for (let i = 0; i < 12 && !(await page.locator('[data-testid=battle-topbar]').count()); i++) {
        await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(280); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(250);
      }
      await page.waitForTimeout(1400);
      for (let i = 0; i < 8 && !(await page.getByRole('button', { name: /Attack/ }).count()); i++) {
        await page.getByText(/tap to continue/i).first().click().catch(() => {});
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(600);
      await shot(page, `battle-commands-${tag}`);
      // On the desktop run, film the turn (menu, question, answer, the hit) as timed
      // frames: a recorded video skips frames while nothing moves, so its clock drifts.
      const film = tag === 'desk' ? filmer(page, path.join(dir, 'clip')) : null;
      await page.waitForTimeout(900);
      await page.getByRole('button', { name: /Attack/ }).first().click();
      await page.waitForTimeout(1500);
      await shot(page, `battle-question-${tag}`);
      await page.getByRole('button', { name: RIGHT }).first().click();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: /Go!|Continue|Next/ }).first().click().catch(() => {});
      await page.waitForTimeout(2800);
      if (film) await film.stop();
      console.log(page.errors.length ? page.errors : `✓ battle ${tag}`);
      await ctx.close();

      // The Training Grounds and a quiz question with its report link.
      ({ page, ctx } = await stubbed(browser, port, { width: w, height: h }, save({ worldUnlocked: false, passedRounds: 1, avatarId: null, zoneId: 'lumina-village', pos: null })));
      await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/DEV/.test(b.textContent)) b.remove(); });
      await shot(page, `topics-${tag}`);
      await page.getByRole('button', { name: /Space/ }).first().click();
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: RIGHT }).first().click();
      await page.waitForTimeout(900);
      await shot(page, `quiz-answered-${tag}`);
      await ctx.close();

      // "Who's playing?" and the PIN pad.
      ({ page, ctx } = await stubbed(browser, port, { width: w, height: h }, save({ zoneId: 'lumina-village', pos: { x: 30 * 32 + 16, y: 6 * 32 + 16 } }), { pickKid: false }));
      await shot(page, `who-${tag}`);
      await page.getByRole('button', { name: /Juno/ }).first().click();
      await page.waitForTimeout(900);
      await shot(page, `pin-${tag}`);
      await ctx.close();

      // The world with its HUD.
      ({ page, ctx } = await stubbed(browser, port, { width: w, height: h }, save({ zoneId: 'lumina-village', pos: { x: 30 * 32 + 16, y: 8 * 32 + 16 } }), { ready: '[data-testid=world-topbar]' }));
      await shot(page, `world-${tag}`);
      await ctx.close();
      console.log(`✓ app screens ${tag}`);
    }
  } finally {
    vite.kill();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (mode === 'world' || mode === 'all') await world(browser);
    if (mode === 'app' || mode === 'all') await app(browser);
  } finally {
    await browser.close();
  }
  console.log(`Captures in ${out}. Next: python3 site/tools/prep-assets.py ${path.relative(ROOT, out)}`);
})().catch((e) => { console.error(e); process.exit(1); });
