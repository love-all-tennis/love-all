import {
  CommentNotFound,
  InvalidCursor,
  InvalidResult,
  type NewSessionComment,
  type NewSessionResult,
  NotCommentAuthor,
  NotOnOtherSide,
  NotSessionPlayer,
  ResultConflict,
  ResultNotFound,
  type ResultResponse,
  SESSION_COMMENTS_PAGE_DEFAULT,
  SessionClosed,
  SessionComment,
  SessionCommentsPage,
  SessionNotFound,
  SessionResult,
  type SessionUser,
  winningSide,
} from "@love-all/domain";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Db } from "./Db";
import { Sessions } from "./Sessions";
import { notBlocked } from "./db/blocks";
import {
  playSessionComment,
  playSessionParticipant,
  playSessionResult,
  profile,
  user,
} from "./db/schema";

/** Players a side of each kind has. Hitting sessions have no score. */
const SIDE_SIZE = { singles: 1, doubles: 2 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A comments cursor is the last comment's id, base64url-encoded so clients treat it as opaque. */
export const encodeCommentCursor = (id: string) => Buffer.from(id).toString("base64url");
export const decodeCommentCursor = (token: string): string | undefined => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    return undefined;
  }
  const id = Buffer.from(token, "base64url").toString("utf8");
  return UUID.test(id) ? id : undefined;
};

type ResultRow = typeof playSessionResult.$inferSelect;

const respondingSide = (result: ResultRow) => {
  if (result.recordedBy === null) {
    return [...result.sideA, ...result.sideB];
  }

  return result.sideA.includes(result.recordedBy) ? result.sideB : result.sideA;
};

const toResult = (row: ResultRow) =>
  new SessionResult({
    sideA: row.sideA,
    sideB: row.sideB,
    sets: row.sets,
    winner: row.winner,
    status: row.status,
    recordedBy: row.recordedBy,
    respondedBy: row.respondedBy,
    recordedAt: row.recordedAt,
    respondedAt: row.respondedAt,
  });

const toComment = (row: {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly displayName: string;
  readonly photoUrl: string | null;
}) =>
  new SessionComment({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: { id: row.authorId, displayName: row.displayName, photoUrl: row.photoUrl },
  });

/**
 * Comments and scores on a session. Everything here is for the host and
 * accepted players only; other players get `NotSessionPlayer`, or
 * `SessionNotFound` when they couldn't see the session at all.
 *
 * Database failures are defects (a 500).
 */
export class SessionActivity extends Context.Service<
  SessionActivity,
  {
    readonly listComments: (
      viewer: SessionUser,
      sessionId: string,
      query: { readonly cursor?: string; readonly limit?: number },
    ) => Effect.Effect<SessionCommentsPage, SessionNotFound | NotSessionPlayer | InvalidCursor>;
    readonly addComment: (
      viewer: SessionUser,
      sessionId: string,
      input: NewSessionComment,
    ) => Effect.Effect<SessionComment, SessionNotFound | NotSessionPlayer | SessionClosed>;
    readonly deleteComment: (
      viewer: SessionUser,
      commentId: string,
    ) => Effect.Effect<void, CommentNotFound | NotCommentAuthor>;
    readonly getResult: (
      viewer: SessionUser,
      sessionId: string,
    ) => Effect.Effect<SessionResult | null, SessionNotFound | NotSessionPlayer>;
    readonly recordResult: (
      viewer: SessionUser,
      sessionId: string,
      input: NewSessionResult,
    ) => Effect.Effect<
      SessionResult,
      SessionNotFound | NotSessionPlayer | SessionClosed | InvalidResult | ResultConflict
    >;
    readonly respondToResult: (
      viewer: SessionUser,
      sessionId: string,
      input: ResultResponse,
    ) => Effect.Effect<
      SessionResult,
      SessionNotFound | NotSessionPlayer | ResultNotFound | NotOnOtherSide | ResultConflict
    >;
  }
