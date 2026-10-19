/**
 * World renderer bench runner (overworld Phase 0, #75). Drives
 * bench/world.html in headless Chromium via Playwright.
 *
 *   node bench/run-world-bench.cjs fps [cols] [rows]   frame times on the stress map
 *   node bench/run-world-bench.cjs shots <outDir>      screenshot every zone screen + Spire floor
 *                                                      (on an overworld map, a screen with no open
 *                                                      ground in view is shot flying, `…__fly.png`)
 *   node bench/run-world-bench.cjs diff <dirA> <dirB>  pixel-compare two shots dirs
 *   node bench/run-world-bench.cjs journey [outDir]    walk Act I's legs and the Spire's floors
 *                                                      with the real hero (#75 item 14b)
 *   node bench/run-world-bench.cjs hud [outDir]        the real app (Supabase stubbed) at phone to
 *                                                      desktop sizes: nothing in the world HUD
 *                                                      overlaps, overlays cover the top bar (#102i);
 *                                                      flying with Calm on, 🛬 Land / 🐉 Fly, the
 *                                                      timer and 📜 Menu fit and each tap lands (#136e);
 *                                                      and by touch on sideways phones (740×360,
 *                                                      568×320), walking and flying with Calm: the
 *                                                      map whole on screen, nothing over the d-pad,
 *                                                      44 px taps, "Switch player" (#159 r2)
 *   node bench/run-world-bench.cjs battle [outDir]     the real app (Supabase stubbed): a battle at
 *                                                      five sizes — its top bar covers nothing, the
 *                                                      enemy's "!!!" shows, the commands fit (#75 item 14f),
 *                                                      and again on the boss's "💢 … next!" turn (#158b)
 *   node bench/run-world-bench.cjs sea [outDir]        sea critters on the real canvas (#75 item 14d):
 *                                                      sailing into one battles it, Calm passes it,
 *                                                      arriving starts none; one that could reach the
 *                                                      hero where a scene starts (back from a Flee)
 *                                                      or where they land rests — lets them pass —
 *                                                      until they leave its patch; a bump's cooldown
 *                                                      never lets the hero through a boss
 *   node bench/run-world-bench.cjs use [outDir]        press to use on the real canvas (#127): a door
 *                                                      from up to 18 px off its middle lets the hero in;
 *                                                      chests, gates and people wait for Space / Enter /
 *                                                      a click; a person kept walking into steps aside;
 *                                                      a shopkeeper is talked to across the counter
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
    // A screen with no open ground near its middle is shot with the hero flying over it (#82f).
    for (const s of screens) {
      const fly = s.fly ? '&fly=1' : '';
      targets.push({ name: `${zone}__${s.x}_${s.y}${s.fly ? '__fly' : ''}`, query: `zone=${zone}&paused=1&at=${s.x},${s.y}${fly}` });
    }
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
 * Signs in a stub grown-up whose one kid is already playing in this tab (#124)
 * and answers Supabase for them: consent given, the kid's profile, `save` as
 * their saved game, canned questions; every write succeeds.
 */
