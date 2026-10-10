/**
 * World renderer bench runner (overworld Phase 0, #75). Drives
 * bench/world.html in headless Chromium via Playwright.
 *
 *   node bench/run-world-bench.cjs fps [cols] [rows]   frame times on the stress map
 *   node bench/run-world-bench.cjs shots <outDir>      screenshot every zone screen + Spire floor
 *   node bench/run-world-bench.cjs diff <dirA> <dirB>  pixel-compare two shots dirs
 *   node bench/run-world-bench.cjs journey [outDir]    walk Act I's legs and the Spire's floors
 *                                                      with the real hero (#75 item 14b)
 *   node bench/run-world-bench.cjs hud [outDir]        the real app (Supabase stubbed) at phone to
 *                                                      desktop sizes: nothing in the world HUD
 *                                                      overlaps, overlays cover the top bar (#102i)
 *   node bench/run-world-bench.cjs sea [outDir]        sea critters on the real canvas (#75 item 14d):
 *                                                      sailing into one battles it, Calm passes it,
 *                                                      arriving starts none; one that could reach the
 *                                                      hero where a scene starts (back from a Flee)
 *                                                      or where they land rests — lets them pass —
 *                                                      until they leave its patch; a bump's cooldown
 *                                                      never lets the hero through a boss
 *
 * Playwright isn't a project dependency; a global install works:
 *   NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs fps
 * Starts its own Vite dev server on port 5199 (or `BENCH_PORT`).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

/** Its own Vite dev server's port (`BENCH_PORT` to run two at once). */
const PORT = Number(process.env.BENCH_PORT ?? 5199);
const ROOT = path.resolve(__dirname, '..');
const BASE = `http://localhost:${PORT}/bench/world.html`;

function startVite(env = {}) {
  // stderr goes straight to the terminal: a piped-but-unread stream can fill
  // up and stall Vite on a long, noisy run (#77).
  const p = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
  });
  return new Promise((resolve, reject) => {
    // If Vite never says it's ready, stop it — the caller never gets a handle to kill (#77).
    const t = setTimeout(() => {
      p.kill();
      reject(new Error('vite did not start'));
    }, 30000);
    p.stdout.on('data', (d) => {
      if (String(d).includes('Local')) {
        clearTimeout(t);
        resolve(p);
      }
    });
    p.on('exit', (code) => reject(new Error(`vite exited (${code})`)));
  });
}

