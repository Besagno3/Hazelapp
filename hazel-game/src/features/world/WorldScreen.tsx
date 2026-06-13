import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import WorldCanvas from './WorldCanvas';
import TouchPad from './TouchPad';
import DialogueOverlay from './DialogueOverlay';
import ServiceOverlay from './ServiceOverlay';
import PathQuestionOverlay from './PathQuestionOverlay';
import MenuOverlay from './MenuOverlay';
import StoryPanels from '../../components/StoryPanels';
import { zone, TILE } from '../../content/zones';
import { spawnEnemy } from '../../content/enemies';
import { avatarById } from '../../content/avatars';
import { TOPIC_REGISTRY, crystalFlag } from '../../content/topics';
import {
  emberStatus,
  endingPanels,
  EMBER_SPRITES,
  EMBER_STAGE_LABEL,
  EMBER_HATCHED,
  EMBER_HATCH_SEEN,
  HATCH_PANELS,
  INTRO_PANELS,
  INTRO_SEEN,
  ENDING_SEEN,
} from '../../content/story';
import { playerAge } from '../../lib/age';
import { heroMaxHp } from '../../lib/powerups';
import { prefetchQuestions, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useBattleStore } from '../../store/battleStore';
import { sendFlow, useFlow } from '../../machines/gameFlow';

/**
 * The world of Lumina (#37): KaPlay canvas + JRPG HUD + DOM overlays
 * (dialogue / services / path questions / menu), driven by the game-flow
 * machine's `world.*` substates. The canvas pauses (not unmounts) under
 * overlays and remounts per zone.
 */
export default function WorldScreen() {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
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

  const touchDirRef = useRef({ dx: 0, dy: 0 });
  const onDirChange = useCallback((dx: number, dy: number) => {
    touchDirRef.current = { dx, dy };
  }, []);
  const [toast, setToast] = useState<string | null>(null);

  const age = playerAge(profile);
  const zoneId = save?.zoneId ?? 'lumina-field';
  const z = zone(zoneId);
  const avatar = avatarById(save?.avatarId ?? null);
  const maxHp = heroMaxHp(avatar, profile?.powerUps ?? {});
  const hp = Math.min(save?.hp ?? maxHp, maxHp);
  const flags = save?.flags ?? {};
  const { crystals, stage: ember } = emberStatus(flags);

  // Story moments (#37 story pass) — priority: intro, hatch, then ending.
  const introDue = !flags[INTRO_SEEN];
  const hatchDue = !introDue && flags[EMBER_HATCHED] === true && !flags[EMBER_HATCH_SEEN];
  const endingDue =
    !introDue && !hatchDue && crystals === TOPIC_REGISTRY.length && !flags[ENDING_SEEN];
  const cutscene = introDue || hatchDue || endingDue;

  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = overlay !== null || cutscene;
  }, [overlay, cutscene]);

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
      {/* Responsive stage: as wide as the viewport allows while keeping the
          11:7 zone fully on screen (cap leaves room for top bar + footer). */}
      <div
        className="flex flex-col items-center"
        style={{ width: 'min(96vw, calc((100dvh - 220px) * 11 / 7))' }}
      >
      {/* HUD */}
      <div className="w-full flex items-center justify-between text-white mb-2 px-1">
        <div>
          <h1 className="text-lg font-extrabold leading-tight">{z.name}</h1>
          <p className="text-[11px] text-white/60">
            💎 {crystals}/{TOPIC_REGISTRY.length} crystals restored
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span title={`Ember — ${EMBER_STAGE_LABEL[ember]}`}>{EMBER_SPRITES[ember]}</span>
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
        zoneId={zoneId}
        avatar={avatar}
        age={age}
        emberStage={ember}
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
      </div>
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

      {/* Story cutscenes (#37 story pass) */}
      {introDue && (
        <StoryPanels
          panels={INTRO_PANELS}
          doneLabel="🐲 Begin the adventure!"
          onDone={() => setFlag(INTRO_SEEN)}
        />
      )}
      {hatchDue && (
        <StoryPanels
          panels={HATCH_PANELS}
          doneLabel="🐲 Hello, Ember!"
          onDone={() => setFlag(EMBER_HATCH_SEEN)}
        />
      )}
      {endingDue && (
        <StoryPanels
          panels={endingPanels(avatar.name)}
          doneLabel="🌟 The adventure continues!"
          onDone={() => setFlag(ENDING_SEEN)}
        />
      )}
    </div>
  );
}
