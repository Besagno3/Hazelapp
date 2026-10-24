import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MINIGAMES, gameHostedBy } from '../../content/minigames';
import { NPC_DEFS, ROLE_SERVICE, npcEmoji, npcName, npcSpriteId, visibleLines, type DialogueLine } from '../../content/npcs';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { riddleTopic, riddleWords, questConversation, type QuestConversation } from '../../content/quests';
import { boatFetchOffer, boatSpot, fetchBoatHome } from '../../content/boat';
import { ZONES, topicAt } from '../../content/zones';
import { wayfindingLines } from '../../lib/wayfinding';
import { fieldSpellTaughtBy, knowsFieldSpell } from '../../content/fieldSpells';
import { useSaveStore } from '../../store/saveStore';
import { useKeyboardStore } from '../../store/keyboardStore';
import { LINE_HOLD_MS, penPalFor, penPalReadLine, penPalReplyFlag, scriptoriumOpen, type PenPal } from '../../content/typing';
import { LineRun } from '../typing/TypingLesson';
import { shortWindow } from '../typing/hints';
import { sfx } from '../../lib/audio';
import { sendFlow } from '../../machines/gameFlow';
import ModalLayer from '../../components/ModalLayer';
import type { ServiceType } from '../../types';

/**
 * Classic JRPG text box (#37) — one line at a time, player-paced. Quest
 * givers speak their quest conversation (offer / in-progress / completion
 * with rewards, see content/quests.ts) before falling back to their normal
 * lines. Service NPCs offer their service on the last line (an innkeeper on
 * every line); lines can set
 * story flags as they're read. Guides and signposts add the way to the next
 * goal (lib/wayfinding.ts).
 */
/** Each service's button (a `Record`, so a new service can't get a blank one — 16e code review). */
const SERVICE_BUTTON: Record<ServiceType, string> = {
  shop: '🛒 Shop',
  inn: '🛏️ Rest',
  library: '📚 Library',
  sage: '✨ Learn',
  trial: '🕯️ Take the trial',
  name: '🌑 Answer Umbra',
};

