import { motion } from 'framer-motion';
import { SpriteSheet } from './SpriteSheet';
import type { ResolvedSprite } from '../../content/sprites';
import type { EmberStage } from '../../content/story';
import type { FloatText, FxSide } from './useBattleFx';

/** Damage / heal numbers drifting up over one side of the stage. */
function Floats({ floats, side }: { floats: FloatText[]; side: FxSide }) {
  return (
    <>
      {floats
        .filter((f) => f.side === side)
        .map((f) => (
          <motion.span
            key={f.id}
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -54, opacity: 0 }}
            transition={{ duration: 1 }}
            className={`absolute -top-6 left-1/2 -translate-x-1/2 font-extrabold text-2xl ${f.color}`}
          >
            {f.text}
          </motion.span>
        ))}
    </>
  );
}

/** The combatants on the pseudo-3D ground plane: enemy left, hero + Ember right. */
export function BattleStage({
  enemySprite,
  heroSprite,
  emberSprite,
  ember,
  isBoss,
  guarded,
  floats,
  heroLunge,
  enemyLunge,
  heroActing,
  enemyActing,
}: {
  enemySprite: ResolvedSprite;
  heroSprite: ResolvedSprite;
  emberSprite: ResolvedSprite;
  ember: EmberStage;
  isBoss: boolean;
  guarded: boolean;
  floats: FloatText[];
  heroLunge: number;
  enemyLunge: number;
  heroActing: boolean;
  enemyActing: boolean;
}) {
  return (
    <div className="relative z-10 flex-1 flex items-end justify-between px-[12%] pb-[8%] min-h-[220px]">
      <div className="relative">
        <motion.div
          key={`el${enemyLunge}`}
          animate={enemyLunge ? { x: [0, 70, 0] } : {}}
          transition={{ duration: 0.5 }}
          className={isBoss ? 'text-[7rem] leading-none' : 'text-8xl leading-none'}
          style={{ filter: 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))' }}
        >
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.2 }}>
            <SpriteSheet
              view={enemySprite.def?.battle ?? null}
              anim={enemyActing ? 'attack' : heroActing ? 'hurt' : 'idle'}
              emoji={enemySprite.emoji}
              scale={isBoss ? 3 : 2.5}
              className="leading-none"
            />
          </motion.div>
        </motion.div>
        <Floats floats={floats} side="enemy" />
      </div>

      <div className="relative">
        <motion.div
          key={`hl${heroLunge}`}
          animate={heroLunge ? { x: [0, -70, 0] } : {}}
          transition={{ duration: 0.5 }}
          className="text-8xl leading-none"
          style={{ filter: 'drop-shadow(0 14px 10px rgba(0,0,0,0.45))' }}
        >
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>
            <SpriteSheet
              view={heroSprite.def?.battle ?? null}
              anim={heroActing ? 'attack' : enemyActing ? 'hurt' : 'idle'}
              emoji={heroSprite.emoji}
              scale={2.5}
              className="leading-none scale-x-[-1]"
            />
          </motion.div>
        </motion.div>
        {guarded && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl">🛡️</span>}
        <motion.span
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          className={`absolute -right-10 bottom-0 ${ember === 'egg' ? 'text-2xl' : ember === 'dragon' ? 'text-5xl' : 'text-3xl'}`}
          title="Ember"
          style={{ filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.4))' }}
        >
          <SpriteSheet
            view={emberSprite.def?.battle ?? null}
            anim="idle"
            emoji={emberSprite.emoji}
            scale={ember === 'egg' ? 1.5 : ember === 'dragon' ? 3 : 2}
          />
        </motion.span>
        <Floats floats={floats} side="hero" />
      </div>
    </div>
  );
}
