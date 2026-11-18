import {
  FORUM_BODY_MAX,
  FORUM_TITLE_MAX,
  type ForumCategory,
  ForumPost,
  type ForumReactionCount,
  ForumThread,
  type ForumReactionKind,
} from "@love-all/domain";

/** How each reaction reads on its chip. */
export const REACTION_LABELS: Record<ForumReactionKind, string> = {
  like: "Like",
  helpful: "Helpful",
  ace: "Ace",
};

/** "Like" with nobody yet, then "Like 3". */
export const reactionChipLabel = (reaction: ForumReactionCount): string =>
  reaction.count > 0
    ? `${REACTION_LABELS[reaction.kind]} ${reaction.count}`
    : REACTION_LABELS[reaction.kind];

/**
 * The reactions after I toggle `kind`, before the server answers: my
 * reaction goes on or off and the count follows. Returns whether it's now on.
 */
export const toggleReaction = (
  reactions: ReadonlyArray<ForumReactionCount>,
  kind: ForumReactionKind,
): { readonly reactions: ReadonlyArray<ForumReactionCount>; readonly on: boolean } => {
  const current = reactions.find((r) => r.kind === kind);
  const on = !current?.mine;
  return {
    on,
    reactions: reactions.map((r) =>
      r.kind === kind ? { kind, mine: on, count: Math.max(0, r.count + (on ? 1 : -1)) } : r,
    ),
  };
};

/** "No replies yet", "1 reply", "12 replies". */
export const replyCountLabel = (count: number): string =>
  count === 0 ? "No replies yet" : count === 1 ? "1 reply" : `${count} replies`;

/**
 * The Forum tab's two groups: my metro's Local category, then the ones every
 * player sees. Either can be empty (no metro, or nothing loaded yet).
 */
export const splitCategories = (
  categories: ReadonlyArray<ForumCategory>,
): {
  readonly local: ReadonlyArray<ForumCategory>;
  readonly global: ReadonlyArray<ForumCategory>;
} => ({
  local: categories.filter((c) => c.metroId !== null),
  global: categories.filter((c) => c.metroId === null),
});

/** A Local category's heading on the Forum tab: "Detroit" for "Detroit Local". */
export const localHeading = (category: ForumCategory): string =>
  category.name.replace(/\s+Local$/i, "") || category.name;

const lengthError = (text: string, what: string, max: number): string | null => {
  const value = text.trim();
  if (value.length === 0) return `Write a ${what} first`;
  if (value.length > max) return `Keep the ${what} to ${max} characters (${value.length} now)`;
  return null;
};

/** Why a thread title can't be posted yet, or null. */
export const titleError = (text: string): string | null =>
  lengthError(text, "title", FORUM_TITLE_MAX);

/** Why a thread's text or a reply can't be posted yet, or null. */
export const bodyError = (text: string, what: "post" | "reply" = "post"): string | null =>
  lengthError(text, what, FORUM_BODY_MAX);

/** "42 / 120", shown under a field so the limit is clear before it's hit. */
export const lengthHint = (text: string, max: number): string => `${text.trim().length} / ${max}`;

/** Adds a page or a new item to a list without repeating any, keeping the order. */
export const mergeById = <T extends { readonly id: string }>(
  current: ReadonlyArray<T>,
  more: ReadonlyArray<T>,
): ReadonlyArray<T> => {
  const seen = new Set(current.map((x) => x.id));
  return [...current, ...more.filter((x) => !seen.has(x.id))];
};

/** What the post menu offers. Report goes to the player report sheet until posts can be reported (#18). */
export type PostMenuAction = "delete" | "report";

export const postMenuActions = (authorId: string | null, meId: string | null): PostMenuAction[] =>
  authorId === null ? [] : authorId === meId ? ["delete"] : ["report"];

type ThreadFields = ConstructorParameters<typeof ForumThread>[0];
type PostFields = ConstructorParameters<typeof ForumPost>[0];

/** A copy of a thread with some fields changed (after a reply, delete or reaction). */
export const patchThread = (thread: ForumThread, patch: Partial<ThreadFields>): ForumThread =>
  new ForumThread({
    id: thread.id,
    category: thread.category,
    title: thread.title,
    body: thread.body,
    author: thread.author,
    replyCount: thread.replyCount,
    lastPostAt: thread.lastPostAt,
    createdAt: thread.createdAt,
    reactions: thread.reactions,
    ...patch,
  });

/** A copy of a reply with some fields changed. */
export const patchPost = (post: ForumPost, patch: Partial<PostFields>): ForumPost =>
  new ForumPost({
    id: post.id,
    threadId: post.threadId,
    deleted: post.deleted,
    body: post.body,
    author: post.author,
    createdAt: post.createdAt,
    reactions: post.reactions,
    ...patch,
  });

/** How a reply I deleted looks straight away, the same as the API sends it. */
export const asDeleted = (post: ForumPost): ForumPost =>
  patchPost(post, {
    deleted: true,
    body: null,
    author: null,
    reactions: post.reactions.map((r) => ({ kind: r.kind, count: 0, mine: false })),
  });