export default function DialogueOverlay({ npcId }: { npcId: string }) {
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  // Who they look like now (#75 item 16a: Wisp's new face once the name is learned).
  const flagsNow = useSaveStore((s) => s.save?.flags);
  const npc = NPC_DEFS[npcId];
  // Freeze the conversation at open — quest completion or a line that sets
  // its own filter flag must not reshuffle lines mid-conversation.
  const [conversation] = useState<{
    lines: DialogueLine[];
    quest: QuestConversation | null;
    fetchOffer: { line: string; done: string } | null;
  }>(() => {
    const save = useSaveStore.getState().save;
    const quest = save ? questConversation(npcId, save) : null;
    if (quest) {
      // A letter the kid added a line to (#165 item 9): the giver reads it back before the reward.
      const read = quest.finishKind === 'complete' && quest.questId && save ? penPalReadLine(quest.questId, save.flags) : null;
      const lines = read && quest.lines.length > 1 ? [...quest.lines.slice(0, -1), read, quest.lines[quest.lines.length - 1]] : quest.lines;
      return { lines, quest, fetchOffer: null };
    }
    const flags = save?.flags ?? {};
    // Guides end on "where to next?"; signposts read out the way (#75 item 6) —
    // from Old Marlow first, when the boat's been left away from his dock (#117p r1).
    const wayfinding = npc ? wayfindingLines(ZONES, npc, flags, save ? boatSpot(save) : null) : [];
    // Old Marlow offers to row the boat home when it's away (#75 item 14).
    const fetchOffer = save ? boatFetchOffer(npcId, save) : null;
    const lines = [...visibleLines(npc?.lines ?? [], flags), ...wayfinding, ...(fetchOffer ? [fetchOffer.line] : [])];
    return { lines, quest: null, fetchOffer };
  });
  const { lines, quest, fetchOffer } = conversation;
  const [index, setIndex] = useState(0);
  // A choice made (#75 item 16b): what's said after it, before the box closes.
  const [picked, setPicked] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  // A pen-pal reply (#165 item 9): offered at a letter's bring step with a keyboard
  // and the capitals lesson; the line picked, then typed, then its thanks.
  const keyboard = useKeyboardStore((s) => s.present);
  const holdRule = useSaveStore((s) => s.save?.typingAnchor ?? true);
  const penPal: PenPal | null = quest?.finishKind === 'step' && quest.step ? penPalFor(quest.step) : null;
  const canWrite = !!penPal && keyboard && scriptoriumOpen(flagsNow ?? {});
  const [writing, setWriting] = useState<'pick' | number | 'done' | null>(null);
  // The envelope's beat after the line is typed (review round 4), cleared if the talk closes first.
  const written = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(written.current ?? undefined), []);
  // The line is typed and its envelope is on its way (round 5: the buttons beside it stayed live in the beat).
  const [sealing, setSealing] = useState(false);
  // The line on show: what a screen reader reads as the box opens (#142 r1).
  const lineId = useId();

  const invalid = !npc || lines.length === 0;
  useEffect(() => {
    if (invalid) sendFlow({ type: 'CLOSE' });
  }, [invalid]);
  // On a choice, the arrow keys move between its buttons, from none focused —
  // so Enter picks only once a name has been chosen with them (16b review round 3).
  const rowRef = useRef<HTMLDivElement>(null);
  // …and after a pick, → reaches 🎉 Thanks (16b review round 4).
  const choiceUp = !invalid && index >= lines.length - 1 && !!quest?.choice?.length;
  useEffect(() => {
    if (!choiceUp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const buttons = Array.from(rowRef.current?.querySelectorAll('button') ?? []);
      if (!step || !buttons.length) return;
      e.preventDefault();
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = at < 0 ? (step > 0 ? 0 : buttons.length - 1) : (at + step + buttons.length) % buttons.length;
      buttons[next].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choiceUp]);
  // "⛵ Row her home" goes with its click: focus goes on to the way out (Bye!),
  // before the box can take it — the box's description is his new line, which
  // the live region says already, so it isn't read twice (#159 r2).
  const onwardRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (fetched) onwardRef.current?.focus({ preventScroll: true });
  }, [fetched]);
  if (invalid) return null;

  const line = lines[Math.min(index, lines.length - 1)];
  const text = picked ?? (fetched && fetchOffer ? fetchOffer.done : typeof line === 'string' ? line : line.text);
  const isLast = index >= lines.length - 1;
  // Giver conversations don't double as service menus, but a service NPC who
  // is merely a quest STEP target (Sage Cog polishing, Sage Muse singing)
  // must still offer their service — a sage's "Learn" can't be quest-locked.
  const service =
    quest && quest.finishKind !== 'step' ? undefined : ROLE_SERVICE[npc.role];
  // An innkeeper passes on the news from the road (#75 item 11), but a tired
  // hero shouldn't have to hear it first: Rest is on offer from line one.
  const offerService = !!service && (isLast || service === 'inn');
  // A mini-game's host offers it from the first line (docs/DESIGN-MINIGAMES.md §2.1) — over
  // their quest's offer or a reminder too, which it leaves as they were (only "I'm on it!"
  // takes a quest: a host who gives one, Baker Dot, mustn't hide her game until it's done);
  // never over a reward, which its own buttons pay (the game's paid it twice after a pick,
  // review round 1); on a step through them only on its last line, which it finishes as ✨ Learn does.
  const gameTalk = quest?.finishKind ?? null;
  const game = gameTalk === 'complete' || gameTalk === 'riddle' ? null : gameHostedBy(npcId);
  const offerGame = !!game && (gameTalk !== 'step' || isLast);
  // A shrine keeper's button: the trial, or (once passed) how to cast the spell.
  const taught = fieldSpellTaughtBy(npcId);
  const trialPassed = !!taught && knowsFieldSpell(taught.id, useSaveStore.getState().save?.flags ?? {});

  function applyLineFlag() {
    if (typeof line !== 'string' && line.setFlag) setFlag(line.setFlag);
  }

  function advance() {
    applyLineFlag();
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    if (quest?.finish) {
      update(quest.finish);
    }
    sendFlow({ type: 'CLOSE' });
  }

  // A completion that ends on a choice (#75 item 16b: the Unnamed Dog's name):
  // the pick finishes the quest with its flag, then its own line is said.
  function choose(c: { flag: string; line: string }) {
    applyLineFlag();
    if (quest?.finish) {
      const finish = quest.finish;
      update((s) => {
        const done = finish(s);
        return { ...done, flags: { ...done.flags, [c.flag]: true } };
      });
    }
    setPicked(c.line);
  }
  const choosing = isLast && !!quest?.choice?.length && picked === null;

  // The pen-pal offer is on this line: the service button leaves it standing (round 6: 📚 Library spent the one-time ask).
  const offering = isLast && canWrite;
  function openService() {
    applyLineFlag();
    // Leaving via the service button must still advance the quest step —
    // otherwise "Learn" would strand a delivery mid-step. Not past the pen-pal offer: the next talk makes it again.
    if (quest?.finish && !offering) update(quest.finish);
    if (service) sendFlow({ type: 'OPEN_SERVICE', service, npcId });
  }

  function openGame() {
    if (!game) return;
    applyLineFlag();
    // From the last line it does what ▼ Next would — a step through the host is finished, a reminder's own
    // bookkeeping kept (review round 1) — except take the quest: an offer stays an offer.
    if (gameTalk !== 'offer' && quest?.finish && isLast && !offering) update(quest.finish);
    sendFlow({ type: 'OPEN_GAME', game });
  }

  // A riddle step's thing asks its question (#75 item 15e).
  function askRiddle() {
    applyLineFlag();
    const save = useSaveStore.getState().save;
    if (!quest?.riddle || !save) return;
    // In a mixed-topic zone (#75 item 16b) the thing's own cell picks its topic.
    const z = ZONES[save.zoneId];
    const at = z?.npcs.find((p) => p.defId === npcId);
    const topic = riddleTopic(quest.riddle) ?? (z && at ? topicAt(z, at.x, at.y, 'words') : z?.topic ?? 'words');
    sendFlow({ type: 'OPEN_PATH', target: { kind: 'riddle', id: quest.riddle, topic, zoneId: save.zoneId } });
  }

  function rowHome() {
    update(fetchBoatHome);
    setFetched(true);
  }

  /** The reply typed: the step finishes as it would, remembering which line was written. */
  function replyWritten(index: number) {
    applyLineFlag();
    const finish = quest?.finish;
    const flag = penPalReplyFlag(penPal!.questId, index);
    update((s) => {
      const done = finish ? finish(s) : s;
      return { ...done, flags: { ...done.flags, [flag]: true } };
    });
    // The envelope after the line's beat (review round 4: a habitual Enter on the last key closed it unread).
    setSealing(true);
    written.current = window.setTimeout(() => {
      sfx('chest');
      setSealing(false);
      setWriting('done');
    }, LINE_HOLD_MS);
  }

  if (penPal && writing !== null) {
    const pal = penPal;
    return (
      <ModalLayer
        label={npcName(npc, flagsNow)}
        focusKey={`write-${String(writing)}`}
        // Escape is the box's own way out (#110o): "Maybe not" while picking or typing, "Got it!" once sealed.
        onEscape={writing === 'done' ? () => sendFlow({ type: 'CLOSE' }) : sealing ? undefined : () => setWriting(null)}
        className="fixed inset-0 z-40 flex items-end justify-center p-4 pb-10 bg-black/30">
        <div className="w-full max-w-xl max-h-[calc(100dvh-4rem)] overflow-y-auto bg-indigo-950/95 border-4 border-white/80 rounded-xl p-5 text-white shadow-2xl" data-testid="pen-pal">
          {/* The envelope, read out (round 6). */}
          <p className="sr-only" role="status">
            {writing === 'done' ? pal.written : ''}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <CharacterPortrait spriteId={npcSpriteId(npc, flagsNow)} emoji={npcEmoji(npc, flagsNow)} scale={1.25} className="text-3xl" />
            <span className="font-bold text-amber-300">{npcName(npc, flagsNow)}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider bg-amber-400/20 text-amber-300 rounded px-2 py-0.5">✍️ To {pal.to}</span>
          </div>
          {writing === 'pick' && (
            <>
              <p className="leading-relaxed mb-3">{pal.offer}</p>
              <div className="flex flex-col gap-2">
                {pal.replies.map((line, i) => (
                  <button
                    key={line}
                    onClick={() => setWriting(i)}
                    className="text-left bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2.5 min-h-11 text-sm font-semibold"
                  >
                    ✍️ {line}
                  </button>
                ))}
                <button onClick={() => setWriting(null)} className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11 self-end">
                  Maybe not
                </button>
              </div>
            </>
          )}
          {typeof writing === 'number' && (
            <>
              <p className="text-xs text-white/70 mb-2">Type your line, every letter and dot:</p>
              <LineRun key={writing} text={pal.replies[writing]} holdRule={holdRule} onDone={() => replyWritten(writing)} announce compact={shortWindow()} label="Your line" />
              <div className="mt-3 flex gap-2">
                <button disabled={sealing} onClick={() => setWriting('pick')} className="flex-1 min-h-11 bg-white/10 hover:bg-white/20 disabled:opacity-50 font-semibold rounded-lg py-2 text-sm">
                  Pick another line
                </button>
                {/* A way out from here too (review round 4: it took two steps). */}
                <button disabled={sealing} onClick={() => setWriting(null)} className="min-h-11 bg-white/15 hover:bg-white/25 disabled:opacity-50 font-semibold rounded-lg px-4 py-2 text-sm">
                  Maybe not
                </button>
              </div>
            </>
          )}
          {writing === 'done' && (
            <>
              <p className="leading-relaxed mb-3">{pal.written}</p>
              <div className="flex justify-end">
                <button autoFocus onClick={() => sendFlow({ type: 'CLOSE' })} className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11">
                  ✨ Got it!
                </button>
              </div>
            </>
          )}
        </div>
      </ModalLayer>
    );
  }

  // Escape takes the box's own way out (#110o): "Later" on a choice or a
  // riddle, 🎉 Thanks after a pick, Bye on the last line of a plain chat.
  // Never ▼ Next (a talk is read to its end), a quest's offer or its reward.
  const close = () => sendFlow({ type: 'CLOSE' });
  const onEscape = choosing || picked !== null ? close : isLast && (!quest || quest.finishKind === 'riddle') ? advance : undefined;

  return (
    <ModalLayer
      label={npcName(npc, flagsNow)}
      focusKey={`${index}-${picked ? 1 : 0}`}
      describedBy={lineId}
      onEscape={onEscape}
      className="fixed inset-0 z-40 flex items-end justify-center p-4 pb-10 bg-black/30"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-xl bg-indigo-950/95 border-4 border-white/80 rounded-xl p-5 text-white shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-2">
          <CharacterPortrait spriteId={npcSpriteId(npc, flagsNow)} emoji={npcEmoji(npc, flagsNow)} scale={1.25} className="text-3xl" />
          <span className="font-bold text-amber-300">{npcName(npc, flagsNow)}</span>
          {quest && (
            <span className="ml-auto text-[10px] uppercase tracking-wider bg-amber-400/20 text-amber-300 rounded px-2 py-0.5">
              ❗ {quest.badge}
            </span>
          )}
        </div>
        {/* pre-line: a signpost reads one direction per line. A live region,
            so a screen reader reads each new line on ▼ Next (#142), as
            StoryPanels does; whole, not just the words that changed. A live
            region says nothing of what it opened with, so the first line —
            often the only one — is the dialog's description (#142 r1). */}
        <p id={lineId} aria-live="polite" aria-atomic="true" className="leading-relaxed min-h-[3rem] whitespace-pre-line">
          {text}
        </p>
        <div ref={rowRef} className="flex flex-wrap justify-end gap-3 mt-3">
          {offerGame && game && (
            <button
              onClick={openGame}
              // Beside the pen-pal offer the pen is the gold action, as for a service (round 6); beside a quest's
              // offer it's as quiet as "I'm on it!", so it doesn't pull a kid away from the quest (review round 1).
              className={
                offering || gameTalk === 'offer'
                  ? 'bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11'
                  : 'bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-1.5 text-sm min-h-11'
              }
            >
              {MINIGAMES[game].emoji} {MINIGAMES[game].name}
            </button>
          )}
          {offerService && (
            <button
              // Umbra's finale is focused (16e review round 4): Enter through the talk mustn't close the climax.
              autoFocus={service === 'name'}
              onClick={openService}
              // Beside the pen-pal offer the pen is the gold action (round 6).
              className={
                offering
                  ? 'bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11'
                  : 'bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-1.5 text-sm min-h-11'
              }
            >
              {service === 'trial' && trialPassed ? `${taught?.emoji} How to cast` : SERVICE_BUTTON[service]}
            </button>
          )}
          {/* Not focused: Enter reads on as ever; the pen is a choice (#165 item 9). */}
          {isLast && canWrite && (
            <button
              onClick={() => setWriting('pick')}
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-1.5 text-sm min-h-11"
            >
              ✍️ Add a line of my own
            </button>
          )}
          {isLast && fetchOffer && !fetched && (
            <button
              onClick={rowHome}
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-1.5 text-sm min-h-11"
            >
              ⛵ Row her home
            </button>
          )}
          {/* Never focused: a stray or held Enter mustn't pick a name for good (16b review round 1). */}
          {choosing &&
            quest!.choice!.map((c) => (
              <button
                key={c.flag}
                onClick={() => choose(c)}
                className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-2.5 min-h-[44px] text-sm"
              >
                {c.label}
              </button>
            ))}
          {choosing && (
            <button
              onClick={() => sendFlow({ type: 'CLOSE' })}
              className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-2.5 min-h-[44px] text-sm"
            >
              Later
            </button>
          )}
          {/* Not focused: a held Enter after a pick can't close the reply unread (16b review round 2). */}
          {picked !== null && (
            <button
              onClick={() => sendFlow({ type: 'CLOSE' })}
              className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11"
            >
              🎉 Thanks!
            </button>
          )}
          {/* Focused, so Enter / Space read on (as in a story); the world behind is inert. */}
          {!choosing && picked === null && (
          <button
            ref={onwardRef}
            // Not focused beside a pen-pal offer (review round 2): a held Enter skipped the one-time ask, as it would a quest's choice.
            // A new node there (round 3): the same button, kept across lines, kept the focus a keyboard kid had given it.
            key={isLast && canWrite ? 'offer' : 'next'}
            autoFocus={!(isLast && canWrite)}
            onClick={isLast && quest?.finishKind === 'riddle' ? askRiddle : advance}
            className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11"
          >
            {!isLast
              ? '▼ Next'
              : quest?.finishKind === 'complete'
                ? '🎉 Thanks!'
                : quest?.finishKind === 'offer'
                  ? "I'm on it!"
                  : quest?.finishKind === 'step'
                    ? '✨ Got it!'
                    : quest?.finishKind === 'riddle'
                      ? riddleWords(quest.riddle ?? '').button
                      : npc.prop
                        ? 'OK'
                        : 'Bye!'}
          </button>
          )}
          {isLast && quest?.finishKind === 'riddle' && (
            <button
              onClick={advance}
              className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-4 py-1.5 text-sm min-h-11"
            >
              Later
            </button>
          )}
        </div>
      </motion.div>
    </ModalLayer>
  );
}
