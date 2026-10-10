import { useState } from 'react';
import { motion } from 'framer-motion';
import { spellsKnown } from '../../content/spells';
import { ALL_SHOP_ITEMS, CONSUMABLES, CONSUMABLE_IDS } from '../../content/items';
import { GATE_KEYS } from '../../content/keys';
import { avatarById } from '../../content/avatars';
import { emberStatus, EMBER_SPRITES, EMBER_SPRITE_IDS, EMBER_STAGE_LABEL } from '../../content/story';
import { COMPANIONS, COMPANION_IDS, companionsInParty } from '../../content/companion';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { activeQuests, activeStep, resolveHint, QUEST_ITEMS } from '../../content/quests';
import { ALL_SECRETS, secretFlag, secretProgress } from '../../content/secrets';
import { zone } from '../../content/zones';
import { NPC_DEFS } from '../../content/npcs';
import { heroMaxHp } from '../../lib/powerups';
import { playerLevel, xpProgress } from '../../lib/level';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { sendFlow } from '../../machines/gameFlow';
import { boatSpot } from '../../content/boat';
import WorldMapPanel from './WorldMapPanel';
import FieldSpellsPanel from './FieldSpellsPanel';
import type { FieldCast } from '../../content/fieldSpells';
import ModalLayer from '../../components/ModalLayer';

/**
 * The pause/party menu (#37): hero status, inventory, Sage equipping,
 * field spells to cast (#75 item 9), manual save, and the way back to the
 * training grounds (quiz mode).
 */