async function openBench(browser, query, { rate = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  if (rate !== 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  }
  // Every page error from the very first script on (a walk or a check reads `page.errors`).
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}?${query}`);
  await page.waitForFunction(() => window.__bench && document.querySelector('canvas'), null, { timeout: 180000 });
  return page;
}

async function fps(browser, cols, rows) {
  const results = [];
  for (const rate of [1, 4]) {
    const page = await openBench(browser, `zone=stress&cols=${cols}&rows=${rows}`, { rate });
    // Sprites load + scene build; the old per-tile renderer can take a while.
    await page.waitForFunction(() => window.__bench.stats().frames > 120, null, { timeout: 180000 });
    const load = await page.evaluate(() => window.__bench.stats());
    await page.evaluate(() => window.__bench.reset());
    // Walk a loop so the camera scrolls across the map.
    for (const [key, ms] of [
      ['ArrowRight', 3000],
      ['ArrowDown', 2500],
      ['ArrowLeft', 3000],
      ['ArrowUp', 2500],
    ]) {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    }
    const walk = await page.evaluate(() => window.__bench.stats());
    results.push({
      cpuThrottle: `${rate}x`,
      map: `${cols}x${rows}`,
      loadHitchMs: Math.round(load.max),
      fps: Math.round(walk.fps * 10) / 10,
      p50Ms: Math.round(walk.p50 * 10) / 10,
      p95Ms: Math.round(walk.p95 * 10) / 10,
      maxMs: Math.round(walk.max),
    });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
}

async function shots(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const page = await openBench(browser, 'zone=lumina-village&paused=1');
  const { zoneIds, spireThemes } = await page.evaluate(() => window.__bench.info());
  const targets = [];
  for (const zone of zoneIds) {
    await page.goto(`${BASE}?zone=${zone}&paused=1`);
    await page.waitForFunction(() => window.__bench);
    const { screens } = await page.evaluate(() => window.__bench.info());
    for (const s of screens) targets.push({ name: `${zone}__${s.x}_${s.y}`, query: `zone=${zone}&paused=1&at=${s.x},${s.y}` });
  }
  for (const theme of spireThemes) {
    targets.push({ name: `spire-${theme}`, query: `zone=crystal-spire&floor=${theme}&paused=1` });
  }
  for (const t of targets) {
    await page.goto(`${BASE}?${t.query}`);
    await page.waitForFunction(() => window.__bench && document.querySelector('canvas'));
    await page.waitForTimeout(2500);
    await page.locator('canvas').screenshot({ path: path.join(outDir, `${t.name}.png`) });
    const { animated } = await page.evaluate(() => window.__bench.info());
    fs.writeFileSync(path.join(outDir, `${t.name}.json`), JSON.stringify(animated));
  }
  console.log(`${targets.length} screenshots → ${outDir}`);
}

async function diff(browser, dirA, dirB) {
  const page = await browser.newPage();
  const names = fs.readdirSync(dirA).filter((f) => f.endsWith('.png'));
  let worst = 0;
  for (const name of names) {
    const b = path.join(dirB, name);
    if (!fs.existsSync(b)) {
      console.log(`${name}: MISSING in ${dirB}`);
      worst = Infinity;
      continue;
    }
    // Masks come from the newer run (B) when it has them — they don't depend on the renderer.
    const maskFile = [dirB, dirA].map((d) => path.join(d, name.replace('.png', '.json'))).find((f) => fs.existsSync(f));
    const masks = JSON.parse(fs.readFileSync(maskFile, 'utf8'));
    const res = await page.evaluate(
      async ({ a, b, masks }) => {
        const load = (src) =>
          new Promise((ok) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.src = src;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const read = (img) => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height).data;
        };
        const da = read(ia);
        const db = read(ib);
        // 2px of slack: the stage can resample the canvas by a pixel, which
        // lets an animated tile's edge bleed into its neighbour's border row.
        const P = 2;
        const masked = (x, y) =>
          masks.some(([mx, my, mw, mh]) => x >= mx - P && x < mx + mw + P && y >= my - P && y < my + mh + P);
        let diffs = 0;
        let maskedDiffs = 0;
        for (let y = 0; y < ia.height; y++) {
          for (let x = 0; x < ia.width; x++) {
            const i = (y * ia.width + x) * 4;
            if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
              if (masked(x, y)) maskedDiffs++;
              else diffs++;
            }
          }
        }
        return { diffs, maskedDiffs, size: [ia.width, ib.width, ia.height, ib.height] };
      },
      {
        a: `data:image/png;base64,${fs.readFileSync(path.join(dirA, name)).toString('base64')}`,
        b: `data:image/png;base64,${fs.readFileSync(b).toString('base64')}`,
        masks,
      },
    );
    worst = Math.max(worst, res.diffs);
    console.log(`${name}: ${res.diffs} px differ (+${res.maskedDiffs} in animated tiles) ${res.size.join('/')}`);
  }
  console.log(worst === 0 ? 'IDENTICAL outside animated tiles' : `DIFFERENT (worst ${worst} px)`);
  // Scripts and agents read the exit code, not the text (#77).
  if (worst !== 0) process.exitCode = 1;
}

/**
 * Act I walked by the real hero (#75 item 14b): each leg of `lib/journey.ts` on
 * a fresh page — zone by zone, through gates and exits, into its boss or the
 * Spire — then every Spire floor's seals and stairs (or Umbra). One line per
 * walk; a failure saves a screenshot to `outDir`. Exit code 1 on any failure.
 */
async function journey(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const first = await openBench(browser, 'leg=0');
  const titles = await first.evaluate(() => window.__bench.legs());
  const themes = await first.evaluate(() => window.__bench.info().spireThemes);
  await first.close();
  const walks = [
    ...titles.map((title, i) => ({ name: `leg ${i + 1}: ${title}`, query: `leg=${i}`, fn: 'walkLeg' })),
    ...themes.map((t) => ({ name: `Spire floor: ${t}`, query: `zone=crystal-spire&floor=${t}&walk=1`, fn: 'walkFloor' })),
  ];
  let failed = 0;
  const tight = [];
  for (const w of walks) {
    const page = await openBench(browser, w.query);
    const errors = page.errors;
    const r = await page.evaluate((fn) => window.__bench[fn](), w.fn);
    const ok = r.ok && errors.length === 0;
    const hops = r.hops.map((h) => `${h.zoneId}${h.ok ? '' : ' ✗'}`).join(' → ');
    const cells = r.hops.reduce((n, h) => n + h.cells, 0);
    console.log(`${ok ? '✓' : '✗'} ${w.name}  (${r.hops.length} hops, ${cells} cells, ${r.seconds}s)  ${hops}`);
    for (const h of r.hops) for (const c of h.tightTurns) tight.push(`${w.name}: ${h.zoneId} ${c.x},${c.y}`);
    if (!ok) {
      failed += 1;
      const bad = r.hops.find((h) => !h.ok);
      if (r.error) console.log(`    ${r.error}`);
      if (bad) console.log(`    stuck in ${bad.zoneId} at ${bad.stuck?.at ? `${bad.stuck.at.x},${bad.stuck.at.y}` : '?'} (step ${bad.stuck?.step}): ${bad.stuck?.reason}`);
      if (bad?.trace) console.log(`    trace: ${bad.trace.join(' | ')}`);
      for (const e of errors) console.log(`    page error: ${e}`);
      await page.screenshot({ path: path.join(outDir, `${w.query.replace(/[^a-z0-9]+/gi, '_')}.png`) });
    }
    await page.close();
  }
  console.log(`\n${walks.length - failed}/${walks.length} walks made it.`);
  if (tight.length) console.log(`Turns that took more than three tries:\n  ${tight.join('\n  ')}`);
  if (failed) process.exitCode = 1;
}

/** Where the `hud` mode points the app's Supabase client — every request is answered here. */
const STUB = 'http://supabase.stub';
const HUD_USER = 'u-hud';

/**
 * Signs in a stub player and answers Supabase for them: their profile, `save`
 * as their saved game, canned questions; every write succeeds.
 */
async function stubbedApp(browser, viewport, save, profile, { reducedMotion } = {}) {
  const page = await browser.newPage({ viewport, reducedMotion });
  const session = {
    access_token: 'stub',
    refresh_token: 'stub',
    token_type: 'bearer',
    expires_in: 31536000,
    expires_at: Math.floor(Date.now() / 1000) + 31536000,
    user: { id: HUD_USER, aud: 'authenticated', role: 'authenticated', email: 'kid@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await page.addInitScript((s) => localStorage.setItem('sb-supabase-auth-token', s), JSON.stringify(session));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.route(`${STUB}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET' && url.includes('/rest/v1/')) return route.fulfill({ status: 201, body: '' });
    if (url.includes('/rest/v1/profiles')) return json(one ? profile : [profile]);
    if (url.includes('/rest/v1/saves')) return json(one ? { data: save } : [{ data: save }]);
    if (url.includes('/functions/v1/generate-questions')) {
      const questions = Array.from({ length: 6 }, (_, i) => ({
        id: `q${i}`, level: 3, text: `What is ${i} + 2?`, options: [`${i + 2}`, `${i + 3}`, `${i + 4}`, `${i + 5}`],
        correctIndex: 0, explanation: 'Count on two.', timesAsked: 0,
      }));
      return json({ questions });
    }
    return json({});
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('[data-testid=world-topbar]', { timeout: 120000 });
  await page.waitForTimeout(1500);
  return page;
}

