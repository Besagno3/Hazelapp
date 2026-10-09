import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryPanel } from '../content/story';
import StoryScene, { type StoryCast } from './StoryScene';
import { useInertOutside } from '../hooks/useInertOutside';

/** How long a panel takes to fade in, or out (ms): a picture slowly, words quickly. */
export const PICTURE_FADE_MS = 700;
export const WORDS_FADE_MS = 300;

/**
 * Full-screen cutscene (#37 story pass): one storybook panel at a time,
 * player-paced. Used for the opening, Ember's hatching, and the ending. A
 * panel with a `scene` shows a little picture of the hero and Ember
 * (`StoryScene`, given `cast`) and fades in and out through black.
 *
 * A tap counts only once the panel on screen has finished fading in, so a
 * quick double tap can't skip the next one; the button's label and the dots
 * follow the panel actually on screen. Everything behind is inert while the
 * story plays, and each new panel's words are read out.
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
  // `index` is the panel asked for; `shown` the one on screen (the old one
  // fades out first); `ready` once it has faded in.
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [ready, setReady] = useState(false);
  const fadeMs = (p: StoryPanel | undefined) => (p?.scene && cast ? PICTURE_FADE_MS : WORDS_FADE_MS);
  const outMs = index > 0 ? fadeMs(panels[index - 1]) : 0;
  const inMs = fadeMs(panels[index]);
  useEffect(() => {
    const show = setTimeout(() => setShown(index), outMs);
    const settle = setTimeout(() => setReady(true), outMs + inMs);
    return () => {
      clearTimeout(show);
      clearTimeout(settle);
    };
  }, [index, outMs, inMs]);

  const panel = panels[index];
  const isLast = shown >= panels.length - 1;
  const advance = () => {
    if (!ready) return;
    if (index >= panels.length - 1) onDone();
    else {
      setReady(false);
      setIndex((i) => i + 1);
    }
  };

  // The button keeps focus, so Enter / Space read on; the world behind is inert.
  const self = useRef<HTMLDivElement>(null);
  useInertOutside(self);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => next.current?.focus(), [index]);
  const textId = useId();

  // Pictures fade through black, so the world behind stays out of sight.
  const pictures = panels.some((p) => p.scene);
  const scene = panel.scene && cast ? panel.scene : null;
  const fade = inMs / 1000;

  return (
    // Scrolls when a picture panel doesn't fit (a phone held sideways); the
    // inner column still centres when it does.
    <div
      ref={self}
      role="dialog"
      aria-modal="true"
      aria-label="Story"
      className={`fixed inset-0 z-[80] overflow-y-auto ${pictures ? 'bg-black' : 'bg-black/90'}`}
      // The button is the only thing to focus, so Tab keeps to it.
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        next.current?.focus();
      }}
    >
      <div className="min-h-full flex items-center justify-center p-6 [@media(max-height:500px)]:py-3">
        <div className="w-full max-w-lg text-center">
          {/* A new panel's words are announced as they appear. */}
          <div aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                // A picture fades slowly in from black and back out to it; the
                // words-only panels drift up as before.
                initial={scene ? { opacity: 0 } : { opacity: 0, y: 18 }}
                animate={scene ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={scene ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: fade }}
              >
                {scene && cast ? (
                  <StoryScene id={scene} cast={cast} />
                ) : (
                  <div aria-hidden className="text-7xl mb-6 [@media(max-height:500px)]:mb-3">
                    {panel.emoji}
                  </div>
                )}
                <p
                  id={textId}
                  className="text-white/95 text-lg leading-relaxed min-h-[7rem] [@media(max-height:500px)]:min-h-0"
                >
                  {panel.text}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-center gap-1.5 my-5 [@media(max-height:500px)]:my-3">
            {panels.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${i === shown ? 'bg-amber-300' : 'bg-white/25'}`}
              />
            ))}
          </div>

          <button
            ref={next}
            onClick={advance}
            aria-describedby={textId}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-8 py-3"
          >
            {isLast ? doneLabel : '▼ Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
