import { useSyncExternalStore } from "react";

/**
 * How many conversations have unread messages, for the Messages tab badge.
 * The inbox sets it each time it loads; opening a conversation takes that
 * one off. Messages are async, so nothing polls: it catches up on the next
 * load.
 */
let unread = 0;
const listeners = new Set<() => void>();

export const setUnreadConversations = (next: number): void => {
  if (next === unread) {
    return;
  }
  unread = Math.max(0, next);
  for (const listener of listeners) {
    listener();
  }
};

/** One conversation was just read: take it off the badge. */
export const takeOneUnread = (): void => setUnreadConversations(unread - 1);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useUnreadConversations = (): number => useSyncExternalStore(subscribe, () => unread);
