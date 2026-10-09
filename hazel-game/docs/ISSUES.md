# Issues Log

Running log of bugs, shortcuts, and things to revisit. **Update before every
commit** — if you added a workaround or noticed something off, log it here.

Status: 🔴 open · 🟡 in progress · 🟢 resolved

| ID  | Status | Severity | Summary |
|-----|--------|----------|---------|
| #1  | 🟢 | High   | Auth is cosmetic — game state not gated on a real session |
| #2  | 🟢 | High   | `PASS_THRESHOLD` (0.82) vs 5 questions requires a perfect score |
| #3  | 🟢 | High   | App crashes on boot if Supabase env vars are missing |
| #4  | 🟢 | Med    | Test infrastructure (Vitest) installed but not wired |
| #5  | 🔴 | Med    | No PWA (installable/offline). `vite-plugin-pwa` was removed as unused in #87 — `npm i -D vite-plugin-pwa` when this is picked up |
| #6  | 🟢 | Med    | Sign-up proceeds even when email confirmation is pending |
| #7  | 🟢 | Med    | Quiz/battle questions are hardcoded — replaced by AI generation |
| #8  | 🟢 | Low    | Battle damage and avatar HP do not persist between battles |
| #9  | 🟢 | Low    | Dead code: `NPC.questions` field unused |
| #10 | 🟢 | Low    | Two React Vite plugins installed (`-react` and `-react-swc`) |
| #11 | 🟢 | Med    | Migrate game flow to xstate once guarded transitions multiply |
| #12 | 🟢 | Med    | Game progress in localStorage is not tied to user identity |
| #13 | 🟢 | Med    | Consider upgrading the build toolchain Vite 5 → 8 |
| #14 | 🟢 | Low    | 2 moderate npm audit vulnerabilities (dev-only) |
| #15 | 🟢 | High   | `profiles` migration must be applied in Supabase or profiles fail to load |
| #16 | 🟢 | High   | `generate-questions` edge function must be deployed before it can be called |
| #17 | 🟢 | High   | Migration `0002_add_xp.sql` must be applied or profile load fails |
| #18 | 🟢 | Med    | Generic error messages hide the real cause (esp. edge-function errors) |
| #19 | 🟢 | High   | Apply migration 0003 + redeploy the edge function (cache + error detail) |
| #20 | 🟢 | Low    | No visual feedback (pop / celebration) when the player levels up |
| #21 | 🟢 | High   | Migration `0004_power_ups.sql` must be applied or profile load fails |
| #22 | 🟢 | Low    | Quiz auto-advances on a fixed timer — a Next button would suit all readers |
| #23 | 🟢 | High   | Question cache inserts fail — `service_role` lacks INSERT on `questions` |
| #24 | 🟢 | Med    | Cache has no per-player dedupe — the same kid can see the same question twice |
| #25 | 🟢 | Low    | No end-of-round "missed questions" recap — explanations flash once and are lost |
| #26 | 🟢 | Med    | No way to flag a wrong/awkward question — LLM errors have no feedback loop |
| #27 | 🟢 | Low    | Power-ups stack uncapped + all four bias offense — high-level battles trivialise |
| #28 | 🟢 | Low    | No daily-streak / return-tomorrow hook — the canonical kids-game retention loop |
| #29 | 🔴 | Med    | No parent dashboard — buyers see nothing of their kid's progress |
| #30 | 🟢 | Low    | Cache-vs-AI split is uniformly random — no reuse bias, no per-session cost cap |
| #31 | 🟢 | Low    | "Loading…" dead air while Claude generates — needs a fun fact / mascot animation |
| #32 | 🟢 | Low    | Battles never nudge `skill_levels` — fighting NPCs teaches the difficulty model nothing |
| #33 | 🟢 | Low    | Topic set is hardcoded to four — no easy path to add history, language, etc. |
| #34 | 🟢 | High   | Apply migration 0006 + redeploy the edge function (per-player dedupe + flags) |
| #35 | 🟢 | High   | Apply migration 0007 (streak columns on profiles) |
| #36 | 🟢 | Med    | "Open World" is just a 4-card NPC picker — superseded by the #37 build |
| #37 | 🟡 | Epic   | Evolve into an educational JRPG — phases 0–3 SHIPPED; phase 4 open |
| #38 | 🟢 | High   | Apply migration 0008 (saves) + redeploy the edge function (context flavor) |
| #39 | 🔴 | Med    | Replace placeholder programmer art with CC0 tilesets/sprite sheets |
| #40 | 🔴 | Low    | Boss question difficulty doesn't ramp per enrage phase (damage does) |
| #41 | 🔴 | Low    | No audio — howler installed, needs CC0 chiptune/SFX packs (phase 4) |
| #42 | 🟢 | Low    | All four mini-quests share the riddle-chest pattern — add variety later |
| #43 | 🟢 | Med    | Review-pass fixes: double-tap turn resolve, legacy-key leak, sage/step lock, hub chest |
| #44 | 🟡 | Low    | Battle turn flow refactored (#87): rules → `lib/battleTurn.ts`, live numbers → `battleStore`, UI split into HUD/stage/menus/result. Still open: world cutscenes as machine substates |
| #45 | 🟢 | High   | World canvas: black lines on screen change, keys need a click, canvas too small |
| #46 | 🔴 | Med    | Pixel-art assets still to be produced — heroes, Ember, Verdara first; hub NPCs + Numbria/Gearfall/Chromaria zones after (depends on Task 8 asset production; see `docs/ASSET-SOURCING.md`) |
| #47 | 🟢 | High   | XP gauge never moved / no level medallion — a missing `profiles` row left `profile` null so `addXp` silently dropped all XP. `loadProfile` now self-heals: falls back to a working local profile and best-effort upserts the row (`profileStore.ts`). `LevelBadge` shows Lv 1 / 0 XP instead of nothing. |
| #48 | 🟢 | Low    | Sign-out button (top-right) overlapped the battle hero panel; hidden in battle. Level medallion moved to top-center in battle to clear the combatant panels (`App.tsx`, `LevelBadge.tsx`). |
| #49 | 🔴 | Med    | Sprite system review backlog — bugs/gaps/edge cases to fix (mostly when art lands). See `docs/SPRITE-REVIEW-FINDINGS.md`. |
| #50 | 🟢 | Med    | World expansion: 5 → 10 zones + story doubled (new-zone NPCs, per-crystal + Spire cutscenes, longer intro/ending) |
| #51 | 🟢 | Med    | Spellbook battle system — cast any learned spell by answering a super-hard question (replaces single equipped Special) |
| #52 | 🔴 | Low    | The new zones are story/exploration only (no enemies/gates/chests — those need a topic). Consider giving them light optional content (Ember snack micro-quests, secret save spots) later. |
| #53 | 🟢 | Low    | Spellbook unlocks are derived from the save (sages/crystals/Ember stage); `sageEquipped` is now vestigial. Drop it on the next save-schema bump. **Done (2026-10-07):** dropped in save v2 (#75 item 8). |
| #54 | 🟢 | Low    | Edge-function persona prompt has no entry for the new zones — RESOLVED by #55 (nature/space/history personas added). |
| #55 | 🟢 | High   | Themed topics for the new zones (nature/space/history) + the Crystal Spire endgame climb + the hidden villain (Umbra) story arc |
| #56 | 🔴 | Low    | The Spire is replayable after clearing (bump the icon again to climb). Intentional for now (endless practice); could add a "champion" variant or a cleared-state greeting later. |
| #57 | 🟢 | High   | ⚠️ Deploy: redeploy `generate-questions` so nature/space/history questions generate — the function whitelists topics, so the new zones' gates/chests/battles 400 until it ships. Redeployed 2026-06-18 (fixed the Clockwork Depths "topic must be one of…" error). |
| #58 | 🟢 | High   | Warden bosses in the 3 themed zones drop keys that gate-unlock 3 of the 4 Fiends (Numbria stays open). Reward: key + trophy badge + boss XP. |
| #59 | 🟢 | Low    | Warden bosses sit in the open roaming area. Added a signpost NPC near each warden that warns of it and points the reward home; keys retheme to their destination crystal zone (Verdant/Prism/Gearwright). |
| #107 | 🔴 | Low    | **The boat + the Silver Shallows follow-ups (#75 item 14, slice 14a; #106 left for item 13, built in parallel):** (a) **item 14 is sliced**: 14a (this) is the boat, Marlow's quest, the Silver Shallows with Gull Rock + Sandpiper Cay and the Great Fogbank, the Act II opening; still to come — 14b Remembrance Hill (on Dawnreach, behind the Grove fog) + Eldergrove (warden island, Memoria Key), 14c Foglight Marsh + the Sunken Archive (crystal #5 Memory, Hollow Fiend, Sage Chronicle, `TOTAL_CRYSTALS` → 6 and the Ember retune), 14d Act II's other quests, reactive dialogue and panels. The Shallows map already leaves room for them (Marsh along the north, Eldergrove south, the Archive north-east); (b) **no sea critters yet** — enemies wander on land only; a water wanderer (sea critters you bump in the boat) comes with the islands' content; (c) ~~no sea music~~ **done (2026-10-08):** one loop per sea area — a shanty while sailing Dawnreach's waters, the Silver Shallows' own theme (islets too), a misty one near the Great Fogbank (`seaAreaAt`, `SEA_TRACK`; `build.py seamusic`); the Starfall Sea gets its own when Act III adds it, and the tracks were composed against `main`'s `audio.py` (the unmerged `claude/longer-music-loops` branch rewrites it — the sea block is appended so it should merge cleanly) — hand-check in the app is TC-655; (d) the Shallows is tier 4 (like Chromaria) until Act II gets tiers 5+ (#105g); (e) **decision 8 taken as recommended**: the boat arrives in Act II, after the Spire; (f) `SaveData.boat` / `aboard` replaced the roadmap's `vehicle` / `boat` (§4.5) — additive, no version bump; (g) a boat left at an island stays there after a Return or a lost battle — Old Marlow rows it home on request (`boatFetch`); there is no other recall; (h) Marlow's quest steps are conversations (flags), not item 13's carried items, so the 🚩 can follow each step from the story flags alone (`nextObjective` only sees flags); (i) the 🚩 for "Sail the Silver Shallows" sits on Marlow's dock; routes through the sea read "Sail west to Dawnreach, then …" even when the boat is moored elsewhere; (j) a hero standing on a beach right beside a roaming critter can be bumped into battle from the boat — rare, and the battle backdrop is the zone's; (k) numbered #107 / TC-640+ to leave item 13's #106 and its test cases alone — renumber at merge if they collide. **Review (2026-10-09, `/saas-code-review` + `/saas-ux-review`, fresh reviewers; all fixed):** a landing at a beach's corner left the boat touching the shore only corner to corner, where nobody could board it — a softlock on Gull Rock / Sandpiper Cay without Return (`landingMooring` now moors edge to edge, `canBoard` boards from beside the boat, corners too, which also frees saves already stuck); a hand-edited save naming `constructor` as a map crashed `normalizeSave` (`isZoneId`, own keys only — also `zoneId` and `lastRest`); a hero saved aboard on cells that are land, fog or a town pond now loads afloat on the nearest open sea, or ashore with the boat beside where they'll stand (`afloatAt`, `seaBeside`, `safeSpawn`'s boat fallback, `onAshore` moors beside them); re-picking a track mid-fade-out silenced the music (`playMusic`), and the fogbank's music now lingers to `FOGBANK_LEAVE` (9 cells); UX: the ⛵ chip pushed 📜 Menu off phones (now beside the place name, stats wrap), the boat 'vanished' after Return (toast + map legend say where, and who fetches it), guides read Marlow's hint in his voice (neutral lines), no sailing reminder (footer + a sound on boarding/landing), the Shallows' map was unlabelled (`ZoneDef.landmarks`: Gull Rock, Sandpiper Cay; sea-edge markers), Marlow rowed the boat home unasked (now a ⛵ Row her home button, and a mooring within `DOCK_NEAR` of his dock is home), two story lines contradicted, plus the map's caption/aria, Atlas's spot, the at-the-dock directions, focus in story panels and the toast over the d-pad. Still open: (l) ~~Gull Rock Lighthouse is drawn as a whitewashed cottage, no tower~~ **fixed (2026-10-09):** a lighthouse tower (`/tiles/lighthouse.png`, `ZoneDef.lighthouse`) stands on a 2×2 rock just east of Ness's cottage, its lamp pulsing and two soft beams sweeping round (still under reduced motion); (m) ~~ten panels play back to back after the Spire finale~~ **fixed (2026-10-09):** the finale (now 3 panels) runs into three walk-home pictures that fade in and out through black — down the Spire, the village cheering, a bed at the Sleepy Sheep Inn (`HOMECOMING_PANELS`, `StoryScene`) — then the hero is put to bed there (`restAtHomeInn`), the morning fades in on them inside the inn (`WakeFade`), and Act II (now 3 panels, opening "You wake to sunshine at the Sleepy Sheep Inn") follows; under 330 words in all (was ~450). Before this nothing took the hero away from the Spire: after the panels they stood at its door with only the 🚩 to go by; (m2) ~~a save caught between the finale and Act II plays Act II wherever the hero stands~~ **fixed in the review below** — and it was not branch-only as first written: Act II isn't on `main`, so every player who beat the Spire there would have met it once; **review of (m) (2026-10-09, `/saas-code-review` + `/saas-ux-review`, fresh reviewers; all fixed):** the finale started while the Spire's own "The Spire is yours!" panel was still open (`SpireOverlay.win` sets `spire-cleared` mid-climb), so the morning faded in on Umbra's throne room with the Spire's music, Act II played there and "See how it ends" was offered after the ending — the finale now waits for that button to close the climb (`spireVictoryDue` needs `overlay !== 'spire'`); a save with `spire-victory-seen` but not `act2-seen` loads asleep at the inn (`normalizeSave` → `restAtHomeInn`), and "Good night" saves at once (`flush`), so a reload mid-morning can't replay the finale; on a phone held sideways the picture panels pushed the only button off screen with no scroll — the dialog scrolls (as `PathQuestionOverlay` does) and a picture is at most ~35% of the screen tall, so the button fits even at 568×320; a quick second tap during the 1.4 s picture cross-fade skipped the next panel (the inn's, even) or left a stale picture beside the wrong dots — a tap now counts only once the panel on screen has faded in, and the label and dots follow that panel; the HUD stayed tappable through the wake (the Menu then sat under Act II) and Tab could leave a story for a hidden 📜 Menu — the story and the wake make everything behind them `inert` (`useInertOutside`) and Tab keeps to the story's button; screen readers heard nothing as panels changed — the words sit in a polite live region, the button is described by them, the emoji is hidden, and the dark says "The next morning…" (a status line, shown too); Act II's second panel was 38 words with Grandmother Wick out of nowhere — split in two again (Wick "squeezes your hand" first; Act II is 4 panels, none over 30 words) and Aurora's line lost its quote-in-a-quote; Marlow's panel says he's "just east of the village"; the village's confetti starts lower and smaller and is cleared when its picture goes, the finale's big burst respects reduced motion; the pictures now match the words (stairs down from the Spire, two sheep cheering, the inn's blue roof); the morning holds 1.8 s (`MORNING_MS`) before Act II, as asked. A `WorldScreen` test now plays the whole thing from the Spire's panel. Still open: (m3) the timings were measured in headless software rendering — check the fades and the tap lock on a real phone, and the announcements with VoiceOver / TalkBack (TC-675); (n) in headless SwiftShader the slide snapshot (`k.screenshot()`) has no terrain, so mid-crossing the hero seems to stand on green — check on a real device (TC-326 / TC-655). |
| #106 | 🔴 | Low    | **Item-chain follow-ups (#75 item 13; item 12 took #105):** (a) one chain so far — "The Hermit's Moonstone" (Hermit Moss → the Echo Mine's key-item chest → Miner Mabel cuts it → back to Moss); the same `haveStep` / `bringStep` / `keyChests` carry more (the Gear Halls' side hall, island hermits in Act II, STORY-4X's Blank Chart key item); (b) **a key item must go in a new chest** — a save that already opened an existing chest would never get the item (`openChest` only pays on the first opening), so never turn an old chest into a key-item chest; (c) the whole chain sits in one small valley (the hill, the mine, its mouth) — fine for a first chain, give later ones more road; (d) Moss can be met before the first crystal, when the Shrine of First Light (Glow) is still fogged — his hint points at Old Wren and the quest simply waits; (e) ~~the quest log's "Done — go collect your reward!" doesn't say who~~ fixed in the review: "Done — go back to <giver> for your reward!"; (f) quest items can't be dropped, sold or lost, and the menu's "Carrying" row is the only place they show; (g) ~~a Moonstone found before meeting Moss comes with no hint of who wants it~~ fixed in the second review: the chest names who wants it (`KeyChestDef.wantedBy`) while the quest is unoffered — the original note: — the chest just says "25 coins and the 🌙 Moonstone!" and Mabel (who would know it) says her usual lines; Moss stands beside the mine door with his name plate, so kids will likely find him, but a line from Mabel while the stone is carried and the quest unoffered would close it (NPC lines can't test items yet — add an `ifItem` or a found-flag); (h) also from the review, fixed: a hand-over now sets `handedOverFlag(item)` so a have step never falls back to "go find it" after a bring step takes its item, and a test checks every quest item id is registered.; (i) **second review (2026-10-08), fixed:** chest steps (`zoneChestOpened`) skip key-item chests, so a key chest can share a zone with a "find the riddle-chest" quest; a test keeps every quest item to one quest (the handed-over flag is per item); (j) Moss's offer still says "Bring it out" to a kid who is already holding the stone (offers are fixed lines) — harmless, his next line sends them to Mabel.; (k) **third review (2026-10-08), fixed:** the "who wants this" note moved into the question card above Continue and the chest overlay scrolls (with a real riddle it had been below the fold on phones, and gone in landscape); Mabel points to the Moonstone's nook while the quest is on; a test forbids a step aimed at a quest giver; `PathQuestionOverlay.test` added. Still pre-existing (#102i): the LEVEL / STREAK badges sit over the top of overlays on phones. |
| #105 | 🔴 | Low    | **Regional difficulty follow-ups (#75 item 12):** (a) **tiers follow the story leg, not the distance from home** — Starfall Coast is just east of the Village but tier 3 (its warden's key opens the third Fiend), so a kid who wanders there first meets tough critters. That's the "not yet" a JRPG gives; the map's "!" says so before you bump in. Revisit if playtests show early Coast trips putting kids off; (b) **home ground got a little gentler** than before (tier 0: ×0.85 HP and blows, ×0.8 coins) — Dawnreach's heartland critters and Moonwell Grove's; tier 1 (Numbria, the Woods) is exactly the old balance; (c) **the numbers are first guesses** (`DANGER`): a tier-4 critter has ~1.45× the HP and hits ~1.3× harder; by then a hero has the XP power-ups, spells and Pair Attacks to match. Tune with real play; (d) a healer's mend is capped at 20 (`HEALER_REGEN_MAX`) so no region can make it out-mend a correct hit — no change at tier ≤ 1; (e) the Spire isn't scaled — it's a question trial, not a fight; (f) on the map "Lv" is still the *question* level (the speed trigger's ⚡ and the docs say so); danger is the "!" and the colour — a kid may read "Lv" as strength. Mitigated by the UX review fixes (the first fight per tier explains the "!", Scout Tamsin, the defeat tip); still the residual risk — watch playtests; (g) Act II's regions will need tiers 5+ — extend `DangerTier` and `DANGER` (the tests check every tier is tougher than the last); (h) critter labels now sit on a dark plate above every character (and below the fog — a second code review caught the label drawing over it) (was hard to read on Chromaria's pink ground, then a shadow wasn't enough on a phone) — bench screenshot sets taken before this differ at every label; (i) code review (2026-10-08): no data/security surface; the two spawn sites (world + question prefetch) now share `spawnPlaced` so the instance id and tier can't drift apart; (j) UX review (2026-10-08): all 8 findings fixed — label plate + z, HUD marks beside "Lv" (the "💪 Fierce" word dropped), a 💪 banner on the first fight per tier per session, far mercy eases the fight to tier 1 (`fightTier` / `atTier`) and losses count per kind + tier (`lossKey`), defeat tip + victory bonus line, an arrival toast 2+ tiers past the 🚩's road, Tamsin's line split; (k) **far mercy is generous on purpose:** after two losses a tier-4 critter drops all the way to tier 1 (and pays tier-1 coins) rather than one tier at a time — a wall is worse than an easy win; revisit if kids farm it; (l) the HUD title row with "!!!" plus ⚡+2 truncates a long enemy name sooner on a 375 px phone ("Count…") — the name has a tooltip and the sprite is on stage; (m) second UX review (2026-10-08): all 7 findings fixed — the battle banner is a dark pill floating over the stage (it was unreadable on light skies, and on a small phone it moved the answers a row mid-question), 💪 / 💛 are tap-to-continue lines, the copy talks about the "!" marks instead of "far from home" (the Coast is near home), the 🚩 hints name the 📜 Menu, the HUD shows 💛 once mercy eased a fight, tier-4 labels are lighter on a darker plate; (n) at DPR 1 on a ~360 px stage the canvas downscale can still drop a column of the 10–11 px label text ("!!!" reads "! !") — pre-existing for every small canvas label (place names too); fix with the canvas resolution, not the copy. |
| #104 | 🔴 | Low    | **Inn follow-ups (#75 item 11):** (a) **`lastRest` is additive, with no version bump** — old saves read null (home), but an older client still open in another tab rebuilds the save from the fields it knows and drops it, so the next defeat goes home instead of to the inn. Harmless (it's where every defeat went before), so it rides along until the next real bump; (b) Numbria, Gearfall Canyon and Chromaria **grew a street south** (28 → 37 rows) to fit their inns, through a 2-wide gap in the old bottom wall — every other tile, door, Dawnreach icon and saved position is unchanged. Verdara's inn sits in its open north-east block; (c) the roadmap asked for ~8–12 people per town: each crystal town now has 9 (signposts don't count), the Village 14 — it's home and took in Lumina Field's people, so it's left over the band; (d) **rumors are ordinary dialogue lines**, not a system: the ones about a field spell, warden key or the Moonwell quest drop away (`unlessFlag`) once it's done; the ones that just describe a place stay. The compass words in them ("Verdara, way down in the south-west corner") are hand-written and were checked against Dawnreach's icons, but no test guards them — if an icon moves, grep `npcs.ts` for the place's name; (e) resting at the Sleepy Sheep Inn now sets `lastRest` too, so a hero who rested there wakes inside it rather than at the Village's start spot — both are home; (f) needs a real-app check with a signed-in save (TC-604): rest at a far inn, lose a battle, reload; (g) **UX review (2026-10-07):** losing to the Clockwork Titan, three floors down beside B3's save crystal, wakes the hero at their last inn — often far away. Kept: it's the roadmap's rule (§2.4, the DQ way), and the defeat screen now says "…where you last rested"; if playtests show kids giving up on the walk back, wake a hero beaten in a dungeon at its entrance or last save crystal instead; (h) an innkeeper offers 🛏️ Rest on every line of their talk (`DialogueOverlay`), so the rumors never stand between a tired hero and a bed. |
| #103 | 🔴 | Low    | **Dungeon follow-ups (#75 item 10):** (a) **the Spire shares the dungeon engine's parts, not its floors:** it numbers floors with `floorLabel` (`spireFloorTitle`), draws through the same canvas and the same darkness code, and is listed as `SPIRE_DUNGEON` — but its floors are still trial maps run by `SpireOverlay` (rune seals, candles, Umbra), not saveable zones joined by stairs exits. Porting them would mean positions mid-climb in the save and a new rule for what a reload does to a climb in progress; it doesn't change play, so it waits for a reason (e.g. the Dream Root, item 16, which descends *below* the Spire and should be ordinary floors); (b) the roadmap said "entered from the Woods" — since Phase 1 the Depths are a place on Dawnreach, so that's the way in; (c) the Gear Halls (B2) are dim, not dark: they're on the way to the Gearwright Key, and Glow is optional (only their side hall needs it). A fully dark floor must never stand between the hero and a story goal (dungeons.test walks every floor without Glow); (d) dungeon floors save your position like any zone — a reload mid-dungeon wakes you where you were; (e) moving the Titan down a floor moved the Gearwright Key's `fromZone` to B3 — wayfinding, Elder Lumen and the key gate all name the Depths; (f) only the Depths are a dungeon so far — the Echo Mine (item 9) stays one floor; (g) an older build still open in another tab doesn't know B2/B3 — a save standing there loads in that tab at home, like any unknown zone (harmless; the item 8 version bump only guards older *versions*); (h) **UX review (2026-10-07):** "B1 / B2" was flagged as a convention young players may not know (and a screen reader says "B two"). Kept for now — it's the elevator and JRPG convention, the HUD, map and routes all say "stairs down", and "Floor 2" alone wouldn't say which way; revisit with a real playtest.; (b2) **fresh-eyes review (2026-10-08):** no code findings beyond the builder's review; one UX fix — on the dim Gear Halls the side hall's pitch dark was one opaque rectangle over a mostly visible floor, so it read as a hard black hole in the map. Pitch dark is now drawn as stacked layers (`PITCH_FEATHER`: a three-step rim, 30 px, around an opaque core), which also softens the Echo Mine's doorway. Seen, already logged (#102i): on a phone the LEVEL / STREAK badges cover the new floor label ("B2 —") in the HUD. |
| #102 | 🔴 | Low    | **Field spells follow-ups (#75 item 9):** (a) field spells cost nothing to cast — the shrine trial (3 right answers) is the learning gate. Return and Glow are tools, but Calm could let a kid walk past most fights: watch real play, and if battles stop happening give Calm a cooldown or a question; (b) Calm is session-only (`WorldScreen` state, counted down by the canvas while the world runs) — it ends when the world screen goes away (a boss battle, the training grounds, a reload); (c) Return flies only to the five towns (home + the four crystal regions), landing just inside each front door; it works from anywhere, so it's also the way out of a dark place; (d) visits were never recorded before item 9, so an older save offers home plus the towns whose crystal it restored until it visits the rest again; (e) the Echo Mine is one screen with no critters — roadmap item 10 (real dungeons) should reuse `ZoneDef.dark` for the Clockwork Depths' lower floors; (f) the three shrines share the `shrine` icon and the mine shares the Depths' `cave` icon (names tell them apart on the map) — draw new icons if kids mix them up; (g) the mine's chest asks a ⏳ history question, like the Depths; (h) **review fixes (2026-10-08, code + UX review in a fresh session):** Calm running out while the hero stands on a critter started the battle in the same frame — now `CALM_GRACE` (1.5 s) of cooldown first; the unlit Echo Mine showed its pitch-dark doorway as a hard black box in an otherwise ~90%-dark map, so the darkness read as a glitch — the unlit edge is now 95% dark; ✨ Field spells moved up under the menu's world map (it sat below Ember, battle friends, quests and secrets, a long scroll on a phone for the spell you cast most); (i) seen in the review, not caused by item 9: on a phone the fixed LEVEL / STREAK badges cover the zone name in the world HUD and the top of overlays (e.g. a shrine trial's title) — move the badges or give the HUD and overlays a top inset; (j) the trial awards `XP_PER_CORRECT` without the Scholar bonus, like gates and chests (`PathQuestionOverlay`); quizzes, battles and the Spire add `xpBonusPerCorrect` — make them all agree. |
| #101 | 🔴 | Low    | **Act I re-stage follow-ups (#75 item 8):** (a) the Village, not the Spire, sits at the heart of Dawnreach (the Phase 1 island was kept whole and lobes added at the corners); the Spire is just south of it in its fog ring — the bible's "at the heart of the world" is close, not exact. Revisit with #100(g) if the Spire should be the landmark you see from everywhere; (b) the four corner lobes are mostly open grass, a critter and a pocket each — roadside places, shrines and rumors (items 9–11) should fill them; (c) ~~a v1 client still open in an old tab after this ships has no newer-save guard (that arrived with v2): if it re-saves a migrated save as v1, the next load migrates it again and a Dawnreach position shifts by (8, 6) tiles a second time~~ **fixed 2026-10-07:** every v2 save carries the `save:v2` flag (v1 keeps `flags` as they are), and the v1 → v2 step leaves a flagged save's position alone; migration 0011 also stops such a save reaching the server at all; (d) the moved NPCs keep their `hub-*` ids (`hub-kid`, `hub-merchant`, `hub-librarian`, `hub-innkeeper`) because saves and quests reference them — rename only with a save migration; (e) the `hamlet` icon and the `cottage` building style have no users now (kept for future roadside hamlets), and the retired Field keeps its entry in `tools/assets/tiles.py` (`RETIRED`) so the other zones' art seeds don't shift; (f) every crystal region is ~40–47 road tiles (~9 s) from home — fine on foot, but the *Return* spell (item 9) matters more now; (g) the Village spawn moved from its north gate to the plaza (new games and defeats wake there) — old saves standing in the Village keep their own position; (h) ~~**from the item 8 reviews (2026-10-07):** the newer-save guard covers loads only — a tab already running when a newer version ships still saves over a newer save; its comment overclaims~~ **fixed 2026-10-07:** migration 0011's trigger refuses any `saves` write that lowers `data->>'version'` (`save_version_conflict`), `saveStore.flush` turns that into the "refresh to update" screen, and the ladder comment says which guard covers what. Still true of two tabs on the *same* version: the last save wins (as before); (i) ~~the outdated-save screen reuses `ErrorScreen` — "Something went wrong" + "Try again" for what is just an update~~ **fixed 2026-10-07:** "✨ Hazel Quest has been updated!" with a 🔄 Refresh button (`ErrorScreen` `title` / `emoji` / `retryLabel`); (j) ~~Scout Tamsin's corner-regions line is one 7-line box on a phone~~ **fixed 2026-10-07:** split in two, the corners line 135 characters. Fixed from the same review: Elder Lumen now greets a new hero on the plaza and mentors from the Library (feature log). Still open: (a), (b), (d), (e), (f) — follow-ups for items 9–11, not bugs. |
| #100 | 🔴 | Low    | **Fog follow-ups (#75 item 7):** (a) ~~the four crystal pockets sit in the quadrants of today's Dawnreach~~ done in item 8: each pocket sits beside its own region at Dawnreach's corners (science and engineering moved; save v2 carries their opened state over); (b) a pocket's reward is a riddle chest (the usual `CHEST_COINS`) — a shrine or side place behind fog comes with items 8/9; (c) ~~the reveal can't be skipped~~ done: any fresh key, click or tap skips it (a key held from before doesn't); a skip shows only the lift line of the bank in view — the others clear silently (the world map still shows what each crystal opened); (d) a crystal restored away from Dawnreach waits to be shown until you next arrive there (the storybook panel says to go and look); (e) ~~fog banks are rectangles~~ done: banks are now soft puffs with round edges drifting around each other (`lib/fog.ts`); in the foggiest view they cost a little frame rate in software rendering (see TC-550) — recheck on a real device with TC-326; (f) the later fogs in §3.2 (the Silver Shallows, the Grove road, the Great Fogbank) wait for their acts; (g) the Spire now hides in its ring of clouds until the first crystal, so it isn't a landmark you can see from afar until then (roadmap §2.4 wants it visible from most of the continent) — revisit with the full continent, e.g. let the tip show above the clouds; (h) in a full reveal each bank's lift toast is replaced by the next one after ~3.4 s, a little short for a slow reader (the shrine's line is the longest) — hold the camera longer on a bank with a long line, or show the lines one after another; (i) 💎 means "any crystal" on the world map's fog markers but also appears in "💎 Game saved!" — pick a different save icon if kids mix them up; (j) the menu map shows the Spire as ☁️ until its fog *lifts* (the crystal flag), the same moment the map stops drawing the fog — so right after the first crystal, before you're back on Dawnreach to watch the ring clear, the map already shows 🗼 while the world still hides it until the reveal plays. |
| #99 | 🟢 | Med    | **Battle port onto main's split arena (2026-10-07).** `main` merged its own battle refactor (#87: `CombatState` + `battleStore` as the single source of truth, `resolveHeroHit` / `resolveEnemyTurn` / `resolveSpell` / `resolveItem`, the view split into `BattleHud` / `BattleStage` / `BattleMenus` / `BattleResult` + `useBattleFx`) while this branch had grown the old single-file arena (#92–#98). Kept main's structure and moved every battle feature onto it: `resolveEnemyTurn` gained `intent` (power blows ×2); this branch's rules (intents, streaks, weakness, mercy, rewards, countdown, speed trigger) joined `lib/battleTurn.ts`; `battleStore` gained `losses` (mercy); `useBattleFx` gained the choreography (hero/companion motions, fireballs, flinch, cheer, swap drop) and banner icons; menus gained Companion + Swap. The displayed HP still lags until the blow lands, but only for display — the store is written at once (#70 stays closed; main's regression test passes). Follow-ups: (a) `streak` and `intent` live in the arena, not `CombatState` — move them in if a rule ever needs them outside the arena; (b) `BattleStage` takes a `stage` values object + the two element refs (a ref inside the object trips the React compiler's refs rule). |
| #98 | 🟢 | Med    | Code review of #97, all fixed: (1) **Medium — stuck question:** the question card was keyed by `question.id + qIndex + spellIdx`, and `qIndex` stops advancing once the harder pool serves questions — a one-question pool reused the same key, so the already-answered card stayed up with Go! gone (softlock). Every ask now gets its own `seq` and the key is `id:seq`. (2) **Low — boost-pool race/failure:** a late, easier pool could replace a harder one, and the banner promised harder questions even when the fetch failed. Only the pool for the current boost is kept; the ⚡ banner + badge wait for it; a failed/empty fetch shows "Your level goes up to N after this battle" (the level is still saved). (3) **Low — Flee dropped the boost:** Flee now saves `current + boost` (no battle ramp). (4) **Pip's peek** (a crossed-out answer) no longer counts toward the speed run — like a Hint Feather. Follow-up: the boost fetch has no retry; a failed one keeps the old pool for the rest of the fight. |
| #97 | 🟡 | Med    | Difficulty follows the per-topic **question level** (age baseline + performance) and a **speed trigger** (5 quick correct answers in a row → +1 mid-battle, max +2/battle, saved); XP no longer scales anything. Follow-ups: (a) "quick" = half the age countdown (≈9.5s at 9) — a first guess, and it counts from when the card appears, so reading a long question fast still has to beat it; (b) the speed boost only exists in battles — quiz rounds still use the flawless/streak ramp without timing; (c) the enemy's charge banner can replace the "So quick!" banner if it fires right after (the ⚡+1 badge stays) — seen in testing; (d) nothing *lowers* the question level in battles (#32 rule) — only weak quiz rounds do; (e) mercy still eases questions by 1 and adds 5s, independent of the question level. |
| #96 | 🟢 | Med    | **Superseded by #97** (XP-based growth removed). Kept from #96: the age-based countdown and the per-player defend-timer setting. Original: Growth rule: age (from sign-up birth date) is the baseline, player level adds +1 challenge step per 5 levels (max +3) — used by enemies, battle questions, the Spire and the defend countdown (age-based: 24s at 6 → 15s at 12, −1s per step, 10–25s). Defend timer can be switched off per player (📜 → ⚔️ Battle). Follow-ups: (a) **at the +3 cap a 9-year-old at Lv 16 gets the same questions as a 12-year-old (Lv 7)** — a big jump for a younger reader; watch it, and consider a smaller cap or letting per-topic skill (not just XP) drive growth; (b) this reverses #32's "battles scale to age only" — battles still never *lower* skill; (c) the enemy level is fixed when a zone loads, so a level-up mid-zone takes effect on the next zone entry; (d) the timer setting lives in the kid's save — a parent can change it only from that child's menu (a parent dashboard, #29, could own it later). |
| #95 | 🟡 | Med    | Defend questions are timed — now a **flat 15s** for every question (was 15–30s by reading length; 10s rejected as too fast for young readers), +5s under mercy, pauses when hidden; timeout = wrong answer. Follow-ups: (0) a long word problem gets the same 15s as "2 + 2" — watch whether long questions need more;  (a) **no way to turn it off** — consider an accessibility setting (off / extra time) for slower readers and kids who find clocks stressful (STORY-4X §12 warned timers may add stress; watch playtests); (b) 15s is one number for every age — could scale with `playerAge` if older kids find it slow; (c) the countdown starts as the card appears, so the card's ~0.3s fade-in comes out of the budget; (d) the Spire's Umbra gauntlet and gates/chests stay untimed on purpose. |
| #94 | 🟡 | Med    | Battle UX pass for phones (fit, 44px targets, readable hints, truncating names, clearer copy). Follow-ups: (a) at 360×640 the question card fits with ~2px to spare — a 5-line question or a long answer set will still need a scroll (Continue auto-scrolls into view, but the top of the question can scroll off); (b) the QuestionCard auto-scroll also applies to the quiz / gates / Library (harmless, `nearest` = no scroll when it fits); (c) contrast was raised by rule of thumb (12px @ 70% white on indigo-950), not measured with a contrast tool; (d) not yet tried on a real phone (notch / Safari toolbars change the usable height). |
| #93 | 🟡 | Med    | Review fixes (2026-09-26): a Wisp killing blow now keeps its heal in the saved HP (`victory()` reads live store HP), and pending battle timers are cancelled when the arena unmounts (`later()`). Battle round 3: party companions (Ember / Pip / Wisp) with a free 🔄 Swap, telegraphed enemy power moves, topic weakness, answer streaks, mercy after losses, first-win bonus + drops, reduced-motion support, clearer miss explanations; turn rules extracted to `lib/battleTurn.ts`. Follow-ups: (a) ~~mercy + companion session-only~~ — decided: the companion pick now lives in the save (`SaveData.companionId`, survives reloads); mercy stays session-only on purpose (a reload is a fresh start) and only eases questions (no damage change); (b) Pip and Wisp have no custom battle clips (attack/hurt only, no cheer/breath — they idle through those) and share the generic lunge; (c) tuning is first-guess: `CHARGE_CHANCE` 20%, boss charge every 3rd enemy turn, power ×2, streak ×1.2 at 3 / ×1.4 at 5, mercy = 1 level easier questions after 2 losses (no damage change), drop table (potion 18% / hint 10% / spark 6%, bosses always an elixir), first-win +50% coins; (d) the streak multiplies every hero-side hit including glancing blows and Pair Attacks, so a 5-streak Dragon Duet can reach ~220 — watch boss fights; (e) Pip's peek works even against trickster enemies (who block Hint Feathers) — intentional: Pip "sees through the trick", but revisit if it trivialises them; (f) the charging turn skips the defend question, so battles ask slightly fewer questions; (g) Ember's Breath with Ember swapped out plays as a hero strike (Ember "swoops in"); (h) new SFX swap / charge / streak checked by measurement and play order, not by ear. |
| #92 | 🟡 | Low    | Ember fights in battle (🐉 Ember command: Ember Attack + stage-gated Pair Attacks, `content/companion.ts`) and battle SFX for spells, guarding, blocking, damage, shield-shatter, Ember and Pair Attacks (9 new generated files). Follow-ups: (a) the new SFX were checked by measurement (peak levels) and by play order in headless Chromium, not by ear — swap any via `SFX_SOURCES`; (b) Pair Attack / Ember numbers (`EMBER_POWER`, `PAIR_ATTACKS`) are first guesses — Dragon Duet (~158 dmg at 4◆) can one-shot a mid-level critter, which feels right for the capstone but watch boss fights; (c) ~~Ember lunges on its idle frame~~ — correction: the sheets had attack frames, but they were near-identical to idle; replaced by Ember's own sheet (attack / breath / cheer) in the animation follow-up; (d) Ember's strikes and Pair Attacks reuse the 260ms delayed-`setHp` path, so they share the #70 tap-race (no new exposure); (f) animation follow-up: dive distance is measured from the DOM at move time (`fitReach`) — a mid-move window resize isn't followed (harmless); the comet/duet blows land ~570ms in, so the result message is on screen before the hit (the #70 race window is 570ms for those two, still self-correcting); Ember's world sheet has no breath/cheer clips (battle only); (e) Ember is still one companion — Wave 2 party/companion work (ROADMAP-4X) should fold `companion.ts` in rather than duplicate it. |
| #91 | 🟢 | Low    | Training Grounds only offered the 4 crystal topics; the 3 `EXTRA_TOPICS` (nature/space/history) were defined + question-generable but never selectable. Now `TopicSelect` renders all 7 (`ALL_TOPIC_INFO`). Added a per-session "passed topic" set (`store/quizSessionStore.ts`, ephemeral like `battleStore`): passing a round (80%+) greys that topic out with a ✓ and disables it for the session; cleared on sign-out (`useAuthInit`) + on reload. No edge-function change (extras already whitelisted, #57). |
| #90 | 🟢 | Med    | Migrations review: `profiles` lacked explicit grants (likely part of #61), sign-up trigger failed without birth-date metadata, `increment_question_usage` callable via PUBLIC → fixed in `0010_access_hardening.sql`. Migration rules (forward-only, re-runnable, no BEGIN/COMMIT) documented + linted by `db:bundle`. Open (low): players can edit their own `xp`/`power_ups` via the API — move XP awards server-side before any leaderboard |
| #88 | 🟡 | High   | ⚠️ Deploy: apply `0009_question_quota.sql`, redeploy `generate-questions`, add the site URL to Auth → Redirect URLs. Code shipped: sign-in required + rate limit/budget on the question generator, CI workflow, password reset. Until 0009 is applied the quota fails OPEN (logged) |
| #89 | 🔴 | High   | Children sign up directly with email + password and a birth date — no parent involvement. Needs a parent-account / verifiable-consent design before shipping to other families (COPPA / GDPR-K). Product + legal decision |
| #87 | 🟢 | Low    | Tech-debt pass: battle refactor (#44), tap-race fix (#70), real README, 22 unused packages removed. Note: `npm audit` still reports 13 pre-existing advisories (vite/vitest/postcss chain, was 17) — handle with a toolchain bump |
| #83 | 🔴 | Low    | **Wayfinding follow-ups (#75 item 6):** (a) the 🚩 and the guides follow the main story only (crystals → warden keys → Spire); side quests stay in the menu's quest log, and optional places (the Shrine, the Grove) are never the goal; (b) the crystals are suggested in a fixed order (Numbria, Verdara, Gearfall, Chromaria; a key you already hold jumps the queue) though the story lets you do them in any order; (c) directions are straight-line compass bearings, not road-following: fine on Dawnreach's straight roads, but on the full continent a sign could say "north-east" where the road first goes north — follow the roads by pathfinding then; (d) routes count zones and ignore fog and gates (no main-story route crosses fog today); (e) inside a crystal zone the 🚩 has no marker toward the Fiend's gate itself — "It's right here in Numbria!" is all you get; (f) "every town's people point onward" (§3.4 rumor lines) is roadmap item 11, not done here. |
| #82 | 🔴 | Low    | **Overworld Phase 1 follow-ups (for Phase 2):** (a) ~~Lumina Field is still its own place~~ done in item 8: it retired, its people and buildings moved into Lumina Village; (b) the Shrine of First Light teaches nothing yet — Old Wren is flavour until field spells land; (c) ~~the one fog bank lifts on *any* crystal~~ done in item 7: each crystal now lifts its own pocket (the shrine road and the Spire ring stay on any crystal, by design); see #100; (d) the world map is a stub: no zoom or scroll, no region names, places listed as text, and ~~zones not on the map (e.g. Numbria) show the nearest place on it~~ (since item 8 every zone has its own icon; the fallback stays for later dungeon floors); (e) overworld critters reuse existing nature/space enemies (their own topics); a regional difficulty pass comes with the full continent; (f) dev-only: `bench … shots` picks each screen by the walkable cell nearest its centre (the hero must stand on open ground), so on maps with big solid areas some strips go unshot — on Dawnreach, rows ~23–28 west of the Village (the Woods icon was checked by hand). Add a camera-only position to the bench before the full continent; (g) Tiled holds only the terrain — places, exits and fog are still coordinates in zones.ts, kept in step by the tests. If moving places around in Tiled gets painful on the full continent, read them from a Tiled object layer instead; (h) a `.tmj` map is one long JSON line, so map changes diff badly in PRs — use `tools/tiled/tiled.py to-ascii` to compare, or add a CI step that prints the ASCII diff. |
| #81 | 🟡 | Med    | CI added (`.github/workflows/ci.yml`: lint + test + build on every PR / push to `main`, check `test`; #88 added the `edge-function` and `migrations` jobs + the bundle check). **Manual step left (GitHub settings, owner only):** add `test` as a required status check in the `main` branch ruleset (source: GitHub Actions) after its first run (the first run, on PR #15, passed — so it is in the picker); optionally keep `Vercel` too. Until then CI reports but doesn't block merges. |
| #80 | 🟡 | Low    | Village expansion: five towns enlarged (Lumina Village +1 screen east; Numbria/Chromaria a south district; Verdara/Gearfall an east district + Gearfall's Clockwork Plaza), 15 new buildings, 21 new townsfolk with sprites, 5 new shops + items (Lucky Clover, Focus Tea, Sunseed Snack, Turbo Coil, Mirror Charm), 10 side quests, 15 secrets and hidden 'H' passages. Follow-ups: (a) ~~the Mirror Charm's bounced hit ignored a shielded enemy's shield~~ fixed in the review pass: it now shatters the shield like any landed hit; (b) secrets are flat rewards — no 'all secrets found' trophy yet; (c) Lumina Field, the Woods, Coast and Depths hamlets were deliberately left as they are; (d) shop clerks stand behind full-width counters, so a secret can never sit behind one (secrets.test enforces reachability); (e) the side-quest NPCs are stationary — none of them roam. |
| #79 | 🟢 | Low    | Character art pass: every UI portrait (dialogue, Sage, HUD + menu Ember, menu hero, battle name tag) now uses the sprite via `CharacterPortrait`; Umbra redesigned as an armoured purple shadow-lord in a white war-helm and drawn at a new 'giant' size tier (64px map / 96px battle), shown oversized over the throne-hall panels. |
| #78 | 🟢 | Low    | ~~**Phase 2 (real dungeons):** the Spire's candle-light overlay places its circle at `player.pos / VIEW_W` (`WorldCanvas.tsx`, the darkness block) — world pixels with no camera offset or zoom. Correct only because every Spire floor is one screen; a scrolling dungeon would put the light in the wrong place.~~ **Fixed 2026-10-07 (#75 item 9):** the circle is placed at `k.toScreen(player.pos)` (camera position and zoom included), the same code now lighting dark places (`ZoneDef.dark`); unchanged on the one-screen Spire floors. |
| #77 | 🟢 | Low    | **Fixed (overworld Phase 1, 2026-10-06).** Bench cleanup from the Phase 0 code review (dev-only `hazel-game/bench/`): (a) Vite's stderr is inherited instead of piped-and-unread, so a noisy run can't fill the pipe and hang it; (b) if Vite never prints its ready line, the startup timeout kills it before rejecting; (c) `diff` sets exit code 1 when any shot differs; (d) `world.tsx`'s frame sampler is capped (`MAX_SAMPLES`) and keeps a running max, so a long-open tab can't hit a RangeError. Also new: the bench follows exits between zones, reports `{zoneId, exits, pos}` via `__bench.state()`, and takes `flags=` (e.g. to lift fog). |
| #76 | 🟢 | Low    | **Fixed (overworld Phase 0, 2026-10-05).** Field ↔ Village geography: both ends of the link were **north** exits, so you walked north to go either way and the screen slid north both ways. The Field's road to the Village now leaves from its **south** edge (cells 2–3, row 13) and the Village's north exit lands at the Field's bottom-left (3,12); the old north road stub is grass. Regression test: zones.test "walking out one edge brings you in through the opposite edge" (every other exit pair already passed). Still true: the zones can't all be laid out on one flat map (the Village and Gearfall both overlap Chromaria) — that goes away when the overworld replaces the Field hub (`docs/ROADMAP-OVERWORLD.md` Phase 2). |
| #75 | 🟡 | Epic   | Overworld: grow the world from 18 hub-and-spoke screens into a two-scale DQ3/FF2-style world map (enterable towns/caves/shrines, two continents + islands, walk → boat → Ember flight → descend, fog that lifts per crystal). Plan: `docs/ROADMAP-OVERWORLD.md`. Re-sequences `ROADMAP-4X.md` (Act II waits for the home continent). Blocking risk: `WorldCanvas` builds one KaPlay object per tile — chunked rendering must land before any big map. **Decided 2026-10-05:** retire Lumina Field as a hub (its people + buildings move to Lumina Village, Phase 2); an inn in every town (reverses #73); `ROADMAP-4X.md` Wave 1 (Act II) paused until Dawnreach exists. **Phase 0 (2026-10-05):** big-map renderer done — terrain is drawn by ONE object that paints only the cells in view (`lib/terrain.ts`), roofs are one object per building; 160×112 map 3.2 → 60 fps (0.5 → 37 fps at 4× CPU throttle) in headless Chromium, every zone + Spire floor pixel-identical to before; bench in `hazel-game/bench/`. #76 fixed. Open: real-device check (TC-326); roadmap §8 decisions 5–9; save v2 lands with the first feature that needs it (Phase 1/2). **Reviews (2026-10-05/06):** two `/saas-code-review` passes on Phase 0 — no player-facing bugs; fixed: multi-gate-safe exit check (`edgeLinkProblem`), zoom-aware culling + camera clamp (`worldView`), full exit-test failure messages; logged #77 (bench cleanup) and #78 (candle-light vs camera). **Phase 1 (2026-10-06):** the Dawnreach vertical slice — a 64×48 overworld (`dawnreach`) with 8 places (Village, Field, Woods, Depths cave, Grove, Spire, Coast, Shrine of First Light), zone kinds (`ZoneDef.kind`) picking fade vs slide and the music, a fog bank that lifts on any crystal, a stub world map in the menu, and the shrine (`dawn-shrine`). Every old Village/Field/Woods/Coast/Depths/Grove/Spire link to another place now goes through Dawnreach. Decisions 5–6 taken as recommended (visible monsters only, same 32px tiles); 7 (Tiled) waits for the full continent, so the slice is ASCII. Follow-ups: #82. **Item 3 done (2026-10-06):** rounded coasts/beaches/roads by edge blending (#71b) — Dawnreach walks ~5% slower unthrottled / ~12% at 4× throttle in headless software GL; recheck on a real device with TC-326. **Item 5 done (2026-10-07):** Dawnreach's terrain is painted in Tiled (`content/maps/dawnreach.tmj`, read by `tiledRows`); guide in `docs/MAP-AUTHORING.md`. **Item 6 done (2026-10-07):** wayfinding — a 🚩 on the next goal in the menu map with the way there, two crossroads signposts on Dawnreach, and "where to next?" lines from Elder Lumen, Grandmother Wick and Scout Tamsin, all from `lib/wayfinding.ts`; follow-ups #83. **Item 7 done (2026-10-07):** fog banks — each crystal lifts its own fog pocket (a chest on its topic), the first crystal also the shrine road and a new ring over the Spire grounds; a lift plays on screen once (camera pan, toast, storybook panel); follow-ups #100. **Item 8 done (2026-10-07):** Act I re-staged — Dawnreach grew to 80×60 with the four crystal regions at its corners (each its own icon, its fog pocket beside it, a critter from it roaming near), Lumina Field retired into a new east end of Lumina Village (home, `HUB_ZONE`), and save v2 (the first version bump) moves old saves; follow-ups #101. **Item 9 done (2026-10-07):** field spells — 🏠 Return (fly to a visited town), 🔆 Glow (light a dark place for good) and 🕊️ Calm (critters let you pass for a minute) — each taught at its own roadside shrine by a 3-question trial and cast from the menu; the new Echo Mine can't be explored without Glow; follow-ups #102. **Item 10 done (2026-10-07):** real dungeons — floors are ordinary zones joined by stairs (`>` / `<`, `content/dungeons.ts`); the Clockwork Depths became three floors (B1 unchanged, B2 the dim two-screen Gear Halls with a dark side hall, B3 the Titan's Forge with the boss at the bottom); the Spire numbers its floors the same way; follow-ups #103. **Item 11 done (2026-10-07):** inns everywhere — Numbria, Verdara, Gearfall Canyon and Chromaria each got an inn and innkeeper (three of them grew a street south for it), a traveler wanders each crystal town, every town has someone who names another place, and a defeat (battle or Spire) wakes you inside the last inn you rested at (`lastRest`); follow-ups #104. **Item 12 done (2026-10-08):** regional difficulty — each zone has a danger tier by story leg (home 0 … Chromaria 4) that scales its enemies' HP, blows, power-move rate, coins and win XP, never their questions; the map and the battle HUD show "Lv 4 !!", the first fight per tier explains the marks, and mercy far from home eases the fight too; follow-ups #105. **Item 14 started (2026-10-08, slice 14a):** the boat — the morning after the Spire, Old Marlow remembers he's a sailor; a sail (Willow, Verdara), his compass (Mapmaker Atlas, Chromaria) and a rudder (Sage Cog, Gearfall) mend his boat, the Biscuit; board it at his dock on Dawnreach's east coast, sail off the edge into the Silver Shallows (a new sea map: Gull Rock's lighthouse, Sandpiper Cay, the Great Fogbank), land on any beach or dock; follow-ups #107. **Fog UX review (2026-10-07):** 4 findings fixed — the leaving-home panels and Scout Tamsin no longer say the Spire can be seen while it's fogged, the reveal can be skipped, a lift plays the gate chime instead of the level-up fanfare, and toasts sit in a live region so screen readers read them. **Edge-blending reviews (2026-10-07):** 3 findings fixed — roads no longer vanish while a zone's blend sheet loads, sheets load per zone (+ neighbours) instead of all up front, `blendPairFrame` rejects a wrong pair. **Phase 1 reviews (2026-10-06):** `/saas-code-review` + `/saas-ux-review` — 8 findings, all fixed: world-map place emoji + fog legend + article-free caption, position saved on pause (the ⭐ lagged up to ~8 tiles), arrival lock only for places (reduced motion locked every edge), toast time follows text length + no early hide, shorter fog hint, 11 px place names, a ✕ at the top of the menu. |
| #74 | 🟡 | Low    | Review fixes applied: short-batch softlock → retryable error, exploring re-enabled on every phase change, Menu hidden mid-climb + new 🚪 Leave the Spire, 250ms double-tap guard on panels. Original: The Spire is five walkable, spooky floors (rune seals, stairs, candle-light, per-floor music, Umbra on the throne). Follow-ups: (a) the spooky tracks were checked by measurement, not by ear; (b) the hero has no corner-assist, so 2-tile corridors next to shelves/walls need the player to line up (seen while scripting the playthrough); (c) a wrong answer still breaks the seal (kept the old "every question advances" rule) — revisit if the climb feels too easy; (d) no transition between floors beyond the taunt panel (a fade would be nice); (e) floors don't show Ember's facing / wanderers — they are deliberately empty and quiet. |
| #73 | 🟡 | Med    | Every place unique: one Inn (village), one Library (field), six distinct shops (each item sold once), 3 new battle items, per-place layouts + architecture styles. Follow-ups: (a) ~~potions only on Lumina Field~~ — Tadpole's Tonics (Verdara) now also sells them (`SHARED_STOCK`); (b) the battle 🎒 Items menu is covered by typecheck + logic only, not yet played in-browser; (c) Rainbow Ward/Spark Cell/Honey Elixir prices are first guesses; (d) Moonwell Grove and the Crystal Spire deliberately have no buildings (wild grove / the tower); (e) the Spire climb doesn't offer battle items. **Update 2026-10-05:** the one-inn rule is reversed by #75 — every town gets an inn when towns move onto the overworld (Phase 2); `zones.test.ts` one-inn check changes then. |
| #72 | 🟡 | Low    | Lumina Village is now a scrolling 44×28 town with 4 enterable buildings (roof fades when inside; counter talk). Follow-ups: (a) ~~duplicated services~~ resolved by #73; (b) ~~zone changes hard-cut~~ done — Zelda-style slide (edge exits only; a future interior exit/door-warp would need a fade); (c) only the town scrolls — other zones stay one screen; (d) NPC name labels can overlap furniture indoors; (e) ambient speech bubbles render above roofs (only matters if a chatty NPC is ever placed indoors). |
| #71 | 🟡 | Low    | 16-bit asset set generated (`tools/assets/`): every hero/Ember stage/enemy/NPC sprite, 11 zone tilesets + props + Spire, per-zone battle backdrops, and chiptune SFX + music loops. Follow-ups: (a) ~~no up/down walk cycles~~ done — 4-way facing (beasts, flyers, crabs, serpents, demons, whale, octopus, seal still reuse side art for up/down); zone changes now slide (#72 follow-up); (b) ~~no autotiling, so water/path edges are hard squares~~ done (2026-10-06, #75 item 3) — edge blending rounds coasts, beaches and roads (`blendLayer`); Spire pits stay square on purpose; (c) music is procedurally composed and was checked numerically, not by ear — swap any track via `MUSIC_SOURCES` if one grates; (d) the Spire climb overlay has no backdrop art yet; (e) zones are still fixed 22×14 single screens — a true scrolling camera (bigger maps + `k.camPos` follow) is engine work, not assets. |
| #70 | 🟢 | Low    | **Resolved by #87** (kept in the #99 port — the arena only delays the *displayed* HP now; the store is written at once). Battle tap-race: a delayed 260ms `setHp` could clobber a potion heal / healer mend. HP, charge, guard and shield now live in `battleStore` and every command reads + writes them synchronously; only cosmetic effects are delayed |
| #69 | 🟡 | Med    | Wave 0.5: enemy behavior archetypes shipped (`EnemyBehavior`: shielded/trickster/healer) with three existing +1-tier critters retuned as the first users (Relic Golem 🛡, Pixel Witch 🎭, Moon Moth 💚) — a mild live difficulty change, announced in-battle via the phase banner so it's never a gotcha. **Open:** (a) the "swift"/timed archetype is deliberately unbuilt pending the STORY-4X §12 timer decision; (b) ~~archetype logic lives in `BattleArena` component state~~ extracted to the pure `lib/battleTurn.ts` resolvers (#87); (c) healer stall-check is test-guarded for today's stat ranges only (battleMath.test) — re-verify if HP formulas change. |
| #68 | 🟢 | Low    | **Won't do (product decision 2026-09-26):** questions are never pruned — the bank should keep growing so different children get variety. Revisit only for storage cost, and then add an index, not deletion |
| #67 | 🟢 | Med    | Wave 0.4 + follow-up. Topic whitelist + persona lines have a canonical copy in `supabase/functions/_shared/topics.ts` (imported by the app via `src/content/topicPrompts.ts`, with a compile-time `Topic` ≡ `TopicId` lock + test). **The edge function keeps its OWN inline copy** of that table (reverted from a `../_shared` import) so `generate-questions/index.ts` stays a single self-contained file — a sibling `_shared` import fails to bundle on non-CLI/dashboard deploys with `Module not found "_shared/topics.ts"` (hit live 2026-07-07). Drift between the function's inline copy and the canonical source is caught by `topicPrompts.test.ts` (reads the function file via `?raw` and asserts every id + persona is present). Net: deploy the function ANY way (CLI, dashboard, API); adding a topic means editing both the `_shared` table and the function's inline block, and the test fails if you forget. |
| #66 | 🟢 | Low    | Wave 0.3: `ZoneId` now derives from `ZONE_IDS` in `content/zones.ts` (types/index.ts re-exports it type-only — the circular import is erased at compile time). Adding a zone touches only zones.ts; the `Record<ZoneId, ZoneDef>` shape + zones.test enforce id/entry consistency. **Not done (deliberate):** lazy per-region zone loading — all 11 maps still load eagerly, fine at this scale; revisit when Act III's ~10 island zones land (ROADMAP-4X Wave 3). |
| #65 | 🟢 | Med    | Wave 0.2: versioned save-migration ladder (`runMigrations`/`MIGRATIONS`, `lib/save.ts`) runs inside `normalizeSave`, so both load paths (Supabase + localStorage) upgrade old payloads step-by-step before field coercion. The ladder is empty while `SAVE_VERSION` is 1 — the first real save-shape change (e.g. Wave 2 party state) must bump the version, add a step, and add a real-v1-fixture test. Reminder from #53: drop the vestigial `sageEquipped` on that same bump. |
| #64 | 🟡 | Low    | Wave 0.1 (4× expansion, `docs/ROADMAP-4X.md`): crystal count is now registry-derived — `CRYSTAL_TOPIC_IDS`/`TOTAL_CRYSTALS` in `types/index.ts` are the single source of truth; `EMBER_STAGE_AT` (`story.ts`) replaces the literal `>=2`/`>=4` Ember thresholds. **Note for Act II:** `EMBER_STAGE_AT` derives whelp=`ceil(TOTAL/2)`, dragon=`TOTAL` — when crystal #5 ships, re-tune this table explicitly per `STORY-4X.md` §8 (whelp 2 / dragon 4 / flight 5 / radiant 6) instead of accepting the derived drift. `TOPIC_REGISTRY` completeness vs `CRYSTAL_TOPIC_IDS` is test-enforced (not compiler-enforced — it's an array, not a Record). |
| #63 | 🟡 | Low    | Wandering NPCs/enemies (`lib/wander.ts` + `WorldCanvas`) use a simple leashed random walk. Self-review fixed two real issues: (a) a wandering NPC could re-open dialogue on a *standing* player after the cooldown — the old `player.pos -= dir*10` nudge is a no-op when the NPC walks into a motionless hero (dir = 0); now the NPC is pushed clear of the contact radius on talk. (b) A leash/steer-home correction could seat a sprite inside a wall; collision is now tested on the clamped target. Follow-ups resolved: ambient bubbles render a light pill behind dark text (readable on any ground); wander tuning moved to `WANDER_TUNING`/`AMBIENT_TUNING` in `lib/wander.ts`; and wanderers now avoid overlapping every other character — other wanderers, stationary NPCs, the boss, the Spire — via `approachBlocked` (`lib/wander.ts`) using per-actor footprint radii (`ACTOR_RADIUS`), with the wall check widened to the sprite footprint (`WANDER_WALL_HALF`). Wanderers deliberately do NOT avoid the player (bump-to-interact preserved) or Ember (companion). **Still open (low):** a wandering enemy can initiate a battle by walking into the player (intended — note for difficulty tuning). |
| #62 | 🟢 | Med    | Music went silent after a page refresh: settings were still "on", but the browser autoplay policy blocks `play()` until a user gesture, and the engine never retried once the player clicked. Fixed in `lib/audio.ts` with `armUnlock()` — a one-time gesture listener that (re)starts the intended track. SFX unaffected (fire on gestures). |
| #61 | 🟡 | High   | XP / level (and skill levels) reset to 1 / blank on refresh. The profile lived only in Supabase; writes were silently failing (the live DB is missing the profile `update` RLS policy and/or the 0002/0004/0007 columns, so updates affect 0 rows with no error), and `loadProfile`'s fallback upserted a **zeroed default over the real row**, permanently destroying XP. Code fixed: non-destructive load + localStorage write-through + merge-by-max + surfaced `remoteError`. **Still TODO:** apply migrations 0001–0008 to the production Supabase so writes persist remotely. Existing wiped rows are only recoverable via Supabase PITR/backup. |
| #60 | 🟢 | Low    | **Resolved by #71:** every SFX + music track now has a generated 16-bit file in `public/audio/16bit/`, and attack/select are wired. Original note: Audio scaffold shipped (Howler engine + settings store + menu toggles, off by default). Real mp3s now wired for overworld/battle/boss/spire/final-boss music + hit/wrong/levelup/victory SFX. Still silent (no file): correct / gate / chest / attack / select SFX and title music; plus per-track volume sliders unwired. Files sit flat in `public/audio/` (not the `sfx/`,`music/` subdirs the README describes). See `public/audio/README.md`. |

