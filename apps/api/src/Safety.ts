import {
  BlockedPlayer,
  CannotTargetSelf,
  type NewReport,
  ReportCreated,
  type SessionUser,
  TargetNotFound,
} from "@love-all/domain";
import { and, desc, eq, or } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Db } from "./Db";
import { block, follow, profile, report, user } from "./db/schema";
import { removeFromEachOthersSessions } from "./SessionJoins";

/**
 * Blocks and reports. Hiding blocked players from other queries is done in
 * those queries, with `notBlocked` from `./db/blocks`.
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

      /** Fails unless `id` is another player's existing account. */
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

      return Safety.of({
        block: (viewer, playerId) =>
          requireOtherPlayer(viewer, playerId, "block").pipe(
            Effect.andThen(
              // Blocking also ends any follow between the two, in both directions,
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
                    // ...and takes each out of the other's sessions.
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
          requireOtherPlayer(viewer, input.targetId, "report").pipe(
            Effect.andThen(
              db
                .insert(report)
                .values({
                  reporterId: viewer.id,
                  targetType: input.targetType,
                  targetId: input.targetId,
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
