// The public pages (prototype). Plain HTML, CSS and JS, served with the
// game's own public/ folder so the pages use the same sprites and backdrops.
//
//   npx vite --config site/vite.config.mjs          preview on http://localhost:5173
//   npx vite build --config site/vite.config.mjs    build to dist-site/
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default {
  root,
  publicDir: '../public',
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: `${root}index.html`,
        grownUps: `${root}grown-ups.html`,
      },
    },
  },
};
