import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryPanel } from '../content/story';
import StoryScene, { type StoryCast } from './StoryScene';

/**
 * Full-screen cutscene (#37 story pass): one storybook panel at a time,
 * player-paced. Used for the opening, Ember's hatching, and the ending. A
 * panel with a `scene` shows a little picture of the hero and Ember
 * (`StoryScene`, given `cast`) and fades in and out through black.
 */
export default function StoryPanels({
  panels,
  doneLabel,
  onDone,
  cast,
}: {
  panels: StoryPanel[];
  doneLabel: string;
  onDone: () => void;
  cast?: StoryCast;
}) {
  const [index, setIndex] = useState(0);
  const panel = panels[index];
  const isLast = index >= panels.length - 1;
  // The button takes focus, so Enter / Space read on and Tab can't wander off
  // to the HUD behind the panels.
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => next.current?.focus(), [index]);

  // Pictures fade through black, so the world behind stays out of sight.
  const pictures = panels.some((p) => p.scene);
  const scene = panel.scene && cast ? panel.scene : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Story"
      className={`fixed inset-0 z-[80] flex items-center justify-center p-6 ${pictures ? 'bg-black' : 'bg-black/90'}`}
    >
      <div className="w-full max-w-lg text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            // A picture fades slowly in from black and back out to it; the
            // words-only panels drift up as before.
            initial={scene ? { opacity: 0 } : { opacity: 0, y: 18 }}
            animate={scene ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={scene ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: scene ? 0.7 : 0.3 }}
          >
            {scene && cast ? (
              <StoryScene id={scene} cast={cast} />
            ) : (
              <div className="text-7xl mb-6">{panel.emoji}</div>
            )}
            <p className="text-white/95 text-lg leading-relaxed min-h-[7rem]">{panel.text}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-center gap-1.5 my-5">
          {panels.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full ${i === index ? 'bg-amber-300' : 'bg-white/25'}`}
            />
          ))}
        </div>

        <button
          ref={next}
          onClick={() => (isLast ? onDone() : setIndex((i) => i + 1))}
          className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-8 py-3"
        >
          {isLast ? doneLabel : '▼ Next'}
        </button>
      </div>
    </div>
  );
}
