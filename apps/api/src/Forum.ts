import {
  FORUM_PAGE_DEFAULT,
  FORUM_REACTION_KINDS,
  FORUM_REPLIES_PER_HOUR,
  FORUM_THREADS_PER_HOUR,
  ForumCategory,
  ForumCategoryNotFound,
  ForumPost,
  ForumPostNotFound,
  ForumRateLimited,
  type ForumReactionCount,
  type ForumReactionKind,
  type ForumRepliesQuery,
  ForumThread,
  ForumThreadNotFound,
  ForumThreadPage,
  ForumThreadSummary,
  ForumThreadsPage,
  type ForumThreadsQuery,
  InvalidCursor,
  type NewForumPost,
  type NewForumThread,
  NotForumAuthor,
  type SessionUser,
} from "@love-all/domain";
import { type SQL, and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import { Notifications } from "./Notifications";
import { messages } from "./notifications/messages";
import { notBlocked } from "./db/blocks";
import { forumCategory, forumPost, forumReaction, forumThread, profile, user } from "./db/schema";
import {
  decodeRepliesCursor,
  decodeThreadsCursor,
  encodeRepliesCursor,
  encodeThreadsCursor,
} from "./forum/cursor";

const HOUR_MS = 3_600_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forum content as a report sees it. */
export interface ForumReportable {
  /** Null when the author deleted their account. */
  readonly authorId: string | null;
  /** The thread's title and opening text, or the reply's text. */
  readonly content: string;
}

/** Every kind at zero, for a deleted reply or a target nobody reacted to. */
const noReactions = (): Array<ForumReactionCount> =>
  FORUM_REACTION_KINDS.map((kind) => ({ kind, count: 0, mine: false }));

/** How an author is shown: their profile name, or their account name before they have a profile. */
const authorName = sql<string | null>`coalesce(${profile.displayName}, ${user.name})`;

/**
 * The forum: categories, threads and replies.
 *
 * Who sees what, in one place (`visibleThread`):
 * - Global categories (no metro) are for everyone. A Local category is only
 *   for players whose profile is in its metro, for reading and posting.
 * - Threads that are deleted or hidden by a moderator are left out.
 * - Threads and replies by players blocked either way with me are left out,
 *   and so are their reactions from the counts.
 *   A deleted reply stays as a placeholder ("Post deleted"); a hidden one
 *   is left out.
 *
 * Database failures are defects (a 500).
 */
export class Forum extends Context.Service<
  Forum,
  {
    readonly listCategories: (viewer: SessionUser) => Effect.Effect<ReadonlyArray<ForumCategory>>;
    readonly listThreads: (
      viewer: SessionUser,
      query: ForumThreadsQuery,
    ) => Effect.Effect<ForumThreadsPage, ForumCategoryNotFound | InvalidCursor>;
    readonly createThread: (
      viewer: SessionUser,
      input: NewForumThread,
    ) => Effect.Effect<ForumThread, ForumCategoryNotFound | ForumRateLimited>;
    readonly getThread: (
      viewer: SessionUser,
      id: string,
      query: ForumRepliesQuery,
    ) => Effect.Effect<ForumThreadPage, ForumThreadNotFound | InvalidCursor>;
    readonly reply: (
      viewer: SessionUser,
      threadId: string,
      input: NewForumPost,
    ) => Effect.Effect<ForumPost, ForumThreadNotFound | ForumRateLimited>;
    readonly deleteThread: (
      viewer: SessionUser,
      id: string,
    ) => Effect.Effect<void, ForumThreadNotFound | NotForumAuthor>;
    readonly deletePost: (
      viewer: SessionUser,
      id: string,
    ) => Effect.Effect<void, ForumPostNotFound | NotForumAuthor>;
    readonly reactToThread: (
      viewer: SessionUser,
      threadId: string,
      kind: ForumReactionKind,
    ) => Effect.Effect<void, ForumThreadNotFound>;
    readonly unreactToThread: (
      viewer: SessionUser,
      threadId: string,
      kind: ForumReactionKind,
    ) => Effect.Effect<void>;
    readonly reactToPost: (
      viewer: SessionUser,
      postId: string,
      kind: ForumReactionKind,
    ) => Effect.Effect<void, ForumPostNotFound>;
    readonly unreactToPost: (
      viewer: SessionUser,
      postId: string,
      kind: ForumReactionKind,
    ) => Effect.Effect<void>;
    /**
     * A thread or live reply I can see, for reporting it: who wrote it and
     * its text. None when it's gone or hidden from me.
     */
    readonly findReportable: (
      viewer: SessionUser,
      kind: "thread" | "post",
      id: string,
    ) => Effect.Effect<Option.Option<ForumReportable>>;
  }
>()("love-all/Forum") {
  static readonly layer = Layer.effect(
    Forum,
    Effect.gen(function* () {
      const db = yield* Db;
      const notifications = yield* Notifications;

      /** The metro of my profile, or null when I have no profile or no metro. */
      const viewerMetro = (viewer: SessionUser) =>
        db
          .select({ metroId: profile.metroId })
          .from(profile)
          .where(eq(profile.userId, viewer.id))
          .pipe(
            Effect.map(([row]) => row?.metroId ?? null),
            Effect.orDie,
          );

      /** Categories I can see: global ones, plus the Local one for my metro. */
      const visibleCategory = (metroId: string | null): SQL =>
        metroId === null
          ? isNull(forumCategory.metroId)
          : or(isNull(forumCategory.metroId), eq(forumCategory.metroId, metroId))!;

      /** Threads I can see. Needs the `forumCategory` join. */
      const visibleThread = (viewer: SessionUser, metroId: string | null): SQL =>
        and(
          isNull(forumThread.deletedAt),
          isNull(forumThread.hiddenAt),
          notBlocked(viewer.id, forumThread.authorId),
          visibleCategory(metroId),
        )!;

      const threadColumns = {
        id: forumThread.id,
        categoryId: forumThread.categoryId,
        categorySlug: forumCategory.slug,
        categoryName: forumCategory.name,
        title: forumThread.title,
        body: forumThread.body,
        replyCount: forumThread.replyCount,
        lastPostAt: forumThread.lastPostAt,
        createdAt: forumThread.createdAt,
        authorId: forumThread.authorId,
        authorName,
        authorPhotoUrl: profile.photoUrl,
      };

      const selectThreads = () =>
        db
          .select(threadColumns)
          .from(forumThread)
          .innerJoin(forumCategory, eq(forumCategory.id, forumThread.categoryId))
          .leftJoin(user, eq(user.id, forumThread.authorId))
          .leftJoin(profile, eq(profile.userId, forumThread.authorId));

      type ThreadRow = Effect.Success<ReturnType<typeof selectThreads>>[number];

      const authorOf = (row: {
        readonly authorId: string | null;
        readonly authorName: string | null;
        readonly authorPhotoUrl: string | null;
      }) =>
        row.authorId === null
          ? null
          : {
              id: row.authorId,
              displayName: row.authorName ?? "",
              photoUrl: row.authorPhotoUrl,
            };

      /**
       * Reaction counts for each thread (or reply) in `ids`, leaving out
       * reactions by players blocked either way with the viewer.
       */
      const reactionsFor = (
        viewer: SessionUser,
        target: typeof forumReaction.threadId,
        ids: ReadonlyArray<string>,
      ) =>
        ids.length === 0
          ? Effect.succeed(new Map<string, Array<ForumReactionCount>>())
          : db
              .select({
                targetId: sql<string>`${target}`,
                kind: forumReaction.kind,
                total: count(),
                mine: sql<boolean>`bool_or(${forumReaction.userId} = ${viewer.id})`,
              })
              .from(forumReaction)
              .where(and(inArray(target, [...ids]), notBlocked(viewer.id, forumReaction.userId)))
              .groupBy(target, forumReaction.kind)
              .pipe(
                Effect.map((rows) => {
                  const byTarget = new Map<string, Array<ForumReactionCount>>();
                  for (const row of rows) {
                    const counts = byTarget.get(row.targetId) ?? noReactions();
                    byTarget.set(
                      row.targetId,
                      counts.map((c) =>
                        c.kind === row.kind
                          ? { kind: c.kind, count: row.total, mine: row.mine }
                          : c,
                      ),
                    );
                  }
                  return byTarget;
                }),
                Effect.orDie,
              );

      const toThread = (row: ThreadRow, reactions: Array<ForumReactionCount>) =>
        new ForumThread({
          id: row.id,
          category: { id: row.categoryId, slug: row.categorySlug, name: row.categoryName },
          title: row.title,
          body: row.body,
          author: authorOf(row),
          replyCount: row.replyCount,
          lastPostAt: row.lastPostAt,
          createdAt: row.createdAt,
          reactions,
        });

      const toSummary = (row: ThreadRow) =>
        new ForumThreadSummary({
          id: row.id,
          categoryId: row.categoryId,
          title: row.title,
          author: authorOf(row),
          replyCount: row.replyCount,
          lastPostAt: row.lastPostAt,
          createdAt: row.createdAt,
        });

      const findThread = (viewer: SessionUser, metroId: string | null, id: string) =>
        selectThreads()
          .where(and(eq(forumThread.id, id), visibleThread(viewer, metroId)))
          .pipe(
            Effect.map(([row]) => row),
            Effect.orDie,
          );

      const selectPosts = () =>
        db
          .select({
            id: forumPost.id,
            threadId: forumPost.threadId,
            body: forumPost.body,
            deletedAt: forumPost.deletedAt,
            createdAt: forumPost.createdAt,
            authorId: forumPost.authorId,
            authorName,
            authorPhotoUrl: profile.photoUrl,
          })
          .from(forumPost)
          .leftJoin(user, eq(user.id, forumPost.authorId))
          .leftJoin(profile, eq(profile.userId, forumPost.authorId));

      type PostRow = Effect.Success<ReturnType<typeof selectPosts>>[number];

      const toPost = (row: PostRow, reactions: Array<ForumReactionCount>) =>
        row.deletedAt
          ? new ForumPost({
              id: row.id,
              threadId: row.threadId,
              deleted: true,
              body: null,
              author: null,
              createdAt: row.createdAt,
              reactions: noReactions(),
            })
          : new ForumPost({
              id: row.id,
              threadId: row.threadId,
              deleted: false,
              body: row.body,
              author: authorOf(row),
              createdAt: row.createdAt,
              reactions,
            });

      /** A reply that is live, by a player I can see, in a thread I can see. */
      const findLivePost = (viewer: SessionUser, postId: string) =>
        Effect.gen(function* () {
          const metroId = yield* viewerMetro(viewer);
          const [post] = yield* db
            .select({ id: forumPost.id, authorId: forumPost.authorId, body: forumPost.body })
            .from(forumPost)
            .innerJoin(forumThread, eq(forumThread.id, forumPost.threadId))
            .innerJoin(forumCategory, eq(forumCategory.id, forumThread.categoryId))
            .where(
              and(
                eq(forumPost.id, postId),
                isNull(forumPost.deletedAt),
                isNull(forumPost.hiddenAt),
                notBlocked(viewer.id, forumPost.authorId),
                visibleThread(viewer, metroId),
              ),
            )
            .pipe(Effect.orDie);
          return post;
        });

      /** Fails when the viewer already wrote `limit` rows of `table` in the last hour. */
      const checkRate = (
        viewer: SessionUser,
        table: typeof forumThread | typeof forumPost,
        limit: number,
        what: string,
      ) =>
        db
          .select({ total: count() })
          .from(table)
          .where(
            and(
              eq(table.authorId, viewer.id),
              gte(table.createdAt, new Date(Date.now() - HOUR_MS)),
            ),
          )
          .pipe(
            Effect.orDie,
            Effect.flatMap(([row]) =>
              (row?.total ?? 0) >= limit
                ? Effect.fail(
                    new ForumRateLimited({
                      message: `You can post ${limit} ${what} an hour. Try again a bit later.`,
                    }),
                  )
                : Effect.void,
            ),
          );

      return Forum.of({
        listCategories: (viewer) =>
          Effect.gen(function* () {
            const metroId = yield* viewerMetro(viewer);
            const categories = yield* db
              .select()
              .from(forumCategory)
              .where(visibleCategory(metroId))
              // Local first, then the global ones in their set order.
              .orderBy(sql`${forumCategory.metroId} is null`, asc(forumCategory.sortOrder))
              .pipe(Effect.orDie);
            const latest = yield* db
              .selectDistinctOn([forumThread.categoryId], {
                categoryId: forumThread.categoryId,
                id: forumThread.id,
                title: forumThread.title,
                lastPostAt: forumThread.lastPostAt,
              })
              .from(forumThread)
              .innerJoin(forumCategory, eq(forumCategory.id, forumThread.categoryId))
              .where(visibleThread(viewer, metroId))
              .orderBy(forumThread.categoryId, desc(forumThread.lastPostAt), desc(forumThread.id))
              .pipe(Effect.orDie);
            const byCategory = new Map(latest.map((row) => [row.categoryId, row]));
            return categories.map((category) => {
              const thread = byCategory.get(category.id);
              return new ForumCategory({
                id: category.id,
                slug: category.slug,
                name: category.name,
                metroId: category.metroId,
                latestThread: thread
                  ? { id: thread.id, title: thread.title, lastPostAt: thread.lastPostAt }
                  : null,
              });
            });
          }).pipe(Effect.withSpan("Forum.listCategories")),

        listThreads: (viewer, query) =>
          Effect.gen(function* () {
            const metroId = yield* viewerMetro(viewer);
            const limit = query.limit ?? FORUM_PAGE_DEFAULT;
            const cursor =
              query.cursor === undefined ? undefined : decodeThreadsCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const [category] = yield* db
              .select({ id: forumCategory.id })
              .from(forumCategory)
              .where(and(eq(forumCategory.id, query.categoryId), visibleCategory(metroId)))
              .pipe(Effect.orDie);
            if (!category) return yield* new ForumCategoryNotFound({ id: query.categoryId });
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* selectThreads()
              .where(
                and(
                  eq(forumThread.categoryId, query.categoryId),
                  visibleThread(viewer, metroId),
                  after === undefined
                    ? undefined
                    : sql`(${forumThread.lastPostAt}, ${forumThread.id}) < (${new Date(after.lastPostAt).toISOString()}::timestamptz, ${after.id}::uuid)`,
                ),
              )
              .orderBy(desc(forumThread.lastPostAt), desc(forumThread.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            return new ForumThreadsPage({
              items: page.map(toSummary),
              nextCursor:
                rows.length > limit && last
                  ? encodeThreadsCursor({ lastPostAt: last.lastPostAt.getTime(), id: last.id })
                  : null,
            });
          }).pipe(Effect.withSpan("Forum.listThreads")),

        createThread: (viewer, input) =>
          Effect.gen(function* () {
            const metroId = yield* viewerMetro(viewer);
            const [category] = yield* db
              .select({ id: forumCategory.id })
              .from(forumCategory)
              .where(and(eq(forumCategory.id, input.categoryId), visibleCategory(metroId)))
              .pipe(Effect.orDie);
            if (!category) return yield* new ForumCategoryNotFound({ id: input.categoryId });
            yield* checkRate(viewer, forumThread, FORUM_THREADS_PER_HOUR, "new threads");
            // One millisecond-precision time for both, so `last_post_at` matches exactly.
            const now = new Date();
            const [inserted] = yield* db
              .insert(forumThread)
              .values({
                categoryId: input.categoryId,
                authorId: viewer.id,
                title: input.title,
                body: input.body,
                lastPostAt: now,
                createdAt: now,
              })
              .returning({ id: forumThread.id })
              .pipe(Effect.orDie);
            const [row] = yield* selectThreads()
              .where(eq(forumThread.id, inserted!.id))
              .pipe(Effect.orDie);
            return toThread(row!, noReactions());
          }).pipe(Effect.withSpan("Forum.createThread")),

        getThread: (viewer, id, query) =>
          Effect.gen(function* () {
            const metroId = yield* viewerMetro(viewer);
            const limit = query.limit ?? FORUM_PAGE_DEFAULT;
            const cursor =
              query.cursor === undefined ? undefined : decodeRepliesCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const thread = yield* findThread(viewer, metroId, id);
            if (!thread) return yield* new ForumThreadNotFound({ id });
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* selectPosts()
              .where(
                and(
                  eq(forumPost.threadId, id),
                  isNull(forumPost.hiddenAt),
                  notBlocked(viewer.id, forumPost.authorId),
                  after === undefined
                    ? undefined
                    : sql`(${forumPost.createdAt}, ${forumPost.id}) > (
                        select p.created_at, p.id from ${forumPost} p
                        where p.id = ${after} and p.thread_id = ${id}
                      )`,
                ),
              )
              .orderBy(asc(forumPost.createdAt), asc(forumPost.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            const threadReactions = yield* reactionsFor(viewer, forumReaction.threadId, [id]);
            const postReactions = yield* reactionsFor(
              viewer,
              forumReaction.postId,
              page.filter((p) => !p.deletedAt).map((p) => p.id),
            );
            return new ForumThreadPage({
              thread: toThread(thread, threadReactions.get(id) ?? noReactions()),
              replies: page.map((p) => toPost(p, postReactions.get(p.id) ?? noReactions())),
              nextCursor: rows.length > limit && last ? encodeRepliesCursor(last.id) : null,
            });
          }).pipe(Effect.withSpan("Forum.getThread")),

        reply: (viewer, threadId, input) =>
          Effect.gen(function* () {
            const metroId = yield* viewerMetro(viewer);
            const thread = yield* findThread(viewer, metroId, threadId);
            if (!thread) return yield* new ForumThreadNotFound({ id: threadId });
            yield* checkRate(viewer, forumPost, FORUM_REPLIES_PER_HOUR, "replies");
            const inserted = yield* db
              .transaction((tx) =>
                Effect.gen(function* () {
                  const [post] = yield* tx
                    .insert(forumPost)
                    .values({
                      threadId,
                      authorId: viewer.id,
                      body: input.body,
                      createdAt: new Date(),
                    })
                    .returning({ id: forumPost.id, createdAt: forumPost.createdAt });
                  yield* tx
                    .update(forumThread)
                    .set({
                      lastPostAt: post!.createdAt,
                      replyCount: sql`${forumThread.replyCount} + 1`,
                    })
                    .where(eq(forumThread.id, threadId));
                  return post!;
                }),
              )
              .pipe(Effect.orDie);
            const [row] = yield* selectPosts()
              .where(eq(forumPost.id, inserted.id))
              .pipe(Effect.orDie);
            // The thread's author hears about others' replies (`notify` also skips blocked players).
            if (thread.authorId !== null && thread.authorId !== viewer.id) {
              yield* notifications.notify({
                to: [thread.authorId],
                from: viewer.id,
                ...messages.forumReply(thread, row!.authorName ?? viewer.name, input.body),
              });
            }
            return toPost(row!, noReactions());
          }).pipe(Effect.withSpan("Forum.reply")),

        deleteThread: (viewer, id) =>
          Effect.gen(function* () {
            const [row] = yield* db
              .select({ authorId: forumThread.authorId })
              .from(forumThread)
              .where(and(eq(forumThread.id, id), isNull(forumThread.deletedAt)))
              .pipe(Effect.orDie);
            if (!row) return yield* new ForumThreadNotFound({ id });
            if (row.authorId !== viewer.id) {
              return yield* new NotForumAuthor({ message: "Only the author can delete it" });
            }
            yield* db
              .update(forumThread)
              .set({ deletedAt: new Date() })
              .where(eq(forumThread.id, id))
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Forum.deleteThread")),

        deletePost: (viewer, id) =>
          Effect.gen(function* () {
            const [row] = yield* db
              .select({ authorId: forumPost.authorId, threadId: forumPost.threadId })
              .from(forumPost)
              .where(and(eq(forumPost.id, id), isNull(forumPost.deletedAt)))
              .pipe(Effect.orDie);
            if (!row) return yield* new ForumPostNotFound({ id });
            if (row.authorId !== viewer.id) {
              return yield* new NotForumAuthor({ message: "Only the author can delete it" });
            }
            yield* db
              .transaction((tx) =>
                Effect.gen(function* () {
                  // The `deleted_at is null` guard keeps two deletes from counting twice.
                  const deleted = yield* tx
                    .update(forumPost)
                    .set({ deletedAt: new Date() })
                    .where(and(eq(forumPost.id, id), isNull(forumPost.deletedAt)))
                    .returning({ id: forumPost.id });
                  if (deleted.length === 0) return;
                  yield* tx
                    .update(forumThread)
                    .set({ replyCount: sql`greatest(${forumThread.replyCount} - 1, 0)` })
                    .where(eq(forumThread.id, row.threadId));
                }),
              )
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Forum.deletePost")),

        reactToThread: (viewer, threadId, kind) =>
          Effect.gen(function* () {
            const metroId = yield* viewerMetro(viewer);
            const thread = yield* findThread(viewer, metroId, threadId);
            if (!thread) return yield* new ForumThreadNotFound({ id: threadId });
            yield* db
              .insert(forumReaction)
              .values({ threadId, userId: viewer.id, kind })
              .onConflictDoNothing()
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Forum.reactToThread")),

        unreactToThread: (viewer, threadId, kind) =>
          db
            .delete(forumReaction)
            .where(
              and(
                eq(forumReaction.threadId, threadId),
                eq(forumReaction.userId, viewer.id),
                eq(forumReaction.kind, kind),
              ),
            )
            .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Forum.unreactToThread")),

        reactToPost: (viewer, postId, kind) =>
          Effect.gen(function* () {
            const post = yield* findLivePost(viewer, postId);
            if (!post) return yield* new ForumPostNotFound({ id: postId });
            yield* db
              .insert(forumReaction)
              .values({ postId, userId: viewer.id, kind })
              .onConflictDoNothing()
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Forum.reactToPost")),

        unreactToPost: (viewer, postId, kind) =>
          db
            .delete(forumReaction)
            .where(
              and(
                eq(forumReaction.postId, postId),
                eq(forumReaction.userId, viewer.id),
                eq(forumReaction.kind, kind),
              ),
            )
            .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Forum.unreactToPost")),

        findReportable: (viewer, kind, id) =>
          Effect.gen(function* () {
            // Ids are uuids; anything else can't name a thread or reply.
            if (!UUID.test(id)) return Option.none<ForumReportable>();
            if (kind === "thread") {
              const metroId = yield* viewerMetro(viewer);
              const thread = yield* findThread(viewer, metroId, id);
              return thread
                ? Option.some({
                    authorId: thread.authorId,
                    content: `${thread.title}\n\n${thread.body}`,
                  })
                : Option.none();
            }
            const post = yield* findLivePost(viewer, id);
            return post
              ? Option.some({ authorId: post.authorId, content: post.body })
              : Option.none();
          }).pipe(Effect.withSpan("Forum.findReportable")),
      });
    }),
  );
}