/** In the page: the HUD's pieces, and every pair of them that overlaps. */
function hudLayout() {
  const named = [];
  const bar = document.querySelector('[data-testid=world-topbar]');
  for (const el of bar.querySelectorAll(':scope > div > *, :scope > button')) named.push([`top bar: ${el.textContent.trim().slice(0, 14)}`, el]);
  const h1 = document.querySelector('h1');
  named.push(['place name', h1], ['crystals line', h1.nextElementSibling]);
  const stats = h1.parentElement.nextElementSibling;
  for (const el of stats.children) {
    // The Spire's seals, candles and Leave button sit in a `contents` slot (they lay out as the HUD's own).
    if (el.classList.contains('contents')) for (const c of el.children ?? []) named.push([`Spire: ${c.textContent.trim().slice(0, 14)}`, c]);
    else named.push([`HUD: ${el.textContent.trim().slice(0, 14) || el.title}`, el]);
  }
  const boxes = named.map(([name, el]) => ({ name, r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && b.r.height > 0);
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r;
      const b = boxes[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1) overlaps.push(`${boxes[i].name} × ${boxes[j].name}`);
    }
  }
  const canvas = document.querySelector('canvas')?.getBoundingClientRect();
  return {
    overlaps,
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    // The whole map on screen without scrolling (the d-pad below it may need a scroll).
    mapCut: canvas ? Math.max(0, Math.round(canvas.bottom - window.innerHeight)) : 0,
    barHeight: Math.round(bar.getBoundingClientRect().height),
    stage: canvas ? `${Math.round(canvas.width)}×${Math.round(canvas.height)} @ y ${Math.round(canvas.top)}` : 'no canvas',
  };
}