export default function MenuOverlay({
  calmLeft = 0,
  onCast,
}: {
  /** Seconds of the Calm field spell left (0 = off). */
  calmLeft?: number;
  /** Cast a field spell — the menu closes first. */
  onCast?: (cast: FieldCast) => void;
} = {}) {
  const save = useSaveStore((s) => s.save);
  const flush = useSaveStore((s) => s.flush);
  const update = useSaveStore((s) => s.update);
  const remoteError = useSaveStore((s) => s.remoteError);
  const profile = useProfileStore((s) => s.profile);
  const profileError = useProfileStore((s) => s.remoteError);
  const music = useSettingsStore((s) => s.music);
  const sfxOn = useSettingsStore((s) => s.sfx);
  const setMusic = useSettingsStore((s) => s.setMusic);
  const setSfx = useSettingsStore((s) => s.setSfx);
  const [saved, setSaved] = useState(false);
  if (!save) return null;

  const avatar = avatarById(save.avatarId);
  const maxHp = heroMaxHp(avatar, profile?.powerUps ?? {});
  const xp = profile?.xp ?? 0;
  const hp = save.hp ?? maxHp;
  const { stage: ember } = emberStatus(save.flags);
  const quests = activeQuests(save);
  const secretsHere = secretProgress(save.zoneId, save);
  const secretsWorld = {
    found: ALL_SECRETS.filter((s) => save.flags[secretFlag(s.secret.id)]).length,
    total: ALL_SECRETS.length,
  };

  async function doSave() {
    await flush();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <ModalLayer label="Menu" className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-6 w-full max-w-md text-white shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold">📜 Menu</h2>
          {/* A way back right at the top, so a long menu never hides it. */}
          <button
            onClick={() => sendFlow({ type: 'CLOSE' })}
            aria-label="Back to the world"
            title="Back to the world"
            className="w-11 h-11 -mr-2 rounded-lg bg-white/15 hover:bg-white/25 font-bold text-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 mb-3">
          <CharacterPortrait
            spriteId={avatar?.spriteId}
            emoji={avatar?.sprite ?? '🧑'}
            scale={1.25}
            className="text-3xl"
          />
          <div className="flex-1">
            <div className="font-bold text-sm">{avatar?.name ?? 'Hero'}</div>
            {/* The top bar's medallion shows only a bar; here are its numbers (#75 item 14b review). */}
            <div className="text-xs text-yellow-200">
              ⭐ Level {playerLevel(xp)} · {xpProgress(xp).into}/{xpProgress(xp).needed} XP
            </div>
            <div className="text-xs text-white/70">
              ❤️ {hp}/{maxHp} · 🪙 {save.coins}
              {CONSUMABLE_IDS.filter((id) => id === 'potion' || id === 'hint' || save.items[id] > 0).map((id) => (
                <span key={id} title={CONSUMABLES[id].name}>
                  {' · '}
                  {CONSUMABLES[id].emoji} ×{save.items[id]}
                </span>
              ))}
            </div>
          </div>
        </div>

        <WorldMapPanel zoneId={save.zoneId} pos={save.pos} flags={save.flags} boat={boatSpot(save)} aboard={save.aboard} />

        {/* Field spells sit under the map: see where to go, then fly there with Return. */}
        <FieldSpellsPanel save={save} calmLeft={calmLeft} onCast={onCast} />

        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 mb-3">
          <CharacterPortrait spriteId={EMBER_SPRITE_IDS[ember]} emoji={EMBER_SPRITES[ember]} scale={1.25} className="text-3xl" />
          <div className="flex-1">
            <div className="font-bold text-sm">Ember</div>
            <div className="text-xs text-white/70">
              {ember === 'egg'
                ? 'A warm egg — win a battle to hatch it!'
                : `The last dragon of Lumina — ${EMBER_STAGE_LABEL[ember]}. Grows with each crystal!`}
            </div>
          </div>
        </div>

        {/* Battle party: who can be swapped in (🔄 Swap in battle — a free action) */}
        <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm">
          <span className="font-bold mr-2">Battle friends:</span>
          {COMPANION_IDS.filter((id) => id !== 'ember').map((id) => {
            const c = COMPANIONS[id];
            const joined = companionsInParty(save).includes(id);
            return (
              <span key={id} className={`mr-3 ${joined ? '' : 'text-white/40'}`} title={joined ? c.blurb : c.joinHint}>
                {c.emoji} {c.name} {joined ? `(${c.role})` : `🔒 ${c.joinHint}`}
              </span>
            );
          })}
        </div>

        {save.badges.length > 0 && (
          <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm">
            <span className="font-bold mr-2">Badges:</span>
            {save.badges
              .map(
                (b) =>
                  ALL_SHOP_ITEMS.find((i) => i.id === b)?.emoji ??
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
                    <div className="font-semibold text-amber-300">
                      {q.title}
                      {q.side && (
                        <span className="ml-1.5 text-[10px] font-normal text-white/50">side quest · {zone(q.zoneId).name}</span>
                      )}
                    </div>
                    <div className="text-white/70">
                      {step ? resolveHint(step, save) : `Done — go back to ${NPC_DEFS[q.giverNpcId]?.name ?? 'them'} for your reward!`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {secretsWorld.total > 0 && (
          <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm">
            <span className="font-bold mr-2">✨ Secrets:</span>
            {secretsHere.total > 0 && (
              <span>
                {secretsHere.found}/{secretsHere.total} found here ·{' '}
              </span>
            )}
            <span className="text-white/70">
              {secretsWorld.found}/{secretsWorld.total} across Lumina
            </span>
            {secretsHere.total > secretsHere.found && (
              <p className="text-[11px] text-white/50 mt-1">Watch for a faint ✦ twinkle — and some walls are not as solid as they look…</p>
            )}
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

        <div className="bg-white/10 rounded-xl p-3 mb-3">
          <div className="font-bold text-sm mb-2">⚔️ Battle</div>
          <button
            onClick={() => update((s) => ({ ...s, defendTimer: !s.defendTimer }))}
            className="w-full min-h-[44px] flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm"
            aria-pressed={save.defendTimer}
          >
            <span className="text-left">
              ⏳ Defend timer
              <span className="block text-xs text-white/70">
                {save.defendTimer ? 'Answer before the countdown ends to block' : 'Take as long as you need'}
              </span>
            </span>
            <span className={save.defendTimer ? 'text-emerald-300 font-bold' : 'text-white/70'}>
              {save.defendTimer ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        <div className="bg-white/10 rounded-xl p-3 mb-3">
          <div className="font-bold text-sm mb-2">🔊 Audio</div>
          <div className="space-y-2">
            <button
              onClick={() => setMusic(!music)}
              className="w-full flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm"
            >
              <span>🎵 Music</span>
              <span className={music ? 'text-emerald-300 font-bold' : 'text-white/50'}>
                {music ? 'On' : 'Off'}
              </span>
            </button>
            <button
              onClick={() => setSfx(!sfxOn)}
              className="w-full flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm"
            >
              <span>🔔 Sound effects</span>
              <span className={sfxOn ? 'text-emerald-300 font-bold' : 'text-white/50'}>
                {sfxOn ? 'On' : 'Off'}
              </span>
            </button>
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
          {profileError && (
            <p className="text-[11px] text-orange-300">
              ⚠️ XP / level isn't saving to the cloud ({profileError}) — kept on this device
              for now. Apply the latest database migrations to fix it.
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
    </ModalLayer>
  );
}
