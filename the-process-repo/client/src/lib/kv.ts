/**
 * Small persisted-state helper over the kv table: React state that
 * survives a refresh (checklist ticks, tool inputs, reminders).
 */
import { useEffect, useRef, useState } from 'react';
import { db } from './db';

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const entry = await db.kv.get(key);
  return entry?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

/**
 * Like useState, but loaded from and saved to IndexedDB (debounced).
 * Returns [value, setValue, loaded] — render neutral UI until loaded.
 */
export function useKvState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;
    kvGet<T>(key).then((stored) => {
      if (cancelled) return;
      if (stored !== undefined) setValue(stored);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => kvSet(key, resolved), 250);
      return resolved;
    });
  };

  return [value, set, loaded];
}
