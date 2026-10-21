#!/usr/bin/env node
//
// Builds what Vercel serves (#146): the public pages at `/` and the game at
// `/play/`. `npm run build:web` (vercel.json's buildCommand).
//
//   dist/index.html, dist/grown-ups.html   the public pages (site/)
//   dist/play/index.html                   the game
//   dist/assets/                           both bundles (hashed, no clashes)
//   dist/sprites/, tiles/, audio/, …       the game's public/ files
//   dist/og.png                            the share card (og:image)
//
// The game is built as usual (base '/'): its code asks for `/sprites/…`,
// `/tiles/…` and `/audio/…` at the root, and its page loads its bundle from
// `/assets/…`, so only the page itself moves. The site build then adds its
// pages and bundle beside it, without emptying the folder.
import { access, copyFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;

// The game needs its Supabase address and key at build time (#175): without
// them `lib/supabase.ts` throws as it loads, the throw is a constant, and the
// minifier drops the whole app — a "successful" build of a page with no game
// in it. Vercel's production deploy must never ship that, so there it stops
// the build (VERCEL_ENV=production, or REQUIRE_SUPABASE_ENV=1 anywhere);
// elsewhere (a preview, a local check of the public pages) it only warns.
// CI builds with placeholders, which bundle the real app (.github/workflows/ci.yml).
const env = loadEnv('production', root, 'VITE_SUPABASE_');
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !env[key]);
if (missing.length > 0) {
  const what = `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set, so the game would build with no app in it (ISSUES #175).`;
  if (process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_SUPABASE_ENV === '1') {
    console.error(`build:web — ${what} Not building production: set them in Vercel → Settings → Environment Variables (Production).`);
    process.exit(1);
  }
  console.warn(`build:web — ⚠️  ${what} Set them (or placeholders, as CI does) to build the game itself.`);
}

await build({ root });
await mkdir(`${dist}/play`, { recursive: true });
await rename(`${dist}/index.html`, `${dist}/play/index.html`);

await build({
  configFile: `${root}site/vite.config.mjs`,
  build: { outDir: dist, emptyOutDir: false },
});

// The share card, at the fixed address the pages' og:image names (link
// previews need a full URL, so it can't take a hashed name).
await copyFile(`${root}site/assets/img/og.png`, `${dist}/og.png`);

// Fail loudly rather than ship a site without the game (or the other way).
for (const page of ['index.html', 'grown-ups.html', 'play/index.html', 'og.png']) {
  await access(`${dist}/${page}`);
}
console.log('build:web — the public pages at /, the game at /play/');
