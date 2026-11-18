import { useSyncExternalStore } from "react";

import type { PlayerFilters } from "./filters";

let current: PlayerFilters | null = null;
const listeners = new Set<() => void>();

export const setPlayerFilters = (next: PlayerFilters | null) => {
  current = next;

  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const usePlayerFilters = () => useSyncExternalStore(subscribe, () => current);