---

## Details

### #1 — Auth is cosmetic 🟢 High — RESOLVED (2026-05-17)
`authStore` was never populated; nothing checked a real session. **Fixed:**
`useAuthInit` calls `getSession()` + subscribes to `onAuthStateChange`; `App.tsx`
gates on `authStore.session` — no session means only `AuthPage` renders,
regardless of the persisted game phase. Regression test: TC-R1.

### #2 — Pass threshold math 🟢 High — RESOLVED (2026-05-17)
`PASS_THRESHOLD` was `0.82`, so 4/5 (0.80) failed — a perfect 5/5 was required
despite the UI saying "82%+". **Fixed:** threshold lowered to `0.8` (4 of 5),
and `TopicSelect` copy now derives its numbers from `PASS_THRESHOLD` /
`ROUNDS_TO_UNLOCK` instead of hardcoding "3" and "82%", so it can't drift again.
Regression test: TC-R2.

### #3 — Boots crash without env 🟢 High — RESOLVED (2026-05-17)
`src/lib/supabase.ts` now checks for `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` and throws a clear, actionable error pointing to
`.env.example` when they are missing — instead of a cryptic `createClient`
crash. A real `hazel-game/.env` (gitignored) holds the project credentials.
Regression test: TC-R3.

### #4 — Tests not wired 🟢 Med — RESOLVED (2026-05-17)
Vitest is wired: `test` block in `vite.config.ts` (jsdom), setup file
`src/test/setup.ts` (jest-dom matchers + RTL cleanup), and `test` /
`test:watch` / `test:ui` scripts. 21 cases automated across `utils`, `age`,
`gameStore`, and `StatusScreens` — `npm test` is green.

