/**
 * Dev-only mini-game bench (docs/DESIGN-MINIGAMES.md §4). Not part of the app
 * build — Vite serves it at /bench/minigame.html in dev. Mounts a mini-game's
 * stage on its own, over a plain night background, with a stub save and
 * profile, at whatever size the browser is — for screenshots and the UX
 * reviews. Start Vite with a stand-in Supabase (`VITE_SUPABASE_URL=http://supabase.stub
 * VITE_SUPABASE_ANON_KEY=stub`) and answer its requests in the browser, as
 * the `hud` bench does: XP and saves only write in memory here.
 *
 * Query params:
 *   game=<MiniGameId>     the game (default the first)
 *   level=<1–10>          the kid's question level in the game's topic (picks the band)
 *   age=<years>           the kid's age (default 9)
 *   flags=a,b             save flags already set (e.g. mg:potion-lab:page:lemon)
 *   pages=<n>             that many of the game's pages already found (in `PAGE_IDS` order)
 *   ember=egg|hatchling|whelp|dragon   Ember's stage (default hatchling)
 *
 * `window.__mg.save()` returns the save; `__mg.xp()` the profile's XP.
 */
import { createRoot } from 'react-dom/client';
import MiniGameStage from '../src/features/minigames/MiniGameStage';
import { MINIGAMES, MINIGAME_IDS, pageFlag, type MiniGameId } from '../src/content/minigames';
import { JAR_IDS } from '../src/lib/minigames/potionLab';
import { REGULAR_IDS } from '../src/lib/minigames/bakery';
import { defaultSave } from '../src/lib/save';
import { crystalFlag } from '../src/content/topics';
import { EMBER_HATCHED } from '../src/content/story';
import { useSaveStore } from '../src/store/saveStore';
import { useProfileStore } from '../src/store/profileStore';
import '../src/index.css';

const q = new URLSearchParams(location.search);
const game = (MINIGAME_IDS as readonly string[]).includes(q.get('game') ?? '') ? (q.get('game') as MiniGameId) : MINIGAME_IDS[0];
// A level that isn't 1–10 reads as 4 (a Medium kid).
const asked = Math.round(Number(q.get('level') ?? 4));
const level = asked >= 1 && asked <= 10 ? asked : 4;
const age = Number(q.get('age') ?? 9);
const ember = q.get('ember') ?? 'hatchling';

/** Each game's page keys, for `pages=<n>`. */
const PAGE_IDS: Record<MiniGameId, readonly string[]> = { 'potion-lab': JAR_IDS, 'dots-bakery': REGULAR_IDS };

const flags: Record<string, boolean> = {};
for (const f of (q.get('flags') ?? '').split(',').filter(Boolean)) flags[f] = true;
for (const p of PAGE_IDS[game].slice(0, Number(q.get('pages') ?? 0))) flags[pageFlag(game, p)] = true;
if (ember !== 'egg') flags[EMBER_HATCHED] = true;
const crystals = ember === 'whelp' ? 2 : ember === 'dragon' ? 4 : 0;
for (const t of ['math', 'science', 'engineering', 'creativity'].slice(0, crystals)) flags[crystalFlag(t as 'math')] = true;

const year = new Date().getFullYear() - age;
useSaveStore.setState({ userId: null, save: { ...defaultSave(), avatarId: 'a4', worldUnlocked: true, flags }, status: 'ready', remoteError: null });
useProfileStore.setState({
  profile: {
    id: 'bench-kid',
    birthYear: year,
    birthMonth: 1,
    skillLevels: { [MINIGAMES[game].topic]: level },
    xp: 500,
    level: 5,
    levelXp: 0,
    powerUps: {},
    currentStreak: 1,
    longestStreak: 1,
    lastPlayedOn: null,
  },
});

(window as unknown as { __mg: unknown }).__mg = {
  save: () => useSaveStore.getState().save,
  xp: () => useProfileStore.getState().profile?.xp,
};

createRoot(document.getElementById('root')!).render(<MiniGameStage game={game} />);
