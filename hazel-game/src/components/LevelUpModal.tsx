import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useProfileStore } from '../store/profileStore';
import { playerLevel } from '../lib/level';
import { POWER_UPS, totalPowerUps } from '../lib/powerups';
import type { PowerUpId } from '../types';

/**
 * Level-up celebration. Shows whenever the player owes a power-up choice —
 * `owed = (playerLevel - 1) - powerUpsChosen` — derived entirely from the
 * profile, so it survives reloads and handles multi-level jumps (one
 * celebration per level). Choosing a power-up decrements `owed`.
 */
export default function LevelUpModal() {
  const profile = useProfileStore((s) => s.profile);
  const addPowerUp = useProfileStore((s) => s.addPowerUp);

  const level = profile ? playerLevel(profile.xp) : 1;
  const owned = profile ? totalPowerUps(profile.powerUps) : 0;
  const owed = Math.max(0, level - 1 - owned);
  const celebrating = owed > 0 ? level - owed + 1 : null;

  useEffect(() => {
    if (celebrating !== null) {
      confetti({ particleCount: 220, spread: 100, origin: { y: 0.45 } });
    }
  }, [celebrating]);

  if (!profile || celebrating === null) return null;

  function choose(id: PowerUpId) {
    void addPowerUp(id);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <motion.div
        key={celebrating}
        initial={{ scale: 0.7, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl"
      >
        <div className="text-6xl mb-2">🎉</div>
        <h2 className="text-3xl font-extrabold text-purple-700">Level Up!</h2>
        <p className="text-gray-500 mb-6">
          You reached Level {celebrating} — choose a power-up:
        </p>

        <div className="grid grid-cols-2 gap-3">
          {POWER_UPS.map((pu) => {
            const have = profile.powerUps[pu.id] ?? 0;
            return (
              <button
                key={pu.id}
                onClick={() => choose(pu.id)}
                className="border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl p-4 text-left transition"
              >
                <div className="text-3xl mb-1">{pu.icon}</div>
                <div className="font-bold text-sm text-gray-800">{pu.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{pu.description}</div>
                {have > 0 && (
                  <div className="text-[11px] text-purple-600 font-semibold mt-1">
                    Owned ×{have}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
