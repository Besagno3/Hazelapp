import type { Topic, ZoneId } from '../types';

/**
 * The single source of truth for topics (#33). UI labels, world fiction
 * (crystals/fiends/zones), and styling all hang off this registry — adding a
 * topic means one entry here plus a zone in zones.ts and a persona hint in
 * the edge function's system prompt.
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
  crystalName: string;
  fiendName: string;
  zoneId: ZoneId;
}

export const TOPIC_REGISTRY: TopicInfo[] = [
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

export const TOPICS: Topic[] = TOPIC_REGISTRY.map((t) => t.id);

export function topicInfo(id: Topic): TopicInfo {
  // The registry covers every Topic union member (enforced by topics.test.ts).
  return TOPIC_REGISTRY.find((t) => t.id === id)!;
}

/** Flag set when a topic's Fiend falls and its crystal is restored. */
export function crystalFlag(id: Topic): string {
  return `crystal-${id}-restored`;
}
