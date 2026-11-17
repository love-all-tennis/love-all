import {
  CannotTargetSelf,
  type HideableTargetType,
  InvalidCursor,
  MODERATION_PAGE_DEFAULT,
  ModerationReport,
  ModerationReportsPage,
  type ModerationReportsQuery,
  type NewSuspension,
  NotModerator,
  type ReportResolution,
  type ReportTargetType,
  ReportNotFound,
  type SessionUser,
  TargetNotFound,
} from "@love-all/domain";
import { type SQL, type SQLWrapper, and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import {
  accountSuspension,
  clubReview,
  forumPost,
  forumThread,
  profile,
  report,
  session,
  user,
} from "./db/schema";
import {
  decodeRepliesCursor as decodeIdCursor,
  encodeRepliesCursor as encodeIdCursor,
} from "./forum/cursor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Content tables a moderator can hide, by report target type. */
const hideable = {
  forum_thread: forumThread,
  forum_post: forumPost,
  club_review: clubReview,
} as const;

const reporterUser = alias(user, "reporter_user");
const reporterProfile = alias(profile, "reporter_profile");
const subjectUser = alias(user, "subject_user");
const subjectProfile = alias(profile, "subject_profile");
const subjectSuspension = alias(accountSuspension, "subject_suspension");
const reportedThread = alias(forumThread, "reported_thread");
const reportedPost = alias(forumPost, "reported_post");
const reportedClubReview = alias(clubReview, "reported_club_review");

/**
 * Moderation, for admins: the reports queue, hiding forum posts and club
 * reviews, and suspending players. Every method fails with `NotModerator`
 * for anyone whose `role` isn't "admin".
 *
 * Hiding sets `hidden_at`, which the forum and club reviews already leave
 * out for everyone.
 * Suspending signs the player out everywhere; `auth.ts` stops them signing
 * in again and player search leaves them out (`notSuspended`).
 *
 * Database failures are defects (a 500).
 */
export class Moderation extends Context.Service<
  Moderation,
  {
    readonly listReports: (
      viewer: SessionUser,
      query: ModerationReportsQuery,
    ) => Effect.Effect<ModerationReportsPage, NotModerator | InvalidCursor>;
    readonly dismissReport: (
      viewer: SessionUser,
      id: string,
    ) => Effect.Effect<void, NotModerator | ReportNotFound>;
    readonly hideContent: (
      viewer: SessionUser,
      type: HideableTargetType,
      id: string,
    ) => Effect.Effect<void, NotModerator | TargetNotFound>;
    readonly unhideContent: (
      viewer: SessionUser,
      type: HideableTargetType,
      id: string,
    ) => Effect.Effect<void, NotModerator | TargetNotFound>;
    readonly suspend: (
      viewer: SessionUser,
      playerId: string,
      input: NewSuspension,
    ) => Effect.Effect<void, NotModerator | TargetNotFound | CannotTargetSelf>;
    readonly unsuspend: (
      viewer: SessionUser,
      playerId: string,
    ) => Effect.Effect<void, NotModerator | TargetNotFound>;
  }
>()("love-all/Moderation") {
  static readonly layer = Layer.effect(
    Moderation,
    Effect.gen(function* () {
      const db = yield* Db;

      const requireModerator = (viewer: SessionUser) =>
        viewer.role === "admin"
          ? Effect.void
          : Effect.fail(new NotModerator({ message: "Only moderators can do that" }));

      const requirePlayer = (id: string) =>
        db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, id))
          .pipe(
            Effect.orDie,
            Effect.flatMap(([row]) =>
              row ? Effect.void : Effect.fail(new TargetNotFound({ id })),
            ),
          );

      type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

      /** Closes the open reports matching `where` as `resolution`. */
      const resolveReports = (
        tx: Tx,
        viewer: SessionUser,
        resolution: ReportResolution,
        where: SQL,
      ) =>
        tx
          .update(report)
          .set({
            status: "resolved",
            resolution,
            resolvedById: viewer.id,
            resolvedAt: new Date(),
          })
          .where(and(eq(report.status, "open"), where));

      const onTarget = (targetType: ReportTargetType, targetId: string) =>
        and(eq(report.targetType, targetType), eq(report.targetId, targetId))!;

      const playerName = (displayName: SQLWrapper, name: SQLWrapper) =>
        sql<string | null>`coalesce(${displayName}, ${name})`;

      /** Sets or clears `hidden_at`; a reply's thread counts it in or out of `reply_count`. */
      const setHidden = (
        viewer: SessionUser,
        type: HideableTargetType,
        id: string,
        hidden: boolean,
      ) =>
        Effect.gen(function* () {
          yield* requireModerator(viewer);
          if (!UUID.test(id)) return yield* new TargetNotFound({ id });
          const table = hideable[type];
          const [exists] = yield* db
            .select({ id: table.id })
            .from(table)
            .where(eq(table.id, id))
            .pipe(Effect.orDie);
          if (!exists) return yield* new TargetNotFound({ id });
          yield* db
            .transaction((tx) =>
              Effect.gen(function* () {
                const changed = yield* tx
                  .update(table)
                  .set({ hiddenAt: hidden ? new Date() : null })
                  .where(
                    and(
                      eq(table.id, id),
                      hidden ? isNull(table.hiddenAt) : isNotNull(table.hiddenAt),
                    ),
                  )
                  .returning({ id: table.id });
                if (hidden) {
                  yield* resolveReports(tx, viewer, "content_hidden", onTarget(type, id));
                }
                if (changed.length === 0 || type !== "forum_post") return;
                // Deleted replies already left the count when they were deleted.
                const [post] = yield* tx
                  .select({ threadId: forumPost.threadId, deletedAt: forumPost.deletedAt })
                  .from(forumPost)
                  .where(eq(forumPost.id, id));
                if (!post || post.deletedAt) return;
                yield* tx
                  .update(forumThread)
                  .set({
                    replyCount: hidden
                      ? sql`greatest(${forumThread.replyCount} - 1, 0)`
                      : sql`${forumThread.replyCount} + 1`,
                  })
                  .where(eq(forumThread.id, post.threadId));
              }),
            )
            .pipe(Effect.orDie);
        });

      return Moderation.of({
        listReports: (viewer, query) =>
          Effect.gen(function* () {
            yield* requireModerator(viewer);
            const limit = query.limit ?? MODERATION_PAGE_DEFAULT;
            const status = query.status ?? "open";
            const cursor = query.cursor === undefined ? undefined : decodeIdCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* db
              .select({
                id: report.id,
                targetType: report.targetType,
                targetId: report.targetId,
                reason: report.reason,
                details: report.details,
                content: report.content,
                status: report.status,
                resolution: report.resolution,
                createdAt: report.createdAt,
                resolvedAt: report.resolvedAt,
                reporterId: reporterUser.id,
                reporterName: playerName(reporterProfile.displayName, reporterUser.name),
                subjectId: subjectUser.id,
                subjectName: playerName(subjectProfile.displayName, subjectUser.name),
                subjectSuspended: sql<boolean>`${subjectSuspension.userId} is not null`,
                threadId: sql<
                  string | null
                >`coalesce(${reportedThread.id}, ${reportedPost.threadId})::text`,
                clubId: sql<string | null>`${reportedClubReview.clubId}::text`,
                hidden: sql<boolean>`coalesce(${reportedThread.hiddenAt}, ${reportedPost.hiddenAt}, ${reportedClubReview.hiddenAt}) is not null`,
                removed: sql<boolean>`case
                  when ${report.targetType} = 'player' then ${subjectUser.id} is null
                  -- Messages can't be deleted; they go only with the sender's account.
                  when ${report.targetType} = 'direct_message' then ${subjectUser.id} is null
                  -- Club reviews are deleted for good, so a missing row means removed.
                  when ${report.targetType} = 'club_review' then ${reportedClubReview.id} is null
                  else ${reportedThread.id} is null and ${reportedPost.id} is null
                    or coalesce(${reportedThread.deletedAt}, ${reportedPost.deletedAt}) is not null
                end`,
                openReportsOnTarget: sql<number>`(
                  select count(*)::int from ${report} r
                  where r.target_type = ${report.targetType} and r.target_id = ${report.targetId}
                    and r.status = 'open'
                )`,
              })
              .from(report)
              .leftJoin(reporterUser, eq(reporterUser.id, report.reporterId))
              .leftJoin(reporterProfile, eq(reporterProfile.userId, report.reporterId))
              .leftJoin(subjectUser, eq(subjectUser.id, report.subjectId))
              .leftJoin(subjectProfile, eq(subjectProfile.userId, report.subjectId))
              .leftJoin(subjectSuspension, eq(subjectSuspension.userId, report.subjectId))
              .leftJoin(
                reportedThread,
                and(
                  eq(report.targetType, "forum_thread"),
                  sql`${reportedThread.id}::text = ${report.targetId}`,
                ),
              )
              .leftJoin(
                reportedPost,
                and(
                  eq(report.targetType, "forum_post"),
                  sql`${reportedPost.id}::text = ${report.targetId}`,
                ),
              )
              .leftJoin(
                reportedClubReview,
                and(
                  eq(report.targetType, "club_review"),
                  sql`${reportedClubReview.id}::text = ${report.targetId}`,
                ),
              )
              .where(
                and(
                  eq(report.status, status),
                  after === undefined
                    ? undefined
                    : sql`(${report.createdAt}, ${report.id}) < (
                        select r.created_at, r.id from ${report} r where r.id = ${after}
                      )`,
                ),
              )
              .orderBy(desc(report.createdAt), desc(report.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            return new ModerationReportsPage({
              items: page.map(
                (row) =>
                  new ModerationReport({
                    id: row.id,
                    targetType: row.targetType,
                    targetId: row.targetId,
                    reason: row.reason,
                    details: row.details,
                    content: row.content,
                    reporter: row.reporterId
                      ? {
                          id: row.reporterId,
                          displayName: row.reporterName ?? "",
                          suspended: false,
                        }
                      : null,
                    subject: row.subjectId
                      ? {
                          id: row.subjectId,
                          displayName: row.subjectName ?? "",
                          suspended: row.subjectSuspended,
                        }
                      : null,
                    threadId: row.threadId,
                    clubId: row.clubId,
                    hidden: row.hidden,
                    removed: row.removed,
                    openReportsOnTarget: row.openReportsOnTarget,
                    status: row.status,
                    resolution: row.resolution,
                    createdAt: row.createdAt,
                    resolvedAt: row.resolvedAt,
                  }),
              ),
              nextCursor: rows.length > limit && last ? encodeIdCursor(last.id) : null,
            });
          }).pipe(Effect.withSpan("Moderation.listReports")),

        dismissReport: (viewer, id) =>
          Effect.gen(function* () {
            yield* requireModerator(viewer);
            if (!UUID.test(id)) return yield* new ReportNotFound({ id });
            const [row] = yield* db
              .select({ targetType: report.targetType, targetId: report.targetId })
              .from(report)
              .where(eq(report.id, id))
              .pipe(Effect.orDie);
            if (!row) return yield* new ReportNotFound({ id });
            yield* db
              .transaction((tx) =>
                resolveReports(tx, viewer, "dismissed", onTarget(row.targetType, row.targetId)),
              )
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Moderation.dismissReport")),

        hideContent: (viewer, type, id) =>
          setHidden(viewer, type, id, true).pipe(Effect.withSpan("Moderation.hideContent")),

        unhideContent: (viewer, type, id) =>
          setHidden(viewer, type, id, false).pipe(Effect.withSpan("Moderation.unhideContent")),

        suspend: (viewer, playerId, input) =>
          Effect.gen(function* () {
            yield* requireModerator(viewer);
            if (playerId === viewer.id) {
              return yield* new CannotTargetSelf({ message: "You can't suspend yourself" });
            }
            yield* requirePlayer(playerId);
            yield* db
              .transaction((tx) =>
                Effect.gen(function* () {
                  yield* tx
                    .insert(accountSuspension)
                    .values({
                      userId: playerId,
                      suspendedById: viewer.id,
                      reason: input.reason || null,
                    })
                    .onConflictDoNothing();
                  // Signs them out everywhere; `auth.ts` refuses new sessions.
                  yield* tx.delete(session).where(eq(session.userId, playerId));
                  yield* resolveReports(
                    tx,
                    viewer,
                    "player_suspended",
                    onTarget("player", playerId),
                  );
                }),
              )
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Moderation.suspend")),

        unsuspend: (viewer, playerId) =>
          Effect.gen(function* () {
            yield* requireModerator(viewer);
            yield* requirePlayer(playerId);
            yield* db
              .delete(accountSuspension)
              .where(eq(accountSuspension.userId, playerId))
              .pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Moderation.unsuspend")),
      });
    }),
  );
}
