import { useSyncExternalStore } from "react";

let unread = 0;
const listeners = new Set<() => void>();

export const setUnreadConversations = (next: number) => {
  if (next === unread) return;
  unread = Math.max(0, next);

  for (const listener of listeners) listener();
};

/** One conversation was just read: take it off the badge. */
export const takeOneUnread = () => setUnreadConversations(unread - 1);

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const useUnreadConversations = () => useSyncExternalStore(subscribe, () => unread);
