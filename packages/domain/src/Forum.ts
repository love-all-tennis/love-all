import { Schema } from "effect";
import { PlayerId } from "./Player";

/**
 * The forum: a few global categories plus one Local category per metro.
 * Players see the global ones and the Local one for their own metro. A
 * thread's opening text lives on the thread; posts are the replies.
 */

export const ForumCategoryId = Schema.String.check(Schema.isUUID());
export type ForumCategoryId = typeof ForumCategoryId.Type;

export const ForumThreadId = Schema.String.check(Schema.isUUID());
export type ForumThreadId = typeof ForumThreadId.Type;

export const ForumPostId = Schema.String.check(Schema.isUUID());
export type ForumPostId = typeof ForumPostId.Type;

export const FORUM_TITLE_MAX = 120;
export const FORUM_BODY_MAX = 5000;

export const ForumTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, FORUM_TITLE_MAX),
);
export const ForumBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, FORUM_BODY_MAX),
);

/**
 * Posting limits per player, to blunt spam. Deleted threads and replies
 * still count, so deleting and reposting doesn't get around them.
 */
export const FORUM_THREADS_PER_HOUR = 5;
export const FORUM_REPLIES_PER_HOUR = 60;

/** Who wrote a thread or reply, as shown next to it. */
export const ForumAuthor = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
});
export type ForumAuthor = typeof ForumAuthor.Type;

/** The thread with the latest activity in a category, for the category list. */
export const ForumLatestThread = Schema.Struct({
  id: ForumThreadId,
  title: Schema.String,
  lastPostAt: Schema.DateFromString,
});
export type ForumLatestThread = typeof ForumLatestThread.Type;

/**
 * A category. `metroId` is set only on a metro's Local category, which only
 * players in that metro see.
 */
export class ForumCategory extends Schema.Class<ForumCategory>("ForumCategory")({
  id: ForumCategoryId,
  slug: Schema.String,
  name: Schema.String,
  metroId: Schema.NullOr(Schema.String),
  /** Null while the category has no threads I can see. */
  latestThread: Schema.NullOr(ForumLatestThread),
}) {}

/** A thread as listed in its category, without its opening text. */
export class ForumThreadSummary extends Schema.Class<ForumThreadSummary>("ForumThreadSummary")({
  id: ForumThreadId,
  categoryId: ForumCategoryId,
  title: Schema.String,
  author: ForumAuthor,
  /** Replies that aren't deleted. */
  replyCount: Schema.Int,
  /** When the thread was started or last replied to. Lists are ordered by it. */
  lastPostAt: Schema.DateFromString,
  createdAt: Schema.DateFromString,
}) {}

/** A thread with its opening text. */
export class ForumThread extends Schema.Class<ForumThread>("ForumThread")({
  id: ForumThreadId,
  category: Schema.Struct({ id: ForumCategoryId, slug: Schema.String, name: Schema.String }),
  title: Schema.String,
  body: Schema.String,
  author: ForumAuthor,
  replyCount: Schema.Int,
  lastPostAt: Schema.DateFromString,
  createdAt: Schema.DateFromString,
}) {}

/**
 * A reply. A deleted reply keeps its place in the thread with `deleted`
 * set and no body or author, so the app shows "Post deleted".
 */
export class ForumPost extends Schema.Class<ForumPost>("ForumPost")({
  id: ForumPostId,
  threadId: ForumThreadId,
  deleted: Schema.Boolean,
  body: Schema.NullOr(Schema.String),
  author: Schema.NullOr(ForumAuthor),
  createdAt: Schema.DateFromString,
}) {}

export const FORUM_PAGE_DEFAULT = 30;
export const FORUM_PAGE_MAX = 100;

const ForumPageSize = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: FORUM_PAGE_MAX }));

/** `GET /forum/threads` query. `cursor` is the previous page's `nextCursor`. */
export const ForumThreadsQuery = {
  categoryId: ForumCategoryId,
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(ForumPageSize),
};
export type ForumThreadsQuery = Schema.Struct<typeof ForumThreadsQuery>["Type"];

/** One page of a category's threads, latest activity first. */
export class ForumThreadsPage extends Schema.Class<ForumThreadsPage>("ForumThreadsPage")({
  items: Schema.Array(ForumThreadSummary),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `GET /forum/threads/:id` query: paging through the replies. */
export const ForumRepliesQuery = {
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(ForumPageSize),
};
export type ForumRepliesQuery = Schema.Struct<typeof ForumRepliesQuery>["Type"];

/** A thread and one page of its replies, oldest first. */
export class ForumThreadPage extends Schema.Class<ForumThreadPage>("ForumThreadPage")({
  thread: ForumThread,
  replies: Schema.Array(ForumPost),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `POST /forum/threads` body. */
export const NewForumThread = Schema.Struct({
  categoryId: ForumCategoryId,
  title: ForumTitle,
  body: ForumBody,
});
export type NewForumThread = typeof NewForumThread.Type;

/** `POST /forum/threads/:id/posts` body. */
export const NewForumPost = Schema.Struct({ body: ForumBody });
export type NewForumPost = typeof NewForumPost.Type;

/** No category with that id that I can see (another metro's Local category, say). */
export class ForumCategoryNotFound extends Schema.TaggedError<ForumCategoryNotFound>()(
  "ForumCategoryNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** No thread with that id that I can see: deleted, hidden, in a category I can't see, or by a blocked player. */
export class ForumThreadNotFound extends Schema.TaggedError<ForumThreadNotFound>()(
  "ForumThreadNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** No reply with that id that I can see, or it was deleted. */
export class ForumPostNotFound extends Schema.TaggedError<ForumPostNotFound>()(
  "ForumPostNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Only the author can delete a thread or reply. */
export class NotForumAuthor extends Schema.TaggedError<NotForumAuthor>()(
  "NotForumAuthor",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** Too many threads or replies in the last hour. */
export class ForumRateLimited extends Schema.TaggedError<ForumRateLimited>()(
  "ForumRateLimited",
  { message: Schema.String },
  { httpApiStatus: 429 },
) {}