async function stubbedApp(browser, viewport, save, profile, { reducedMotion, ready = '[data-testid=world-topbar]', touch = false } = {}) {
  // `touch`: a phone's coarse pointer — the d-pad and the sideways-phone layout only show with it.
  const page = await browser.newPage({ viewport, reducedMotion, hasTouch: touch, isMobile: touch });
  const session = {
    access_token: 'stub',
    refresh_token: 'stub',
    token_type: 'bearer',
    expires_in: 31536000,
    expires_at: Math.floor(Date.now() / 1000) + 31536000,
    user: { id: HUD_USER, aud: 'authenticated', role: 'authenticated', email: 'kid@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await page.addInitScript(
    ([s, kid]) => {
      localStorage.setItem('sb-supabase-auth-token', s);
      sessionStorage.setItem(`hazel-active-kid-${kid}`, kid); // past "Who's playing?"
    },
    [JSON.stringify(session), profile.id],
  );
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  let askedSoFar = 0;
  await page.route(`${STUB}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET' && url.includes('/rest/v1/')) return route.fulfill({ status: 201, body: '' });
    if (url.includes('/rest/v1/parents')) return json([{ consent_at: '2026-10-10T00:00:00Z', has_pin: false }]);
    if (url.includes('/rest/v1/profiles')) return json(one ? profile : [{ display_name: 'Hud', icon: 'fox', has_pin: true, ...profile }]);
    if (url.includes('/rest/v1/saves')) return json(one ? { data: save } : [{ data: save }]);
    if (url.includes('/functions/v1/generate-questions')) {
      // As many as asked (so no starter question fills in), each its own: a bench
      // can answer "What is n + 2?" right (`answerRight`).
      const body = (() => {
        try {
          return JSON.parse(req.postData() || '{}');
        } catch {
          return {};
        }
      })();
      const count = Math.min(20, Math.max(1, Number(body.count) || 6));
      const questions = Array.from({ length: count }, () => {
        const n = (askedSoFar += 1);
        return {
          id: `q${n}`, level: 3, text: `What is ${n} + 2?`, options: [`${n + 2}`, `${n + 3}`, `${n + 4}`, `${n + 5}`],
          correctIndex: 0, explanation: 'Count on two.', timesAsked: 0,
        };
      });
      return json({ questions });
    }
    return json({});
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector(ready, { timeout: 120000, state: 'attached' });
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
    // The buttons (and Calm's timer) keep together in a group of their own: each one counts.
    else if (el.tagName === 'DIV') for (const c of el.children) named.push([`HUD: ${c.textContent.trim().slice(0, 14) || c.title}`, c]);
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

/**
 * In the page: 🐉 Fly / 🛬 Land, Calm's timer and 📜 Menu in the HUD row
 * (#136e) — each one's box, whether it's on screen, and how many lines the
 * row of stats wraps onto.
 */
function flightRow() {
  const stats = document.querySelector('h1').parentElement.nextElementSibling;
  // The buttons (and Calm's timer) may sit in a group of their own: count what's in it.
  const items = [...stats.children].flatMap((el) => (el.tagName === 'DIV' ? [...el.children] : [el]));
  const shown = items.filter((el) => el.getBoundingClientRect().width > 0);
  const box = (re) => {
    const el = shown.find((c) => re.test(c.textContent));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim(), onScreen: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight };
  };
  return {
    flight: box(/🐉 Fly|🛬 Land/),
    calm: box(/🕊️/),
    menu: box(/📜 Menu/),
    // Items in one line share a middle (the row is `items-center`).
    lines: new Set(shown.map((el) => Math.round((el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2) / 6))).size,
    titleLines: Math.round(document.querySelector('h1').getBoundingClientRect().height / 28),
  };
}

/**
 * In the page: does a tap anywhere on each named button's own face land on it?
 * A 44 px tap area (`HUD_TAP`) drawn later can sit over a neighbour's face when
 * the HUD row wraps (#136e).
 */
function faceTaps(names) {
  return names.flatMap((name) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(name));
    if (!b) return [];
    const r = b.getBoundingClientRect();
    const spots = [
      [r.left + r.width / 2, r.top + 2, 'top'],
      [r.left + r.width / 2, r.bottom - 2, 'bottom'],
      [r.left + 2, r.top + r.height / 2, 'left'],
      [r.right - 2, r.top + r.height / 2, 'right'],
    ];
    return spots.flatMap(([x, y, edge]) => {
      const hit = document.elementFromPoint(x, y)?.closest('button');
      return hit === b ? [] : [`a tap on the ${edge} edge of "${name}" lands on ${hit ? `"${hit.textContent.trim().slice(0, 14)}"` : 'nothing'}`];
    });
  });
}

/**
 * In the page, by touch: the d-pad (its arrows and ✋) — each one's size, and
 * every HUD piece, top-bar item or the map that runs over one — and whether the
 * map is whole on screen (not cut at any edge), the page scrolls sideways, and
 * the top bar's Switch is named "Switch player" and 44 px tall (#159 r2).
 */
function padLayout() {
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
  const pad = document.querySelector('[aria-label="movement pad"]');
  const use = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('✋'));
  const padButtons = shown(pad) ? [...pad.querySelectorAll('button'), ...(use ? [use] : [])] : [];
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 16);
  const pieces = [];
  const bar = document.querySelector('[data-testid=world-topbar]');
  for (const el of bar.querySelectorAll(':scope > div > *, :scope > button, :scope > span > button')) pieces.push(['top bar', el]);
  const h1 = document.querySelector('h1');
  pieces.push(['place name', h1], ['crystals line', h1.nextElementSibling]);
  for (const el of h1.parentElement.nextElementSibling.children) {
    if (el.tagName === 'DIV') for (const c of el.children) pieces.push(['HUD', c]);
    else pieces.push(['HUD', el]);
  }
  const canvas = document.querySelector('canvas');
  if (canvas) pieces.push(['map', canvas]);
  const hits = [];
  for (const [where, el] of pieces.filter(([, el]) => shown(el))) {
    const a = el.getBoundingClientRect();
    for (const b of padButtons) {
      const r = b.getBoundingClientRect();
      const w = Math.min(a.right, r.right) - Math.max(a.left, r.left);
      const h = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
      if (w > 1 && h > 1) hits.push(`${where} "${label(el)}" over the pad's ${label(b)}`);
    }
  }
  const c = canvas?.getBoundingClientRect();
  const cut = c
    ? [['top', -c.top], ['left', -c.left], ['right', c.right - innerWidth], ['bottom', c.bottom - innerHeight]]
        .filter(([, px]) => px > 0.5)
        .map(([edge, px]) => `${Math.round(px)}px off the ${edge}`)
    : ['no map'];
  const sw = [...bar.querySelectorAll('button')].find((b) => /^switch/i.test((b.getAttribute('aria-label') || b.textContent).trim()));
  return {
    pad: padButtons.length,
    small: padButtons.filter((b) => b.getBoundingClientRect().width < 44 || b.getBoundingClientRect().height < 44).map(label),
    hits,
    cut,
    map: c ? `${Math.round(c.width)}×${Math.round(c.height)} @ ${Math.round(c.left)},${Math.round(c.top)}` : 'no map',
    hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    switchName: sw ? sw.getAttribute('aria-label') || sw.textContent.trim() : null,
    switchHeight: sw ? Math.round(sw.getBoundingClientRect().height) : 0,
  };
}

/**
 * A sideways phone by touch (#159 r2): on Dawnreach walking, or flying on
 * Ember with Calm cast (its timer in the HUD row), the map is whole on screen,
 * nothing in the HUD or the top bar runs over the d-pad, the pad's buttons are
 * 44 px, 📜 Menu and 🐉 Fly / 🛬 Land take a tap 20 px off their middle, the
 * top bar's Switch reads "Switch player", and nothing scrolls sideways.
 */
