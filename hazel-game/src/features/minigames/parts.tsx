import type { ReactNode } from 'react';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { NPC_DEFS, npcEmoji, npcName, npcSpriteId } from '../../content/npcs';
import { EMBER_SPRITES, EMBER_SPRITE_IDS, emberStatus } from '../../content/story';
import { cn } from '../../lib/utils';
import { useSaveStore } from '../../store/saveStore';
import { pixelHeadClass } from './styles';

/** No save yet: one object, so a selector's answer stays the same (zustand re-renders on a new one). */
const EMPTY_FLAGS: Record<string, boolean> = {};

/**
 * The pieces every mini-game's screen is built from (docs/DESIGN-MINIGAMES.md
 * §2.2): the stars, the host's speech bubble, Ember, the order ticket and the
 * round's step chips. One look, so a kid who's played one game knows the next.
 */

/** Three stars, earned ones gold. Read out as "2 of 3 stars". */
export function Stars({ count, size = 30, className }: { count: number; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={`${count} of 3 stars`} className={cn('inline-flex gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
            fill={i < count ? '#fcd34d' : '#3a3670'}
            stroke="#1b0f22"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

/**
 * The host's portrait and speech bubble. A live region: each new tip is read
 * out. `phoneStrip`: on a phone or a short screen (a phone on its side), a
 * smaller portrait and no name, so the game comes up sooner (one bubble —
 * never two live regions).
 */
export function HostBubble({ npcId, line, phoneStrip = false, id, portraitClass }: { npcId: string; line: ReactNode; phoneStrip?: boolean; id?: string; portraitClass?: string }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const npc = NPC_DEFS[npcId];
  if (!npc) return null;
  const name = npcName(npc, flags);
  return (
    <div className="flex items-start gap-3">
      {/* The bubble says who it is; the picture isn't read out (review round 2: an emoji stand-in was, as "🥐"). */}
      <div
        aria-hidden="true"
        className={cn(
          'flex flex-none items-end justify-center overflow-hidden rounded-lg border-[3px] border-white bg-[#2f6a4c] shadow-[0_0_0_3px_#1b0f22]',
          phoneStrip ? 'h-14 w-14 sm:[@media(min-height:501px)]:h-24 sm:[@media(min-height:501px)]:w-24' : 'h-20 w-20 sm:h-24 sm:w-24',
          portraitClass,
        )}
      >
        <CharacterPortrait spriteId={npcSpriteId(npc, flags)} emoji={npcEmoji(npc, flags)} scale={2.5} className="text-4xl" />
      </div>
      <div
        id={id}
        aria-live="polite"
        className={cn(
          // A long word wraps rather than run out of a narrow bubble (Ringwood's Rings' UX review round 2: "neighbour's").
          'min-w-0 flex-1 rounded-xl border-[3px] border-[#1b0f22] bg-white px-3 text-[#1b0f22] [overflow-wrap:anywhere]',
          phoneStrip ? 'py-1.5 text-[15px] leading-snug sm:[@media(min-height:501px)]:py-2 sm:[@media(min-height:501px)]:text-base' : 'py-2 text-base leading-snug',
        )}
      >
        <div className={cn(pixelHeadClass, 'text-xl text-emerald-800', phoneStrip && 'sr-only sm:[@media(min-height:501px)]:not-sr-only')}>{name}</div>
        {line}
      </div>
    </div>
  );
}

/** Ember, at the stage the story has grown her to. `anim` is a battle clip ("breath", "cheer"). */
export function EmberSprite({ anim, scale = 4 }: { anim?: string; scale?: number }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const { stage } = emberStatus(flags);
  return <CharacterPortrait spriteId={EMBER_SPRITE_IDS[stage]} emoji={EMBER_SPRITES[stage]} scale={scale} anim={anim} className="text-5xl" />;
}

/** The round's goal, on a paper ticket. `ready` turns its chip green; `id` names its words, for what's described by them. */
export function Ticket({ heading, children, ready, icon, id }: { heading: string; children: ReactNode; ready: boolean; icon?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-3 py-2 text-[#1b0f22] shadow-[0_4px_0_#1b0f22]">
      {icon && <span className="flex-none">{icon}</span>}
      <div className="min-w-0 flex-1">
        {/* The chip by the heading, wrapping under it at the right where it's narrow — not a column of its own, which
            squeezed the words to a strip in a 300 px side panel (Ringwood's Rings' UX review round 1). */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="font-pixel text-xl leading-none tracking-wide text-[#a3195b]">{heading}</div>
          <span
            className={cn(
              'ml-auto flex h-7 flex-none items-center rounded-full border-2 border-[#1b0f22] px-2.5 text-[13px] font-bold',
              ready ? 'bg-emerald-400' : 'bg-[#e6dfc4]',
            )}
          >
            {ready ? 'Ready!' : 'Waiting'}
          </span>
        </div>
        <div id={id} className="text-[15px] leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The round's steps as chips: done ones green, the one now gold. */
export function StepChips({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            className={cn(
              'flex h-8 items-center gap-2 rounded-full pl-1 pr-3 text-[15px] font-bold',
              now ? 'bg-amber-300 text-[#1b0f22]' : done ? 'bg-emerald-700 text-white' : 'bg-[#2a2766] text-[#b3aee8]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[13px]',
                now ? 'bg-[#1b0f22] text-amber-300' : done ? 'bg-white text-emerald-800' : 'bg-[#3d3a8a] text-white',
              )}
            >
              {done ? '✓' : i + 1}
            </span>
            {label}
            {done && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}
