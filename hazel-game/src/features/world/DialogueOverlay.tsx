import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { NPC_DEFS, ROLE_SERVICE, type DialogueLine } from '../../content/npcs';
import { questDialogue, applyQuestFinish, type QuestDialogue } from '../../content/quests';
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
 * Classic JRPG text box (#37) — one line at a time, player-paced. Quest
 * givers speak their quest conversation (offer / in-progress / completion
 * with rewards, see content/quests.ts) before falling back to their normal
 * lines. Service NPCs offer their service on the last line; lines can set
 * story flags as they're read.
 */
export default function DialogueOverlay({ npcId }: { npcId: string }) {
  const update = useSaveStore((s) => s.update);
  const npc = NPC_DEFS[npcId];
  // Freeze the conversation at open — quest completion or a line that sets
  // its own filter flag must not reshuffle lines mid-conversation.
  const [conversation] = useState<{ lines: DialogueLine[]; quest: QuestDialogue | null }>(() => {
    const save = useSaveStore.getState().save;
    const quest = save ? questDialogue(npcId, save) : null;
    if (quest) return { lines: quest.lines, quest };
    return { lines: visibleLines(npc?.lines ?? [], save?.flags ?? {}), quest: null };
  });
  const { lines, quest } = conversation;
  const [index, setIndex] = useState(0);

  const invalid = !npc || lines.length === 0;
  useEffect(() => {
    if (invalid) sendFlow({ type: 'CLOSE' });
  }, [invalid]);
  if (invalid) return null;

  const line = lines[Math.min(index, lines.length - 1)];
  const text = typeof line === 'string' ? line : line.text;
  const isLast = index >= lines.length - 1;
  // Quest conversations don't double as service menus.
  const service = quest ? undefined : ROLE_SERVICE[npc.role];

  function applyLineFlag() {
    if (typeof line !== 'string' && line.setFlag) {
      const flag = line.setFlag;
      update((s) => ({ ...s, flags: { ...s.flags, [flag]: true } }));
    }
  }

  function advance() {
    applyLineFlag();
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    if (quest && quest.finish) {
      update((s) => applyQuestFinish(s, quest));
    }
    sendFlow({ type: 'CLOSE' });
  }

  function openService() {
    applyLineFlag();
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
          {quest && (
            <span className="ml-auto text-[10px] uppercase tracking-wider bg-amber-400/20 text-amber-300 rounded px-2 py-0.5">
              ❗ {quest.quest.title}
            </span>
          )}
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
            {!isLast ? '▼ Next' : quest?.finish === 'complete' ? '🎉 Thanks!' : quest?.finish === 'offer' ? "I'm on it!" : 'Bye!'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
