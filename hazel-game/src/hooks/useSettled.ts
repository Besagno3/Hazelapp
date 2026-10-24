import { useEffect, useState } from 'react';

/** What `promise` resolved with, once it has (null until then, and for no promise). A new promise starts over. */
export function useSettled<T>(promise: Promise<T> | null): T | null {
  const [settled, setSettled] = useState<{ from: Promise<T>; value: T } | null>(null);
  useEffect(() => {
    let live = true;
    void promise?.then((value) => {
      if (live) setSettled({ from: promise, value });
    });
    return () => {
      live = false;
    };
  }, [promise]);
  return settled && settled.from === promise ? settled.value : null;
}