### #5 — PWA not configured 🔴 Med
`vite-plugin-pwa` is installed but `vite.config.ts` only registers the React
plugin. No manifest, no service worker. **Fix:** wire the plugin or drop the dep.

### #6 — Sign-up confirmation 🟢 Med — RESOLVED (2026-05-17)
`AuthPage` now inspects `data.session` after `signUp`. A null session (email
confirmation required) shows a "check your email" notice and switches to the
sign-in view instead of entering the game. Regression test: TC-R4.

**Note:** whether confirmation is required depends on the Supabase project's
Auth settings (Authentication → Providers → Email → "Confirm email").

### #7 — Hardcoded questions 🟢 Med — RESOLVED (2026-05-17)
The `SAMPLE_QUESTIONS` / `BATTLE_QUESTIONS` literals are gone. `QuizRound` and
`BattleArena` load AI-generated questions via `useGeneratedQuestions` →
`fetchQuestions` → the `generate-questions` edge function, with loading and
error/retry states. Requires the function to be deployed (#16).

### #8 — Battle state not persisted 🟢 Low — RESOLVED (2026-05-17)
**Resolved by decision:** battles are independent — the player starts at full
HP every battle. Carrying damage across battles would need a healing mechanic
to avoid a death spiral, which is unfriendly for a kids' game. `WorldMap` now
calls `startBattle(npc, avatar.maxHp)` explicitly, and the redundant `hp`
fields (always equal to `maxHp`) were removed from the `Avatar` and `NPC`
types — `maxHp` is the single source of truth.

### #9 — Dead code 🟢 Low — RESOLVED (2026-05-17)
- ~~`gameStore.reset()` defined but no UI calls it~~ — called by `SignOutButton`.
- ~~`type Phase` in `BattleArena` includes `'result'`~~ — removed in Phase 3.
- ~~`NPC.questions` field unused~~ — removed; battle questions come from
  `fetchQuestions(npc.topic, …)`.

### #10 — Duplicate React plugin 🟢 Low — RESOLVED (2026-05-17)
Both `@vitejs/plugin-react` and `@vitejs/plugin-react-swc` were dependencies.
`@vitejs/plugin-react@6` also peer-required `vite@^8`, which broke `npm install`
against the pinned `vite@5.4`. **Fixed:** removed the unused `@vitejs/plugin-react`
(`vite.config.ts` uses `-swc`). Also aligned `@vitest/ui` from `^4` to `^3` to
match `vitest@3`. Dependencies now install cleanly.

### #11 — Migrate game flow to xstate 🟢 Med — RESOLVED (2026-06-12)
`src/machines/gameFlow.ts` (xstate v5 `setup()`): `boot → topicSelect ⇄ quiz
→ avatarSelect → world ⇄ battle` with world overlay substates. Guards
(`worldUnlocked`, `hasAvatar`) read the save store at transition time —
the guarded transitions that used to leak into `App.tsx` render logic live
in the machine now. Zustand keeps data only. Covered by `gameFlow.test.ts`.

### #12 — Progress not tied to user identity 🟢 Med — RESOLVED (2026-06-12)
Progress lives in the per-player save file: Supabase `saves` row (migration
0008, #38) + localStorage write-through keyed `hazel-save-<userId>`. The old
fixed-key `hazel-game` payload is migrated once (world unlock, passed rounds,
avatar) and ignored thereafter. Shared-tablet players no longer inherit each
other's progress; saves follow the player across devices once 0008 is live.

### #13 — Upgrade Vite 5 → 8 🟢 Med — RESOLVED (2026-05-17)
Coordinated toolchain bump: `vite` 5.4 → 8.0.13, `vitest` 3 → 4.1.6,
`@vitest/ui` → 4.1.6, `vite-plugin-pwa` → 1.3.0. Also swapped
`@vitejs/plugin-react-swc` → `@vitejs/plugin-react@6` — Vite 8 recommends the
Oxc-based plugin when no SWC plugins are used — and updated `vite.config.ts`.
Lint, build, and dev server all verified green.

### #14 — npm audit vulnerabilities 🟢 Low — RESOLVED (2026-05-17)
The 2 moderate advisories (esbuild dev-server, via Vite 5's toolchain) were
cleared by the Vite 8 upgrade (#13). `npm audit` now reports 0 vulnerabilities.

### #15 — profiles migration must be applied 🟢 High — RESOLVED (2026-05-17)
`0001_create_profiles.sql` applied to the Supabase project (`profiles` table +
`handle_new_user` trigger). Note: any users created before the trigger existed
have no profile row and would need one backfilled.

### #16 — generate-questions edge function must be deployed 🟢 High — RESOLVED (2026-05-17)
The `generate-questions` edge function is deployed; the `ANTHROPIC_API_KEY`
secret is set. JWT verification is on by default, so only signed-in players
can call it. (Runtime errors from the function are now surfaced in full — see #18.)

### #17 — Migration 0002 must be applied 🟢 High — RESOLVED (2026-05-17)
`0002_add_xp.sql` applied to the live Supabase project. `profiles.xp`
exists; profile load + XP/level systems are working end-to-end.

### #20 — No level-up feedback 🟢 Low — RESOLVED (2026-05-17)
`LevelUpModal` celebrates each level-up with confetti and a power-up choice.
"Owed" celebrations are derived from `playerLevel − 1 − powerUpsChosen`, so a
level-up can't be missed (survives reloads, handles multi-level jumps).

### #22 — Quiz advances on a fixed timer 🟢 Low — RESOLVED (2026-05-17)
The timer is gone. After answering, `QuizRound` shows the result + explanation
and a "Next Question" / "See Results" button; the player advances when ready.

### #34 — Apply migration 0006 + redeploy the edge function 🟢 High — RESOLVED (2026-05-17)
`0006_question_views_and_flags.sql` applied and `generate-questions`
redeployed. Per-player dedupe (#24) and flag quarantine (#26) are live.

### #35 — Apply migration 0007 (streak columns) 🟢 High — RESOLVED (2026-05-17)
`0007_add_streak.sql` applied and `generate-questions` redeployed
(also picks up #30's smarter cache mix). The daily-streak hook (#28)
is live end-to-end.

### #36 — "Open World" is a card picker, not a world 🟢 Med — SUPERSEDED by #37 (2026-06-12)
The #37 JRPG build replaced the single-screen MVP with a 5-zone tile world:
multi-screen exits ✅, static obstacles ✅, on-screen d-pad ✅, position
persistence across battles ✅, beaten-enemy tracking ✅, per-topic biomes ✅.
The one surviving follow-up — real sprite sheets/tilesets — moved to #39.
Original MVP notes kept below for the KaPlay integration lessons.

#### Original entry (historical)
**MVP done:** KaPlay 3001 added (lazy-loaded). `WorldMap.tsx` is now a
single 640×480 canvas screen — player avatar walks with arrow keys /
WASD, bumping into an NPC triggers the existing `startBattle()` flow.
Manual position update + clamp + overlap detection (no physics body).
Placeholder graphics (colored rounded rects with emoji labels). Bundle
impact: +70 KB gzip, isolated to the world chunk via `React.lazy`.

**2026-05-26 follow-up fixes:** Removed React `<StrictMode>` (KaPlay's
internal singleton survives `quit()`, so the double-effect-run corrupted
the WebGL context). Switched WorldMap from a `canvas` ref to a `<div>`
ref + KaPlay's `root` option so a fresh canvas is created each mount.
Added `loadingScreen: false, debug: false, focus: false` to suppress
the built-in mascot splash (broken-image artifact under lazy chunks).

**Follow-ups (kept in this issue, status stays 🟡 until they land):**
- Real sprite sheets — Kenney / OpenGameArt CC0 tilesets and a 4-dir
  walk animation for the player.
- Tilemap background — author with the Tiled editor, load via KaPlay
  `loadSprite`/`addLevel`. Today's background is a solid green fill.
- On-screen d-pad for mobile / tablet (keyboard-only right now).
- Multiple screens — walk to the edge → next "room". Zelda-1 mechanic.
- Static obstacles — trees, rocks, water — once the tilemap exists.
- Persist player position across battle round-trips (the kid currently
  respawns at center after each battle).
- Beaten-NPC tracking — defeated NPCs should disappear from the map
  until the next session.
- Optional: distinct biomes per topic (library / lab / studio / workshop).

### #37 — Educational JRPG epic 🟡 Epic — PHASES 0–3 SHIPPED (2026-06-12)
The product vision is a classic NES/SNES-style JRPG (FF1/2/4/6, Dragon
Warrior) where the 2D open world and side-profile battles are powered by the
existing AI question pipeline. Full design, architecture, 5-phase roadmap, and
build-scope live in **`docs/DESIGN-JRPG.md`**.

**Shipped 2026-06-12 (phases 0–3):** xstate game-flow machine (#11), per-user
Supabase save files (#12), topic registry (#33), 5-zone tile overworld with
dialogue/gates/chests/save-crystals/mobile d-pad (supersedes #36), FF-style
command battles with Sages/Specials/charge gauge/boss phases, shop + inn +
library services, coins/badges economy, crystal-restoration arc + ending.
Deploy steps tracked as #38; placeholder-art swap as #39.

**Story pass shipped 2026-06-12:** `docs/STORY.md` bible, opening/hatch/
ending cutscenes, Ember the dragon companion (hatches on first victory,
grows with crystals), Fiend battle dialogue, one mini-quest per zone (#42
tracks quest variety).

**Remaining (phase 4):** audio (#41), PWA (#5), parent dashboard (#29),
friends leaderboard, companions (incl. Ember battle actions), New Game+.

### #38 — Apply migration 0008 + redeploy the edge function 🔴 High
The JRPG build needs `0008_saves.sql` applied (the `saves` table — without it
cloud saves degrade to local-only and the menu shows a warning) and
`supabase functions deploy generate-questions` re-run (optional `context`
flavor hint). Same runbook as #34/#35.

### #39 — Placeholder art → CC0 asset packs 🔴 Med
Everything renders as colored tiles + emoji ("programmer art", decided
2026-06-12). Swap in CC0 packs: Kenney "Tiny Town"/"Pixel Platformer" or
OpenGameArt Zelda-like tilesets for `WorldCanvas` tiles, 4-dir character
sheets for the player, side-profile poses for battle actors, painted
backdrops per topic for `BattleArena`. Wire via KaPlay `loadSprite` +
`<img>` in battle; add a `docs/CREDITS.md` with licenses. Human asset
review/picks needed — see DESIGN-JRPG.md §5.

### #40 — Boss questions don't ramp per phase 🔴 Low
Design says Fiend question difficulty rises each enrage phase; shipped build
ramps damage + dialogue only (questions stay at the boss's level, +1 over
zone mobs). Ramping would need per-phase question pools — an extra fetch per
phase. Revisit after observing real boss-fight pacing with kids.

### #41 — No audio 🔴 Low
howler is installed and unused. Needs CC0 packs (zone themes, battle theme,
victory fanfare, SFX for hits/heals/saves) and a small `lib/audio.ts` with a
mute toggle in the menu. Asset sourcing is the blocker, not code.

### #43 — Review-pass fixes 🟢 Med — RESOLVED (2026-06-12)
A 7-angle bug hunt over the whole JRPG build. Fixed: QuestionCard double-tap
double-resolving battle turns (+ biased hint shuffle, + `correct` passed via
`onContinue` replacing the BattleArena ref channel); legacy `hazel-game` key
consumed after migration so the next account on a shared browser can't
inherit it; quest-step conversations no longer hide a sage's service button
(and the service path applies the step finish); machine RESET clears context;
explicit save flushes after battle end / avatar choice; new content
invariant (no gates/chests in no-topic zones) which caught and removed a
mis-placed hub chest; dead code removed (`calcAttackDamage`, legacy types);
shared helpers `playerAge` / `heroMaxHp` / `emberStatus` / `setFlag` /
`spendHint` replace 12+ duplicated derivations.

Reviewed and explicitly NOT changed (with reasons): per-frame gate/chest
sprite sync in WorldCanvas (required — gates open while the canvas stays
mounted under overlays); Special-tier question prefetch per battle (prefetch
is the point; server cache absorbs cost); path-question refetch on retry
(fresh question per attempt is a design feature); hand-rolled normalizeSave
vs zod (tested, working; revisit if schema churn grows).

### #44 — Battle turns + cutscenes as machine substates 🟡 Low
The design doc sketches battle substates inside the flow machine; the build
keeps turn flow in BattleArena component state and cutscenes as WorldScreen
local overlays (pausedRef union). Fine at current scale, but each new
cutscene/turn-phase adds boilerplate. When phase 4 lands (companions, more
story moments), promote both into the gameFlow machine.

**Battle half addressed by #87 (2026-09-26)**, but deliberately *not* as
gameFlow substates: the fight's rules became pure resolvers in
`lib/battleTurn.ts` (unit-tested, no React), its numbers moved into
`battleStore` (synchronous source of truth), cosmetic timers into
`features/battle/useBattleFx.ts`, and the render into `BattleHud` /
`BattleStage` / `BattleMenus` / `BattleResult`. `BattleArena` now only
sequences the `Turn` union. That gives companions (Wave 2) a pure place to add
actions without growing the component. Promoting the `Turn` union into an
xstate machine is still possible later if companion turn order gets complex.
World cutscenes are unchanged and remain open.

### #88 — Question-generator lockdown, CI, password reset 🟡 High
**Why:** `generate-questions` accepted any caller holding the public anon key
(it's in the web bundle) and called Claude with no limit — a cost/abuse hole.
**Shipped:**
- 401 unless signed in; `begin_question_request` (migration 0009) logs every
  call and enforces a per-player rate (429) plus per-player and global daily
  budgets of fresh questions. Over budget the batch comes from the cache, then
  already-seen cached questions; only an empty cache returns 429.
- Known limits: the per-player lock serializes the check, but `fresh_count`
  is written after generation, so a burst inside one minute can overshoot the
  daily budget by at most (calls/min × batch size). The global budget isn't
  locked across players (can overshoot slightly under heavy parallel load).
  New accounts can still be created freely, which is why the global budget is
  the real ceiling. The `question_requests` log grows by one row per call;
  it's tiny, but it's the one table that may need a cleanup job later (unlike
  `questions`, which is never pruned).
- CI workflow + `supabase/ci/` (Supabase stub, `quota.test.sql`).
- Password reset (AuthPage + ResetPasswordPage + recovery detection).
**Easiest path:** paste `supabase/apply_all_migrations.sql` into the SQL
Editor (applies + records 0001–0009, safe to re-run).
**To finish (manual):** apply 0009 to production, redeploy the function, add
Redirect URLs, then confirm a signed-out `curl` to the function returns 401.
Also still open from #61: apply 0001–0008 to production if not done.

### #89 — Parent accounts / consent 🔴 High
Kids create their own email/password accounts and enter a birth date. For a
product used by other families this needs a parent-first model (parent
account → child profiles, PIN or picture login for kids) and a consent flow.
Needs a product/legal decision before building.

### #87 — Tech-debt pass 🟢 Low — RESOLVED (2026-09-26)
- **#70 tap-race fixed.** Root cause: `BattleArena` applied the enemy's hit in
  a 260ms `setTimeout` that wrote render-captured HP, so a kid tapping
  through and drinking a potion could lose the heal (or a healer's mend).
  Now every command resolves against `combatState()` read from the store at
  that moment and writes the result back immediately; the timers only drive
  floats/SFX (`useBattleFx`, cleared on unmount). Victory/flee also read the
  store for the HP they save. Regression-tested in `battleTurn.test` and the
  `BattleArena.test` smoke test.
- **Behavior notes:** HP bars now start moving at the lunge rather than at
  impact (they animate either way). Victory XP is computed once and shown
  from the same number (was a duplicated formula in the render).
- **Unused packages removed (22):** @hookform/resolvers, @tailwindcss/typography,
  @tanstack/react-query, @tanstack/react-table, class-variance-authority, cmdk,
  date-fns, embla-carousel-react, katex, lottie-react, lucide-react,
  next-themes, react-hook-form, react-katex, react-router-dom, recharts,
  sonner, tailwindcss-animate, vaul, zod, vite-plugin-pwa,
  @testing-library/user-event. Re-add when a feature adopts one (react-router
  + recharts for the parent dashboard #29, vite-plugin-pwa for #5).
- **README** rewritten for the game (was the Vite template).
- **#68 closed as won't-do:** the question bank is meant to grow.
- **Review follow-up:** the #70 test was hardened with fake timers (it previously
  asserted before any timer could fire); `BattleArena` now uses a `useShallow`
  store selector.

### #45 — World canvas: black lines, click-to-focus, too small 🟢 High — RESOLVED (2026-06-13)
Three problems with the KaPlay overworld surfaced in live play:
- **Black lines through everything on a screen change.** Root cause is
  KaPlay's app state (`a`) being a *module-global singleton* whose `quit()`
  is deferred to frame-end and never clears `a.k`. `WorldCanvas` was keyed
  `${zoneId}|${ember}` (remount per zone) and re-`kaplay()`-ed on every world
  mount, so a previous instance's pending `quit()` tore down the *new* canvas.
  This is the same singleton trap as the 2026-05-26 StrictMode fix (#36),
  re-triggered first by zone changes and then by `world → battle → world`
  re-entry. **Fix:** call `kaplay()` exactly ONCE per session
  (module-level `sharedKaplay`), drop the remount `key`, rebuild the scene
  per zone with `destroyAll('*')`, and re-parent the cached canvas on every
  later mount. No code path calls `kaplay()` twice anymore.
- **Had to click the canvas before the keys moved the hero.** KaPlay binds
  keys to its canvas (run with `focus:false`), so they only fired once the
  canvas had focus. **Fix:** window-level `keydown`/`keyup` listeners drive
  movement (works whenever the window is focused), `preventDefault` on the
  arrows (no page scroll), clear-on-blur (no stuck keys after alt-tab).
- **Canvas felt small.** It rendered at a fixed 704×448. **Fix:** the stage is
  now responsive — `min(96vw, (100dvh − 220px) × 11/7)`, aspect-locked to the
  zone's 11:7, the canvas upscaled crisply (`image-rendering: pixelated`) from
  the unchanged internal resolution.

Lesson (third time KaPlay's singleton has bitten): **never construct a second
KaPlay instance in the same page — one per session, reuse it.**

### #42 — Mini-quest pattern is uniform 🟢 Low — RESOLVED (2026-06-12)
Quests are now ordered steps with three mechanics: chest steps, **defeat
steps** (lifetime per-enemy kill counts in `save.kills`, written on battle
victory), and **talk steps** (a step-target NPC speaks its own lines and
advances the quest — used for deliveries via the new `save.questItems`
carried-item slot). The five quests use every mechanic: chest fetch
(Numbria), 3-critter defeat with a remaining-targets hint (Verdara),
chest→polish→report multi-step (Gearfall), seed delivery (Chromaria), and
a cross-zone hub defeat quest from Pip. The menu gained a quest log +
carried-items row. See STORY.md §6.

### #33 — Topic set is hardcoded 🟢 Low — RESOLVED (2026-06-12)
`src/content/topics.ts` ships `TOPIC_REGISTRY` (id, label, emoji, colors,
crystal/fiend fiction, zone id) — UI and world content derive from it.
Adding a topic = one registry entry + a zone in `zones.ts` + a persona line
in the edge function's system prompt (the `Topic` union and the function's
`TOPICS` list still need their one-line additions; acceptable).

### #32 — Battles don't move the skill ramp 🟢 Low — RESOLVED (2026-05-17)
`lib/age.ts` ships `nextSkillLevelFromBattle(current, answers)` — same
shape as `nextSkillLevel` but clamped to never lower the current skill
(NPCs scale to age, not skill, so a tough loss shouldn't make the next
quiz easier and punish the kid twice). `BattleArena.finishBattle` reads
the player's current topic skill (`skillLevelFor` falls back to age start
for never-played topics) and writes the new value via `setSkillLevel`
only when it changed. Regression tests: TC-108..TC-110. No deploy needed.

### #31 — Loading screen dead air 🟢 Low — RESOLVED (2026-05-17)
`lib/funFacts.ts` ships a per-topic pool (5 facts each for math, science,
engineering, creativity) plus generic fallbacks. `LoadingScreen` now takes
an optional `topic` prop, starts on a random index, and rotates a fact
every 4 seconds with a fade transition (Framer Motion `AnimatePresence`).
`QuizRound` and `BattleArena` both pass their topic. Regression test:
TC-89..91 (automated).

### #30 — Random cache-vs-AI mix 🟢 Low — RESOLVED (2026-05-17)
Edge function now uses `chooseFreshCount(count, cacheSize)`: empty cache
→ all fresh; rich cache (≥3× count rows available) → ~20% fresh for
novelty, rest reused; thin cache → use what's there, generate the rest.
Cuts ~30-40% of Claude calls on a well-populated cache while keeping
enough novelty that the cache keeps growing. Per-session cost cap not
implemented (would need session tracking) — explicitly deferred until
cost data shows it matters. Awaits `supabase functions deploy
generate-questions` to ship.

### #29 — No parent dashboard 🔴 Med
Parents are the buyers; right now they can see literally nothing of their
kid's progress, missed questions, or topic strengths. A single read-only
`/parent` page (XP timeline, per-topic skill levels, recent missed questions,
last-7-days streak) converts the product from "kids' game" to "kids' game
parents will pay for". Data is already in Supabase — mostly UI work. Auth
question to resolve: separate parent account vs. same account with a
passcode-gated view.

### #28 — No daily-streak hook 🟢 Low — RESOLVED (2026-05-17)
Migration `0007_add_streak.sql` adds `current_streak`, `longest_streak`,
`last_played_on` (date) to `profiles`. `lib/streak.ts` ships pure date
math (`todayIso`, `isoOffset`, `nextStreak`) — same-day → unchanged,
yesterday → +1, older → 1. `profileStore.recordActivity()` runs from both
`QuizRound.finishRound` and `BattleArena.finishBattle`. `StreakBadge`
shows 🔥 + day count below the level medallion, with a "Best streak!"
callout when current ties longest. No streak-freeze yet — explicitly
deferred to keep the first ship simple. Regression tests: TC-92..TC-100.
Awaits deployment of migration 0007 (#35).

### #27 — Power-up stacking goes infinite 🟢 Low — RESOLVED (2026-05-17)
Both fixes shipped: `effectiveStacks` in `lib/powerups.ts` gives full
credit through stack 5, half through 10, quarter past 10 — bonuses
asymptote instead of growing linearly. `choicesForLevel(level, 2)`
deterministically offers 2 of 4 power-ups per level (seeded by level so
refresh can't reroll), and `LevelUpModal` uses it. Combat-bias is now
the player's deliberate choice within the available pair rather than an
auto-stack. Regression tests: TC-101..TC-107. Pure code change; no
migration or redeploy needed.

### #26 — No flag-a-question feedback loop 🟢 Med — RESOLVED (2026-05-17)
Migration `0006_question_views_and_flags.sql` adds `question_flags`
(`question_id`, `profile_id`, optional `reason`, `created_at`); RLS limits
`INSERT` to `auth.uid() = profile_id`. `lib/questions.ts` `flagQuestion(id,
reason?)` does the direct RLS-protected insert — no edge function needed.
`components/FlagButton.tsx` is a 3-reason picker (wrong / confusing /
difficulty) inline with the post-answer explanation in `QuizRound`. The
edge function reads `question_flags` and excludes flagged rows from the
cache pool (single-strike quarantine — easy to relax later). Regression
test: TC-R7. Awaits deployment of migration 0006 (#34).

### #25 — No "missed questions" recap 🟢 Low — RESOLVED (2026-05-17)
`QuizRound`'s round-result screen now shows a "What you missed" section:
each wrong question with the player's pick (now tracked in a new `picks`
state), the correct answer, and the explanation. Section is omitted when
the round was perfect. Regression test: TC-88 (manual). No backend
dependency — ships with the next build.

### #24 — Question cache has no per-player dedupe 🟢 Med — RESOLVED (2026-05-17)
Migration `0006_question_views_and_flags.sql` adds `question_views`
(`profile_id`, `question_id`, `seen_at`) with a `(profile_id, seen_at desc)`
index. The edge function now extracts `auth.uid()` from the caller's JWT,
reads the most recent 100 view rows for that profile (`SEEN_HISTORY_LIMIT`),
excludes those IDs from the cache pool, and writes a view row per question
returned. Synthetic `fresh-…` IDs are skipped on the view insert so a
failed cache insert doesn't FK-violate the view insert. Soft cap chosen
over hard-never-repeat to keep the cache pool viable. Regression test:
TC-R6. Awaits deployment of migration 0006 (#34).

### #23 — Question cache insert denied 🟢 High — RESOLVED (2026-05-17)
`0005_questions_grants.sql` applied. `service_role` now has explicit
`SELECT/INSERT/UPDATE` on `questions` and `EXECUTE` on
`increment_question_usage`. Cache writes succeed; `questions` row count
climbs after each new-question round.

### #21 — Migration 0004 must be applied 🟢 High — RESOLVED (2026-05-17)
`0004_power_ups.sql` applied. `profiles.power_ups` column exists; profile
load + power-up stack tracking work end-to-end.

### #19 — Apply migration 0003 + redeploy the edge function 🟢 High — RESOLVED (2026-05-17)
`0003_questions_cache.sql` applied and `generate-questions` redeployed.
The `questions` cache table + `increment_question_usage` RPC are live;
the rewritten edge function (cache + always-include-detail errors) is
serving traffic.

### #18 — Generic errors hide the real cause 🟢 Med — RESOLVED (2026-05-17)
`lib/errors.ts` added: `errorMessage` (sync — any error value → its real
message, including a Supabase error's `code`/`details`/`hint`) and
`resolveErrorMessage` (async — unwraps a `FunctionsHttpError` by reading the
edge function's response body, so the function's real `{error, detail}` is
shown instead of "non-2xx status code"). Wired into `fetchQuestions`,
`useGeneratedQuestions`, `profileStore`, and `AuthPage`. An `ErrorBoundary`
wraps the app — uncaught render errors show the real message (+ stack in dev)
instead of a blank screen. The edge function's catch-all always returns a
`detail` now.

### #50 — World + story expansion 🟢 Med — RESOLVED (2026-06-15)
The world grew from 5 zones to 10 and the narrative roughly doubled.
- **5 new zones** (`content/zones.ts`), all topic-less story/exploration
  screens (no enemies/gates/chests — those need a topic), reached through a
  new **Lumina Village** crossroads: Village ↔ Whispering Woods ↔ Clockwork
  Depths, Village ↔ Starfall Coast, Village ↔ The Crystal Spire. The hub gains
  ONE new exit (top edge, cols 2-3) to the Village; everything else branches
  off zones I authored fresh, so the change to existing maps is minimal. All
  maps stay 22×14 (the shared KaPlay canvas is sized once from the first zone).
- **11 new NPCs** (`content/npcs.ts`) with multi-line, flag-reactive dialogue.
- **New cutscenes** (`content/story.ts`): a per-Fiend `CRYSTAL_PANELS`
  (plays when each crystal is restored), `SPIRE_PANELS` (the Spire wakes after
  the first crystal), a longer `INTRO_PANELS` (village + Spire setup) and
  `endingPanels` (Spire convergence + village/coast callbacks). `WorldScreen`
  picks exactly one due cutscene per render: intro → hatch → crystal → spire →
  ending. New flags: `crystal-<topic>-scene-seen`, `spire-awake-seen`.
- New zone-graph tests (reachable-from-hub BFS + no one-way traps) guard the
  topology. See #52 for the (intentional) lack of combat in the new zones.

### #51 — Spellbook (cast-any-spell) battle system 🟢 Med — RESOLVED (2026-06-15)
The single equipped-Sage "Special" became a **Spellbook**: the hero learns a
growing set of spells and casts ANY of them in battle by answering one
*super-hard* question (`SPELL_LEVEL_BONUS = 3` levels above the enemy).
- `content/spells.ts`: a `Spell` type (`damage` / `heal` / `shield` effects),
  a charge (◆) cost per spell, and `spellsKnown(save)` — derived from the save
  (always Mend; each met Sage's signature strike; Aegis at the first crystal;
  Ember's Breath when Ember is full-grown). No new save field, so older saves
  light up automatically.
- `BattleArena`: the **Spells** command opens a spell-select menu; choosing a
  spell asks one super-hard question (pool warmed at `level + SPELL_LEVEL_BONUS`).
  Correct → effect + spend charge; a miss fizzles and **refunds the charge**.
  `CHARGE_MAX` raised 3 → 4 to fit Ember's Breath. `lib/battleMath.spellDamage`
  scales basic attack by the spell's multiplier.
- `MenuOverlay` shows the Spellbook (read-only); the Sage service copy now
  says "added to your Spellbook" and drops the vestigial Equip button.
- `sageEquipped` is kept for save compatibility but no longer read for casting
  (see #53).

### #55 — Themed zones + Spire endgame + villain 🟢 High — RESOLVED (2026-06-15)
The expansion zones got question topics, and the world got a true finale.
- **Topic decoupling:** `Topic` splits into `CrystalTopic` (math/science/
  engineering/creativity — crystal/Fiend/Sage/ending logic) and the wider
  `Topic` (+nature/space/history). `topics.ts`: `TOPIC_REGISTRY` (crystal four,
  with crystal fields) + `EXTRA_TOPICS` (styling-only); `topicInfo` resolves
  all seven, `crystalInfo` the four. `SAGES`/`BOSS_LINES`/`CRYSTAL_PANELS` and
  `save.sages`/`sageEquipped` are `CrystalTopic`-typed (normalizeSave casts;
  older saves unaffected — no DB migration, saves are JSONB).
- **Themed combat zones:** Whispering Woods (nature), Starfall Coast (space),
  Clockwork Depths (history) each got `topic` + 3 roaming critters + a gate +
  a riddle-chest, laid out so the gate/chest is an optional alcove and the
  spawn + exits stay reachable (zones.test enforces this). New fun-facts +
  edge-function personas for the three topics.
- **The Crystal Spire:** `ZoneDef.spire` marks an icon (rendered + bump-handled
  in `WorldCanvas`, new `onSpire` callback). Bumping opens `SpireOverlay`,
  sealed until 4 crystals. The climb (`content/spire.ts`): escalating floors
  (level + rotating topics), candle-lights (`SPIRE_LIVES`) for wrong answers,
  and a final boss — Umbra. Clear → `SPIRE_CLEARED` (+XP, healed); lose → cast
  back to the hub, healed. New machine substate `world.spire` (`OPEN_SPIRE`).
- **Villain arc:** crystal cutscenes end on 🌑 omen panels revealing Umbra; the
  four-crystal `endingPanels` became the call to climb; `spireVictoryPanels`
  is the post-boss true finale. Flags `spire-cleared` / `spire-victory-seen`.
- Tuning lives in `content/spire.ts` (floors, lives, XP); 8 new tests
  (topics decoupling, Spire floors, villain arc). See #57 (deploy) and #56.

### #58 — Warden bosses + gate keys 🟢 High — RESOLVED (2026-06-15)
The 3 themed zones became prerequisites for 3 of the 4 crystals.
- **Wardens:** one boss per themed zone (`enemies.ts`, `levelOffset +1`, same
  band as the Fiends) — Thicket Warden, Tide Colossus, Clockwork Titan.
- **Keys (`content/keys.ts`):** beating a warden sets `keyFlag(id)` and adds the
  key to `save.badges`. `GATE_KEYS` maps boss→key→Fiend gate (woods→verdara,
  depths→gearfall, coast→chromaria); `keyForBoss`/`keyForZone`/`bossDefeated`.
- **Gating:** the crystal zone's Fiend gate is marked `ZoneDef.keyGate`;
  `WorldCanvas` routes a bump there to `PathTarget.kind:'keygate'` →
  `KeyGateOverlay` (opens with the key, or names the warden to beat). The gate
  uses the same `gateFlag` so existing passability logic is unchanged. Numbria's
  Fiend stays a question gate (the guaranteed first crystal — no soft-lock since
  themed zones are reachable from the start via the village).
- **BattleArena:** boss intro + victory branch on `keyForBoss(enemy.id)` —
  wardens grant the key (not a crystal) with their own dialogue.
- **Despawn:** `bossDefeated()` unifies "boss stays gone" for both Fiends
  (crystal flag) and wardens (key flag), used by the canvas + world prefetch.
- 4 new tests (`keys.test.ts`). Follow-up #59 done: keys retheme to their
  **destination** crystal zone (Verdant/Gearwright/Prism — a warden's home zone
  has no crystal, so it never brands the key), and a signpost NPC
  (`*-warden-sign`) near each warden warns the player and flips to a "you won
  it" line once the key flag is set.
