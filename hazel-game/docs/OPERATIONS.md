# Operations and tooling

> Moved verbatim out of `CLAUDE.md` on 2026-10-22 (it had grown to 9,000 lines). This is the full reference for the area — keep it accurate: when you change how this works, change it here in the same commit. `CLAUDE.md` holds only the rules that apply everywhere and a map to these files.

The everyday `npm` commands are in `CLAUDE.md`. This file keeps the rest: the world renderer bench, Tiled maps and asset generation, the question-bank recheck, the deploy order and Supabase auth settings for 👪 Grown-ups and closing an account, migration 0025, the question-review alerts and fixing questions (0028). Production database repair: `docs/PRODUCTION-DB-SETUP.md`.

## Commands

```bash
npm install      # install deps (node_modules is gitignored)
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build (the game alone)
npm run build:web # what Vercel serves: the public pages (site/) at /, the game at /play/ — scripts/build-web.mjs (#146); needs VITE_SUPABASE_URL / _ANON_KEY (placeholders do) or the game builds with no app in it — it warns, and refuses on Vercel production (VERCEL_ENV=production) or with REQUIRE_SUPABASE_ENV=1 (#175)
npm run lint     # eslint
npm test         # Vitest suite (test:watch / test:ui also available)

# World renderer bench (dev-only; needs Playwright — a global install works)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs fps [cols rows]   # frame times on a big test map
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs shots <dir>       # screenshot every zone + Spire floor (a screen with no open ground is shot flying, #82f)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs diff <dirA> <dirB> # pixel-compare two shot sets
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs journey [outDir]   # the real hero walks Act I's legs + Spire floors (#75 item 14b)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs hud [outDir]       # the real app, Supabase stubbed: world HUD at 5 sizes (#102i), flying with Calm on too (#136e)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs sea [outDir]       # sea critters on the real canvas: battle, Calm, arrival, sleeping after a Flee / a landing, no walking through a boss after a bump (#75 item 14d)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs battle [outDir]    # the real app, Supabase stubbed: a battle at 5 sizes — top bar, the "!!!", the commands fit, and a boss's power-move turn (#75 item 14f, #158b)
NODE_PATH=$(npm root -g) node bench/run-world-bench.cjs fly [outDir]       # flying on Ember on the real canvas: take off, over mountains and the sea, across an edge, over a critter, landing, no Fly before Memory, the Roost (#75 item 15b), over the Great Fogbank to Port Lantern (#75 item 15c)
# (bench/world.html also takes __bench.travel(zone, x, y) / __bench.calm(s) — Return / Calm, #75 item 9)
# (…and escort=1 — an escort's walk under way, by its flags — and __bench.walkTo(x, y), #75 item 14g; hero=a1…a5, #115f)
# Run `hud` / `battle` on a quiet tree: they load the live src/, and a save elsewhere hot-reloads the page mid-run. BENCH_PORT runs two at once.

# Tiled maps (docs/MAP-AUTHORING.md) — needs Pillow
python3 tools/tiled/tiled.py to-ascii src/content/maps/dawnreach.tmj    # a Tiled map as ASCII rows
python3 tools/tiled/tiled.py from-ascii rows.txt src/content/maps/x.tmj # ASCII rows → a Tiled map
python3 tools/tiled/tiled.py legend                                    # rebuild the legend tileset (append-only)
python3 tools/assets/build.py spells   # art for the field-spell places + keepers only (#75 item 9)
python3 tools/assets/build.py dungeon  # the Depths' lower floors + the stairs sheet only (#75 item 10)
python3 tools/assets/build.py inns     # the innkeepers + travelers' sprites only (#75 item 11)
python3 tools/assets/build.py sea      # the Silver Shallows (+ its battle-at-sea backdrop), the boat, the dock + Lamplighter Ness only (#75 item 14)
python3 tools/assets/build.py quests   # Hermit Moss's sprite only (#75 item 13)
python3 tools/assets/build.py seamusic # the sea music only: sailing, the Shallows, the fogbank (#75 item 14)
python3 tools/assets/build.py lighthouse # Gull Rock's lighthouse tower only (#75 item 14)
python3 tools/assets/build.py seacritters # the sea critters + the battle-at-sea backdrop only (#75 item 14d)
python3 tools/assets/build.py hill     # Remembrance Hill: its tiles, the marble town sheet, the hill icon, its people (#75 item 14e)
python3 tools/assets/build.py elder    # Eldergrove: its tiles, the bark town sheet, the elder icon, its critters and people (#75 item 14f)
python3 tools/assets/build.py marsh    # Foglight Marsh: its tiles, the stilt town sheet, the marsh icon, its critters, people and lanterns (#75 item 14g)
python3 tools/assets/build.py archive  # the Sunken Archive: its tiles, the tome town sheet, the archive icon, its critters, Fiend and people (#75 item 14h)
python3 tools/assets/build.py roost    # the Dragon's Roost: its tiles and the roost icon (#75 item 15b)
python3 tools/assets/build.py taleshore # Taleshore + Port Lantern: tiles, the harbor sheet, the harbor icon, its people and quest board (#75 item 15c)
python3 tools/assets/build.py isles    # Taleshore I: Driftwood Shallows, the Wayfinder Isles, Gale Atoll — tiles, the kite sheet, icons, critters, warden, people (#75 item 15d)
python3 tools/assets/build.py chart    # Chartmaker's Rest: tiles, the chart sheet, its icon, its people (#75 item 15h)
python3 tools/assets/build.py name      # the Name: the gold Root's Heart, Sage Aster and Umbra Remembered's soft sprite only (#75 item 16e)
python3 tools/assets/build.py descent   # the Deep Root: seven floors' tiles, critters, the echoes, the Root's Heart (#75 item 16d)
python3 tools/assets/build.py garden    # Aster's Garden + the Nameless Hall: two zones' tiles, critters, the Gardener, plaques, the deep root (#75 item 16c)
python3 tools/assets/build.py lumina    # Lumina-That-Was: three zones' tiles, the school sheet, its critters and people (#75 item 16b)
python3 tools/assets/build.py dreamroot # the Dream Root Door: tiles, the root sheet, Old Knot, Young Wick, Wisp's new face (#75 item 16a)
python3 tools/assets/build.py cliffs   # Taleshore III: Songstone Cliffs, the Quiet Quarter — tiles, the hush sheet, icons, critters, people, songstones (#75 item 15f)
python3 tools/assets/build.py reef     # Taleshore II: the Story Reef, Inkwell Cove — tiles, the shell sheet, icons, critters, warden, people, tale-stones (#75 item 15e)
python3 tools/assets/build.py cay      # Shelby, Sandpiper Cay's hermit crab, only (#75 item 14i)
python3 tools/assets/build.py intro    # the sign-in screen's intro music only (#120)
python3 tools/assets/build.py heroes   # the five heroes only (Valor, Bastion, Talon, Kira, Selene)

# Recheck the saved question bank against today's rules (#147) — Deno, the project's service-role key
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… deno run --allow-env --allow-net supabase/scripts/recheck-questions.ts           # dry run
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… deno run --allow-env --allow-net supabase/scripts/recheck-questions.ts --apply   # hold back what fails, mark what passes
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… deno run --allow-env --allow-net supabase/scripts/recheck-questions.ts --reported --apply   # reports no check covered yet

# Close an account (#124b) and 👪 Grown-ups held by the database (#167) — after applying 0023 + 0024
supabase functions deploy delete-account   # no secrets beyond the injected SUPABASE_* ones
#   Order for #167, by the owner:
#     1. Ship the app (merge; Vercel). A new app on an old database just has no window to open.
#     2. Apply 0024: re-run apply_all_migrations.sql in the SQL editor (it adds a deferred
#        constraint trigger on auth.users, so run it there, as the editor's own role).
#     3. Right after: `supabase functions deploy delete-account`. Until then closing an account is
#        refused, nothing deleted (the old function can't satisfy 0024); the new function refuses on
#        a database without 0024 (database_out_of_date), so never deploy it first.
#   Auth settings (#124d, #168) — dashboard → Authentication (names can differ a little by version):
#     - "Secure email change" ON (the default): the current address must confirm too, so the login
#       can't be moved to another inbox (one that could then reset the password and skip the wait).
#     - "Require current password" for password updates ON (GoTrue
#       GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD; if the dashboard doesn't show it, ask
#       Supabase or set it through the Management API's auth config): a password change needs the
#       current password — except on ANY sign-in made through an email link (a reset link, a magic
#       link, the sign-up confirmation link), for that sign-in's whole life: GoTrue's IsRecovery()
#       covers otp / magiclink / recovery. So a family device first signed in through its sign-up
#       confirmation link skips it; there the database's wait is the real defence. The app always
#       sends it.
#     - "Secure password change" ON: an emailed code — but only from a sign-in over a day old, so on
#       its own it does NOT cover today's sign-in on the family device.
#     - The "password changed" notification email ON (Authentication → Emails; GoTrue
#       GOTRUE_MAILER_NOTIFICATIONS_PASSWORD_CHANGED_ENABLED): the grown-up hears at once.
#     - Keep the /play/ address in Redirect URLs (email-change and reset links come back there).
#   Whatever the settings, 0024 notes every password change: one the app didn't announce means no
#   password opens 👪 or closes the account for 24 hours (the grown-up PIN still opens 👪; a new
#   password from a reset link ends it). An announcement is for one sign-in and one minute: the
#   password check on Change password, or the reset link's own sign-in (its otp entry, after the
#   reset email). A password set in the dashboard, or a hash Supabase upgrades on sign-in, counts
#   as unannounced too (the safe side).

# 📈 Progress's days played (#29) — migration 0025, any time (either order with the app)
#   Re-run apply_all_migrations.sql in the SQL editor (or `supabase db push`). Before it, the page
#   leaves "Last 7 days" out and each device keeps its days (up to 8), sending none more that session.
#   0025 changed in review round 1 (every kid's old days deleted, a two-week read window — five weeks
#   since 0026 — UTC, an index) and round 2 (the old days deleted at most 1,000 a note): a project that
#   applied it before must re-run apply_all_migrations.sql — `db push` skips a recorded version.

# 📈 Progress's history (#169, #170, #172, #173, #174) — migration 0026, any time (either order with the app)
#   Re-run apply_all_migrations.sql in the SQL editor (or `supabase db push`; 0026 is new). No edge-function
#   deploy. Before it, the new app notes days with note_play_days and keeps each day's XP / minutes /
#   answers on the device (a week back; sent once 0026 is there), reads and writes profiles without
#   skill_starts (topic starts stay in the save), and 📈 shows the week as before (one extra read per part,
#   logged). Each side asks for 0026 again every 10 minutes and on a profile load (📈: its Try again), so
#   tabs open across the deploy pick it up without a reload. After it, an old open tab's note_play_days
#   keeps five weeks too (its days read "played, XP not recorded"). History fills from then on: 0025-era
#   days have zeros (read the same way), and five weeks are there once five weeks have passed. The draft
#   privacy notice says a day's note is kept five weeks, then the family can't see it and it's deleted as
#   the game tidies up (inside the note functions — no scheduled job); CONSENT_VERSION waits for the
#   lawyer (#124). A stale PostgREST schema cache after it: `notify pgrst, 'reload schema'`.
#   Also in 0026 (#181, #183): play_days.noted_play (set by note_play_history for a day sent with
#   "noted": true; a day noted without it reads as before), and each topic start's age worked out from
#   the day it was noted ("on", topic_start_day) and the kid's birth date — again on a grown-up's
#   correction (trigger profiles_keep_skill_starts, kid_age_on); a start's level is never changed.

# Two devices on one day add up (#179) — migration 0027, any time (either order with the app)
#   Re-run apply_all_migrations.sql in the SQL editor (or `supabase db push`; 0027 is new). No edge-function
#   deploy. Before it, the new app finds no note_device_play and sends days with note_play_history as before
#   (asked again every 10 minutes and on a profile load), so nothing breaks. After it, each device's day is its
#   own part (play_day_parts, no client access) and play_days holds their sum; an old open tab's
#   note_play_history writes the day's 'legacy' part, so it adds to the new app's devices instead of replacing
#   them, and a day noted before 0027 keeps what it holds (as that legacy part) the first time a device writes
#   to it. An old tab and a new tab in one browser never count a day twice (each build keeps its own records:
#   the old tab's go to the legacy part, the new tab's to its device's). A day two devices both sent through
#   note_play_history (an old tab on each, or new tabs before 0027) keeps the larger of the two, as before; days
#   add up from then on. At most 8 devices' parts a kid's day (a 9th new device's day is skipped). Parts are
#   tidied at 35 days by the same notes.
#   The draft privacy notice now says each device's share of a day is kept under a random code the browser
#   makes up (#124, for the lawyer). A stale PostgREST schema cache after it: `notify pgrst, 'reload schema'`.

# ✏️ Fix and 📚 Browse in Question review (#194) — migration 0028, before the app (or either order: harmless)
#   Re-run apply_all_migrations.sql in the SQL editor (or `supabase db push`; 0028 is new). No edge-function
#   deploy. Before it, the new app's ✏️ Fix and 📚 Browse say they couldn't save / load (the functions are
#   missing); release, approve and retire work as before. A fix approves the question and clears
#   checked_version: the default recheck skips approved questions, so check fixed wording with Claude by
#   adding --include-approved --include-reviewed (a fix is a review). Deploy generate-questions with it: the
#   report check's write-back then leaves alone a question fixed while the check ran. A stale PostgREST schema
#   cache after it: `notify pgrst, 'reload schema'`.

# Question review alerts and the admin page (#147) — once, by the owner
#   1. SQL editor: make yourself an admin (🛡️ Question review appears in 👪 Grown-ups):
#        insert into public.admins (user_id) select id from auth.users where email = '<your sign-in email>';
#   2. Secrets (email via Resend; Slack and Discord optional):
supabase secrets set RESEND_API_KEY=re_… ALERT_EMAIL_TO=<you> APP_URL=https://hazelapp-pi.vercel.app ALERT_DIGEST_SECRET=<long random string>
supabase secrets set ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/… ALERT_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/…
#      ALERT_EMAIL_FROM is Resend's test sender until you verify a domain (it only delivers to the Resend account's own address).
#   3. SQL editor, after enabling the pg_cron and pg_net extensions: the daily digest (07:45 UTC)
#        select cron.schedule('question-review-digest', '45 7 * * *', $$
#          select net.http_post(
#            url := 'https://<project-ref>.supabase.co/functions/v1/generate-questions',
#            headers := jsonb_build_object('Content-Type', 'application/json',
#              'Authorization', 'Bearer <anon key>', 'x-digest-secret', '<ALERT_DIGEST_SECRET>'),
#            body := '{"action":"digest"}'::jsonb);
#        $$);
```

