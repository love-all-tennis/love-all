import {
  CONVERSATIONS_PER_HOUR,
  CannotMessageSelf,
  Conversation,
  ConversationNotFound,
  ConversationsPage,
  type ConversationsQuery,
  DirectMessage,
  InvalidCursor,
  MESSAGES_PAGE_DEFAULT,
  MESSAGES_PER_HOUR,
  MessagesPage,
  type MessagesQuery,
  MessagesRateLimited,
  type NewDirectMessage,
  PlayerNotFound,
  ProfileRequired,
  type SessionUser,
} from "@love-all/domain";
import { and, count, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import { conversation, conversationMember, directMessage, profile, user } from "./db/schema";
import { decodeCursor, encodeCursor, isUuid } from "./messages/cursor";
import { Notifications } from "./Notifications";
import { messages as notices } from "./notifications/messages";

const HOUR_MS = 3_600_000;

const pairOf = (a: string, b: string) =>
  a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };

/**
 * Direct messages: one conversation per pair of players.
 *
 * Who sees what, in one place (`visibleTo`): a conversation is only for its
 * two players, and only while neither has blocked the other. A block ends
 * it for both: it leaves both inboxes and neither can read or send. The
 * messages are kept, so moderators can still check a report.
 *
 * Database failures are defects (a 500).
 */
export class Messages extends Context.Service<
  Messages,
  {
    readonly listConversations: (
      viewer: SessionUser,
      query: ConversationsQuery,
    ) => Effect.Effect<ConversationsPage, InvalidCursor>;
    readonly openConversation: (
      viewer: SessionUser,
      playerId: string,
    ) => Effect.Effect<
      Conversation,
      PlayerNotFound | CannotMessageSelf | ProfileRequired | MessagesRateLimited
    >;
    readonly listMessages: (
      viewer: SessionUser,
      conversationId: string,
      query: MessagesQuery,
    ) => Effect.Effect<MessagesPage, ConversationNotFound | InvalidCursor>;
    readonly send: (
      viewer: SessionUser,
      conversationId: string,
      input: NewDirectMessage,
    ) => Effect.Effect<DirectMessage, ConversationNotFound | MessagesRateLimited>;
    readonly markRead: (
      viewer: SessionUser,
      conversationId: string,
    ) => Effect.Effect<void, ConversationNotFound>;
  }
