# Public pages (prototype)

Two static pages for Hazel Quest, outside the game app:

| Page | For | What's on it |
|---|---|---|
| `index.html` | kids | a title screen with Kira and Ember walking, a playable demo battle, the five heroes, Ember's five stages, six real places, 36 critters, 6 bosses and Umbra's silhouette, a short grown-ups box, Play; the game's title music and sound effects from the first tap, with a 🔊 button to turn them off (remembered on the device) |
| `grown-ups.html` | parents, carers, teachers | the idea, a real gameplay clip, how a session goes, the ten subjects, how it stays encouraging, how it's kept safe, how questions are made and checked, what's collected, family controls, FAQ |

Plain HTML, CSS and JS (`assets/site.css`, `assets/site.js`), no framework.
The pages use the game's own `public/` folder, so the sprites and backdrops
are always the game's.

```bash
# from hazel-game/
npx vite --config site/vite.config.mjs              # preview: http://localhost:5173
npx vite build --config site/vite.config.mjs        # build to dist-site/
npm run build:web                                   # what Vercel serves: these pages at /, the game at /play/ (dist/)
```

## Hosting

Vercel builds `npm run build:web` (`vercel.json` → `buildCommand`,
`scripts/build-web.mjs`) and serves `dist/`:

- `/` is `index.html`, `/grown-ups.html` the grown-ups page;
- `/play/` is the game (`/play` redirects there). The game is built as
  usual (base `/`) and only its `index.html` moves to `play/`: its code asks
  for `/sprites/…`, `/tiles/…` and `/audio/…` at the root, and its bundle
  loads from `/assets/…`, both of which these pages share.
- A link meant for the game that arrives at `/` — Supabase's emails go to the
  project's Site URL, and review alerts open `?review` — is passed on to
  `/play/` with its address (the small script at the top of `index.html`):
  sign-in tokens and errors in the hash (`access_token`, `error`, …), or
  `?code`, `?token_hash`, `?error`, `?review`. The pages' own `#…` links stay.

## How it's made

- **Art:** every picture is the game's. Sprites come straight from
  `public/sprites/<id>/{battle,world}.png` (`site.js` reads a sheet's frame
  size from the image, so any new character works), band textures and props
  are cut from `public/tiles/`, and the title screen is
  `public/backgrounds/lumina-village.png` at a whole-number zoom.
- **Logo:** hand-drawn pixel letters in `tools/logo.py` →
  `assets/img/logo.png` (68×43; CSS zooms it 4× or 6×).
- **Type:** Jersey 15 for headings and labels (chosen because its B, 3, 5 and
  8 can't be mixed up), Andika for reading (designed for children learning
  to read). Both are self-hosted (`assets/fonts/`, SIL Open Font License):
  no Google Fonts call.
- **Screenshots and the clip** are real captures of the game, not mock-ups:

  ```bash
  NODE_PATH=$(npm root -g) node site/tools/capture.cjs all site-captures
  python3 site/tools/prep-assets.py site-captures     # needs Pillow, numpy, ffmpeg
  ```

  `capture.cjs world` photographs the real world canvas on `bench/world.html`;
  `capture.cjs app` runs the real app with Supabase stubbed (as the bench's
  `hud` mode does) and serves sample space questions. The names "Juno",
  "Theo" and "Maya" in the family screens are sample children.
- **The demo battle** asks ten hand-written sample questions (`BANK` in
  `site.js`), one per subject, so it works with no server.

## Before this goes live

1. **The privacy notice.** `src/content/family.ts` still has
   `PRIVACY_IS_DRAFT = true` and blanks for `[OPERATOR NAME]`,
   `[CONTACT EMAIL]` and the retention period. Both pages show the same
   blanks (highlighted, class `todo`), and "Read the full privacy notice"
   links nowhere yet. It needs a lawyer's review and its own page.
2. **Where the game lives.** Every Play button reads its link from
   `<meta name="hq:play-url">` (`/play/`); the grown-ups page's "Create a
   free family account" (`data-play="signup"`) adds `?signup`, which opens the
   game's sign-in page on its sign-up form. Hosting is set up (see
   **Hosting** above); left for the owner: add `https://hazelapp-pi.vercel.app/play/` to
   Supabase Auth → Redirect URLs, so reset links go straight to the game.
3. **The share image.** `og:image` names `https://hazelapp-pi.vercel.app/og.png`
   (`build:web` copies `assets/img/og.png` there). Change it on both pages if
   the site moves to another domain.
4. **Keep the claims true.** The grown-ups page promises these; check them
   whenever the code they rest on changes:

   | Claim | Rests on |
   |---|---|
   | No chat, no other players, no public profiles | nothing in the app lets kids contact anyone |
   | Children only tap; the nickname is typed by the grown-up | `KidForm` appears only on the grown-up's set-up screens (`FirstKidPage`, `KidSetupPage`, `GrownUpsArea`); kids use `PinPad` |
   | No ads, no purchases | coins are only earned (`content/items.ts`) |
   | Nickname + 4-digit PIN; no full name, email, photo, voice or location | `content/family.ts`, migrations 0013–0014 |
   | The AI is told only age in years and level about the child | `generate-questions` (B8: fixed text only, age from the birth date) |
   | Rules, a filter, a blind second check | `_shared/questionScreen.ts`; the second check is on unless the secret `QUESTION_SECOND_CHECK=off` |
   | A report hides a question from the family; "Not OK for kids" sends it to review | `FlagButton`, migration 0016 |
   | Up to 8 children; Grown-ups area behind password or PIN; kids can't sign out | `profiles_kid_limit`, `GrownUpsArea`, `SwitchPlayerButton` |
   | No game over; easier after two losses; countdown can be switched off | `wakeAfterDefeat`, `mercyFor`, 📜 Menu → ⚔️ Battle |
   | 74 critters, 13 bosses | `ENEMY_DEFS` in `content/enemies.ts` |

5. **No trackers.** A site for children shouldn't load third-party analytics,
   video embeds or fonts. Nothing here does; keep it that way (or use a
   privacy-friendly analytics service after checking it with the lawyer).
