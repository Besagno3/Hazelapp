/**
 * World renderer bench runner (overworld Phase 0, #75). Drives
 * bench/world.html in headless Chromium via Playwright.
 *
 *   node bench/run-world-bench.cjs fps [cols] [rows]   frame times on the stress map
 *   node bench/run-world-bench.cjs shots <outDir>      screenshot every zone screen + Spire floor
 *   node bench/run-world-bench.cjs diff <dirA> <dirB>  pixel-compare two shots dirs
 *
 * Playwright isn't a project dependency; a global install works:
 *   NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs fps
 * Starts its own Vite dev server on port 5199.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 5199;
const ROOT = path.resolve(__dirname, '..');
const BASE = `http://localhost:${PORT}/bench/world.html`;

function startVite() {
  // stderr goes straight to the terminal: a piped-but-unread stream can fill
  // up and stall Vite on a long, noisy run (#77).
  const p = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
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

(async () => {
  const [mode = 'fps', ...args] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  let vite = null;
  try {
    if (mode !== 'diff') vite = await startVite();
    if (mode === 'fps') await fps(browser, Number(args[0] ?? 160), Number(args[1] ?? 112));
    else if (mode === 'shots') await shots(browser, args[0] ?? 'bench-shots');
    else if (mode === 'diff') await diff(browser, args[0], args[1]);
    else throw new Error(`unknown mode ${mode}`);
  } finally {
    await browser.close();
    vite?.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