async function touchHud(browser, viewport, save, profile, outDir, size, mode) {
  const page = await stubbedApp(browser, viewport, save, profile, { touch: true });
  const problems = [];
  if (mode === 'flying') {
    await page.getByRole('button', { name: '📜 Menu' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Cast', exact: true }).click();
    await page.waitForTimeout(800);
    await page.waitForFunction(() => !document.body.innerText.includes('Critters will let you pass'), null, { timeout: 12000 }).catch(() => {});
  }
  const pad = await page.evaluate(padLayout);
  const layout = await page.evaluate(hudLayout);
  await page.screenshot({ path: path.join(outDir, `hud-${size}-touch-${mode}.png`) });
  if (!pad.pad) problems.push('no d-pad (is touch on?)');
  for (const h of pad.hits) problems.push(`overlap: ${h}`);
  for (const c of pad.cut) problems.push(`the map is cut: ${c}`);
  for (const o of layout.overlaps) problems.push(`overlap: ${o}`);
  if (pad.hscroll) problems.push('scrolls sideways');
  if (pad.small.length) problems.push(`pad buttons under 44 px: ${pad.small.join(', ')}`);
  if (pad.switchName !== 'Switch player') problems.push(`the top bar's Switch is named ${JSON.stringify(pad.switchName)}, not "Switch player"`);
  if (pad.switchHeight < 44) problems.push(`the top bar's Switch is ${pad.switchHeight}px tall`);
  for (const name of ['📜 Menu', mode === 'flying' ? '🛬 Land' : '🐉 Fly']) {
    const tap = await page.evaluate(tapsLand, name);
    if (tap) problems.push(tap);
  }
  if (mode === 'flying' && !(await page.evaluate(flightRow)).calm) problems.push('no 🕊️ Calm timer in the HUD');
  const errors = [...page.errors];
  await page.close();
  return { problems, errors, look: `${mode}: map ${pad.map}, ${pad.pad} pad buttons, top bar ${layout.barHeight}px` };
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
 * in the Spire, its seals and Leave button in the HUD row, and flying on
 * Ember with Calm on (`flyingHud`, #136e).
 */
/** In the page, on the battle screen: the top bar, the status boxes and the enemy's "!" marks (#75 item 14f review). */
function battleLayout() {
  const barEl = document.querySelector('[data-testid=battle-topbar]');
  const bar = barEl.getBoundingClientRect();
  const panels = [...barEl.nextElementSibling.children].map((el) => el.getBoundingClientRect());
  const marks = [...document.querySelectorAll('span[aria-hidden=true]')].find((s) => /^!+$/.test(s.textContent.trim()));
  const mr = marks?.getBoundingClientRect();
  const top = mr ? document.elementFromPoint(mr.left + mr.width / 2, mr.top + mr.height / 2) : null;
  const visible = [...document.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0);
  return {
    barHeight: Math.round(bar.height),
    gap: Math.round(Math.min(...panels.map((r) => r.top)) - bar.bottom),
    marks: marks ? marks.textContent.trim() : null,
    marksOnTop: !!top && !!marks && (top === marks || marks.parentElement.contains(top)),
    offScreen: visible.filter((b) => b.getBoundingClientRect().bottom > innerHeight + 1).map((b) => b.textContent.trim().slice(0, 16)),
    sideways: document.documentElement.scrollWidth > innerWidth,
    scrolls: document.documentElement.scrollHeight > innerHeight + 1,
    // A coming power move (💢 … next!): the line a sighted kid sees, if any, on screen and on top.
    warning: (() => {
      const el = [...document.querySelectorAll('span')].find((x) => {
        const r = x.getBoundingClientRect();
        return x.children.length === 0 && /^💢 .* next!$/.test(x.textContent.trim()) && r.width > 2 && r.height > 2 && getComputedStyle(x).display !== 'none';
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + Math.min(r.width, 40) / 2, r.top + r.height / 2);
      return { text: el.textContent.trim(), onScreen: r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight, onTop: !!top && el.contains(top) };
    })(),
  };
}

/** Answer the question on screen right — the stub only asks "What is n + 2?" — and go on. */
async function answerRight(page) {
  const ask = page.getByText(/What is \d+ \+ 2\?/).first();
  const text = await ask.textContent({ timeout: 8000 }).catch(() => '');
  const n = Number(/What is (\d+) \+ 2/.exec(text)?.[1]);
  if (!Number.isFinite(n)) return false;
  await page.getByRole('button', { name: String(n + 2), exact: true }).click();
  await page.getByRole('button', { name: /Go!/ }).click();
  return true;
}

/** Read on (tap to continue) until the commands or the next question show. */
async function readOn(page) {
  for (let i = 0; i < 10; i++) {
    if (await page.getByRole('button', { name: /Attack/ }).count()) return 'commands';
    if (await page.getByText(/What is \d+ \+ 2\?/).count()) return 'question';
    await page.getByText(/tap to continue/).first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return 'stuck';
}

/**
 * The battle screen on the real app (#75 item 14f review): a hero walks into
 * the Ringkeeper, Eldergrove's tier-5 warden, at five sizes. The level and
 * streak sit in their own row above the status boxes (they floated over the
 * enemy's "!!!" on a phone), the "!!!" is on top, nothing scrolls sideways,
 * and the 💪 line and then the commands fit on screen — 🏃 Flee too, at 320
 * px (#158b). Then it Guards on (right answers) to the boss's power-move turn:
 * the "💢 … next!" line shows and is on top, every command is on screen, and
 * the page doesn't scroll.
 */
async function battleHud(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const crystals = ['math', 'science', 'engineering', 'creativity'];
  const flags = {
    'intro-seen': true, 'dawnreach-seen': true, 'ember-hatched': true, 'ember-hatch-seen': true, 'spire-awake-seen': true, 'save:v2': true,
    'ending-seen': true, 'spire-cleared': true, 'spire-victory-seen': true, 'act2-seen': true,
    ...Object.fromEntries(crystals.flatMap((t) => [[`crystal-${t}-restored`, true], [`crystal-${t}-scene-seen`, true]])),
  };
  const save = {
    version: 2, avatarId: 'a1', hp: null, coins: 340, items: { potion: 2, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0, knot: 0 },
    badges: [], sages: ['math', 'science'], openedChests: [], kills: {}, questItems: [], passedRounds: 6, worldUnlocked: true,
    library: [], companionId: 'ember', defendTimer: true, lastRest: null, boat: null, aboard: false,
    // In the Great Ring, three cells east of the Ringkeeper (25,23): a boss
    // stands still (a critter wanders, and one that could reach the hero as the
    // world loads rests till they leave its patch, #75 item 14d), so the hero
    // walks west straight into it.
    zoneId: 'eldergrove', pos: { x: 28 * 32 + 16, y: 23 * 32 + 16 }, flags,
  };
  const profile = { id: HUD_USER, birth_year: 2016, birth_month: 3, skill_levels: {}, xp: 1250, power_ups: { attack: 4, defense: 4, vitality: 2, scholar: 2 }, current_streak: 12, longest_streak: 12, last_played_on: new Date().toISOString().slice(0, 10) };
  // A sideways phone (740×360) is left out: the battle never fit one, row or not (ISSUES #117m).
  const sizes = [[320, 568], [360, 640], [375, 667], [390, 844], [1024, 768]];
  let bad = 0;
  for (const [width, height] of sizes) {
    const size = `${width}×${height}`;
    const page = await stubbedApp(browser, { width, height }, save, profile, {
      ready: '[data-testid=world-topbar], [data-testid=battle-topbar]',
    });
    const problems = [];
    // Walk west into the Ringkeeper.
    for (let i = 0; i < 10 && !(await page.locator('[data-testid=battle-topbar]').count()); i++) {
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(300);
      await page.keyboard.up('ArrowLeft');
      await page.waitForTimeout(250);
    }
    if (!(await page.locator('[data-testid=battle-topbar]').count())) {
      console.log(`✗ ${size}  no battle started`);
      bad++;
      await page.close();
      continue;
    }
    await page.waitForTimeout(1200);
    const opening = await page.evaluate(battleLayout);
    await page.screenshot({ path: path.join(outDir, `battle-${size}-opening.png`) });
    // Read on through the opening lines (its monologue, the 💪 line for tier 5) to the commands.
    for (let i = 0; i < 6 && !(await page.getByRole('button', { name: /Attack/ }).count()); i++) {
      await page.getByText(/tap to continue/).first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    const commands = await page.evaluate(battleLayout);
    await page.screenshot({ path: path.join(outDir, `battle-${size}-commands.png`) });
    if (!(await page.getByRole('button', { name: /Attack/ }).count())) problems.push('never reached the commands');
    // A boss winds up its power move every third turn: Guard (so it never falls
    // first), answer right, defend right, until the commands come back under
    // "💢 Big hit next!" (#158b).
    let power = null;
    for (let round = 0; round < 5 && !power && (await page.getByRole('button', { name: /Attack/ }).count()); round++) {
      await page.getByRole('button', { name: /Guard/ }).first().click();
      if (!(await answerRight(page))) break;
      let next = await readOn(page);
      if (next === 'question') {
        if (!(await answerRight(page))) break;
        next = await readOn(page);
      }
      if (next !== 'commands') break;
      await page.waitForTimeout(600);
      const l = await page.evaluate(battleLayout);
      if (l.warning) power = l;
    }
    if (power) await page.screenshot({ path: path.join(outDir, `battle-${size}-power.png`) });
    else problems.push("never reached the boss's power-move turn");
    for (const [when, l] of [['opening', opening], ['commands', commands], ['power move', power]]) {
      if (!l) continue;
      if (l.barHeight && l.gap < 0) problems.push(`${when}: the top bar runs ${-l.gap}px into the status boxes`);
      if (!l.marksOnTop) problems.push(`${when}: the enemy's "${l.marks}" is covered`);
      if (l.offScreen.length) problems.push(`${when}: off the bottom: ${l.offScreen.join(', ')}`);
      if (l.sideways) problems.push(`${when}: the page scrolls sideways`);
    }
    if (power?.scrolls) problems.push('power move: the page scrolls');
    if (power && !(power.warning.onScreen && power.warning.onTop)) problems.push(`power move: "${power.warning.text}" is ${power.warning.onScreen ? 'covered' : 'off the screen'}`);
    problems.push(...page.errors);
    const barText = commands.barHeight ? `top bar ${commands.barHeight}px, ${commands.gap}px above the status boxes` : 'no top bar (too small)';
    const powerText = power ? `; power move: "${power.warning.text}", ${power.offScreen.length ? 'commands cut off' : 'every command on screen'}, ${power.scrolls ? 'scrolls' : 'no scroll'}` : '';
    console.log(`${problems.length ? '✗' : '✓'} ${size}  ${barText}; "${commands.marks}" on top: ${commands.marksOnTop ? 'yes' : 'no'}${powerText}`);
    for (const pr of problems) console.log(`    ${pr}`);
    if (problems.length) bad++;
    await page.close();
  }
  console.log(`\n${sizes.length - bad}/${sizes.length} battle checks clean. Screenshots in ${outDir}.`);
  if (bad) process.exitCode = 1;
}

/**
 * Flying over Dawnreach in the real app (#136e): a save-v3 hero on Ember casts
 * Calm from the 📜 Menu, so 🛬 Land, "🕊️ 60s" and 📜 Menu share the HUD row;
 * then 🛬 Land sets them down and the row reads 🐉 Fly instead. Each time:
 * nothing in the HUD overlaps, all three are there and on screen, Land / Fly
 * and Menu keep 44 px taps and a tap on either one's face lands on it, no
 * sideways scroll, the map fits.
 */
async function flyingHud(browser, viewport, save, profile, outDir, size) {
  const page = await stubbedApp(browser, viewport, save, profile);
  const problems = [];
  const looks = [];
  const look = async (when, button) => {
    const layout = await page.evaluate(hudLayout);
    const row = await page.evaluate(flightRow);
    await page.screenshot({ path: path.join(outDir, `hud-${size}-${when}.png`) });
    for (const o of layout.overlaps) problems.push(`${when}: overlap: ${o}`);
    if (layout.hscroll) problems.push(`${when}: scrolls sideways`);
    if (layout.mapCut) problems.push(`${when}: the map runs ${layout.mapCut}px off the bottom of the screen`);
    for (const [name, b] of [[button, row.flight], ['🕊️ Calm', row.calm], ['📜 Menu', row.menu]]) {
      if (!b) problems.push(`${when}: no ${name} in the HUD`);
      else if (!b.onScreen) problems.push(`${when}: ${b.text} is off the screen`);
    }
    if (row.flight && !row.flight.text.includes(button)) problems.push(`${when}: the flight button reads "${row.flight.text}", not ${button}`);
    for (const name of [button, '📜 Menu']) {
      const tap = await page.evaluate(tapsLand, name);
      if (tap) problems.push(`${when}: ${tap}`);
    }
    for (const miss of await page.evaluate(faceTaps, [button, '📜 Menu'])) problems.push(`${when}: ${miss}`);
    looks.push(`${when}: ${[row.flight?.text, row.calm?.text, row.menu?.text].filter(Boolean).join(' · ')} — stats on ${row.lines} line${row.lines === 1 ? '' : 's'}, title on ${row.titleLines}`);
  };
  // Calm from the menu (the HUD shows its timer only while it runs).
  await page.getByRole('button', { name: '📜 Menu' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Cast', exact: true }).click();
  await page.waitForTimeout(800);
  // On a phone the "Calm!" toast floats over the HUD row for a few seconds (it lets taps through);
  // wait it out so the screenshots show the row.
  await page.waitForFunction(() => !document.body.innerText.includes('Critters will let you pass'), null, { timeout: 12000 }).catch(() => {});
  await look('flying', '🛬 Land');
  await page.getByRole('button', { name: 'Land', exact: true }).click();
  await page.getByRole('button', { name: 'Fly on Ember', exact: true }).waitFor({ timeout: 5000 }).catch(() => problems.push('🛬 Land never set the hero down'));
  await page.waitForTimeout(300);
  await look('landed', '🐉 Fly');
  const errors = [...page.errors];
  await page.close();
  return { problems, looks, errors };
}

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
  // Save v3 (#75 item 15b), flying on Ember over open ground on Dawnreach: the Crystal of Memory
  // restored (so `canFly`), every story panel and fog lift already seen, Calm learned (#136e).
  const flyingSave = {
    ...base, version: 3, vehicle: 'ember', zoneId: 'dawnreach', pos: { x: 41 * 32 + 16, y: 18 * 32 + 16 },
    flags: {
      ...seen, 'ending-seen': true, 'spire-cleared': true, 'spire-victory-seen': true, 'act2-seen': true, 'flight-tutorial-seen': true, 'spell:calm': true,
      ...Object.fromEntries([...crystals, 'history'].flatMap((t) => [[`crystal-${t}-restored`, true], [`crystal-${t}-scene-seen`, true]])),
      ...Object.fromEntries(['shrine-fog', 'spire-fog', 'math-fog', 'science-fog', 'engineering-fog', 'creativity-fog', 'hill-fog', 'roost-clouds'].map((id) => [`fog-${id}-seen`, true])),
    },
  };
  delete flyingSave.aboard; // v3 has `vehicle` in its place
  const profile = { id: HUD_USER, birth_year: 2016, birth_month: 3, skill_levels: {}, xp: 1250, power_ups: { attack: 4, defense: 4, vitality: 2, scholar: 2 }, current_streak: 12, longest_streak: 12, last_played_on: new Date().toISOString().slice(0, 10) };
  const sizes = [[320, 568], [360, 640], [375, 667], [740, 360], [1024, 768]];
  let bad = 0;
  for (const [width, height] of sizes) {
    const size = `${width}×${height}`;
    const page = await stubbedApp(browser, { width, height }, depths, profile);
    const errors = page.errors;
    const problems = []; // keyboard, tap-target and Switch-player checks (#75 item 14b review)
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
    // Asking "Switch?" doesn't move anything on a phone.
    if (width <= 375) {
      const before = await page.evaluate(hudLayout);
      await page.getByRole('button', { name: 'Switch player' }).click();
      await page.waitForTimeout(150);
      const armed = await page.evaluate(hudLayout);
      await page.screenshot({ path: path.join(outDir, `hud-${size}-switch-armed.png`) });
      if (armed.barHeight !== before.barHeight || armed.stage !== before.stage)
        problems.push(`asking "Switch?" moved the page: bar ${before.barHeight}→${armed.barHeight}px, stage ${before.stage} → ${armed.stage}`);
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
    // The Spire: walk up to its icon and use it, read through the door's lines, and look at the HUD on floor 1.
    const sp = await stubbedApp(browser, { width, height }, spire, profile);
    await sp.keyboard.down('ArrowDown');
    await sp.waitForTimeout(900);
    await sp.keyboard.up('ArrowDown');
    await sp.keyboard.press('Space'); // the Spire's door waits to be used (#127)
    // The door's lines: Tab, Tab, Tab never reaches the top bar's Switch under the panel.
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
      // "Leave the Spire?": the top bar out of reach; 🗼 Keep climbing puts focus back on Leave.
      await sp.getByRole('button', { name: '🚪 Leave the Spire' }).click();
      await sp.waitForTimeout(300);
      await sp.screenshot({ path: path.join(outDir, `hud-${size}-spire-leave.png`) });
      const underAsk = (await tabs(sp, 4)).filter((f) => f.startsWith('top bar'));
      if (underAsk.length) problems.push(`Tab reached the top bar under "Leave the Spire?": ${underAsk.join(', ')}`);
      await sp.getByRole('button', { name: '🗼 Keep climbing' }).click();
      await sp.waitForTimeout(300);
      const kept = await sp.evaluate(focusLabel);
      if (await sp.locator('[role=alertdialog]').count()) problems.push('Keep climbing left "Leave the Spire?" open');
      else if (!kept.includes('Leave the Spire')) problems.push(`after Keep climbing focus is on ${kept}`);
      // Escape hands the keys back to the climb (#159 r2): focus off 🚪 Leave (on the world's
      // stage), so the next Space acts in the world instead of asking "Leave the Spire?" again.
      await sp.getByRole('button', { name: '🚪 Leave the Spire' }).click();
      await sp.waitForTimeout(300);
      await sp.keyboard.press('Escape');
      await sp.waitForTimeout(300);
      const after = await sp.evaluate(focusLabel);
      if (await sp.locator('[role=alertdialog]').count()) problems.push('Escape left "Leave the Spire?" open');
      else if (after.includes('Leave the Spire') || after.startsWith('top bar')) problems.push(`after Escape focus is on ${after}`);
      else {
        await sp.keyboard.press('Space');
        await sp.waitForTimeout(300);
        if (await sp.locator('[role=alertdialog]').count()) problems.push('Space after Escape asked "Leave the Spire?" again');
      }
    }
    errors.push(...sp.errors);
    await sp.close();
    // Flying: 🛬 Land / 🐉 Fly, Calm's timer and 📜 Menu in one HUD row (#136e).
    const flight = await flyingHud(browser, { width, height }, flyingSave, profile, outDir, size);
    errors.push(...flight.errors);
    problems.push(...flight.problems);
    const cut = Math.max(layout.mapCut, spireLayout?.mapCut ?? 0);
    const ok =
      !layout.overlaps.length && !layout.hscroll && covered.every(Boolean) && inSpire && !spireLayout.overlaps.length && !spireLayout.hscroll && !cut && !errors.length && !problems.length;
    if (!ok) bad += 1;
    console.log(`${ok ? '✓' : '✗'} ${size}  top bar ${layout.barHeight}px, stage ${layout.stage}; menu covers the bar: ${covered.every(Boolean) ? 'yes' : `no (${covered})`}; Spire HUD: ${inSpire ? 'in the row' : 'never reached'}`);
    for (const l of flight.looks) console.log(`    ${l}`);
    for (const o of [...layout.overlaps, ...(spireLayout?.overlaps ?? [])]) console.log(`    overlap: ${o}`);
    if (layout.hscroll || spireLayout?.hscroll) console.log('    scrolls sideways');
    if (cut) console.log(`    the map runs ${cut}px off the bottom of the screen${spireLayout?.mapCut ? ' (in the Spire)' : ''}`);
    for (const e of errors) console.log(`    page error: ${e}`);
    for (const p of problems) console.log(`    ${p}`);
  }
  // A sideways phone by touch (#159 r2): the `(pointer: coarse) and
  // (orientation: landscape) and (max-height: 500px)` layout only shows with
  // a coarse pointer, which the checks above don't have.
  const walkSave = { ...flyingSave, vehicle: 'foot' };
  const touchSizes = [[740, 360], [568, 320]];
  for (const [width, height] of touchSizes) {
    const size = `${width}×${height}`;
    const runs = [];
    for (const mode of ['walking', 'flying']) runs.push(await touchHud(browser, { width, height }, mode === 'walking' ? walkSave : flyingSave, profile, outDir, size, mode));
    const issues = runs.flatMap((r) => [...r.problems, ...r.errors.map((e) => `page error: ${e}`)]);
    if (issues.length) bad += 1;
    console.log(`${issues.length ? '✗' : '✓'} ${size} touch  ${runs.map((r) => r.look).join('; ')}`);
    for (const p of issues) console.log(`    ${p}`);
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
  const checks = sizes.length + touchSizes.length + 1;
  console.log(`\n${checks - bad}/${checks} checks clean. Screenshots in ${outDir}.`);
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

  // A bump's cooldown spares only an enemy already touching the hero (#114t): use the
  // Whispering Woods save crystal (18,2) from 18,3 (a press since #127) — a 2 s cooldown —
  // then head down-left past the Thicket Warden (16,4). It fights; it used to let the hero
  // walk through.
  page = await ready('zone=whispering-woods&at=18,3');
  await hold(page, 'ArrowUp', 300);
  await page.keyboard.press('Space');
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

/**
 * Press to use (#127), on the real canvas with real keys: doorways a few pixels
 * off still let the hero in (the corner assist); chests, gates and people wait
 * for Space / Enter / a click, and a person stops the hero; one walked into
 * for ~1.5 s steps aside.
 */
async function use(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const TILE = 32;
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
    await page.waitForTimeout(100);
  };
  // Pausing makes the canvas say where the hero is; resuming starts the 0.8 s cooldown, waited out.
  const where = (page) =>
    page.evaluate(async () => {
      const b = window.__bench;
      const before = b.state().moves;
      b.pause(true);
      for (let i = 0; i < 40 && b.state().moves === before; i++) await new Promise((r) => requestAnimationFrame(r));
      const s = b.state();
      b.pause(false);
      await new Promise((r) => setTimeout(r, 900));
      return s;
    });
  const checks = [];
  const check = async (page, name, ok, detail, { close = true } = {}) => {
    checks.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
    await page.locator('canvas').screenshot({ path: path.join(outDir, `${checks.length}.png`) });
    if (page.errors.length) console.log(`    page errors: ${page.errors.join(' | ')}`);
    if (close) await page.close();
  };

  // Numbria's south-west shop door (28,5): walk straight up from a little off its middle.
  // The hero's box only fits a one-tile door within ±5 px; before #127 6 px off stopped them.
  for (const off of [0, 6, 10, 14, 18, -10, -18]) {
    const page = await ready(`zone=numbria&at=${28 + off / TILE},6`);
    await hold(page, 'ArrowUp', 1200);
    const s = await where(page);
    await check(page, `${off > 0 ? '+' : ''}${off} px off a door's middle, walking up goes in`, s.pos.y < 5 * TILE, `y ${Math.round(s.pos.y)}`);
  }

  // Eldergrove's chest (5,24): bumping opens nothing, the prompt says so, Space opens it.
  let page = await ready('zone=eldergrove&at=5,25');
  await hold(page, 'ArrowUp', 900);
  let s = await where(page);
  const bumped = s.paths.length;
  s = await state(page);
  await check(page, 'walking into a chest opens nothing; its prompt says "Open chest"', bumped === 0 && s.prompt === 'Open chest', `${bumped} opened, prompt ${s.prompt}`, { close: false });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  s = await state(page);
  await check(page, 'Space opens it', s.paths.some((p) => p.startsWith('chest:')), JSON.stringify(s.paths));

  // Moonwell Grove's gate (11,10): bumping asks nothing; Enter does; then the hero walks through.
  page = await ready('zone=moonwell-grove&at=11,11');
  await hold(page, 'ArrowUp', 900);
  s = await where(page);
  const asked = s.paths.length;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await hold(page, 'ArrowUp', 900);
  s = await where(page);
  await check(page, 'a gate asks nothing on a bump; Enter opens it and the hero walks through', asked === 0 && s.paths.some((p) => p.startsWith('gate:')) && s.pos.y < 10 * TILE, `${asked} on the bump, then ${JSON.stringify(s.paths)}, y ${Math.round(s.pos.y)}`);

  // Pip (hub-kid, 76,20) in the village: solid, talks on Space / Enter / a click, once per press.
  page = await ready('zone=lumina-village&at=76,21');
  await hold(page, 'ArrowUp', 500);
  s = await where(page);
  const blocked = s.pos.y > 20 * TILE + TILE / 2 + 20;
  const talked = s.talks.length;
  s = await state(page);
  await check(page, 'walking into someone stops the hero and says nothing; the prompt says "Talk"', blocked && talked === 0 && s.prompt === 'Talk', `y ${Math.round(s.pos.y)}, ${talked} talks, prompt ${s.prompt}`, { close: false });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.locator('canvas').click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(300);
  await page.keyboard.down('Space'); // held: its auto-repeats aren't fresh presses
  await page.waitForTimeout(600);
  await page.keyboard.up('Space');
  s = await state(page);
  await check(page, 'Space, Enter, a click and a held Space talk once each', s.talks.length === 4, JSON.stringify(s.talks));

  // Keep walking into Pip: still in the way after 1 s; by ~1.5 s Pip steps aside and the hero walks on.
  page = await ready('zone=lumina-village&at=76,21');
  await hold(page, 'ArrowUp', 1000);
  const after1 = (await where(page)).pos.y;
  await hold(page, 'ArrowUp', 2600);
  s = await where(page);
  await check(page, 'someone walked into for ~1.5 s steps aside, and the hero walks on past', after1 > 20 * TILE + TILE / 2 + 20 && s.pos.y < 20 * TILE && s.talks.length === 0, `y ${Math.round(after1)} after 1 s, then ${Math.round(s.pos.y)}; ${s.talks.length} talks`);

  // The village shop (#127): the keeper (village-shopkeeper, 8,5) stands behind the counter
  // row (y 6). Straight across from (8,7), a click on the keeper talks to them; from a
  // corner (9,7) Space does. (The camera sits 16 px down here: the map's top is off screen.)
  page = await ready('zone=lumina-village&at=8,7');
  await hold(page, 'ArrowUp', 300);
  await where(page);
  await page.locator('canvas').click({ position: { x: 8 * TILE + TILE / 2, y: 5 * TILE + TILE / 2 - 16 } });
  await page.waitForTimeout(300);
  const clicked = (await state(page)).talks;
  await check(page, 'across the counter, a click on the shopkeeper talks to them', clicked[0] === 'village-shopkeeper', JSON.stringify(clicked));
  page = await ready('zone=lumina-village&at=9,7');
  await hold(page, 'ArrowUp', 300);
  await where(page);
  const prompt = (await state(page)).prompt; // read with the world running (a pause hides it)
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  s = await state(page);
  await check(page, 'from a corner of the counter, Space talks to the shopkeeper', prompt === 'Talk' && s.talks[0] === 'village-shopkeeper', `prompt ${prompt}, ${JSON.stringify(s.talks)}`);

  const bad = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - bad}/${checks.length} use checks passed. Screenshots in ${outDir}.`);
  if (bad) process.exitCode = 1;
}

/**
 * Ember's flight on the real `WorldCanvas` (#75 item 15b), on the bench page:
 * take off, fly over mountains and sea at 2.5×, no landing over water, across
 * the linked east edge, over a critter without a battle, Space to land, and
 * on foot again the mountains stop you. Exit 1 on a failure.
 */
async function fly(browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  // Memory counts as a crystal, so banks lift: mark them watched, or their reveal freezes the hero.
  const SEEN = ['shrine-fog', 'spire-fog', 'math-fog', 'science-fog', 'engineering-fog', 'creativity-fog', 'hill-fog', 'roost-clouds'].map((id) => `fog-${id}-seen`);
  const MEMORY = ['crystal-history-restored', ...SEEN].join(',');
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
  const cell = (s) => ({ x: Math.floor(s.pos.x / 32), y: Math.floor(s.pos.y / 32) });
  // The canvas reports where the hero is on a pause (as a menu opening would).
  const where = async (page) => {
    await page.evaluate(() => window.__bench.pause(true));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__bench.pause(false));
    await page.waitForTimeout(50);
    return state(page);
  };
  const checks = [];
  const check = async (page, name, ok, detail) => {
    checks.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
    await page.locator('canvas').screenshot({ path: path.join(outDir, `${checks.length}.png`) });
    if (page.errors.length) console.log(`    page errors: ${page.errors.join(' | ')}`);
  };

  // A: take off on open ground, fly east over the mountains (52–61) and out over the sea.
  let page = await ready(`zone=dawnreach&at=41,18&flags=${MEMORY}`);
  await page.evaluate(() => window.__bench.fly());
  await page.waitForTimeout(200);
  let s = await state(page);
  await check(page, 'takes off on open ground', s.takeOffs === 1 && s.flying, `takeOffs ${s.takeOffs}, flying ${s.flying}`);
  await hold(page, 'ArrowRight', 1300);
  s = await where(page);
  await check(page, 'flies over the mountains, faster than walking', cell(s).x >= 56, `now at ${JSON.stringify(cell(s))} after 1.3 s (on foot the mountains stop you at 51)`);
  await hold(page, 'ArrowRight', 1400); // out over the sea, two cells past the beach (open ground within a step lands there)
  s = await where(page);
  const overSea = cell(s);
  await page.evaluate(() => window.__bench.land());
  await page.waitForTimeout(200);
  s = await state(page);
  await check(page, 'no landing over open sea', s.noLandings === 1 && s.flying && overSea.x >= 76, `noLandings ${s.noLandings}, over ${JSON.stringify(overSea)}`);
  await hold(page, 'ArrowLeft', 180); // back over the water by the beach…
  await page.evaluate(() => window.__bench.land());
  await page.waitForTimeout(200);
  s = await where(page);
  await check(page, 'a step off the beach, Land sets down on the sand beside', s.touchDowns === 1 && !s.flying, `landed on the beach at ${JSON.stringify(cell(s))}`);
  await page.evaluate(() => window.__bench.fly());
  await page.waitForTimeout(200);
  await hold(page, 'ArrowRight', 1000);
  await page.waitForTimeout(800);
  s = await where(page);
  // …arriving at the crossing, one cell in from the west edge — not at the map's spawn (code review, #136e).
  await check(page, 'flies off the east edge onto the Silver Shallows, arriving where she crossed', s.zoneId === 'silver-shallows' && cell(s).x <= 3 && s.flying, `zone ${s.zoneId} at ${JSON.stringify(cell(s))}, flying ${s.flying}`);
  await page.close();

  // B: over the Bolt Mouse's patch (67,19) without a battle, then Space lands on grass.
  page = await ready(`zone=dawnreach&at=61,19&fly=1&flags=${MEMORY}`);
  await hold(page, 'ArrowRight', 900);
  s = await where(page);
  await check(page, 'flies over a critter without a battle', s.encounters === 0 && cell(s).x > 67, `encounters ${s.encounters}, at ${JSON.stringify(cell(s))}`);
  await hold(page, 'ArrowLeft', 250);
  await page.waitForTimeout(150);
  s = await state(page);
  const prompt = s.prompt;
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  s = await state(page);
  await check(page, 'Space lands on open ground', prompt === 'Land here' && s.touchDowns === 1 && !s.flying, `prompt ${prompt}, touchDowns ${s.touchDowns}, flying ${s.flying}`);
  await page.close();

  // C: on foot again, the mountains stop you.
  page = await ready(`zone=dawnreach&at=41,18&flags=${MEMORY}`);
  await hold(page, 'ArrowRight', 3500);
  await page.waitForTimeout(150);
  s = await state(page);
  await check(page, 'on foot the mountains still stop you', cell(s).x <= 51, `at ${JSON.stringify(cell(s))}`);
  await page.close();

  // D: before Memory, 🐉 Fly does nothing.
  page = await ready(`zone=dawnreach&at=41,18&flags=${SEEN.join(',')}`);
  await page.evaluate(() => window.__bench.fly());
  await page.waitForTimeout(200);
  s = await state(page);
  await check(page, 'no flight before the Crystal of Memory', s.takeOffs === 0 && !s.flying, `takeOffs ${s.takeOffs}`);
  await page.close();

  // E: with Memory, the clouds on the Dragon's Roost lift on screen (the camera shows where to fly).
  page = await ready(`zone=dawnreach&at=44,27&flags=${['crystal-history-restored', ...SEEN.filter((f) => f !== 'fog-roost-clouds-seen')].join(',')}`);
  await page.waitForFunction(() => window.__bench.state().fogReveals.includes('roost-clouds'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4500);
  s = await state(page);
  await check(page, "the clouds on the Dragon's Roost lift on screen", s.fogReveals.includes('roost-clouds'), `revealed ${JSON.stringify(s.fogReveals)}`);
  await page.close();

  // F: fly up to the Roost from the road, land on its plateau, walk in, come out, take off again.
  page = await ready(`zone=dawnreach&at=44,27&flags=${MEMORY}`);
  await page.evaluate(() => window.__bench.fly());
  await page.waitForTimeout(200);
  await hold(page, 'ArrowRight', 300);
  s = await where(page);
  const above = cell(s);
  await page.evaluate(() => window.__bench.land());
  await page.waitForTimeout(250);
  s = await where(page);
  await check(page, "lands on the Dragon's Roost's plateau", s.touchDowns === 1 && !s.flying && cell(s).y === 27 && cell(s).x >= 47 && cell(s).x <= 49, `over ${JSON.stringify(above)}, landed at ${JSON.stringify(cell(s))}`);
  await hold(page, 'ArrowUp', 700);
  await page.waitForTimeout(1500);
  s = await state(page);
  await check(page, "walks into the Dragon's Roost", s.zoneId === 'dragon-roost', `zone ${s.zoneId}`);
  await hold(page, 'ArrowDown', 700);
  await page.waitForTimeout(1500);
  s = await where(page);
  await check(page, 'steps back out onto the plateau', s.zoneId === 'dawnreach' && cell(s).y === 27, `zone ${s.zoneId} at ${JSON.stringify(cell(s))}`);
  await page.evaluate(() => window.__bench.fly());
  await page.waitForTimeout(250);
  s = await state(page);
  await check(page, 'takes off from the plateau again', s.takeOffs === 2 && s.flying, `takeOffs ${s.takeOffs}, flying ${s.flying}`);
  await page.close();

  // G (#75 item 15c): off the Shallows' east edge, over the Great Fogbank, onto Taleshore; land by Port Lantern and walk in.
  page = await ready(`zone=silver-shallows&at=54,21&fly=1&flags=${MEMORY}`);
  await hold(page, 'ArrowRight', 1100);
  await page.waitForTimeout(900);
  s = await where(page);
  await check(page, 'flies over the Great Fogbank onto Taleshore, arriving where she crossed', s.zoneId === 'taleshore' && cell(s).x <= 3 && cell(s).y === 21 && s.flying, `zone ${s.zoneId} at ${JSON.stringify(cell(s))}, flying ${s.flying}`);
  for (let i = 0; i < 12 && cell(s).x < 30; i++) {
    await hold(page, 'ArrowRight', 200);
    s = await where(page);
  }
  await page.evaluate(() => window.__bench.land());
  await page.waitForTimeout(250);
  s = await where(page);
  const landed = cell(s);
  await check(page, "lands on Port Lantern's road", s.touchDowns === 1 && !s.flying && landed.x >= 29 && landed.x <= 33, `landed at ${JSON.stringify(landed)}`);
  await hold(page, 'ArrowLeft', 1500);
  await page.waitForTimeout(1500);
  s = await where(page);
  await check(page, 'walks into Port Lantern', s.zoneId === 'port-lantern', `zone ${s.zoneId} at ${JSON.stringify(cell(s))}`);
  await page.close();

  // H (#75 item 15d): out over the sea to the Wayfinder Isles — land on the island beside its stone, walk in, walk out.
  page = await ready(`zone=taleshore&at=13,11&fly=1&flags=${MEMORY}`);
  await page.evaluate(() => window.__bench.land());
  await page.waitForTimeout(250);
  s = await where(page);
  const isle = cell(s);
  await check(page, 'lands on the Wayfinder Isles, beside its stone', s.touchDowns === 1 && !s.flying && isle.y === 11 && isle.x >= 12 && isle.x <= 14, `landed at ${JSON.stringify(isle)}`);
  await hold(page, 'ArrowLeft', 900);
  await page.waitForTimeout(1500);
  s = await where(page);
  await check(page, 'walks into the Wayfinder Isles', s.zoneId === 'wayfinder-isles', `zone ${s.zoneId} at ${JSON.stringify(cell(s))}`);
  await hold(page, 'ArrowUp', 700);
  await page.waitForTimeout(1500);
  s = await where(page);
  await check(page, 'steps back out beside the stone, on ground Ember can take off from', s.zoneId === 'taleshore' && cell(s).x === 11 && cell(s).y === 12, `zone ${s.zoneId} at ${JSON.stringify(cell(s))}`);
  await page.close();

  const bad = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - bad}/${checks.length} flight checks passed. Screenshots in ${outDir}.`);
  if (bad) process.exitCode = 1;
}

(async () => {
  const [mode = 'fps', ...args] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  let vite = null;
  try {
    if (mode === 'hud' || mode === 'battle') vite = await startVite({ VITE_SUPABASE_URL: STUB, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' });
    else if (mode !== 'diff') vite = await startVite();
    if (mode === 'fps') await fps(browser, Number(args[0] ?? 160), Number(args[1] ?? 112));
    else if (mode === 'shots') await shots(browser, args[0] ?? 'bench-shots');
    else if (mode === 'diff') await diff(browser, args[0], args[1]);
    else if (mode === 'battle') await battleHud(browser, args[0] ?? 'bench-battle');
    else if (mode === 'journey') await journey(browser, args[0] ?? 'bench-journey');
    else if (mode === 'hud') await hud(browser, args[0] ?? 'bench-hud');
    else if (mode === 'sea') await sea(browser, args[0] ?? 'bench-sea');
    else if (mode === 'use') await use(browser, args[0] ?? 'bench-use');
    else if (mode === 'fly') await fly(browser, args[0] ?? 'bench-fly');
    else throw new Error(`unknown mode ${mode}`);
  } finally {
    await browser.close();
    vite?.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
