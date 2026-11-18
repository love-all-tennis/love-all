import { SESSION_COMMENT_MAX } from "@love-all/domain";

/** "Just now", "5 min ago", "3 h ago", "2 d ago", then the date: "Nov 3". */
export const timeAgo = (at: Date, now: Date) => {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);

  if (minutes < 1) return "Just now";

  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);

  if (days < 7) return `${days} d ago`;

  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/**
 * Why a comment can't be sent yet, or null. The body is trimmed before it
 * goes, as the API wants.
 */
export const commentError = (text: string) => {
  const body = text.trim();

  if (body.length === 0) return "Write a comment first";

  if (body.length > SESSION_COMMENT_MAX) {
    return `Keep it to ${SESSION_COMMENT_MAX} characters (${body.length} now)`;
  }

  return null;
};

/** Adds a page or a new comment to a list, oldest first, without repeating any. */
export const mergeComments = <C extends { readonly id: string }>(
  current: ReadonlyArray<C>,
  more: ReadonlyArray<C>,
) => {
  const seen = new Set(current.map((c) => c.id));

  return [...current, ...more.filter((c) => !seen.has(c.id))];
};
