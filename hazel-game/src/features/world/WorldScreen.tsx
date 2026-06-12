import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import WorldCanvas from './WorldCanvas';
import TouchPad from './TouchPad';
import DialogueOverlay from './DialogueOverlay';
import ServiceOverlay from './ServiceOverlay';
import PathQuestionOverlay from './PathQuestionOverlay';
import MenuOverlay from './MenuOverlay';
import { zone, TILE } from '../../content/zones';
import { spawnEnemy } from '../../content/enemies';
import { avatarById } from '../../content/avatars';
import { TOPIC_REGISTRY, crystalFlag } from '../../content/topics';
import { calcAge } from '../../lib/age';
import { hpBonus } from '../../lib/powerups';
import { prefetchQuestions, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useBattleStore } from '../../store/battleStore';
import { sendFlow, useFlow } from '../../machines/gameFlow';

const DEFAULT_AGE = 10;

/**
 * The world of Lumina (#37): KaPlay canvas + JRPG HUD + DOM overlays
 * (dialogue / services / path questions / menu), driven by the game-flow
 * machine's `world.*` substates. The canvas pauses (not unmounts) under
 * overlays and remounts per zone.
 */
export default function WorldScreen() {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);
  const flush = useSaveStore((s) => s.flush);
  const profile = useProfileStore((s) => s.profile);
  const defeatedIds = useBattleStore((s) => s.defeatedIds);
  const startBattle = useBattleStore((s) => s.start);

  const overlay = useFlow((s) =>
    s.matches({ world: 'dialogue' })
      ? 'dialogue'
      : s.matches({ world: 'service' })
        ? 'service'
        : s.matches({ world: 'path' })
          ? 'path'
          : s.matches({ world: 'menu' })
            ? 'menu'
            : null,
  );
  const npcId = useFlow((s) => s.context.npcId);
  const service = useFlow((s) => s.context.service);
  const pathTarget = useFlow((s) => s.context.pathTarget);

  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = overlay !== null;
  }, [overlay]);
  const touchDirRef = useRef({ dx: 0, dy: 0 });
  const onDirChange = useCallback((dx: number, dy: number) => {
    touchDirRef.current = { dx, dy };
  }, []);
  const [toast, setToast] = useState<string | null>(null);

  const age = profile ? calcAge(profile.birthYear, profile.birthMonth) : DEFAULT_AGE;
  const zoneId = save?.zoneId ?? 'lumina-field';
  const z = zone(zoneId);
  const avatar = avatarById(save?.avatarId ?? null);
  const maxHp = (avatar?.maxHp ?? 100) + hpBonus(profile?.powerUps ?? {});
  const hp = Math.min(save?.hp ?? maxHp, maxHp);
  const crystals = TOPIC_REGISTRY.filter((t) => save?.flags[crystalFlag(t.id)]).length;
  const endingDue = crystals === TOPIC_REGISTRY.length && !save?.flags['ending-seen'];

  // Warm each living enemy's battle questions while the player explores.
  useEffect(() => {
    if (!save) return;
    for (const p of z.enemies) {
      const enemy = spawnEnemy(p.defId, zoneId, `${p.defId}@${p.x},${p.y}`, age);
      if (enemy.isBoss && save.flags[crystalFlag(enemy.topic)]) continue;
      if (defeatedIds.includes(enemy.instanceId)) continue;
      prefetchQuestions(enemy.topic, age, enemy.level, BATTLE_QUESTION_COUNT);
    }
    // Re-warm only when the zone changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  useEffect(() => {
    if (endingDue) confetti({ particleCount: 300, spread: 120, origin: { y: 0.4 } });
  }, [endingDue]);

  if (!save || !avatar) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-700 to-teal-900 p-6">
        <p className="text-white mb-4">Pick an avatar first to enter the world.</p>
        <button
          onClick={() => sendFlow({ type: 'EXIT_TO_TOPICS' })}
          className="bg-white text-emerald-700 font-semibold rounded-lg px-5 py-2"
        >
          Back
        </button>
      </div>
    );
  }

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-br from-slate-900 to-indigo-950 p-4 pt-16">
      {/* HUD */}
      <div className="w-full max-w-[704px] flex items-center justify-between text-white mb-2 px-1">
        <div>
          <h1 className="text-lg font-extrabold leading-tight">{z.name}</h1>
          <p className="text-[11px] text-white/60">
            💎 {crystals}/{TOPIC_REGISTRY.length} crystals restored
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span title="HP">
            ❤️ {hp}/{maxHp}
          </span>
          <span title="Coins">🪙 {save.coins}</span>
          <span title="Potions">🧪 {save.items.potion}</span>
          <button
            onClick={() => sendFlow({ type: 'OPEN_MENU' })}
            className="bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            📜 Menu
          </button>
        </div>
      </div>

      <WorldCanvas
        key={zoneId}
        zoneId={zoneId}
        avatar={avatar}
        age={age}
        startPos={save.pos}
        flags={save.flags}
        openedChests={save.openedChests}
        defeatedIds={defeatedIds}
        pausedRef={pausedRef}
        touchDirRef={touchDirRef}
        callbacks={{
          onMove: (x, y) => update((s) => ({ ...s, pos: { x, y } })),
          onTalk: (id) => sendFlow({ type: 'TALK', npcId: id }),
          onPath: (target) => sendFlow({ type: 'OPEN_PATH', target }),
          onSaveCrystal: () => {
            void flush();
            showToast('💎 Game saved!');
          },
          onExit: (to, spawnX, spawnY) =>
            update((s) => ({
              ...s,
              zoneId: to,
              pos: { x: spawnX * TILE + TILE / 2, y: spawnY * TILE + TILE / 2 },
            })),
          onEncounter: (enemy) => {
            startBattle(enemy, hp, maxHp);
            sendFlow({ type: 'ENCOUNTER' });
          },
        }}
      />

      <p className="text-white/50 text-xs mt-2">
        Walk: arrow keys / WASD · bump into friends to talk, foes to battle!
      </p>
      <TouchPad onDirChange={onDirChange} />

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-8 bg-white text-gray-800 font-semibold rounded-xl px-5 py-2.5 shadow-2xl z-50"
        >
          {toast}
        </motion.div>
      )}

      {/* Overlays (machine substates) */}
      {overlay === 'dialogue' && npcId && <DialogueOverlay npcId={npcId} />}
      {overlay === 'service' && service && <ServiceOverlay service={service} npcId={npcId} />}
      {overlay === 'path' && pathTarget && <PathQuestionOverlay target={pathTarget} />}
      {overlay === 'menu' && <MenuOverlay />}

      {/* Ending (all four crystals restored) */}
      {endingDue && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gradient-to-br from-indigo-900 to-purple-900 border-4 border-amber-300 rounded-3xl p-8 max-w-lg text-center text-white shadow-2xl"
          >
            <div className="text-6xl mb-3">💎✨💎</div>
            <h2 className="text-2xl font-extrabold text-amber-300 mb-3">
              The Crystals of Knowing shine again!
            </h2>
            <p className="text-sm text-white/85 leading-relaxed mb-5">
              The fog of Forgetting melts away. Numbers dance in the rivers, the skies remember
              their stars, the great engines hum, and color floods back into the world.
              <br />
              <br />
              Lumina is bright because <span className="font-bold">you kept learning</span>. The
              Fiends may stir again one day… and you'll be even smarter when they do. 🌟
            </p>
            <button
              onClick={() => update((s) => ({ ...s, flags: { ...s.flags, 'ending-seen': true } }))}
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-3"
            >
              The adventure continues!
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