>()("love-all/SessionActivity") {
  static readonly layer = Layer.effect(
    SessionActivity,
    Effect.gen(function* () {
      const db = yield* Db;
      const sessions = yield* Sessions;

      /**
       * The session, if the viewer is its host or an accepted player. Uses
       * `Sessions.get`, so anyone who couldn't see the session gets
       * `SessionNotFound`, the same as on `GET /sessions/:id`.
       */
      const requirePlayer = (viewer: SessionUser, sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(viewer, sessionId);
          if (session.me?.state !== "accepted") {
            return yield* new NotSessionPlayer({
              message: "Only the host and accepted players can do that",
            });
          }
          return session;
        });

      const selectComments = () =>
        db
          .select({
            id: playSessionComment.id,
            authorId: playSessionComment.authorId,
            body: playSessionComment.body,
            createdAt: playSessionComment.createdAt,
            displayName: sql<string>`coalesce(${profile.displayName}, ${user.name})`,
            photoUrl: profile.photoUrl,
          })
          .from(playSessionComment)
          .innerJoin(user, eq(user.id, playSessionComment.authorId))
          .leftJoin(profile, eq(profile.userId, playSessionComment.authorId));

      const readResult = (sessionId: string) =>
        db
          .select()
          .from(playSessionResult)
          .where(eq(playSessionResult.sessionId, sessionId))
          .pipe(
            Effect.map(([row]) => row),
            Effect.orDie,
          );

      return SessionActivity.of({
        listComments: (viewer, sessionId, query) =>
          Effect.gen(function* () {
            yield* requirePlayer(viewer, sessionId);
            const limit = query.limit ?? SESSION_COMMENTS_PAGE_DEFAULT;
            let after: string | undefined;
            if (query.cursor !== undefined) {
              after = decodeCommentCursor(query.cursor);
              if (!after) {
                return yield* new InvalidCursor({ message: "Unknown cursor" });
              }
            }
            const rows = yield* selectComments()
              .where(
                and(
                  eq(playSessionComment.sessionId, sessionId),
                  isNull(playSessionComment.deletedAt),
                  notBlocked(viewer.id, playSessionComment.authorId),
                  after === undefined
                    ? undefined
                    : sql`(${playSessionComment.createdAt}, ${playSessionComment.id}) > (
                        select c.created_at, c.id from ${playSessionComment} c
                        where c.id = ${after} and c.session_id = ${sessionId}
                      )`,
                ),
              )
              .orderBy(asc(playSessionComment.createdAt), asc(playSessionComment.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            return new SessionCommentsPage({
              items: page.map(toComment),
              nextCursor: rows.length > limit && last ? encodeCommentCursor(last.id) : null,
            });
          }).pipe(Effect.withSpan("SessionActivity.listComments")),

        addComment: (viewer, sessionId, input) =>
          Effect.gen(function* () {
            const session = yield* requirePlayer(viewer, sessionId);
            if (session.status === "cancelled") {
              return yield* new SessionClosed({ message: "The session was cancelled" });
            }
            const [inserted] = yield* db
              .insert(playSessionComment)
              .values({ sessionId, authorId: viewer.id, body: input.body })
              .returning({ id: playSessionComment.id })
              .pipe(Effect.orDie);
            const [row] = yield* selectComments()
              .where(eq(playSessionComment.id, inserted!.id))
              .pipe(Effect.orDie);
            return toComment(row!);
          }).pipe(Effect.withSpan("SessionActivity.addComment")),

        deleteComment: (viewer, commentId) =>
          Effect.gen(function* () {
            const [row] = yield* db
              .select({ authorId: playSessionComment.authorId })
              .from(playSessionComment)
              .where(
                and(eq(playSessionComment.id, commentId), isNull(playSessionComment.deletedAt)),
              )
              .pipe(Effect.orDie);
            if (!row) {
              return yield* new CommentNotFound({ id: commentId });
            }
            if (row.authorId !== viewer.id) {
              return yield* new NotCommentAuthor({ message: "Only the author can delete it" });
            }
            yield* db
              .update(playSessionComment)
              .set({ deletedAt: new Date() })
              .where(eq(playSessionComment.id, commentId))
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("SessionActivity.deleteComment")),

        getResult: (viewer, sessionId) =>
          requirePlayer(viewer, sessionId).pipe(
            Effect.andThen(readResult(sessionId)),
            Effect.map((row) => (row ? toResult(row) : null)),
            Effect.withSpan("SessionActivity.getResult"),
          ),

        recordResult: (viewer, sessionId, input) =>
          Effect.gen(function* () {
            const session = yield* requirePlayer(viewer, sessionId);
            if (session.kind === "hitting") {
              return yield* new InvalidResult({ message: "Hitting sessions have no score" });
            }
            if (session.status === "cancelled") {
              return yield* new SessionClosed({ message: "The session was cancelled" });
            }
            if (session.startsAt.getTime() > Date.now()) {
              return yield* new InvalidResult({ message: "The session hasn't started yet" });
            }
            const size = SIDE_SIZE[session.kind];
            if (input.sideA.length !== size) {
              return yield* new InvalidResult({
                message: `A ${session.kind} side has ${size} player${size === 1 ? "" : "s"}`,
              });
            }
            const players = [...input.sideA, ...input.sideB];
            if (!players.includes(viewer.id)) {
              return yield* new InvalidResult({
                message: "You can only record a match you played",
              });
            }
            const accepted = yield* db
              .select({ userId: playSessionParticipant.userId })
              .from(playSessionParticipant)
              .where(
                and(
                  eq(playSessionParticipant.sessionId, sessionId),
                  eq(playSessionParticipant.state, "accepted"),
                ),
              )
              .pipe(
                Effect.map((rows) => new Set(rows.map((r) => r.userId))),
                Effect.orDie,
              );
            if (!players.every((id) => accepted.has(id))) {
              return yield* new InvalidResult({
                message: "Everyone on a side must be an accepted player in the session",
              });
            }
            const values = {
              sideA: [...input.sideA],
              sideB: [...input.sideB],
              sets: input.sets.map(([a, b]): [number, number] => [a, b]),
              winner: winningSide(input.sets),
              status: "pending" as const,
              recordedBy: viewer.id,
              recordedAt: new Date(),
              respondedBy: null,
              respondedAt: null,
            };
            // One score per session; a new one only replaces a disputed one.
            const [row] = yield* db
              .insert(playSessionResult)
              .values({ sessionId, ...values })
              .onConflictDoUpdate({
                target: playSessionResult.sessionId,
                set: values,
                setWhere: eq(playSessionResult.status, "disputed"),
              })
              .returning()
              .pipe(Effect.orDie);
            if (!row) {
              return yield* new ResultConflict({
                message: "A score is already recorded; it can only be replaced once disputed",
              });
            }
            return toResult(row);
          }).pipe(Effect.withSpan("SessionActivity.recordResult")),

        respondToResult: (viewer, sessionId, input) =>
          Effect.gen(function* () {
            yield* requirePlayer(viewer, sessionId);
            const current = yield* readResult(sessionId);
            if (!current) {
              return yield* new ResultNotFound({ id: sessionId });
            }
            const otherSide = respondingSide(current);
            if (!otherSide.includes(viewer.id)) {
              return yield* new NotOnOtherSide({
                message: "Only a player on the other side can confirm or dispute the score",
              });
            }
            const [row] = yield* db
              .update(playSessionResult)
              .set({
                status: input.response === "confirm" ? "confirmed" : "disputed",
                respondedBy: viewer.id,
                respondedAt: new Date(),
              })
              .where(
                and(
                  eq(playSessionResult.sessionId, sessionId),
                  eq(playSessionResult.status, "pending"),
                ),
              )
              .returning()
              .pipe(Effect.orDie);
            if (!row) {
              return yield* new ResultConflict({ message: "The score was already answered" });
            }
            return toResult(row);
          }).pipe(Effect.withSpan("SessionActivity.respondToResult")),
      });
    }),
  );
}
