import { useSyncExternalStore } from "react";

import type { PlayerFilters } from "./filters";

/**
 * The Nearby list's filters, shared between the list and the filters sheet
 * (a separate route). Null until the list has worked out its defaults.
 */
let current: PlayerFilters | null = null;
const listeners = new Set<() => void>();

export const setPlayerFilters = (next: PlayerFilters | null): void => {
  current = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const usePlayerFilters = (): PlayerFilters | null =>
  useSyncExternalStore(subscribe, () => current);