>()("love-all/Messages") {
  static readonly layer = Layer.effect(
    Messages,
    Effect.gen(function* () {
      const db = yield* Db;
      const notifications = yield* Notifications;

      const otherId = (viewer: SessionUser) =>
        sql<string>`case when ${conversation.userLowId} = ${viewer.id} then ${conversation.userHighId} else ${conversation.userLowId} end`;

      const visibleTo = (viewer: SessionUser) =>
        and(
          or(eq(conversation.userLowId, viewer.id), eq(conversation.userHighId, viewer.id)),
          notBlocked(viewer.id, otherId(viewer)),
        )!;

      const unreadCount = (viewer: SessionUser) =>
        sql<number>`(
          select count(*)::int from ${directMessage}
          where ${directMessage.conversationId} = ${conversation.id}
            and ${directMessage.senderId} <> ${viewer.id}
            and ${directMessage.createdAt} > coalesce(${conversationMember.lastReadAt}, '-infinity'::timestamptz)
        )`;

      const selectConversations = (viewer: SessionUser) =>
        db
          .select({
            id: conversation.id,
            createdAt: conversation.createdAt,
            lastMessageAt: conversation.lastMessageAt,
            otherId: user.id,
            otherName: sql<string>`coalesce(${profile.displayName}, ${user.name})`,
            otherPhotoUrl: profile.photoUrl,
            unreadCount: unreadCount(viewer),
          })
          .from(conversation)
          .innerJoin(user, eq(user.id, otherId(viewer)))
          .leftJoin(profile, eq(profile.userId, user.id))
          .innerJoin(
            conversationMember,
            and(
              eq(conversationMember.conversationId, conversation.id),
              eq(conversationMember.userId, viewer.id),
            ),
          );

      type ConversationRow = Effect.Success<ReturnType<typeof selectConversations>>[number];

      const toMessage = (viewer: SessionUser, row: typeof directMessage.$inferSelect) =>
        new DirectMessage({
          id: row.id,
          conversationId: row.conversationId,
          senderId: row.senderId,
          mine: row.senderId === viewer.id,
          body: row.body,
          createdAt: row.createdAt,
        });

      const lastMessages = (viewer: SessionUser, ids: ReadonlyArray<string>) =>
        ids.length === 0
          ? Effect.succeed(new Map<string, DirectMessage>())
          : db
              .selectDistinctOn([directMessage.conversationId])
              .from(directMessage)
              .where(inArray(directMessage.conversationId, [...ids]))
              .orderBy(
                directMessage.conversationId,
                desc(directMessage.createdAt),
                desc(directMessage.id),
              )
              .pipe(
                Effect.map(
                  (rows) =>
                    new Map(rows.map((row) => [row.conversationId, toMessage(viewer, row)])),
                ),
                Effect.orDie,
              );

      const toConversation = (row: ConversationRow, lastMessage: DirectMessage | undefined) =>
        new Conversation({
          id: row.id,
          otherPlayer: { id: row.otherId, displayName: row.otherName, photoUrl: row.otherPhotoUrl },
          lastMessage: lastMessage ?? null,
          unreadCount: row.unreadCount,
          createdAt: row.createdAt,
        });

      const findConversation = (viewer: SessionUser, id: string) =>
        Effect.gen(function* () {
          if (!isUuid(id)) return undefined;
          const [row] = yield* selectConversations(viewer)
            .where(and(eq(conversation.id, id), visibleTo(viewer)))
            .pipe(Effect.orDie);
          if (!row) return undefined;
          const last = yield* lastMessages(viewer, [row.id]);
          return toConversation(row, last.get(row.id));
        });

      const requireConversation = (viewer: SessionUser, id: string) =>
        findConversation(viewer, id).pipe(
          Effect.flatMap((found) =>
            found ? Effect.succeed(found) : Effect.fail(new ConversationNotFound({ id })),
          ),
        );

      const requireOpened = (viewer: SessionUser, id: string, playerId: string) =>
        findConversation(viewer, id).pipe(
          Effect.flatMap((found) =>
            found ? Effect.succeed(found) : Effect.fail(new PlayerNotFound({ id: playerId })),
          ),
        );

      const rateLimited = (limit: number, what: string) =>
        new MessagesRateLimited({
          message: `You can send ${limit} ${what} an hour. Try again a bit later.`,
        });

      return Messages.of({
        listConversations: (viewer, query) =>
          Effect.gen(function* () {
            const limit = query.limit ?? MESSAGES_PAGE_DEFAULT;
            const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* selectConversations(viewer)
              .where(
                and(
                  visibleTo(viewer),
                  isNotNull(conversation.lastMessageAt),
                  after === undefined
                    ? undefined
                    : sql`(${conversation.lastMessageAt}, ${conversation.id}) < (${new Date(after.at).toISOString()}::timestamptz, ${after.id}::uuid)`,
                ),
              )
              .orderBy(desc(conversation.lastMessageAt), desc(conversation.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            const latest = yield* lastMessages(
              viewer,
              page.map((row) => row.id),
            );
            const [unread] = yield* db
              .select({ total: count() })
              .from(conversation)
              .innerJoin(
                conversationMember,
                and(
                  eq(conversationMember.conversationId, conversation.id),
                  eq(conversationMember.userId, viewer.id),
                ),
              )
              .where(and(visibleTo(viewer), sql`${unreadCount(viewer)} > 0`))
              .pipe(Effect.orDie);
            return new ConversationsPage({
              items: page.map((row) => toConversation(row, latest.get(row.id))),
              nextCursor:
                rows.length > limit && last?.lastMessageAt
                  ? encodeCursor({ at: last.lastMessageAt.getTime(), id: last.id })
                  : null,
              unreadConversations: unread?.total ?? 0,
            });
          }).pipe(Effect.withSpan("Messages.listConversations")),

        openConversation: (viewer, playerId) =>
          Effect.gen(function* () {
            if (playerId === viewer.id) {
              return yield* new CannotMessageSelf({ message: "You can't message yourself" });
            }
            const [other] = yield* db
              .select({ id: profile.userId })
              .from(profile)
              .where(and(eq(profile.userId, playerId), notBlocked(viewer.id, profile.userId)))
              .pipe(Effect.orDie);
            if (!other) return yield* new PlayerNotFound({ id: playerId });
            const pair = pairOf(viewer.id, playerId);
            const [existing] = yield* db
              .select({ id: conversation.id })
              .from(conversation)
              .where(
                and(
                  eq(conversation.userLowId, pair.userLowId),
                  eq(conversation.userHighId, pair.userHighId),
                ),
              )
              .pipe(Effect.orDie);
            if (existing) return yield* requireOpened(viewer, existing.id, playerId);

            const [mine] = yield* db
              .select({ id: profile.id })
              .from(profile)
              .where(eq(profile.userId, viewer.id))
              .pipe(Effect.orDie);
            if (!mine) {
              return yield* new ProfileRequired({
                message: "Set up your profile before messaging players",
              });
            }
            const [started] = yield* db
              .select({ total: count() })
              .from(conversation)
              .where(
                and(
                  eq(conversation.startedById, viewer.id),
                  gte(conversation.createdAt, new Date(Date.now() - HOUR_MS)),
                ),
              )
              .pipe(Effect.orDie);
            if ((started?.total ?? 0) >= CONVERSATIONS_PER_HOUR) {
              return yield* rateLimited(CONVERSATIONS_PER_HOUR, "new conversations");
            }
            const id = yield* db
              .transaction((tx) =>
                Effect.gen(function* () {
                  const [created] = yield* tx
                    .insert(conversation)
                    .values({ ...pair, startedById: viewer.id })
                    .onConflictDoNothing()
                    .returning({ id: conversation.id });
                  if (!created) {
                    const [row] = yield* tx
                      .select({ id: conversation.id })
                      .from(conversation)
                      .where(
                        and(
                          eq(conversation.userLowId, pair.userLowId),
                          eq(conversation.userHighId, pair.userHighId),
                        ),
                      );
                    return row!.id;
                  }
                  yield* tx.insert(conversationMember).values([
                    { conversationId: created.id, userId: viewer.id },
                    { conversationId: created.id, userId: playerId },
                  ]);
                  return created.id;
                }),
              )
              .pipe(Effect.orDie);
            return yield* requireOpened(viewer, id, playerId);
          }).pipe(Effect.withSpan("Messages.openConversation")),

        listMessages: (viewer, conversationId, query) =>
          Effect.gen(function* () {
            const limit = query.limit ?? MESSAGES_PAGE_DEFAULT;
            const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const found = yield* requireConversation(viewer, conversationId);
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* db
              .select()
              .from(directMessage)
              .where(
                and(
                  eq(directMessage.conversationId, conversationId),
                  after === undefined
                    ? undefined
                    : sql`(${directMessage.createdAt}, ${directMessage.id}) < (${new Date(after.at).toISOString()}::timestamptz, ${after.id}::uuid)`,
                ),
              )
              .orderBy(desc(directMessage.createdAt), desc(directMessage.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            return new MessagesPage({
              conversation: found,
              items: page.map((row) => toMessage(viewer, row)),
              nextCursor:
                rows.length > limit && last
                  ? encodeCursor({ at: last.createdAt.getTime(), id: last.id })
                  : null,
            });
          }).pipe(Effect.withSpan("Messages.listMessages")),

        send: (viewer, conversationId, input) =>
          Effect.gen(function* () {
            const found = yield* requireConversation(viewer, conversationId);
            const [sent] = yield* db
              .select({ total: count() })
              .from(directMessage)
              .where(
                and(
                  eq(directMessage.senderId, viewer.id),
                  gte(directMessage.createdAt, new Date(Date.now() - HOUR_MS)),
                ),
              )
              .pipe(Effect.orDie);
            if ((sent?.total ?? 0) >= MESSAGES_PER_HOUR) {
              return yield* rateLimited(MESSAGES_PER_HOUR, "messages");
            }
            const row = yield* db
              .transaction((tx) =>
                Effect.gen(function* () {
                  const now = new Date();
                  const [message] = yield* tx
                    .insert(directMessage)
                    .values({
                      conversationId,
                      senderId: viewer.id,
                      body: input.body,
                      createdAt: now,
                    })
                    .returning();
                  yield* tx
                    .update(conversation)
                    .set({ lastMessageAt: now })
                    .where(eq(conversation.id, conversationId));
                  yield* tx
                    .update(conversationMember)
                    .set({ lastReadAt: now })
                    .where(
                      and(
                        eq(conversationMember.conversationId, conversationId),
                        eq(conversationMember.userId, viewer.id),
                      ),
                    );
                  return message!;
                }),
              )
              .pipe(Effect.orDie);
            const [me] = yield* db
              .select({ name: sql<string>`coalesce(${profile.displayName}, ${user.name})` })
              .from(user)
              .leftJoin(profile, eq(profile.userId, user.id))
              .where(eq(user.id, viewer.id))
              .pipe(Effect.orDie);
            yield* notifications.notify({
              to: [found.otherPlayer.id],
              from: viewer.id,
              ...notices.directMessage(conversationId, me?.name ?? viewer.name, input.body),
            });
            return toMessage(viewer, row);
          }).pipe(Effect.withSpan("Messages.send")),

        markRead: (viewer, conversationId) =>
          Effect.gen(function* () {
            yield* requireConversation(viewer, conversationId);
            yield* db
              .update(conversationMember)
              .set({ lastReadAt: new Date() })
              .where(
                and(
                  eq(conversationMember.conversationId, conversationId),
                  eq(conversationMember.userId, viewer.id),
                ),
              )
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Messages.markRead")),
      });
    }),
  );
}

/**
 * A message `viewerId` may see for a report: in one of their conversations,
 * whoever sent it (the caller refuses their own). Found even after a block,
 * since blocking first and reporting next is a common order.
 */
export const reportableMessage = (db: Db["Service"], viewerId: string, messageId: string) =>
  Effect.gen(function* () {
    if (!isUuid(messageId)) return Option.none();
    const [row] = yield* db
      .select({ authorId: directMessage.senderId, content: directMessage.body })
      .from(directMessage)
      .innerJoin(conversation, eq(conversation.id, directMessage.conversationId))
      .where(
        and(
          eq(directMessage.id, messageId),
          or(eq(conversation.userLowId, viewerId), eq(conversation.userHighId, viewerId)),
        ),
      )
      .pipe(Effect.orDie);
    return Option.fromNullishOr(row);
  });
