import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { NPC_DEFS, ROLE_SERVICE, type DialogueLine } from '../../content/npcs';
import { useSaveStore } from '../../store/saveStore';
import { sendFlow } from '../../machines/gameFlow';

/** Resolves which lines apply given the current story flags. */
function visibleLines(lines: DialogueLine[], flags: Record<string, boolean>): DialogueLine[] {
  return lines.filter((l) => {
    if (typeof l === 'string') return true;
    if (l.ifFlag && !flags[l.ifFlag]) return false;
    if (l.unlessFlag && flags[l.unlessFlag]) return false;
    return true;
  });
}

/**
 * Classic JRPG text box (#37) — one line at a time, player-paced. Service
 * NPCs (merchant/innkeeper/librarian/sage) offer their service on the last
 * line. Lines can set story flags as they're read.
 */
export default function DialogueOverlay({ npcId }: { npcId: string }) {
  const update = useSaveStore((s) => s.update);
  const npc = NPC_DEFS[npcId];
  // Freeze the visible lines at open — a line that sets its own filter flag
  // (e.g. the Elder's one-time greeting) must not reshuffle mid-conversation.
  const [lines] = useState(() =>
    visibleLines(npc?.lines ?? [], useSaveStore.getState().save?.flags ?? {}),
  );
  const [index, setIndex] = useState(0);

  const invalid = !npc || lines.length === 0;
  useEffect(() => {
    if (invalid) sendFlow({ type: 'CLOSE' });
  }, [invalid]);
  if (invalid) return null;

  const line = lines[Math.min(index, lines.length - 1)];
  const text = typeof line === 'string' ? line : line.text;
  const isLast = index >= lines.length - 1;
  const service = ROLE_SERVICE[npc.role];

  function advance() {
    if (typeof line !== 'string' && line.setFlag) {
      const flag = line.setFlag;
      update((s) => ({ ...s, flags: { ...s.flags, [flag]: true } }));
    }
    if (isLast) sendFlow({ type: 'CLOSE' });
    else setIndex((i) => i + 1);
  }

  function openService() {
    if (typeof line !== 'string' && line.setFlag) {
      const flag = line.setFlag;
      update((s) => ({ ...s, flags: { ...s.flags, [flag]: true } }));
    }
    if (service) sendFlow({ type: 'OPEN_SERVICE', service, npcId });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 pb-10 bg-black/30">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-xl bg-indigo-950/95 border-4 border-white/80 rounded-xl p-5 text-white shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-3xl">{npc.sprite}</span>
          <span className="font-bold text-amber-300">{npc.name}</span>
        </div>
        <p className="leading-relaxed min-h-[3rem]">{text}</p>
        <div className="flex justify-end gap-3 mt-3">
          {isLast && service && (
            <button
              onClick={openService}
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-1.5 text-sm"
            >
              {service === 'shop' && '🛒 Shop'}
              {service === 'inn' && '🛏️ Rest'}
              {service === 'library' && '📚 Library'}
              {service === 'sage' && '✨ Learn'}
            </button>
          )}
          <button
            onClick={advance}
            className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm"
          >
            {isLast ? 'Bye!' : '▼ Next'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
