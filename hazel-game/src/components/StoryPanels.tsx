import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryPanel } from '../content/story';

/**
 * Full-screen cutscene (#37 story pass): one storybook panel at a time,
 * player-paced. Used for the opening, Ember's hatching, and the ending.
 */
export default function StoryPanels({
  panels,
  doneLabel,
  onDone,
}: {
  panels: StoryPanel[];
  doneLabel: string;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const panel = panels[index];
  const isLast = index >= panels.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-6">
      <div className="w-full max-w-lg text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-7xl mb-6">{panel.emoji}</div>
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
          onClick={() => (isLast ? onDone() : setIndex((i) => i + 1))}
          className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-8 py-3"
        >
          {isLast ? doneLabel : '▼ Next'}
        </button>
      </div>
    </div>
  );
}