/** In the page: is each top-bar item covered (by whatever is on top at its centre)? */
function topBarCovered() {
  const bar = document.querySelector('[data-testid=world-topbar]');
  return [...bar.querySelectorAll(':scope > div > *, :scope > button')].map((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !bar.contains(top);
  });
}

/** In the page: what has focus, as a short label (the top bar's items say so). */
function focusLabel() {
  const el = document.activeElement;
  if (!el || el === document.body) return 'body';
  const where = el.closest('[data-testid=world-topbar]') ? 'top bar: ' : el.closest('[role=dialog]') ? 'dialog: ' : '';
  return `${where}${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18)}`;
}

/** In the page: does a tap 20 px above and below the button's centre still land on it (44 px targets)? */
function tapsLand(name) {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(name));
  if (!b) return `no "${name}"`;
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const miss = [cy - 20, cy + 20].filter((y) => document.elementFromPoint(cx, y)?.closest('button') !== b);
  return miss.length ? `"${name}" ${Math.round(r.height)}px tall: a tap at y ${miss.map(Math.round)} misses` : '';
}

/** Tab `n` times, noting where focus lands each time. */
async function tabs(page, n) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(focusLabel));
  }
  return seen;
}

/**
 * The world HUD on the real app at phone, sideways-phone and desktop sizes
 * (#75 item 14b, #102i): no two of its pieces overlap, no sideways scroll,
 * and with the menu open the overlay covers the whole top bar. Then the same
 * in the Spire, its seals and Leave button in the HUD row.
 */
