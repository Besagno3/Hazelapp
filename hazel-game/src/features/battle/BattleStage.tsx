import { motion } from 'framer-motion';
import { SpriteSheet } from './SpriteSheet';
import { COMPANION_CLIP, COMPANION_MOTION, FIREBALL_FLIGHT_MS, HERO_MOTION, fitReach, type Keyframes } from './choreography';
import type { ResolvedSprite } from '../../content/sprites';
import type { EmberStage } from '../../content/story';
import type { CompanionId } from '../../content/companion';
import type { RefObject } from 'react';
import type { FloatText, FxSide, StageFx } from './useBattleFx';
import { BOAT_FRAME, BOAT_FRAMES, BOAT_SHEET } from '../../content/tiles';

/** Framer props for a choreography motion (null or reduced motion = at rest). */
function motionProps(k: Keyframes | null, reduceMotion: boolean) {
  if (!k || reduceMotion) return { animate: {} };
  return {
    animate: { x: k.x, y: k.y ?? 0 },
    transition: { duration: k.duration, times: k.times },
  };
}

/** Damage / heal numbers drifting up over one side of the stage (fade in place under reduced motion). */
function Floats({ floats, side, reduceMotion }: { floats: FloatText[]; side: FxSide; reduceMotion: boolean }) {
  return (
    <>
      {floats
        .filter((f) => f.side === side)
        .map((f) => (
          <motion.span
            key={f.id}
            initial={{ y: 0, opacity: 1 }}
            animate={reduceMotion ? { opacity: 0 } : { y: -54, opacity: 0 }}
            transition={{ duration: 1 }}
            className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-extrabold text-2xl ${f.color}`}
          >
            {f.text}
          </motion.span>
        ))}
    </>
  );
}

/** Marlow's boat in a battle at sea (#75 item 14d): its 32 px frames drawn this many times bigger. */
const BOAT_SCALE = 4;
const BOAT_PX = 32 * BOAT_SCALE;
/** How far the boat sits below the hero's feet, so the hull's rim covers only their feet. */
const BOAT_BELOW = 38;
/** At sea the companion stands this much higher, on the deck behind the rim rather than hidden by it. */
const DECK_LIFT = 6;

/**
 * The sea under a battle at sea (#75 item 14d): water from a little above the
 * combatants' feet all the way down the screen (under the menu), so the boat
 * and the sea critter always float in it — the stage shrinks as the menu or a
 * question grows, which would otherwise lift them off the backdrop's water
 * into its sky. Its top fades in, so wherever it meets the backdrop (its sky,
 * or its own sea) there's one soft horizon, not a hard second one. Sized by
 * padding: its bottom edge follows the stage's own bottom padding (pb-1,
 * sm:pb-[8%] — % padding is of the width either way) plus a screen's height.
 */
function SeaFloor() {
  return (
    <div
      aria-hidden
      data-testid="battle-sea"
      className="pointer-events-none absolute inset-x-0 -bottom-[100vh] -z-20 pt-10 pb-[calc(4px_+_100vh)] sm:pt-14 sm:pb-[calc(8%_+_100vh)]"
      style={{
        backgroundImage: [
          'repeating-linear-gradient(to bottom, transparent 0 9px, rgba(255,255,255,0.14) 9px 11px)',
          'linear-gradient(to bottom, rgba(114,176,225,0) 0, #72b0e1 16px, #4f97cf 90px, #3d7eb1 220px)',
        ].join(', '),
        // The wave lines start below the fade, so none float in the sky.
        backgroundSize: '100% 100%, 100% 100%',
        backgroundPosition: '0 18px, 0 0',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}

/**
 * One piece of Marlow's boat under the hero (and the companion): the whole
 * boat behind them, or the front of its hull over their feet so they sit in
 * it. Facing the enemy (the sheet faces right), bobbing gently — still under
 * reduced motion — and never moving with a lunge.
 */
function BoatPiece({ front, reduceMotion }: { front: boolean; reduceMotion: boolean }) {
  const frame = front ? BOAT_FRAME.hullFront[0] : BOAT_FRAME.whole[0];
  return (
    <motion.div
      aria-hidden
      data-testid={front ? 'battle-boat-front' : 'battle-boat'}
      {...(reduceMotion ? {} : { animate: { y: [0, 2, 0] }, transition: { repeat: Infinity, duration: 2.4 } })}
      // Behind everyone on the stage, or (the hull's front) over the hero and
      // companion by coming after them — land battles' stacking is unchanged.
      className={`pointer-events-none absolute -left-1.5 ${front ? '' : '-z-10'}`}
      style={{
        bottom: -BOAT_BELOW,
        width: BOAT_PX,
        height: BOAT_PX,
        backgroundImage: `url(${BOAT_SHEET})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${BOAT_FRAMES * BOAT_PX}px ${BOAT_PX}px`,
        backgroundPosition: `${-frame * BOAT_PX}px 0px`,
        imageRendering: 'pixelated',
        scaleX: -1, // a motion value, so the bob's transform keeps the flip
      }}
    />
  );
}

/**
 * The combatants on the pseudo-3D ground plane: enemy left, hero + the active
 * companion right. Every motion comes from `fx` (`useBattleFx().stage`) and the
 * per-move keyframes in `./choreography`; reduced motion keeps everyone still.
 * Against a sea critter (`afloat`, #75 item 14d) they fight from Marlow's boat.
 */
export function BattleStage({
  fx,
  heroRef,
  enemyRef,
  enemySprite,
  heroSprite,
  companionSprite,
  fireballSprite,
  companionId,
  companionName,
  ember,
  isBoss,
  guarded,
  charging,
  won,
  afloat = false,
}: {
  fx: StageFx;
  /** Measured to fit dives to the screen (`useBattleFx` reads them in event handlers). */
  heroRef: RefObject<HTMLDivElement | null>;
  enemyRef: RefObject<HTMLDivElement | null>;
  enemySprite: ResolvedSprite;
  heroSprite: ResolvedSprite;
  companionSprite: ResolvedSprite;
  fireballSprite: ResolvedSprite;
  companionId: CompanionId;
  companionName: string;
  ember: EmberStage;
  isBoss: boolean;
  guarded: boolean;
  /** The enemy is about to land a charged power move (it glows). */
  charging: boolean;
  /** The battle is won — the companion cheers (the egg wobbles). */
  won: boolean;
  /** A battle at sea (#75 item 14d): the hero and companion stand in Marlow's boat. */
  afloat?: boolean;
}) {
  const { reduceMotion } = fx;
  const bob = (y: number, duration: number) =>
    reduceMotion ? { animate: {} } : { animate: { y: [0, y, 0] }, transition: { repeat: Infinity, duration } };
  const isEgg = companionId === 'ember' && ember === 'egg';
  const companionAnim = fx.companionActing
    ? COMPANION_CLIP[fx.companionMotion]
    : won || fx.cheering
      ? 'cheer'
      : fx.enemyActing
        ? 'hurt'
        : 'idle';

  return (
    // Phones: a smaller floor so menus + question cards fit on screen; flex-1
    // still grows it into any spare height (e.g. while a message shows).
    <div className="relative z-10 flex-1 flex items-end justify-between px-[12%] min-h-[112px] pb-1 sm:min-h-[220px] sm:pb-[8%]">
      {afloat && <SeaFloor />}
      <div className="relative" ref={enemyRef}>
        <motion.div
          key={`el${fx.enemyLunge}`}
          animate={fx.enemyLunge && !reduceMotion ? { x: [0, 70, 0] } : {}}
          transition={{ duration: 0.5 }}
          className={isBoss ? 'text-[7rem] leading-none' : 'text-8xl leading-none'}
          style={{
            filter: charging
              ? 'drop-shadow(0 0 12px rgba(255,90,60,0.9)) drop-shadow(0 14px 10px rgba(0,0,0,0.45))'
              : 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))',
          }}
        >
          {/* knocked back a step whenever a blow lands */}
          <motion.div
            key={`eh${fx.enemyHit}`}
            animate={fx.enemyHit && !reduceMotion ? { x: [0, -14, 6, 0] } : {}}
            transition={{ duration: 0.35 }}
          >
            <motion.div {...bob(-6, 2.2)}>
              <SpriteSheet
                view={enemySprite.def?.battle ?? null}
                anim={fx.enemyActing ? 'attack' : fx.enemyHurt ? 'hurt' : 'idle'}
                emoji={enemySprite.emoji}
                scale={isBoss ? 3 : 2.5}
                className="leading-none"
              />
            </motion.div>
          </motion.div>
        </motion.div>
        <Floats floats={fx.floats} side="enemy" reduceMotion={reduceMotion} />
      </div>

      <div className="relative" ref={heroRef}>
        {afloat && <BoatPiece front={false} reduceMotion={reduceMotion} />}
        <motion.div
          key={`hl${fx.heroLunge}`}
          {...motionProps(fx.heroLunge ? fitReach(HERO_MOTION[fx.heroMotion], fx.reachGap) : null, reduceMotion)}
          className="relative text-8xl leading-none"
          style={{ filter: 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))' }}
        >
          {/* Blazing Comet: the hero streaks down wrapped in fire */}
          {fx.heroActing && fx.heroMotion === 'comet' && !reduceMotion && fireballSprite.def?.battle && (
            <div className="absolute left-[35%] top-1/2 -translate-y-1/2 scale-x-[-1] opacity-90 pointer-events-none">
              <SpriteSheet view={fireballSprite.def.battle} emoji="🔥" scale={4.5} />
            </div>
          )}
          <motion.div {...bob(-5, 1.8)}>
            <SpriteSheet
              view={heroSprite.def?.battle ?? null}
              anim={fx.heroActing ? 'attack' : fx.enemyActing ? 'hurt' : 'idle'}
              emoji={heroSprite.emoji}
              scale={2.5}
              className="leading-none scale-x-[-1]"
            />
          </motion.div>
        </motion.div>
        {guarded && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl">🛡️</span>}
        <motion.div
          key={`ml${fx.companionLunge}`}
          {...motionProps(
            fx.companionLunge ? fitReach(COMPANION_MOTION[fx.companionMotion], fx.reachGap) : null,
            reduceMotion,
          )}
          className="absolute -right-10 bottom-0"
          style={afloat ? { bottom: DECK_LIFT } : undefined}
        >
          {/* A swapped-in companion drops into place */}
          <motion.div
            key={`sw${fx.swapIn}-${companionId}`}
            initial={fx.swapIn ? (reduceMotion ? { opacity: 0 } : { y: -70, opacity: 0 }) : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          >
            <motion.span
              // The egg wobbles with joy on a win; everyone else cheers (sprite clip).
              {...(won && isEgg && !reduceMotion
                ? { animate: { rotate: [0, -12, 12, -8, 0] }, transition: { repeat: Infinity, duration: 0.8 } }
                : bob(-4, 1.4))}
              className={`block ${isEgg ? 'text-2xl' : ember === 'dragon' && companionId === 'ember' ? 'text-5xl' : 'text-3xl'}`}
              title={companionName}
              style={{ filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.4))' }}
            >
              <SpriteSheet
                view={companionSprite.def?.battle ?? null}
                anim={companionAnim}
                emoji={companionSprite.emoji}
                scale={companionId !== 'ember' ? 1.8 : isEgg ? 1.5 : ember === 'dragon' ? 3 : 2}
                // Sheets face right; the companion stands on the hero's side, so face the enemy.
                className="scale-x-[-1]"
              />
            </motion.span>
          </motion.div>
        </motion.div>
        {afloat && <BoatPiece front reduceMotion={reduceMotion} />}
        <Floats floats={fx.floats} side="hero" reduceMotion={reduceMotion} />
      </div>

      {/* Ember's fireballs, flying right → left from Ember to the enemy */}
      {fireballSprite.def?.battle &&
        fx.fireballs.map((f) => (
          <motion.div
            key={f.id}
            initial={{ right: '14%', opacity: 0 }}
            animate={{ right: ['14%', '72%'], opacity: [1, 1, 0] }}
            transition={{
              right: { delay: f.delayMs / 1000, duration: FIREBALL_FLIGHT_MS / 1000, ease: 'easeIn' },
              opacity: { delay: f.delayMs / 1000, duration: FIREBALL_FLIGHT_MS / 1000 + 0.05, times: [0, 0.85, 1] },
            }}
            className="absolute bottom-[22%] pointer-events-none scale-x-[-1]"
          >
            <SpriteSheet view={fireballSprite.def.battle} emoji="🔥" scale={f.big ? 3 : 2} />
          </motion.div>
        ))}
    </div>
  );
}
