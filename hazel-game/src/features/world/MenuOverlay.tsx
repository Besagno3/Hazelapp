import { useState } from 'react';
import { motion } from 'framer-motion';
import { spellsKnown } from '../../content/spells';
import { SHOP_CATALOG } from '../../content/items';
import { GATE_KEYS } from '../../content/keys';
import { avatarById } from '../../content/avatars';
import { emberStatus, EMBER_SPRITES, EMBER_STAGE_LABEL } from '../../content/story';
import { activeQuests, activeStep, resolveHint, QUEST_ITEMS } from '../../content/quests';
import { heroMaxHp } from '../../lib/powerups';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow } from '../../machines/gameFlow';

/**
 * The pause/party menu (#37): hero status, inventory, Sage equipping,
 * manual save, and the way back to the training grounds (quiz mode).
 */
export default function MenuOverlay() {
  const save = useSaveStore((s) => s.save);
  const flush = useSaveStore((s) => s.flush);
  const remoteError = useSaveStore((s) => s.remoteError);
  const profile = useProfileStore((s) => s.profile);
  const [saved, setSaved] = useState(false);
  if (!save) return null;

  const avatar = avatarById(save.avatarId);
  const maxHp = heroMaxHp(avatar, profile?.powerUps ?? {});
  const hp = save.hp ?? maxHp;
  const { stage: ember } = emberStatus(save.flags);
  const quests = activeQuests(save);

  async function doSave() {
    await flush();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-6 w-full max-w-md text-white shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <h2 className="text-xl font-extrabold mb-4">📜 Menu</h2>

        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 mb-3">
          <span className="text-3xl">{avatar?.sprite ?? '🧑'}</span>
          <div className="flex-1">
            <div className="font-bold text-sm">{avatar?.name ?? 'Hero'}</div>
            <div className="text-xs text-white/70">
              ❤️ {hp}/{maxHp} · 🪙 {save.coins} · 🧪 ×{save.items.potion} · 🪶 ×{save.items.hint}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 mb-3">
          <span className="text-3xl">{EMBER_SPRITES[ember]}</span>
          <div className="flex-1">
            <div className="font-bold text-sm">Ember</div>
            <div className="text-xs text-white/70">
              {ember === 'egg'
                ? 'A warm egg — win a battle to hatch it!'
                : `The last dragon of Lumina — ${EMBER_STAGE_LABEL[ember]}. Grows with each crystal!`}
            </div>
          </div>
        </div>

        {save.badges.length > 0 && (
          <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm">
            <span className="font-bold mr-2">Badges:</span>
            {save.badges
              .map(
                (b) =>
                  SHOP_CATALOG.find((i) => i.id === b)?.emoji ??
                  GATE_KEYS.find((k) => k.id === b)?.emoji ??
                  '🏅',
              )
              .join(' ')}
          </div>
        )}

        {save.questItems.length > 0 && (
          <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm">
            <span className="font-bold mr-2">Carrying:</span>
            {save.questItems
              .map((id) => QUEST_ITEMS[id])
              .filter(Boolean)
              .map((item) => `${item.emoji} ${item.name}`)
              .join(' · ')}
          </div>
        )}

        {quests.length > 0 && (
          <div className="bg-white/10 rounded-xl p-3 mb-3">
            <div className="font-bold text-sm mb-2">❗ Quests</div>
            <div className="space-y-2">
              {quests.map((q) => {
                const step = activeStep(q, save);
                return (
                  <div key={q.id} className="text-xs">
                    <div className="font-semibold text-amber-300">{q.title}</div>
                    <div className="text-white/70">
                      {step ? resolveHint(step, save) : 'Done — go collect your reward!'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white/10 rounded-xl p-3 mb-3">
          <div className="font-bold text-sm mb-2">📖 Spellbook</div>
          <p className="text-[11px] text-white/50 mb-2">
            Cast any of these in battle by answering one super-hard question. Find Sages and
            restore crystals to learn more!
          </p>
          <div className="space-y-1.5">
            {spellsKnown(save).map((spell) => (
              <div key={spell.id} className="flex items-center justify-between text-sm gap-2">
                <span>
                  <span className={spell.color}>{spell.emoji} {spell.name}</span>
                  <span className="block text-[10px] text-white/50">{spell.description}</span>
                </span>
                <span className="text-xs text-amber-300 whitespace-nowrap">◆{spell.cost}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => void doSave()}
            className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg py-2 text-sm"
          >
            {saved ? '✅ Saved!' : '💾 Save game'}
          </button>
          {remoteError && (
            <p className="text-[11px] text-orange-300">
              Cloud save unavailable ({remoteError}) — progress is kept on this device.
            </p>
          )}
          <button
            onClick={() => sendFlow({ type: 'EXIT_TO_TOPICS' })}
            className="w-full bg-white/15 hover:bg-white/25 font-semibold rounded-lg py-2 text-sm"
          >
            🎓 Training grounds (quiz)
          </button>
          <button
            onClick={() => sendFlow({ type: 'CLOSE' })}
            className="w-full bg-white/15 hover:bg-white/25 font-semibold rounded-lg py-2 text-sm"
          >
            Back to the world
          </button>
        </div>
      </motion.div>
    </div>
  );
}