async function hud(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const crystals = ['math', 'science', 'engineering', 'creativity'];
  const seen = { 'intro-seen': true, 'dawnreach-seen': true, 'ember-hatched': true, 'ember-hatch-seen': true, 'spire-awake-seen': true, 'save:v2': true };
  const base = {
    version: 2, avatarId: 'a1', hp: null, coins: 340, items: { potion: 2, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0 },
    badges: [], sages: ['math', 'science'], openedChests: [], kills: {}, questItems: [], passedRounds: 6, worldUnlocked: true,
    library: [], companionId: 'ember', defendTimer: true, lastRest: null, boat: null, aboard: false,
  };
  const depths = {
    ...base, zoneId: 'clockwork-depths-b2', pos: null,
    flags: { ...seen, 'crystal-math-restored': true, 'crystal-math-scene-seen': true, 'crystal-science-restored': true, 'crystal-science-scene-seen': true, 'key-verdara-key': true },
  };
  const spire = {
    ...base, zoneId: 'crystal-spire', pos: { x: 10 * 32 + 16, y: 4 * 32 + 16 },
    flags: { ...seen, 'ending-seen': true, 'key-verdara-key': true, 'key-gearfall-key': true, 'key-chromaria-key': true, ...Object.fromEntries(crystals.flatMap((t) => [[`crystal-${t}-restored`, true], [`crystal-${t}-scene-seen`, true]])) },
  };
  const profile = { id: HUD_USER, birth_year: 2016, birth_month: 3, skill_levels: {}, xp: 1250, power_ups: { attack: 4, defense: 4, vitality: 2, scholar: 2 }, current_streak: 12, longest_streak: 12, last_played_on: new Date().toISOString().slice(0, 10) };
  const sizes = [[320, 568], [360, 640], [375, 667], [740, 360], [1024, 768]];
  let bad = 0;
  for (const [width, height] of sizes) {
    const size = `${width}×${height}`;
    const page = await stubbedApp(browser, { width, height }, depths, profile);
    const errors = page.errors;
    const problems = []; // keyboard, tap-target and Sign-out checks (#75 item 14b review)
    const layout = await page.evaluate(hudLayout);
    await page.screenshot({ path: path.join(outDir, `hud-${size}.png`) });
    // Tab never sticks: the canvas isn't focusable, and a dozen Tabs move on.
    if (await page.evaluate(() => document.querySelector('canvas')?.hasAttribute('tabindex'))) problems.push('the canvas can take focus');
    await page.evaluate(() => document.activeElement?.blur());
    const walk = await tabs(page, 12);
    if (walk.some((f) => f.startsWith('canvas'))) problems.push(`Tab reached the canvas: ${walk.join(' → ')}`);
    if (new Set(walk.slice(-4)).size === 1) problems.push(`Tab stuck on ${walk.at(-1)}`);
    const tap = await page.evaluate(tapsLand, '📜 Menu');
    if (tap) problems.push(tap);
    // Asking "Sign out?" doesn't move anything on a phone.
    if (width <= 375) {
      const before = await page.evaluate(hudLayout);
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForTimeout(150);
      const armed = await page.evaluate(hudLayout);
      await page.screenshot({ path: path.join(outDir, `hud-${size}-signout-armed.png`) });
      if (armed.barHeight !== before.barHeight || armed.stage !== before.stage)
        problems.push(`asking "Sign out?" moved the page: bar ${before.barHeight}→${armed.barHeight}px, stage ${before.stage} → ${armed.stage}`);
    }
    // 📜 Menu by keyboard: focus moves in and stays in; closing brings it back to 📜 Menu.
    await page.getByRole('button', { name: '📜 Menu' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const into = await page.evaluate(focusLabel);
    if (!into.startsWith('dialog')) problems.push(`opening the Menu left focus on ${into}`);
    const inMenu = await tabs(page, 6);
    const strays = inMenu.filter((f) => !f.startsWith('dialog') && f !== 'body');
    if (strays.length) problems.push(`Tab left the open Menu: ${strays.join(', ')}`);
    const covered = await page.evaluate(topBarCovered);
    await page.screenshot({ path: path.join(outDir, `hud-${size}-menu.png`) });
    await page.getByRole('button', { name: 'Back to the world' }).first().click();
    await page.waitForTimeout(300);
    const back = await page.evaluate(focusLabel);
    if (!back.includes('Menu')) problems.push(`closing the Menu left focus on ${back}`);
    await page.close();
    // The Spire: walk into its icon, read through the door's lines, and look at the HUD on floor 1.
    const sp = await stubbedApp(browser, { width, height }, spire, profile);
    await sp.keyboard.down('ArrowDown');
    await sp.waitForTimeout(900);
    await sp.keyboard.up('ArrowDown');
    // The door's lines: Tab, Tab, Tab never reaches the top bar's Sign out under the panel.
    await sp.waitForSelector('[role=dialog][aria-label="The Crystal Spire"]', { timeout: 5000 }).catch(() => {});
    const underPanel = (await tabs(sp, 4)).filter((f) => f.startsWith('top bar'));
    if (underPanel.length) problems.push(`Tab reached the top bar under a Spire panel: ${underPanel.join(', ')}`);
    for (let i = 0; i < 8 && !(await sp.locator('[data-testid=spire-hud-slot] button').count()); i++) {
      const next = sp.locator('.fixed.inset-0 button').last();
      if (await next.count()) await next.click().catch(() => {});
      await sp.waitForTimeout(500);
    }
    const inSpire = (await sp.locator('[data-testid=spire-hud-slot] button').count()) > 0;
    const spireLayout = inSpire ? await sp.evaluate(hudLayout) : null;
    await sp.screenshot({ path: path.join(outDir, `hud-${size}-spire.png`) });
    if (inSpire) {
      const leaveTap = await sp.evaluate(tapsLand, 'Leave the Spire');
      if (leaveTap) problems.push(leaveTap);
      // "Leave the Spire?": the top bar out of reach; Escape keeps climbing, focus back on Leave.
      await sp.getByRole('button', { name: '🚪 Leave the Spire' }).click();
      await sp.waitForTimeout(300);
      await sp.screenshot({ path: path.join(outDir, `hud-${size}-spire-leave.png`) });
      const underAsk = (await tabs(sp, 4)).filter((f) => f.startsWith('top bar'));
      if (underAsk.length) problems.push(`Tab reached the top bar under "Leave the Spire?": ${underAsk.join(', ')}`);
      await sp.keyboard.press('Escape');
      await sp.waitForTimeout(300);
      const after = await sp.evaluate(focusLabel);
      if (await sp.locator('[role=alertdialog]').count()) problems.push('Escape left "Leave the Spire?" open');
      else if (!after.includes('Leave the Spire')) problems.push(`after Escape focus is on ${after}`);
    }
    errors.push(...sp.errors);
    await sp.close();
    const cut = Math.max(layout.mapCut, spireLayout?.mapCut ?? 0);
    const ok =
      !layout.overlaps.length && !layout.hscroll && covered.every(Boolean) && inSpire && !spireLayout.overlaps.length && !spireLayout.hscroll && !cut && !errors.length && !problems.length;
    if (!ok) bad += 1;
    console.log(`${ok ? '✓' : '✗'} ${size}  top bar ${layout.barHeight}px, stage ${layout.stage}; menu covers the bar: ${covered.every(Boolean) ? 'yes' : `no (${covered})`}; Spire HUD: ${inSpire ? 'in the row' : 'never reached'}`);
    for (const o of [...layout.overlaps, ...(spireLayout?.overlaps ?? [])]) console.log(`    overlap: ${o}`);
    if (layout.hscroll || spireLayout?.hscroll) console.log('    scrolls sideways');
    if (cut) console.log(`    the map runs ${cut}px off the bottom of the screen${spireLayout?.mapCut ? ' (in the Spire)' : ''}`);
    for (const e of errors) console.log(`    page error: ${e}`);
    for (const p of problems) console.log(`    ${p}`);
  }
  // Reduced motion: panels appear without scaling in (they may still fade).
  const still = await stubbedApp(browser, { width: 375, height: 667 }, depths, profile, { reducedMotion: 'reduce' });
  const firstFrame = await still.evaluate(async () => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Menu')).click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const panel = document.querySelector('[role=dialog][aria-label=Menu] > div');
    return panel ? getComputedStyle(panel).transform : 'no menu';
  });
  await still.close();
  const steady = firstFrame === 'none' || firstFrame === 'matrix(1, 0, 0, 1, 0, 0)';
  console.log(`${steady ? '✓' : '✗'} reduced motion: the Menu's first frame has transform ${firstFrame}`);
  if (!steady) bad += 1;
  console.log(`\n${sizes.length + 1 - bad}/${sizes.length + 1} checks clean. Screenshots in ${outDir}.`);
  if (bad) process.exitCode = 1;
}

/**
 * Sea critters on the real `WorldCanvas` (#75 item 14d), on the bench page:
 * each check on a fresh page, a screenshot of each in `outDir`, exit 1 on a
 * failure. (The Bubble Puffer's home is 17,28 on the Silver Shallows.)
 */
async function sea(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const state = (page) => page.evaluate(() => window.__bench.state());
  const ready = async (query) => {
    const page = await openBench(browser, query);
    await page.waitForFunction(() => window.__bench.stats().frames > 60, null, { timeout: 180000 });
    return page;
  };
  const hold = async (page, key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  // Sweep round the puffer's patch (it wanders ±2 tiles) until a battle starts.
  const hunt = async (page, rounds = 6) => {
    const moves = [['ArrowRight', 300], ['ArrowDown', 250], ['ArrowUp', 500], ['ArrowDown', 250], ['ArrowLeft', 300], ['ArrowUp', 250], ['ArrowDown', 500], ['ArrowUp', 250]];
    for (let i = 0; i < rounds * moves.length; i++) {
      if ((await state(page)).encounters) return;
      await hold(page, ...moves[i % moves.length]);
    }
  };
  // Back in an awake critter's patch: stand still (it wanders into you sooner or later),
  // then sweep — a sweep alone can miss a critter on the move.
  const meet = async (page) => {
    for (let t = 0; t < 30 && !(await state(page)).encounters; t++) await page.waitForTimeout(500);
    await hunt(page);
  };
  const checks = [];
  const check = async (page, name, ok, detail) => {
    checks.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
    await page.locator('canvas').screenshot({ path: path.join(outDir, `${checks.length}.png`) });
    if (page.errors.length) console.log(`    page errors: ${page.errors.join(' | ')}`);
    await page.close();
  };

  let page = await ready('zone=silver-shallows&aboard=1&at=14,28');
  await hunt(page);
  let s = await state(page);
  await check(page, 'sailing into the Bubble Puffer battles it', s.battles[0] === 'bubble-puffer' && !page.errors.length, JSON.stringify(s.battles));

  page = await ready('zone=silver-shallows&aboard=1&at=14,28');
  await page.evaluate(() => window.__bench.calm(60));
  await hunt(page, 2);
  s = await state(page);
  await check(page, 'under Calm the boat sails past it', s.encounters === 0, `${s.encounters} battles`);

  page = await ready('zone=dawnreach&aboard=1&at=77,30');
  await hold(page, 'ArrowRight', 1500);
  await page.waitForTimeout(3000);
  s = await state(page);
  await check(page, 'sailing onto the Shallows from Dawnreach starts no fight', s.zoneId === 'silver-shallows' && s.encounters === 0, `${s.zoneId}, ${s.encounters} battles`);

  // Back from a Flee: saved right where the puffer touched you, and it respawns at home —
  // on top of the hero (0 px) as the scene starts, a battle from the first frame unless
  // it rests (`ready` has run a second of frames by now).
  page = await ready('zone=silver-shallows&aboard=1&at=17,28');
  const onTop = (await state(page)).encounters;
  await page.waitForTimeout(2500);
  // Resting, it lets you pass, like under Calm: nudge about inside its patch.
  await hold(page, 'ArrowRight', 150);
  await hold(page, 'ArrowLeft', 300);
  await page.waitForTimeout(1000);
  const idle = (await state(page)).encounters;
  const hinted = (await state(page)).sleeperHints; // walking into it says it's asleep, once
  await hold(page, 'ArrowUp', 600); // sail out of its patch: it wakes…
  await hold(page, 'ArrowDown', 550); // …and back: it fights
  await meet(page);
  s = await state(page);
  await check(
    page,
    'back on a critter after a Flee: it sleeps — on top of the hero (0 px) and nudging about its patch start nothing, and say it\'s asleep once — until you leave its patch, then fights',
    onTop === 0 && idle === 0 && hinted === 1 && s.battles[0] === 'bubble-puffer',
    `on top ${onTop}, resting ${idle} battles, ${hinted} hint, then ${JSON.stringify(s.battles)}`,
  );

  // Back from a Flee a little off its home (a critter that swam into a hero standing still
  // saves them wherever they touched — or a reload there): it waits for the hero to move.
  page = await ready('zone=silver-shallows&aboard=1&at=18,28');
  await page.waitForTimeout(8000);
  const waited = (await state(page)).encounters;
  await hold(page, 'ArrowUp', 600);
  await hold(page, 'ArrowDown', 550);
  await meet(page);
  s = await state(page);
  await check(page, 'back from a Flee 32 px off its home: 8 s idle start nothing; sailing off and back it fights', waited === 0 && s.battles[0] === 'bubble-puffer', `idle ${waited} battles, then ${JSON.stringify(s.battles)}`);

  // Going ashore beside a land critter: Dawnreach's Bolt Mouse lives at 67,19, a step up
  // from the beach at 67,20. Land there, then stand still: it rests. Walk off along the
  // beach out of its patch and back: it fights.
  page = await ready('zone=dawnreach&aboard=1&at=67,22');
  await hold(page, 'ArrowUp', 900);
  const landed = (await state(page)).landings;
  await page.waitForTimeout(5000);
  const ashore = (await state(page)).encounters;
  await hold(page, 'ArrowLeft', 1400); // off the beach, out of its patch: it wakes…
  await hold(page, 'ArrowRight', 1350); // …and back
  // Stand still a while, then step about its home and back — never drifting off, as the
  // sea-sized sweep (`hunt`) can on land.
  for (let t = 0; t < 30 && !(await state(page)).encounters; t++) await page.waitForTimeout(500);
  const steps = [['ArrowUp', 250], ['ArrowLeft', 250], ['ArrowRight', 500], ['ArrowLeft', 250], ['ArrowDown', 250]];
  for (let i = 0; i < 12 * steps.length && !(await state(page)).encounters; i++) await hold(page, ...steps[i % steps.length]);
  s = await state(page);
  await check(
    page,
    'going ashore beside a land critter: it rests while you stand there (5 s), then fights once you leave its patch and come back',
    landed === 1 && ashore === 0 && s.battles[0] === 'bolt-mouse',
    `landed ${landed}, resting ${ashore} battles, then ${JSON.stringify(s.battles)}`,
  );

  // A bump's cooldown spares only an enemy already touching the hero (#112t): bump the
  // Whispering Woods save crystal (18,2) from 18,3 — a 2 s cooldown — then head down-left
  // past the Thicket Warden (16,4). It fights; it used to let the hero walk through.
  page = await ready('zone=whispering-woods&at=18,3');
  await hold(page, 'ArrowUp', 300);
  await page.keyboard.down('ArrowLeft');
  await hold(page, 'ArrowDown', 800);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(300);
  s = await state(page);
  await check(page, 'just after a bump (the save crystal\'s cooldown), walking at a boss still fights it', s.battles[0] === 'thicket-warden', JSON.stringify(s.battles));

  const bad = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - bad}/${checks.length} sea checks passed. Screenshots in ${outDir}.`);
  if (bad) process.exitCode = 1;
}

(async () => {
  const [mode = 'fps', ...args] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  let vite = null;
  try {
    if (mode === 'hud') vite = await startVite({ VITE_SUPABASE_URL: STUB, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' });
    else if (mode !== 'diff') vite = await startVite();
    if (mode === 'fps') await fps(browser, Number(args[0] ?? 160), Number(args[1] ?? 112));
    else if (mode === 'shots') await shots(browser, args[0] ?? 'bench-shots');
    else if (mode === 'diff') await diff(browser, args[0], args[1]);
    else if (mode === 'journey') await journey(browser, args[0] ?? 'bench-journey');
    else if (mode === 'hud') await hud(browser, args[0] ?? 'bench-hud');
    else if (mode === 'sea') await sea(browser, args[0] ?? 'bench-sea');
    else throw new Error(`unknown mode ${mode}`);
  } finally {
    await browser.close();
    vite?.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
