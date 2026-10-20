import { useCallback, useRef, useState } from 'react';

/**
 * A message for an always-there live region that's read out again when it
 * repeats word for word: each `set` gets its own `key`, so the region gets a
 * new line instead of the same text it already had (a second "The two
 * passwords don't match." clears and refills in one render, which a screen
 * reader never hears). Render it as `<p key={msg.key}>{msg.text}</p>`.
 */
export function useLiveMessage(initial: string | null = null) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(() => (initial === null ? null : { text: initial, key: 0 }));
  const n = useRef(0);
  const set = useCallback((text: string | null) => {
    setMsg(text === null ? null : { text, key: (n.current += 1) });
  }, []);
  return [msg, set] as const;
}
