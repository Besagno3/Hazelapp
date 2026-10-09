import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { SpriteSheet } from '../features/battle/SpriteSheet';
import { resolveSprite } from '../content/sprites';
import { SPIRE_SHEET } from '../content/tiles';
import type { StorySceneId } from '../content/story';

/** Who appears in a story scene: the hero and Ember, by sprite (emoji fallback). */
export interface StoryCast {
  hero: { spriteId?: string; emoji: string };
  ember: { spriteId: string; emoji: string };
}

/** The villagers who cheer the hero home (sprite ids = NPC ids). */
const CHEERING = [
  { id: 'elder-lumen', emoji: '👴', at: '8%' },
  { id: 'village-elder', emoji: '👵', at: '22%' },
  { id: 'hub-innkeeper', emoji: '👩‍🍳', at: '74%' },
];

/** Lanterns strung across the village, as (x %, y %) along a sagging line. */
const LANTERNS = [8, 21, 34, 47, 60, 73, 86].map((x) => ({ x, y: 14 + 10 * (1 - ((x - 47) / 39) ** 2) }));

const STARS = [
  [8, 10],
  [18, 26],
  [30, 8],
  [42, 20],
  [55, 6],
  [64, 24],
  [90, 30],
  [76, 8],
] as const;

/** A character's world sprite: walking or standing, facing the player or (flipped) left. */
function Figure({
  spriteId,
  emoji,
  anim,
  flip = false,
}: {
  spriteId?: string;
  emoji: string;
  anim: string;
  flip?: boolean;
}) {
  const { def, emoji: fallback } = resolveSprite(spriteId, emoji);
  return (
    <div style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <SpriteSheet view={def?.world ?? null} anim={anim} emoji={fallback} scale={1.5} className="text-3xl leading-none" />
    </div>
  );
}

