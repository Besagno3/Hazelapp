import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { inflateSync } from 'node:zlib';

/**
 * A file of the game, found from this test's own place (not the directory
 * vitest was started in). Node's `URL` (jsdom's global one resolves against
 * the test page), and the base in a const: Vite rewrites a literal
 * `new URL(…, import.meta.url)` into an asset path.
 */
const HERE = import.meta.url;
const at = (path: string) => new URL(`../${path}`, HERE);
const page = readFileSync(at('index.html'), 'utf8');

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(file: URL): [number, number] {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** An 8-bit, non-interlaced RGB or RGBA PNG's pixels (what site/tools/prep-assets.py writes). */
function pngPixels(file: URL) {
  const buf = readFileSync(file);
  const [w, h] = pngSize(file);
  const [depth, type, interlace] = [buf[24], buf[25], buf[28]];
  expect([depth, interlace]).toEqual([8, 0]);
  const channels = type === 6 ? 4 : type === 2 ? 3 : 0;
  expect(channels).toBeGreaterThan(0);
  const idat: Buffer[] = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('latin1', off + 4, off + 8) === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][filter];
      px[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predicted) & 255;
    }
  }
  const pixel = (x: number, y: number) => [...px.subarray(y * stride + x * channels, y * stride + (x + 1) * channels)];
  return { w, h, channels, pixel };
}

/** The box of pixels that aren't the background (`isBackground`). */
function artBox({ w, h, pixel }: ReturnType<typeof pngPixels>, isBackground: (p: number[]) => boolean) {
  let [left, top, right, bottom] = [w, h, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBackground(pixel(x, y))) continue;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + 1), Math.max(bottom, y + 1)];
    }
  }
  return { left, top, right, bottom };
}

describe("the game's icon is the project's own (#146a)", () => {
  it("index.html names Ember's egg, not Vite's default", () => {
    expect(page).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    expect(page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(page).not.toContain('favicon.svg');
    expect(existsSync(at('public/favicon.svg'))).toBe(false);
  });

  it('the icons are at the root, where the game at /play/ asks for them, and match the public pages', () => {
    // Root paths: the game is built with base '/', only its page moves to /play/ (scripts/build-web.mjs).
    expect(pngSize(at('public/favicon.png'))).toEqual([64, 64]);
    expect(pngSize(at('public/apple-touch-icon.png'))).toEqual([180, 180]);
    expect(readFileSync(at('public/favicon.png'))).toEqual(readFileSync(at('site/assets/img/favicon.png')));
    expect(readFileSync(at('public/apple-touch-icon.png'))).toEqual(readFileSync(at('site/assets/img/apple-touch-icon.png')));
  });

  it('the egg is centred and fills about 80% of each icon (#146a review)', () => {
    const fav = pngPixels(at('public/favicon.png'));
    const apple = pngPixels(at('public/apple-touch-icon.png'));
    for (const [icon, box] of [
      [fav, artBox(fav, (p) => p[3] === 0)],
      [apple, artBox(apple, (p) => p.join() === '30,27,75')],
    ] as const) {
      const size = icon.w;
      expect(Math.abs(box.left - (size - box.right))).toBeLessThanOrEqual(1);
      expect(Math.abs(box.top - (size - box.bottom))).toBeLessThanOrEqual(1);
      const fill = Math.max(box.right - box.left, box.bottom - box.top) / size;
      expect(fill).toBeGreaterThan(0.75);
      expect(fill).toBeLessThan(0.9);
    }
  });

  it("the home-screen icon is opaque, on the game's theme colour: iOS fills a transparent one with black (#146a review)", () => {
    const apple = pngPixels(at('public/apple-touch-icon.png'));
    expect(apple.channels).toBe(3);
    expect(apple.pixel(0, 0)).toEqual([0x1e, 0x1b, 0x4b]);
    expect(page).toContain('<meta name="theme-color" content="#1e1b4b" />');
  });
});

describe('the home-screen app: Add to Home Screen opens the game full screen (#5)', () => {
  const manifest = JSON.parse(readFileSync(at('public/manifest.webmanifest'), 'utf8')) as {
    [key: string]: unknown;
    short_name: string;
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };
  const THEME = [0x1e, 0x1b, 0x4b];

  it("index.html links the manifest, and tells iOS to open it without Safari's bars", () => {
    expect(page).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(page).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(page).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(page).toContain('<meta name="apple-mobile-web-app-title" content="Hazel Quest" />');
    // Not black-translucent: that draws the page under the status bar, and nothing pads the top for it.
    expect(page).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black" />');
  });

  it("is the splash's colour until the game draws, and only then (review round 1)", () => {
    // A white page between the dark splash and the first screen while the script loads, before.
    // While #root is empty only: the game's own screens keep the page behind them as it was.
    expect(page).toContain('<style>html:has(#root:empty) { background-color: #1e1b4b; }</style>');
    expect(manifest.background_color).toBe('#1e1b4b');
  });

  it('opens the game at /play/, full screen, in its own colours', () => {
    expect(manifest).toMatchObject({
      id: '/play/',
      start_url: '/play/',
      scope: '/play/',
      display: 'fullscreen',
      name: 'Hazel Quest',
      theme_color: '#1e1b4b',
      background_color: '#1e1b4b',
    });
    // A home-screen label fits about 12 characters before it's cut.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("names Ember's egg at 192 and 512 px (what Android asks for to install it), opaque on the theme colour", () => {
    expect(manifest.icons.map((icon) => `${icon.purpose} ${icon.sizes}`)).toEqual(['any 192x192', 'any 512x512', 'maskable 512x512']);
    for (const icon of manifest.icons) {
      // Root paths, like the favicon: the manifest is at the root and the page at /play/.
      expect(icon.src).toMatch(/^\/[\w-]+\.png$/);
      expect(icon.type).toBe('image/png');
      const file = at(`public${icon.src}`);
      expect(pngSize(file).join('x')).toBe(icon.sizes);
      const px = pngPixels(file);
      expect(px.channels).toBe(3);
      expect(px.pixel(0, 0)).toEqual(THEME);
    }
  });

  it("the egg is centred, about 80% of the plain icons, and inside the maskable one's safe circle", () => {
    for (const icon of manifest.icons) {
      const px = pngPixels(at(`public${icon.src}`));
      const box = artBox(px, (p) => p.join() === THEME.join());
      const size = px.w;
      expect(Math.abs(box.left - (size - box.right))).toBeLessThanOrEqual(1);
      expect(Math.abs(box.top - (size - box.bottom))).toBeLessThanOrEqual(1);
      if (icon.purpose === 'maskable') {
        // Android crops a maskable icon to its own shape; only the circle 40% of the size from the centre is sure to show.
        const corner = Math.hypot(Math.max(size / 2 - box.left, box.right - size / 2), Math.max(size / 2 - box.top, box.bottom - size / 2));
        expect(corner).toBeLessThanOrEqual(size * 0.4);
      } else {
        const fill = Math.max(box.right - box.left, box.bottom - box.top) / size;
        expect(fill).toBeGreaterThan(0.75);
        expect(fill).toBeLessThan(0.9);
      }
    }
  });
});
