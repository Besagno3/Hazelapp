import type { BattleEnemy, BossRole, CrystalTopic, EnemyBehavior, Habitat, Topic, ZoneId } from '../types';
import { clampLevel, skillLevelFor } from '../lib/age';
import { topicInfo } from './topics';
import { BOSS_LINES, type BossScript } from './story';
import { keyForBoss } from './keys';
import { bossCoinDrop, enemyCoinDrop } from './items';
import { BASE_TIER, DANGER, placementTier, zoneTier, type DangerTier } from './regions';
import type { EnemyPlacement } from './zones';

/**
 * Enemy archetypes (#37). Placements in zones.ts reference these by id; the
 * actual level is resolved at spawn time from the player's age-appropriate
 * level + the placement's offset, so the same world scales to every kid
 * (replacing the old random `generateNpcs`).
 */
export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  /** key into src/content/sprites.ts SPRITES; falls back to `sprite` (emoji) when absent */
  spriteId?: string;
  topic: Topic;
  /** Question level = the player's question level for this topic + levelOffset, clamped 1-10. */
  levelOffset: number;
  /** maxHp = HP_BASE + level * hpPerLevel. */
  hpPerLevel: number;
  isBoss?: boolean;
  /** A boss's part in the story — required on every boss (#75 item 14c, `BossRole`). */
  role?: BossRole;
  /**
   * A miniboss's / echo's / the finale's own monologue and last words. A
   * Fiend speaks `BOSS_LINES[topic]` and a warden its key's lines instead.
   */
  lines?: BossScript;
  /** Mechanical archetype (Wave 0.5) — see EnemyBehavior in types. */
  behavior?: EnemyBehavior;
  /**
   * Where it lives (#75 item 14d) — missing = land. A sea critter swims open
   * sea only and fights only a hero sailing Marlow's boat; a land critter
   * never fights a sailing hero (`meetsHero`, lib/travel.ts).
   */
  habitat?: Habitat;
  /**
   * A badge for the trophy shelf, won with this boss's first defeat (#75 item
   * 14g: the Last Fogbank's Foglight Badge) — its id in `save.badges`.
   */
  badge?: string;
}

