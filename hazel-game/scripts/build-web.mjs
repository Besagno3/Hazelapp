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
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;

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
