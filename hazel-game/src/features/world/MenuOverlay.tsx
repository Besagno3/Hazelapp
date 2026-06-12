import { useState } from 'react';
import { motion } from 'framer-motion';
import { SAGES } from '../../content/abilities';
import { SHOP_CATALOG } from '../../content/items';
import { avatarById } from '../../content/avatars';
import { hpBonus } from '../../lib/powerups';
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
  const maxHp = (avatar?.maxHp ?? 100) + hpBonus(profile?.powerUps ?? {});
  const hp = save.hp ?? maxHp;

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

        {save.badges.length > 0 && (
          <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm">
            <span className="font-bold mr-2">Badges:</span>
            {save.badges.map((b) => SHOP_CATALOG.find((i) => i.id === b)?.emoji ?? '🏅').join(' ')}
          </div>
        )}

        <div className="bg-white/10 rounded-xl p-3 mb-3">
          <div className="font-bold text-sm mb-2">✨ Specials</div>
          {save.sages.length === 0 ? (
            <p className="text-xs text-white/60">Find a Sage in the world to learn a Special Attack!</p>
          ) : (
            <div className="space-y-1.5">
              {save.sages.map((topic) => {
                const sage = SAGES[topic];
                const equipped = save.sageEquipped === topic;
                return (
                  <div key={topic} className="flex items-center justify-between text-sm">
                    <span>
                      {sage.specialEmoji} {sage.specialName}
                      <span className="text-white/50 text-xs"> · {sage.name}</span>
                    </span>
                    {equipped ? (
                      <span className="text-xs text-emerald-300 font-bold">Equipped</span>
                    ) : (
                      <button
                        onClick={() =>
                          useSaveStore.getState().update((s) => ({ ...s, sageEquipped: topic }))
                        }
                        className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1"
                      >
                        Equip
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