function Backdrop({ zone }: { zone: string }) {
  return (
    <img
      src={`/backgrounds/${zone}.png`}
      alt=""
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/**
 * A little picture for a storybook panel (#75 item 14): the walk home after
 * the Spire, drawn from the game's own art — zone backdrops, the Spire tower,
 * the hero's, Ember's and the villagers' sprites. Decorative: the panel's text
 * says what happens, so the picture is hidden from screen readers. Under
 * reduced motion nothing walks, hops or sways.
 */
export default function StoryScene({ id, cast }: { id: StorySceneId; cast: StoryCast }) {
  const still = useReducedMotion() ?? false;

  // The village throws its cheer with a burst of confetti.
  useEffect(() => {
    if (id === 'village-cheer' && !still) confetti({ particleCount: 90, spread: 80, origin: { y: 0.45 } });
  }, [id, still]);

  const hop = (delay: number) =>
    still ? {} : { animate: { y: [0, -7, 0] }, transition: { duration: 0.55, repeat: Infinity, repeatDelay: 0.5, delay } };

  return (
    <div
      aria-hidden
      className="relative mx-auto mb-5 aspect-[16/9] w-full max-w-md overflow-hidden rounded-xl border-4 border-white/15 bg-slate-900"
    >
      {id === 'spire-stairs' && (
        <>
          <Backdrop zone="crystal-spire" />
          <div className="absolute inset-0 bg-gradient-to-t from-orange-400/25 via-transparent to-transparent" />
          <img
            src={SPIRE_SHEET}
            alt=""
            className="absolute bottom-[22%] right-[10%] h-[64%]"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 10px rgba(190,170,255,0.85))' }}
          />
          {/* Walking away from the Spire, toward home. */}
          <motion.div
            className="absolute bottom-[8%] flex items-end gap-1"
            initial={{ left: still ? '38%' : '58%' }}
            animate={{ left: '24%' }}
            transition={{ duration: still ? 0 : 6, ease: 'linear' }}
          >
            <Figure spriteId={cast.hero.spriteId} emoji={cast.hero.emoji} anim={still ? 'idle' : 'walk'} flip />
            <motion.div {...hop(0.2)} className="mb-6">
              <Figure spriteId={cast.ember.spriteId} emoji={cast.ember.emoji} anim={still ? 'idle' : 'walk'} flip />
            </motion.div>
          </motion.div>
        </>
      )}

      {id === 'village-cheer' && (
        <>
          <Backdrop zone="lumina-village" />
          <div className="absolute inset-0 bg-gradient-to-b from-orange-500/45 via-rose-400/20 to-amber-200/10" />
          <svg className="absolute inset-x-0 top-0 h-[40%] w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
            <path d="M0 12 Q50 34 100 12" fill="none" stroke="#3a2a2a" strokeWidth="0.6" />
          </svg>
          {LANTERNS.map((l, i) => (
            <motion.div
              key={l.x}
              className="absolute h-3 w-2.5 -translate-x-1/2 bg-amber-300 shadow-[0_0_10px_4px_rgba(253,224,71,0.55)]"
              style={{ left: `${l.x}%`, top: `${l.y}%`, transformOrigin: 'top center' }}
              animate={still ? undefined : { rotate: [-6, 6, -6] }}
              transition={still ? undefined : { duration: 2.4, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
          {CHEERING.map((v, i) => (
            <motion.div key={v.id} className="absolute bottom-[10%]" style={{ left: v.at }} {...hop(i * 0.18)}>
              <Figure spriteId={v.id} emoji={v.emoji} anim="idleDown" />
            </motion.div>
          ))}
          <motion.div className="absolute bottom-[10%] left-[44%] flex items-end gap-1" {...hop(0.3)}>
            <Figure spriteId={cast.hero.spriteId} emoji={cast.hero.emoji} anim="idleDown" />
            <Figure spriteId={cast.ember.spriteId} emoji={cast.ember.emoji} anim="idleDown" />
          </motion.div>
        </>
      )}

      {id === 'inn-night' && (
        <>
          <Backdrop zone="lumina-village" />
          <div className="absolute inset-0 bg-indigo-950/80" />
          <div className="absolute right-[12%] top-[10%] h-8 w-8 rounded-full bg-amber-50 shadow-[0_0_20px_6px_rgba(255,250,220,0.45)]" />
          {STARS.map(([x, y], i) => (
            <motion.div
              key={`${x},${y}`}
              className="absolute h-1 w-1 bg-white"
              style={{ left: `${x}%`, top: `${y}%` }}
              animate={still ? undefined : { opacity: [0.3, 1, 0.3] }}
              transition={still ? undefined : { duration: 2, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
          {/* The Sleepy Sheep Inn, one window still glowing. */}
          <div className="absolute bottom-[12%] left-1/2 h-[50%] w-[40%] -translate-x-1/2">
            <div className="absolute inset-x-0 top-0 h-[44%] bg-rose-900" style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
            <div className="absolute inset-x-[7%] bottom-0 h-[58%] bg-[#5e5170]" />
            <div className="absolute bottom-[22%] left-[17%] h-[24%] w-[20%] bg-[#2a2440]" />
            <div className="absolute bottom-[22%] right-[17%] h-[24%] w-[20%] bg-amber-300 shadow-[0_0_18px_6px_rgba(252,211,77,0.55)]">
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-800" />
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-amber-800" />
            </div>
            <div className="absolute bottom-0 left-1/2 h-[30%] w-[15%] -translate-x-1/2 bg-[#33263a]" />
          </div>
          {['z', 'Z', 'z'].map((z, i) => (
            <motion.span
              key={i}
              className="absolute font-extrabold text-white/90"
              style={{ left: `${66 + i * 5}%`, bottom: `${44 + i * 8}%`, fontSize: `${12 + i * 4}px` }}
              animate={still ? undefined : { y: [0, -14], opacity: [0, 1, 0] }}
              transition={still ? undefined : { duration: 2.2, repeat: Infinity, delay: i * 0.6 }}
            >
              {z}
            </motion.span>
          ))}
        </>
      )}
    </div>
  );
}
