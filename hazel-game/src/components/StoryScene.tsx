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

/** Two sheep cheering too (left %, facing). */
const SHEEP = [
  { at: '33%', flip: false },
  { at: '85%', flip: true },
];

/** The Spire's stairs (viewBox 0 0 100 100): seven steps down from its door to the ground. */
const STAIRS =
  'M12 100 V92 H22 V90 H32 V88 H42 V86 H52 V84 H62 V82 H72 V80 H86 V100 Z';

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

/** A little pixel sheep (there's no sheep sprite in the game yet). */
function Sheep({ flip }: { flip: boolean }) {
  return (
    <svg width="30" height="22" viewBox="0 0 15 11" shapeRendering="crispEdges" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <rect x="1" y="2" width="10" height="6" fill="#f4f1ea" />
      <rect x="2" y="1" width="8" height="8" fill="#f4f1ea" />
      <rect x="2" y="7" width="8" height="1" fill="#d9d3c6" />
      <rect x="10" y="2" width="4" height="4" fill="#3b3340" />
      <rect x="12" y="3" width="1" height="1" fill="#f4f1ea" />
      <rect x="3" y="9" width="1" height="2" fill="#3b3340" />
      <rect x="8" y="9" width="1" height="2" fill="#3b3340" />
    </svg>
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

  // The village throws its cheer with a burst of confetti, from about where
  // the picture sits — and clears it away when the picture goes, so none
  // drifts into the night at the inn.
  useEffect(() => {
    if (id !== 'village-cheer' || still) return;
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.3 }, disableForReducedMotion: true });
    return () => {
      confetti.reset();
    };
  }, [id, still]);

  const hop = (delay: number) =>
    still ? {} : { animate: { y: [0, -7, 0] }, transition: { duration: 0.55, repeat: Infinity, repeatDelay: 0.5, delay } };

  return (
    <div
      aria-hidden
      className="relative mx-auto mb-5 aspect-[16/9] w-full max-w-md overflow-hidden rounded-xl border-4 border-white/15 bg-slate-900 [@media(max-height:500px)]:mb-3"
      // No taller than about a third of the screen, so on a phone held
      // sideways the words and the button still fit below it.
      style={{ width: 'min(100%, 28rem, calc(35dvh * 16 / 9))' }}
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
          {/* The Spire's long stairs, stepping down from its door to the ground. */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={STAIRS} fill="#4b4560" stroke="#a99fd0" strokeWidth="0.5" />
          </svg>
          {/* Walking down them, away from the Spire, toward home. */}
          <motion.div
            className="absolute flex items-end gap-1"
            initial={still ? { left: '36%', bottom: '14%' } : { left: '58%', bottom: '18%' }}
            animate={still ? { left: '36%', bottom: '14%' } : { left: '14%', bottom: '9%' }}
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
          {/* "…so loudly that the sheep join in!" */}
          {SHEEP.map((sh, i) => (
            <motion.div key={sh.at} className="absolute bottom-[9%]" style={{ left: sh.at }} {...hop(0.1 + i * 0.25)}>
              <Sheep flip={sh.flip} />
            </motion.div>
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
            {/* Its blue roof, as on the village map, in the moonlight. */}
            <div className="absolute inset-x-0 top-0 h-[44%] bg-[#2c4f86]" style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
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
