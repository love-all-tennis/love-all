import {
  BlockedPlayer,
  CannotTargetSelf,
  type NewReport,
  ReportCreated,
  type ReportTargetType,
  type SessionUser,
  TargetNotFound,
} from "@love-all/domain";
import { and, desc, eq, or } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import { reportableClubReview } from "./Clubs";
import { Db } from "./Db";
import { reportableEquipmentReview } from "./Equipment";
import { Forum } from "./Forum";
import { reportableMessage } from "./Messages";
import { block, follow, profile, report, user } from "./db/schema";
import { removeFromEachOthersSessions } from "./SessionJoins";

interface ReportSubject {
  readonly subjectId: string;
  readonly content: string | null;
}

/**
 * Blocks and reports. Hiding blocked players from other queries is done in
 * those queries, with `notBlocked` from `./db/blocks`.
 *
 * A report can be about a player or about something a player wrote. Each
 * target type says, in `subjectOf`, how to find it as the reporter sees it
 * and who wrote it; that is all a new reportable thing needs.
 *
 * Database failures are defects (a 500), as in `Profiles`.
 */
export class Safety extends Context.Service<
  Safety,
  {
    readonly block: (
      viewer: SessionUser,
      playerId: string,
    ) => Effect.Effect<void, TargetNotFound | CannotTargetSelf>;
    readonly unblock: (viewer: SessionUser, playerId: string) => Effect.Effect<void>;
    readonly listBlocks: (viewer: SessionUser) => Effect.Effect<ReadonlyArray<BlockedPlayer>>;
    readonly report: (
      viewer: SessionUser,
      report: NewReport,
    ) => Effect.Effect<ReportCreated, TargetNotFound | CannotTargetSelf>;
  }
>()("love-all/Safety") {
  static readonly layer = Layer.effect(
    Safety,
    Effect.gen(function* () {
      const db = yield* Db;
      const forum = yield* Forum;

      const requireOtherPlayer = (viewer: SessionUser, id: string, verb: string) =>
        Effect.gen(function* () {
          if (id === viewer.id) {
            return yield* new CannotTargetSelf({ message: `You can't ${verb} yourself` });
          }

          const [row] = yield* db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, id))
            .pipe(Effect.orDie);

          if (!row) {
            return yield* new TargetNotFound({ id });
          }
        });

      const otherAuthor: (
        viewer: SessionUser,
        id: string,
        found: Option.Option<{ readonly authorId: string; readonly content: string }>,
      ) => Effect.Effect<ReportSubject, TargetNotFound | CannotTargetSelf> = (viewer, id, found) =>
        Option.match(found, {
          onNone: () => Effect.fail(new TargetNotFound({ id })),
          onSome: ({ authorId, content }) =>
            authorId === viewer.id
              ? Effect.fail(new CannotTargetSelf({ message: "You can't report your own post" }))
              : Effect.succeed({ subjectId: authorId, content }),
        });

      const subjectOf: (
        viewer: SessionUser,
        targetType: ReportTargetType,
        id: string,
      ) => Effect.Effect<ReportSubject, TargetNotFound | CannotTargetSelf> = (
        viewer,
        targetType,
        id,
      ) => {
        switch (targetType) {
          case "player":
            return requireOtherPlayer(viewer, id, "report").pipe(
              Effect.as({ subjectId: id, content: null }),
            );
          case "forum_thread":
            return forum
              .findReportable(viewer, "thread", id)
              .pipe(Effect.flatMap((found) => otherAuthor(viewer, id, found)));
          case "forum_post":
            return forum
              .findReportable(viewer, "post", id)
              .pipe(Effect.flatMap((found) => otherAuthor(viewer, id, found)));
          case "direct_message":
            return reportableMessage(db, viewer.id, id).pipe(
              Effect.flatMap((found) => otherAuthor(viewer, id, found)),
            );
          case "equipment_review":
            return reportableEquipmentReview(db, viewer.id, id).pipe(
              Effect.flatMap((found) => otherAuthor(viewer, id, found)),
            );
          case "club_review":
            return reportableClubReview(db, viewer.id, id).pipe(
              Effect.flatMap((found) => otherAuthor(viewer, id, found)),
            );
        }
      };

      return Safety.of({
        block: (viewer, playerId) =>
          requireOtherPlayer(viewer, playerId, "block").pipe(
            Effect.andThen(
              db
                .transaction((tx) =>
                  Effect.gen(function* () {
                    yield* tx
                      .insert(block)
                      .values({ blockerId: viewer.id, blockedId: playerId })
                      .onConflictDoNothing();
                    yield* tx
                      .delete(follow)
                      .where(
                        or(
                          and(eq(follow.followerId, viewer.id), eq(follow.followedId, playerId)),
                          and(eq(follow.followerId, playerId), eq(follow.followedId, viewer.id)),
                        ),
                      );
                    yield* removeFromEachOthersSessions(tx, viewer.id, playerId);
                  }),
                )
                .pipe(Effect.orDie),
            ),
            Effect.asVoid,
            Effect.withSpan("Safety.block"),
          ),

        unblock: (viewer, playerId) =>
          db
            .delete(block)
            .where(and(eq(block.blockerId, viewer.id), eq(block.blockedId, playerId)))
            .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Safety.unblock")),

        listBlocks: (viewer) =>
          db
            .select({
              id: block.blockedId,
              displayName: profile.displayName,
              photoUrl: profile.photoUrl,
              blockedAt: block.createdAt,
            })
            .from(block)
            .leftJoin(profile, eq(profile.userId, block.blockedId))
            .where(eq(block.blockerId, viewer.id))
            .orderBy(desc(block.createdAt))
            .pipe(
              Effect.map((rows) => rows.map((row) => new BlockedPlayer(row))),
              Effect.orDie,
              Effect.withSpan("Safety.listBlocks"),
            ),

        report: (viewer, input) =>
          subjectOf(viewer, input.targetType, input.targetId).pipe(
            Effect.flatMap((subject) =>
              db
                .insert(report)
                .values({
                  reporterId: viewer.id,
                  targetType: input.targetType,
                  targetId: input.targetId,
                  subjectId: subject.subjectId,
                  content: subject.content,
                  reason: input.reason,
                  details: input.details || null,
                })
                .returning({ id: report.id })
                .pipe(Effect.orDie),
            ),
            Effect.map(([row]) => new ReportCreated({ id: row!.id })),
            Effect.withSpan("Safety.report"),
          ),
      });
    }),
  );
}
