import { type Conversation, type DirectMessage, MESSAGE_BODY_MAX } from "@love-all/domain";

/**
 * Pure helpers for direct messages. No React Native imports, so they're
 * unit tested in `messages.test.ts`.
 */

/** The inbox row's second line: "You: See you at 6" or their message. */
export const previewLine = (conversation: Conversation): string => {
  const last = conversation.lastMessage;
  if (!last) return "No messages yet";
  const text = last.body.replace(/\s+/g, " ").trim();
  return last.mine ? `You: ${text}` : text;
};

/** The tab badge: nothing at zero, then the count, capped at "99+". */
export const unreadBadge = (count: number): string | null =>
  count <= 0 ? null : count > 99 ? "99+" : String(count);

/** "1 unread message", "3 unread messages", for screen readers. */
export const unreadLabel = (count: number): string =>
  count === 1 ? "1 unread message" : `${count} unread messages`;

/** Why a message can't be sent yet, or null. The body is trimmed before it goes. */
export const messageError = (text: string): string | null => {
  const value = text.trim();
  if (value.length === 0) return "Write a message first";
  if (value.length > MESSAGE_BODY_MAX) {
    return `Keep a message to ${MESSAGE_BODY_MAX} characters (${value.length} now)`;
  }
  return null;
};

/** "9:05 AM", the time under a bubble. */
export const timeOfDay = (at: Date): string =>
  at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", "Mon, Nov 17", or with the year when it isn't this one. */
export const dayLabel = (at: Date, now: Date): string => {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return at.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
};

/** One row in the conversation: a message, or the day heading above a day's first message. */
export type ThreadItem =
  | { readonly kind: "message"; readonly key: string; readonly message: DirectMessage }
  | { readonly kind: "day"; readonly key: string; readonly label: string };

/**
 * The conversation's rows for an inverted list: newest first, with a day
 * heading after the oldest message of each day (so it shows above it).
 */
export const threadItems = (
  newestFirst: ReadonlyArray<DirectMessage>,
  now: Date,
): ReadonlyArray<ThreadItem> => {
  const items: Array<ThreadItem> = [];
  newestFirst.forEach((message, i) => {
    items.push({ kind: "message", key: message.id, message });
    const older = newestFirst[i + 1];
    if (!older || startOfDay(older.createdAt) !== startOfDay(message.createdAt)) {
      items.push({
        kind: "day",
        key: `day-${message.id}`,
        label: dayLabel(message.createdAt, now),
      });
    }
  });
  return items;
};

/**
 * Adds messages to a newest-first list without repeats, keeping it newest
 * first: a sent message, a refreshed first page, or an older page.
 */
export const mergeMessages = (
  current: ReadonlyArray<DirectMessage>,
  more: ReadonlyArray<DirectMessage>,
): ReadonlyArray<DirectMessage> => {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of more) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
  );
};
