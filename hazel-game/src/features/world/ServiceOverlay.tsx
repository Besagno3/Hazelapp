import { useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { SHOP_CATALOG, LIBRARY_XP, type ShopItem } from '../../content/items';
import { SAGES } from '../../content/abilities';
import { NPC_DEFS } from '../../content/npcs';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow } from '../../machines/gameFlow';
import type { CrystalTopic, LibraryEntry, ServiceType } from '../../types';

/**
 * Town services (#37): Shop (coins → potions/hints/badges), Inn (free full
 * heal), Library (re-answer missed questions for bonus XP — the learning
 * loop closing), and Sage (FF6-Esper homage: grants + equips the topic's
 * Special Attack).
 */
export default function ServiceOverlay({
  service,
  npcId,
}: {
  service: ServiceType;
  npcId: string | null;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-6 w-full max-w-xl text-white shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        {service === 'shop' && <Shop />}
        {service === 'inn' && <Inn />}
        {service === 'library' && <Library />}
        {service === 'sage' && <Sage npcId={npcId} />}
        <button
          onClick={() => sendFlow({ type: 'CLOSE' })}
          className="mt-5 w-full bg-white/15 hover:bg-white/25 font-semibold rounded-lg py-2 text-sm"
        >
          Leave
        </button>
      </motion.div>
    </div>
  );
}

function Shop() {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);
  if (!save) return null;

  function buy(item: ShopItem) {
    update((s) => {
      if (s.coins < item.price) return s;
      if (item.id === 'potion') return { ...s, coins: s.coins - item.price, items: { ...s.items, potion: s.items.potion + 1 } };
      if (item.id === 'hint') return { ...s, coins: s.coins - item.price, items: { ...s.items, hint: s.items.hint + 1 } };
      if (s.badges.includes(item.id)) return s;
      return { ...s, coins: s.coins - item.price, badges: [...s.badges, item.id] };
    });
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold mb-1">🛒 Shop</h2>
      <p className="text-sm text-amber-300 mb-4">Your coins: 🪙 {save.coins}</p>
      <div className="space-y-2">
        {SHOP_CATALOG.map((item) => {
          const owned = item.id.startsWith('badge:') && save.badges.includes(item.id);
          const count =
            item.id === 'potion' ? save.items.potion : item.id === 'hint' ? save.items.hint : null;
          const affordable = save.coins >= item.price;
          return (
            <div key={item.id} className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
              <span className="text-2xl">{item.emoji}</span>
              <div className="flex-1">
                <div className="font-bold text-sm">
                  {item.name}
                  {count !== null && <span className="text-white/60 font-normal"> · you have {count}</span>}
                </div>
                <div className="text-xs text-white/70">{item.description}</div>
              </div>
              <button
                onClick={() => buy(item)}
                disabled={owned || !affordable}
                className="bg-amber-400 disabled:bg-white/10 disabled:text-white/40 text-amber-950 font-bold rounded-lg px-3 py-1.5 text-xs"
              >
                {owned ? 'Owned' : `🪙 ${item.price}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Inn() {
  const update = useSaveStore((s) => s.update);
  const [rested, setRested] = useState(false);

  function rest() {
    update((s) => ({ ...s, hp: null }));
    setRested(true);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
  }

  return (
    <div className="text-center">
      <h2 className="text-xl font-extrabold mb-2">🛏️ The Inn</h2>
      {rested ? (
        <p className="text-emerald-300 font-semibold py-6">
          💤 … 🌅 Good morning! Your HP is fully restored!
        </p>
      ) : (
        <>
          <p className="text-sm text-white/80 mb-5">A warm bed and a big breakfast — free for heroes.</p>
          <button
            onClick={rest}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-3"
          >
            Rest until morning
          </button>
        </>
      )}
    </div>
  );
}

function Library() {
  const library = useSaveStore((s) => s.save?.library ?? []);
  const update = useSaveStore((s) => s.update);
  const addXp = useProfileStore((s) => s.addXp);
  const [active, setActive] = useState<LibraryEntry | null>(null);
  const [solved, setSolved] = useState(false);

  function finish() {
    if (active && solved) {
      const id = active.question.id;
      update((s) => ({ ...s, library: s.library.filter((e) => e.question.id !== id) }));
      void addXp(LIBRARY_XP);
    }
    setActive(null);
    setSolved(false);
  }

  if (active) {
    return (
      <div>
        <h2 className="text-xl font-extrabold mb-3">📚 One more try!</h2>
        <QuestionCard
          question={active.question}
          onAnswered={(correct) => {
            setSolved(correct);
            if (correct) confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });
          }}
          continueLabel={solved ? `🌟 +${LIBRARY_XP} XP — beaten!` : 'Back to the shelf'}
          onContinue={finish}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold mb-1">📚 The Library</h2>
      <p className="text-sm text-white/80 mb-4">
        Questions that once stumped you. Beat one for +{LIBRARY_XP} XP!
      </p>
      {library.length === 0 ? (
        <p className="text-emerald-300 text-sm py-4 text-center">
          The shelf is empty — nothing has stumped you. Amazing! 🦉
        </p>
      ) : (
        <div className="space-y-2">
          {library.map((entry) => (
            <button
              key={entry.question.id}
              onClick={() => setActive(entry)}
              className="w-full text-left bg-white/10 hover:bg-white/20 rounded-xl p-3 text-sm transition"
            >
              <span className="capitalize text-xs text-amber-300 font-bold mr-2">
                {entry.question.topic}
              </span>
              {entry.question.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sage({ npcId }: { npcId: string | null }) {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);
  // Sage NPCs always carry a crystal topic (the four main-quest topics).
  const topic = (npcId ? NPC_DEFS[npcId]?.topic : undefined) as CrystalTopic | undefined;
  if (!save || !topic) return null;
  const sage = SAGES[topic];
  const known = save.sages.includes(topic);

  function learn() {
    update((s) => ({
      ...s,
      sages: s.sages.includes(topic!) ? s.sages : [...s.sages, topic!],
      // Kept for older saves; the Spellbook reads `sages`, not the equipped slot.
      sageEquipped: s.sageEquipped ?? topic!,
    }));
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
  }

  return (
    <div className="text-center">
      <div className="text-5xl mb-2">{sage.sprite}</div>
      <h2 className="text-xl font-extrabold mb-1">{sage.name}</h2>
      {!known ? (
        <>
          <p className="text-sm text-white/80 mb-5">
            "Prove your curiosity, and I will add{' '}
            <span className={`font-bold ${sage.flashColor}`}>
              {sage.specialEmoji} {sage.specialName}
            </span>{' '}
            to your Spellbook — a mighty spell powered by tough questions!"
          </p>
          <button
            onClick={learn}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-3"
          >
            ✨ Learn {sage.specialName}
          </button>
        </>
      ) : (
        <p className="text-sm text-emerald-300 mb-4">
          {sage.specialEmoji} {sage.specialName} is in your Spellbook! In battle, open
          <span className="font-bold"> 📖 Spells</span>, spend your charge (◆), and answer one
          super-hard question to cast it.
        </p>
      )}
    </div>
  );
}
