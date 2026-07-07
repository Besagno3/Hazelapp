import { CRYSTAL_TOPIC_IDS, type CrystalTopic, type Topic, type ZoneId } from '../types';

/**
 * The single source of truth for topics (#33). UI labels, world fiction
 * (crystals/fiends/zones), and styling all hang off this registry.
 *
 * Two tiers (#50/#55):
 * - `TOPIC_REGISTRY` — the four **crystal** main-quest topics (math/science/
 *   engineering/creativity). Each bears a crystal, a Fiend, a Sage and a topic
 *   zone; all crystal/ending logic iterates this.
 * - `EXTRA_TOPICS` — the expansion question themes (nature, space, history)
 *   that flavour the new zones. Styling only — no crystal/fiend.
 *
 * `topicInfo(id)` resolves either tier. Adding a topic: an id in
 * `CRYSTAL_TOPIC_IDS`/`EXTRA_TOPIC_IDS` (types), an entry here, a persona line
 * in supabase/functions/_shared/topics.ts (shared with the edge function —
 * topicPrompts.test.ts locks the two lists together), usually a zone in
 * zones.ts, then redeploy generate-questions.
 */
export interface TopicInfo {
  id: Topic;
  label: string;
  emoji: string;
  /** Tailwind classes for topic-colored buttons. */
  buttonColor: string;
  /** Battle-backdrop gradient (Tailwind classes). */
  skyGradient: string;
  /** KaPlay ground tint for this topic's zone. */
  groundTint: [number, number, number];
  /** Crystal-topic only — the crystal restored by beating this topic's Fiend. */
  crystalName?: string;
  /** Crystal-topic only — the Fiend's display name. */
  fiendName?: string;
  /** Crystal-topic only — the topic's zone. */
  zoneId?: ZoneId;
}

/** A crystal main-quest topic — crystal fields are guaranteed present. */
export interface CrystalTopicInfo extends TopicInfo {
  id: CrystalTopic;
  crystalName: string;
  fiendName: string;
  zoneId: ZoneId;
}

export const TOPIC_REGISTRY: CrystalTopicInfo[] = [
  {
    id: 'math',
    label: 'Math',
    emoji: '🔢',
    buttonColor: 'bg-blue-500 hover:bg-blue-600',
    skyGradient: 'from-blue-900 via-indigo-800 to-blue-600',
    groundTint: [96, 130, 186],
    crystalName: 'Crystal of Numbers',
    fiendName: 'The Null Fiend',
    zoneId: 'numbria',
  },
  {
    id: 'science',
    label: 'Science',
    emoji: '🔬',
    buttonColor: 'bg-green-500 hover:bg-green-600',
    skyGradient: 'from-emerald-900 via-green-800 to-teal-600',
    groundTint: [88, 156, 100],
    crystalName: 'Crystal of Nature',
    fiendName: 'The Smog Fiend',
    zoneId: 'verdara',
  },
  {
    id: 'engineering',
    label: 'Engineering',
    emoji: '⚙️',
    buttonColor: 'bg-orange-500 hover:bg-orange-600',
    skyGradient: 'from-stone-900 via-amber-900 to-orange-700',
    groundTint: [168, 134, 96],
    crystalName: 'Crystal of Gears',
    fiendName: 'The Rust Fiend',
    zoneId: 'gearfall',
  },
  {
    id: 'creativity',
    label: 'Creativity',
    emoji: '🎨',
    buttonColor: 'bg-pink-500 hover:bg-pink-600',
    skyGradient: 'from-purple-900 via-fuchsia-800 to-pink-600',
    groundTint: [178, 116, 160],
    crystalName: 'Crystal of Wonder',
    fiendName: 'The Gray Fiend',
    zoneId: 'chromaria',
  },
];

/** Expansion question themes (#55) — styling only, no crystal. */
export const EXTRA_TOPICS: TopicInfo[] = [
  {
    id: 'nature',
    label: 'Nature & Animals',
    emoji: '🦋',
    buttonColor: 'bg-lime-600 hover:bg-lime-700',
    skyGradient: 'from-green-900 via-lime-800 to-emerald-600',
    groundTint: [104, 150, 92],
  },
  {
    id: 'space',
    label: 'Space',
    emoji: '🪐',
    buttonColor: 'bg-indigo-600 hover:bg-indigo-700',
    skyGradient: 'from-slate-950 via-indigo-900 to-violet-700',
    groundTint: [120, 110, 170],
  },
  {
    id: 'history',
    label: 'Time & History',
    emoji: '⏳',
    buttonColor: 'bg-amber-600 hover:bg-amber-700',
    skyGradient: 'from-stone-900 via-yellow-900 to-amber-700',
    groundTint: [150, 130, 110],
  },
];

const ALL_TOPIC_INFO: TopicInfo[] = [...TOPIC_REGISTRY, ...EXTRA_TOPICS];

/** The crystal topics (BOSS_LINES / SAGES / crystal logic iterate this). */
export const TOPICS: CrystalTopic[] = [...CRYSTAL_TOPIC_IDS];

/** Every question topic id (all seven). */
export const ALL_TOPICS: Topic[] = ALL_TOPIC_INFO.map((t) => t.id);

export function topicInfo(id: Topic): TopicInfo {
  // Covers every Topic union member (enforced by topics.test.ts).
  return ALL_TOPIC_INFO.find((t) => t.id === id)!;
}

/** Crystal-topic info with the crystal fields guaranteed present. */
export function crystalInfo(id: CrystalTopic): CrystalTopicInfo {
  return TOPIC_REGISTRY.find((t) => t.id === id)!;
}

/** Flag set when a topic's Fiend falls and its crystal is restored. */
export function crystalFlag(id: Topic): string {
  return `crystal-${id}-restored`;
}
