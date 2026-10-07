import { motion } from 'framer-motion';
import { CHARGE_MAX } from '../../content/abilities';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import type { Avatar, BattleEnemy } from '../../types';

const hpPct = (hp: number, max: number) => `${Math.max(0, (hp / max) * 100)}%`;

/** ◆ pips for the spell-charge gauge. */
export function ChargePips({ charge }: { charge: number }) {
  return (
    <>
      {Array.from({ length: CHARGE_MAX }).map((_, i) => (
        <span key={i} className={i < charge ? 'text-amber-300' : 'text-white/25'}>
          ◆
        </span>
      ))}
    </>
  );
}

/** FF-style status boxes: enemy (left) and hero with charge gauge (right). */
export function BattleHud({
  enemy,
  enemyHp,
  enemyShielded,
  avatar,
  playerHp,
  playerMaxHp,
  charge,
}: {
  enemy: BattleEnemy;
  enemyHp: number;
  enemyShielded: boolean;
  avatar: Avatar;
  playerHp: number;
  playerMaxHp: number;
  charge: number;
}) {
  return (
    <div className="relative z-10 flex justify-between p-4 gap-4">
      <div className="bg-indigo-950/90 border-2 border-white/70 rounded-xl px-4 py-2 text-white w-60">
        <div className="flex justify-between text-sm font-bold">
          <span>
            {enemy.isBoss && '👑 '}
            {enemyShielded && '🛡️ '}
            {enemy.name}
          </span>
          <span className="text-white/70">Lv {enemy.level}</span>
        </div>
        <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
          <motion.div className="h-full bg-red-400 rounded-full" animate={{ width: hpPct(enemyHp, enemy.maxHp) }} />
        </div>
        <div className="text-[11px] text-white/60 text-right mt-0.5">
          {enemyHp}/{enemy.maxHp}
        </div>
      </div>
      <div className="bg-indigo-950/90 border-2 border-white/70 rounded-xl px-4 py-2 text-white w-60">
        <div className="flex justify-between text-sm font-bold">
          <span>
            <CharacterPortrait
              spriteId={avatar.spriteId}
              emoji={avatar.sprite}
              scale={0.75}
              className="inline-block align-middle mr-1"
            />
            {avatar.name}
          </span>
          <span className="flex gap-0.5 items-center" title="Special charge">
            <ChargePips charge={charge} />
          </span>
        </div>
        <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
          <motion.div className="h-full bg-green-400 rounded-full" animate={{ width: hpPct(playerHp, playerMaxHp) }} />
        </div>
        <div className="text-[11px] text-white/60 text-right mt-0.5">
          {playerHp}/{playerMaxHp}
        </div>
      </div>
    </div>
  );
}