const HP_BASE = 60;
const BOSS_HP_BASE = 140;

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  // --- Numbria (math) ---
  'sum-slime': { id: 'sum-slime', name: 'Sum Slime', sprite: '🟦', topic: 'math', levelOffset: -1, hpPerLevel: 10 },
  'count-bat': { id: 'count-bat', name: 'Count Bat', sprite: '🦇', topic: 'math', levelOffset: 0, hpPerLevel: 12 },
  'sir-sumsalot': { id: 'sir-sumsalot', name: 'Sir Sumsalot', sprite: '🐉', topic: 'math', levelOffset: 1, hpPerLevel: 14 },
  'raven-prince': { id: 'raven-prince', name: 'Raven Prince', sprite: '🐦‍⬛', topic: 'math', levelOffset: -1, hpPerLevel: 10 },
  'kia': { id: 'kia', name: 'Kia', sprite: '🦑', topic: 'math', levelOffset: 0, hpPerLevel: 12 },
  'pirate-parrot': { id: 'pirate-parrot', name: 'Pi-rate Parrot', sprite: '🦜', topic: 'math', levelOffset: 1, hpPerLevel: 14, behavior: 'trickster' },
  'null-fiend': { id: 'null-fiend', name: 'The Null Fiend', sprite: '👹', topic: 'math', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Verdara (science) ---
  'spore-puff': { id: 'spore-puff', name: 'Spore Puff', sprite: '🍄', topic: 'science', levelOffset: -1, hpPerLevel: 10 },
  'static-jelly': { id: 'static-jelly', name: 'Static Jelly', sprite: '🪼', topic: 'science', levelOffset: 0, hpPerLevel: 12 },
  'comet-crab': { id: 'comet-crab', name: 'Comet Crab', sprite: '🦀', topic: 'science', levelOffset: 1, hpPerLevel: 14 },
  'fizzlet': { id: 'fizzlet', name: 'Fizzlet', sprite: '🫧', topic: 'science', levelOffset: -1, hpPerLevel: 10 },
  'magnetick': { id: 'magnetick', name: 'Magnetick', sprite: '🧲', topic: 'science', levelOffset: 0, hpPerLevel: 12 },
  'germinator': { id: 'germinator', name: 'Germinator', sprite: '🦠', topic: 'science', levelOffset: 1, hpPerLevel: 14, behavior: 'healer' },
  'smog-fiend': { id: 'smog-fiend', name: 'The Smog Fiend', sprite: '🌫️', topic: 'science', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Gearfall (engineering) ---
  'bolt-mouse': { id: 'bolt-mouse', name: 'Bolt Mouse', sprite: '🐭', topic: 'engineering', levelOffset: -1, hpPerLevel: 10 },
  'scrap-golem': { id: 'scrap-golem', name: 'Scrap Golem', sprite: '🗿', topic: 'engineering', levelOffset: 0, hpPerLevel: 12 },
  'gear-wyrm': { id: 'gear-wyrm', name: 'Gear Wyrm', sprite: '🐍', topic: 'engineering', levelOffset: 1, hpPerLevel: 14 },
  'pulley-spider': { id: 'pulley-spider', name: 'Pulley Spider', sprite: '🕷️', topic: 'engineering', levelOffset: -1, hpPerLevel: 10 },
  'piston-boar': { id: 'piston-boar', name: 'Piston Boar', sprite: '🐗', topic: 'engineering', levelOffset: 0, hpPerLevel: 12 },
  'ironhorn-rampager': { id: 'ironhorn-rampager', name: 'Ironhorn Rampager', sprite: '🦏', topic: 'engineering', levelOffset: 1, hpPerLevel: 14, behavior: 'shielded' },
  'rust-fiend': { id: 'rust-fiend', name: 'The Rust Fiend', sprite: '🤖', topic: 'engineering', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Chromaria (creativity) ---
  'doodle-imp': { id: 'doodle-imp', name: 'Doodle Imp', sprite: '👻', topic: 'creativity', levelOffset: -1, hpPerLevel: 10 },
  'off-key-bird': { id: 'off-key-bird', name: 'Off-Key Bird', sprite: '🐦', topic: 'creativity', levelOffset: 0, hpPerLevel: 12 },
  'pixel-witch': { id: 'pixel-witch', name: 'Pixel Witch', sprite: '🦹', topic: 'creativity', levelOffset: 1, hpPerLevel: 14, behavior: 'trickster' },
  'flicker-goblin': { id: 'flicker-goblin', name: 'Flicker Goblin', sprite: '🔥', topic: 'creativity', levelOffset: -1, hpPerLevel: 10 },
  'graffiti-gargoyle': { id: 'graffiti-gargoyle', name: 'Graffiti Gargoyle', sprite: '🎨', topic: 'creativity', levelOffset: 0, hpPerLevel: 12 },
  'dog-knight': { id: 'dog-knight', name: 'Dog-Knight', sprite: '🐕', topic: 'creativity', levelOffset: 1, hpPerLevel: 14, behavior: 'healer' },
  'gray-fiend': { id: 'gray-fiend', name: 'The Gray Fiend', sprite: '🌑', topic: 'creativity', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Whispering Woods (nature & animals) — critters + the warden boss (#58) ---
  'mossback-cub': { id: 'mossback-cub', name: 'Mossback Cub', sprite: '🐻', topic: 'nature', levelOffset: -1, hpPerLevel: 10 },
  'thornhare': { id: 'thornhare', name: 'Thornhare', sprite: '🐰', topic: 'nature', levelOffset: 0, hpPerLevel: 12 },
  'grumblebee': { id: 'grumblebee', name: 'Grumblebee', sprite: '🐝', topic: 'nature', levelOffset: 1, hpPerLevel: 13 },
  'dart-frog': { id: 'dart-frog', name: 'Dart Frog', sprite: '🐸', topic: 'nature', levelOffset: -1, hpPerLevel: 10 },
  'snapjaw': { id: 'snapjaw', name: 'Snapjaw', sprite: '🪴', topic: 'nature', levelOffset: 0, hpPerLevel: 12 },
  'oak-owl': { id: 'oak-owl', name: 'Oak Owl', sprite: '🦉', topic: 'nature', levelOffset: 1, hpPerLevel: 13, behavior: 'trickster' },
  'thicket-warden': { id: 'thicket-warden', name: 'The Thicket Warden', sprite: '🦌', topic: 'nature', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- Starfall Coast (space) — critters + the warden boss (#58) ---
  'tide-sprite': { id: 'tide-sprite', name: 'Tide Sprite', sprite: '🌊', topic: 'space', levelOffset: -1, hpPerLevel: 10 },
  'meteor-mite': { id: 'meteor-mite', name: 'Meteor Mite', sprite: '☄️', topic: 'space', levelOffset: 0, hpPerLevel: 12 },
  'moon-moth': { id: 'moon-moth', name: 'Moon Moth', sprite: '🌙', topic: 'space', levelOffset: 1, hpPerLevel: 13, behavior: 'healer' },
  'orbit-otter': { id: 'orbit-otter', name: 'Orbit Otter', sprite: '🦦', topic: 'space', levelOffset: -1, hpPerLevel: 10 },
  'gravity-beetle': { id: 'gravity-beetle', name: 'Gravity Beetle', sprite: '🪲', topic: 'space', levelOffset: 0, hpPerLevel: 12 },
  'eclipse-fox': { id: 'eclipse-fox', name: 'Eclipse Fox', sprite: '🦊', topic: 'space', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  'tide-colossus': { id: 'tide-colossus', name: 'The Tide Colossus', sprite: '🐳', topic: 'space', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- Clockwork Depths (time & history) — critters + the warden boss (#58) ---
  'cog-sprite': { id: 'cog-sprite', name: 'Cog Sprite', sprite: '⚙️', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'hourglass-imp': { id: 'hourglass-imp', name: 'Hourglass Imp', sprite: '⏳', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  'relic-golem': { id: 'relic-golem', name: 'Relic Golem', sprite: '🗿', topic: 'history', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  'tut-tut': { id: 'tut-tut', name: 'Tut-Tut', sprite: '🧟', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  'knight-mare': { id: 'knight-mare', name: 'Knight-Mare', sprite: '🐴', topic: 'history', levelOffset: 1, hpPerLevel: 13 },
  'clockwork-titan': { id: 'clockwork-titan', name: 'The Clockwork Titan', sprite: '🦾', topic: 'history', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- The Silver Shallows (sea life) — sea critters, met only from the boat (#75 item 14d) ---
  'bubble-puffer': { id: 'bubble-puffer', name: 'Bubble Puffer', sprite: '🐡', topic: 'nature', levelOffset: -1, hpPerLevel: 10, habitat: 'sea' },
  // Its ink cloud hides the Hint Feather's work (trickster).
  'inkling': { id: 'inkling', name: 'Inkling', sprite: '🐙', topic: 'nature', levelOffset: 0, hpPerLevel: 12, behavior: 'trickster', habitat: 'sea' },
  // A sea star regrows its arms — this one mends itself (healer).
  'starfix': { id: 'starfix', name: 'Starfix', sprite: '⭐', topic: 'nature', levelOffset: 1, hpPerLevel: 13, behavior: 'healer', habitat: 'sea' },

  // --- Eldergrove (history, #75 item 14f): critters of the ring-trees ---
  'ring-beetle': { id: 'ring-beetle', name: 'Ring Beetle', sprite: '🪲', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'sap-sprite': { id: 'sap-sprite', name: 'Sap Sprite', sprite: '✨', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  // Shielded: its cap takes the first hit (Guard first, STORY-4X §4). An empty
  // face for its emoji, so it's never Fen's 🌰 acorns (#75 item 14f review).
  'hollow-acorn': { id: 'hollow-acorn', name: 'Hollow Acorn', sprite: '🫥', topic: 'history', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  // The warden of the Great Ring: beat it for the Memoria Key (keys.ts).
  ringkeeper: { id: 'ringkeeper', name: 'The Ringkeeper', sprite: '🦌', topic: 'history', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- Foglight Marsh (history, #75 item 14g): critters of the last fog ---
  'mist-newt': { id: 'mist-newt', name: 'Mist Newt', sprite: '🦎', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  // Trickster: its flicker hides the Hint Feather's work (STORY-4X §4 "decoy options").
  'bog-lantern': { id: 'bog-lantern', name: 'Bog Lantern', sprite: '🎃', topic: 'history', levelOffset: 0, hpPerLevel: 12, behavior: 'trickster' },
  'murk-toad': { id: 'murk-toad', name: 'Murk Toad', sprite: '🐸', topic: 'history', levelOffset: 1, hpPerLevel: 13 },
  // The very last of the fog that made Lumina forget — optional, restores
  // nothing, gives the Foglight Badge (a miniboss, #75 item 14c roles).
  'last-fogbank': {
    id: 'last-fogbank',
    name: 'The Last Fogbank',
    sprite: '⛈️',
    topic: 'history',
    levelOffset: 1,
    hpPerLevel: 15,
    isBoss: true,
    role: 'miniboss',
    badge: 'foglight',
    lines: {
      intro: [
        'So. Someone wandered into MY cove. I am the Last Fogbank — the very last of the fog that made Lumina forget.',
        "I'll swallow your memories one by one. Answer my questions about long ago — if you can still REMEMBER them!",
      ],
      defeat: "No… you remembered it ALL. The light is too bright… I'm fading away. Take the badge — you've earned it, little lantern.",
    },
  },

  // --- The Sunken Archive (history, #75 item 14h): critters of the forgotten library ---
  'dust-tome': { id: 'dust-tome', name: 'Dust Tome', sprite: '📖', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'ink-wisp': { id: 'ink-wisp', name: 'Ink Wisp', sprite: '🖋️', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  // Swift (roadmap decision 14: no new timers): it darts in and strikes first.
  'quill-imp': { id: 'quill-imp', name: 'Quill Imp', sprite: '🪶', topic: 'history', levelOffset: 1, hpPerLevel: 13, behavior: 'swift' },

  // --- Lumina-That-Was (#75 item 16b): things the world forgot, and a classroom's mischief ---
  'faded-echo': { id: 'faded-echo', name: 'Faded Echo', sprite: '👥', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'lost-sock-golem': { id: 'lost-sock-golem', name: 'Lost Sock Golem', sprite: '🧦', topic: 'science', levelOffset: 0, hpPerLevel: 12 },
  'misplaced-key': { id: 'misplaced-key', name: 'Misplaced Key', sprite: '🔑', topic: 'math', levelOffset: 1, hpPerLevel: 13, behavior: 'trickster' },
  'chalk-wisp': { id: 'chalk-wisp', name: 'Chalk Wisp', sprite: '🖍️', topic: 'words', levelOffset: -1, hpPerLevel: 10, behavior: 'swift' },
  'eraser-imp': { id: 'eraser-imp', name: 'Eraser Imp', sprite: '🧽', topic: 'creativity', levelOffset: 0, hpPerLevel: 12, behavior: 'swift' },
  'sum-gremlin': { id: 'sum-gremlin', name: 'Sum Gremlin', sprite: '➗', topic: 'math', levelOffset: 1, hpPerLevel: 13, behavior: 'swift' },
  // Aster's Garden (#75 item 16c): weeds that won't stop asking "why?" — they mend themselves.
  'thorn-of-doubt': { id: 'thorn-of-doubt', name: 'Thorn of Doubt', sprite: '🌵', topic: 'nature', levelOffset: -1, hpPerLevel: 11, behavior: 'healer' },
  'wilt-sprite': { id: 'wilt-sprite', name: 'Wilt Sprite', sprite: '🥀', topic: 'science', levelOffset: 0, hpPerLevel: 12, behavior: 'healer' },
  bramblewhy: { id: 'bramblewhy', name: 'Bramblewhy', sprite: '❓', topic: 'creativity', levelOffset: 1, hpPerLevel: 13, behavior: 'healer' },
  // Aster's Garden's warden (#75 item 16c): beat him for Aster's Key (keys.ts).
  'the-gardener': { id: 'the-gardener', name: 'The Gardener', sprite: '🧑‍🌾', topic: 'nature', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'warden' },
  // Act II's Fiend: beat it to restore the Crystal of Memory (BOSS_LINES.history).
  'hollow-fiend': { id: 'hollow-fiend', name: 'The Hollow Fiend', sprite: '🕳️', topic: 'history', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Taleshore I (geography, #75 item 15d): three critters a place ---
  // Driftwood Shallows: the Tide Snail's shell takes the first hit (shielded).
  'compass-crab': { id: 'compass-crab', name: 'Compass Crab', sprite: '🦀', topic: 'geography', levelOffset: -1, hpPerLevel: 10 },
  'gull-scout': { id: 'gull-scout', name: 'Gull Scout', sprite: '🐦', topic: 'geography', levelOffset: 0, hpPerLevel: 12 },
  'tide-snail': { id: 'tide-snail', name: 'Tide Snail', sprite: '🐌', topic: 'geography', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  // The Wayfinder Isles: the Latitude Cat's wandering lines muddle a Hint Feather (trickster).
  'marker-post': { id: 'marker-post', name: 'Marker Post', sprite: '🪧', topic: 'geography', levelOffset: -1, hpPerLevel: 11 },
  'latitude-cat': { id: 'latitude-cat', name: 'Latitude Cat', sprite: '🐈', topic: 'geography', levelOffset: 0, hpPerLevel: 12, behavior: 'trickster' },
  'globe-beetle': { id: 'globe-beetle', name: 'Globe Beetle', sprite: '🪲', topic: 'geography', levelOffset: 1, hpPerLevel: 13 },
  // Gale Atoll: the Squall Chick rides the wind and strikes first (swift).
  'zephyr-pup': { id: 'zephyr-pup', name: 'Zephyr Pup', sprite: '☁️', topic: 'geography', levelOffset: -1, hpPerLevel: 10 },
  'kite-ray': { id: 'kite-ray', name: 'Kite Ray', sprite: '🎏', topic: 'geography', levelOffset: 0, hpPerLevel: 12 },
  'squall-chick': { id: 'squall-chick', name: 'Squall Chick', sprite: '🐤', topic: 'geography', levelOffset: 1, hpPerLevel: 12, behavior: 'swift' },
  // The warden of the Wayfinder Isles' stone circle: beat it for the First Chorus Key (keys.ts).
  'compass-golem': { id: 'compass-golem', name: 'The Compass Golem', sprite: '🗿', topic: 'geography', levelOffset: 1, hpPerLevel: 17, isBoss: true, role: 'warden' },
  // --- Taleshore II (words, #75 item 15e) ---
  // The Story Reef: the Riddle Jelly answers your Hint Feather with a riddle of its own (trickster).
  'word-eel': { id: 'word-eel', name: 'Word Eel', sprite: '🐍', topic: 'words', levelOffset: -1, hpPerLevel: 11 },
  'riddle-jelly': { id: 'riddle-jelly', name: 'Riddle Jelly', sprite: '🪼', topic: 'words', levelOffset: 0, hpPerLevel: 12, behavior: 'trickster' },
  'page-ray': { id: 'page-ray', name: 'Page Ray', sprite: '📄', topic: 'words', levelOffset: 1, hpPerLevel: 13 },
  // Inkwell Cove: the Cuttle-Scribe writes its own wounds closed (healer).
  blot: { id: 'blot', name: 'Blot', sprite: '⚫', topic: 'words', levelOffset: -1, hpPerLevel: 10 },
  'cuttle-scribe': { id: 'cuttle-scribe', name: 'Cuttle-Scribe', sprite: '🦑', topic: 'words', levelOffset: 0, hpPerLevel: 13, behavior: 'healer' },
  'margin-shrimp': { id: 'margin-shrimp', name: 'Margin Shrimp', sprite: '🦐', topic: 'words', levelOffset: 1, hpPerLevel: 12 },
  // --- Taleshore III (#75 item 15f) ---
  // Songstone Cliffs (music): the Chime Gull dives before you can blink (swift).
  'echo-bat': { id: 'echo-bat', name: 'Echo Bat', sprite: '🔊', topic: 'music', levelOffset: -1, hpPerLevel: 11 },
  'chime-gull': { id: 'chime-gull', name: 'Chime Gull', sprite: '🔔', topic: 'music', levelOffset: 0, hpPerLevel: 12, behavior: 'swift' },
  'drum-crab': { id: 'drum-crab', name: 'Drum Crab', sprite: '🥁', topic: 'music', levelOffset: 1, hpPerLevel: 13 },
  // The Quiet Quarter (words): the Muffle Moth's woolly scarf soaks up the first hit (shielded).
  hushling: { id: 'hushling', name: 'Hushling', sprite: '🤫', topic: 'words', levelOffset: -1, hpPerLevel: 10 },
  'muffle-moth': { id: 'muffle-moth', name: 'Muffle Moth', sprite: '🦋', topic: 'words', levelOffset: 0, hpPerLevel: 13, behavior: 'shielded' },
  'blank-sprite': { id: 'blank-sprite', name: 'Blank Sprite', sprite: '⬜', topic: 'words', levelOffset: 1, hpPerLevel: 12 },
  // Act III's Fiend (#75 item 15g): beat it to restore the Crystal of Voices (BOSS_LINES.words).
  'hush-fiend': { id: 'hush-fiend', name: 'The Hush Fiend', sprite: '🔇', topic: 'words', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },
  // The warden at the tip of Inkwell Cove's sandy point: beat it for the Second Chorus Key (keys.ts).
  'riddle-leviathan': { id: 'riddle-leviathan', name: 'The Riddle Leviathan', sprite: '🐋', topic: 'words', levelOffset: 1, hpPerLevel: 17, isBoss: true, role: 'warden' },
};

/**
 * A boss's own lines as it gets angrier — at half HP, then near the end (its
 * enrage phases) — so each sounds like itself, and menacing (#75 item 14g,
 * the owner's call: "bosses should be more menacing"). `rageLine` falls back
 * to a general pair for a boss with none.
 */
export const BOSS_RAGE: Record<string, [string, string]> = {
  'null-fiend': ["The Null Fiend's eyes go dark — it's starting to erase the numbers!", 'The Null Fiend roars: "ZERO! Everything becomes ZERO!"'],
  'smog-fiend': ['The Smog Fiend swells up, thick and choking!', "The Smog Fiend bellows out a black cloud — it's furious!"],
  'rust-fiend': ['The Rust Fiend grinds its gears and stomps closer!', "The Rust Fiend's eyes glow red-hot: \"I'll rust you right down to your boots!\""],
  'gray-fiend': ['The Gray Fiend drains the color from the sky!', 'The Gray Fiend howls: "No more colors — EVER!"'],
  'thicket-warden': ["The Thicket Warden's thorns grow longer and sharper!", 'The Thicket Warden stamps the ground — the whole wood shakes!'],
  'tide-colossus': ['The Tide Colossus rises higher — the water churns!', 'The Tide Colossus roars like a storm at sea!'],
  'clockwork-titan': ["The Clockwork Titan's gears spin faster and faster!", 'The Clockwork Titan booms: "YOUR TIME IS UP!"'],
  'the-gardener': ['The Gardener waves his watering can — the seedlings sprout thorns!', 'The Gardener booms: "EVERY question deserves an answer!"'],
  ringkeeper: ['The Ringkeeper lowers its antlers and paws the ground!', 'The Ringkeeper bellows: "A THOUSAND YEARS, and nobody got past me!"'],
  'last-fogbank': ['The Last Fogbank swallows the light — you can barely see!', 'The Last Fogbank rumbles: "I\'ll make you forget your own NAME!"'],
  'hollow-fiend': ['The Hollow Fiend yawns open — the pages round you start to go blank!', 'The Hollow Fiend howls: "I will EAT tomorrow too!"'],
  'hush-fiend': ['The Hush Fiend puffs up like a big purple pillow — every sound goes muffled!', 'The Hush Fiend hisses: "SHHHHHH! Not ONE more word!"'],
  'compass-golem': ['The Compass Golem spins its needle — NORTH, SOUTH, NORTH!', 'The Compass Golem booms: "ALL DIRECTIONS LEAD TO ME!"'],
  // It speaks only in riddles (STORY-4X), even when it's angry.
  'riddle-leviathan': [
    'The Riddle Leviathan slaps its tail on the sand: "What gets BIGGER the more you take away? A HOLE! And my waves get BIGGER too!"',
    'The Riddle Leviathan thrashes the black water: "What has no voice, yet SHOUTS from every page? MY WORDS! Now answer ME!"',
  ],
};

/** What a boss says as it crosses into enrage phase `phase` (1: half HP, 2: near the end). */
export function rageLine(enemyId: string, name: string, phase: 1 | 2): string {
  const own = BOSS_RAGE[enemyId];
  if (own) return own[phase - 1];
  return phase === 1 ? `${name} roars — it's getting serious!` : `${name} is furious — watch out!`;
}

/** A name without a leading "The", for a phone's narrow battle panel ("The Ringkeeper" → "Ringkeeper", #125j). */
export function shortName(name: string): string {
  return name.replace(/^The /, '');
}

/** Badges a boss gives (#75 item 14g), for the menu's trophy shelf: id → name and emoji. */
export const BOSS_BADGES: Record<string, { name: string; emoji: string }> = {
  foglight: { name: 'Foglight Badge', emoji: '🌤️' },
};

/** Where an enemy lives (#75 item 14d): its def's habitat, else land. */
export function habitatOf(e: Pick<EnemyDef, 'habitat'> | Pick<BattleEnemy, 'habitat'>): Habitat {
  return e.habitat ?? 'land';
}

/** A crystal topic's Fiend — the boss whose defeat restores its crystal. */
export function fiendFor(topic: Topic): EnemyDef {
  const def = Object.values(ENEMY_DEFS).find((e) => e.role === 'fiend' && e.topic === topic);
  if (!def) throw new Error(`No fiend defined for topic ${topic}`);
  return def;
}

/**
 * Resolves a placed enemy into a battle-ready instance, scaled to the player's
 * **question level** for the enemy's topic (`skillLevels`, 1–10) — it starts
 * from their sign-up age and moves with how well (and how fast) they answer.
 * XP / player level never changes it. A player with no level for the topic
 * yet gets the age baseline. `instanceId` keys session defeat-tracking.
 * `tier` is the danger of where it roams (#75 item 12, `placementTier`): it
 * scales HP and coins here, its blows and power moves in battle — the
 * questions stay at `level`.
 */
export function spawnEnemy(
  defId: string,
  zoneId: ZoneId,
  placementKey: string,
  age: number,
  skillLevels: Partial<Record<Topic, number>> = {},
  tier: DangerTier = zoneTier(zoneId),
): BattleEnemy {
  const def = ENEMY_DEFS[defId];
  if (!def) throw new Error(`Unknown enemy def: ${defId}`);
  const level = clampLevel(skillLevelFor(skillLevels, def.topic, age) + def.levelOffset);
  // A Fiend goes by its crystal's Fiend name; every other boss by its own (#75 item 14c).
  const name = def.role === 'fiend' ? (topicInfo(def.topic).fiendName ?? def.name) : def.name;
  return {
    id: def.id,
    instanceId: `${zoneId}:${placementKey}`,
    name,
    sprite: def.sprite,
    // Generated art is keyed by the def id; an explicit spriteId overrides.
    spriteId: def.spriteId ?? def.id,
    topic: def.topic,
    level,
    maxHp: scaledHp(def, level, tier),
    zoneId,
    isBoss: def.isBoss ?? false,
    role: def.role,
    coins: scaledCoins(def, level, tier),
    behavior: def.behavior,
    habitat: def.habitat,
    tier,
  };
}

function scaledHp(def: EnemyDef, level: number, tier: DangerTier): number {
  return Math.round(((def.isBoss ? BOSS_HP_BASE : HP_BASE) + level * def.hpPerLevel) * DANGER[tier].hp);
}

function scaledCoins(def: EnemyDef, level: number, tier: DangerTier): number {
  return Math.round((def.isBoss ? bossCoinDrop(level) : enemyCoinDrop(level)) * DANGER[tier].coins);
}

/**
 * The same enemy fighting at another tier — mercy far from home (`mercyFor`'s
 * `fightTier`): HP, blows, power moves and pay all follow `tier`, while
 * `eased` remembers where it roams. Its questions don't change.
 */
export function atTier(enemy: BattleEnemy, tier: DangerTier): BattleEnemy {
  if (tier === (enemy.tier ?? BASE_TIER)) return enemy;
  const def = ENEMY_DEFS[enemy.id];
  if (!def) throw new Error(`Unknown enemy def: ${enemy.id}`);
  return {
    ...enemy,
    maxHp: scaledHp(def, enemy.level, tier),
    coins: scaledCoins(def, enemy.level, tier),
    tier,
    eased: enemy.eased ?? enemy.tier ?? BASE_TIER,
  };
}

/**
 * A zone's placed enemy, ready for battle: its instance id ("count-bat@12,4",
 * the key session defeat-tracking matches) and its danger tier (the
 * placement's own, else the zone's — #75 item 12). The world and the
 * question prefetch both spawn through this, so they always agree.
 */
export function spawnPlaced(
  zoneId: ZoneId,
  p: EnemyPlacement,
  age: number,
  skillLevels: Partial<Record<Topic, number>> = {},
): BattleEnemy {
  return spawnEnemy(p.defId, zoneId, `${p.defId}@${p.x},${p.y}`, age, skillLevels, placementTier(zoneId, p));
}

/**
 * What a boss says before the fight and as it falls (#75 item 14c), by its
 * role: a Fiend its crystal's `BOSS_LINES`, a warden its key's lines, any
 * other boss its own `lines` — or nothing, never a crash.
 */
export function bossScript(boss: { id: string; topic: Topic; role?: BossRole }): BossScript | null {
  if (boss.role === 'fiend') return BOSS_LINES[boss.topic as CrystalTopic] ?? null;
  const key = keyForBoss(boss.id);
  if (key) return { intro: key.bossIntro, defeat: key.bossDefeat };
  return ENEMY_DEFS[boss.id]?.lines ?? null;
}
