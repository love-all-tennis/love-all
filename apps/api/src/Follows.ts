import {
  CannotFollowSelf,
  FollowedPlayer,
  FollowedPlayers,
  FollowLimitReached,
  MAX_FOLLOWS,
  PlayerNotFound,
  type SessionUser,
} from "@love-all/domain";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Context, Effect, Layer } from "effect";
import { Db } from "./Db";
import { follow, profile } from "./db/schema";

/**
 * The players someone follows for later. Following needs the other player to
 * have a profile, the same rule as viewing one.
 *
 * Database failures are defects (a 500).
 */
export class Follows extends Context.Service<
  Follows,
  {
    readonly list: (user: SessionUser) => Effect.Effect<FollowedPlayers>;
    readonly follow: (
      user: SessionUser,
      playerId: string,
    ) => Effect.Effect<void, PlayerNotFound | CannotFollowSelf | FollowLimitReached>;
    readonly unfollow: (user: SessionUser, playerId: string) => Effect.Effect<void>;
  }
>()("love-all/Follows") {
  static readonly layer = Layer.effect(
    Follows,
    Effect.gen(function* () {
      const db = yield* Db;
      const mine = alias(profile, "mine");

      const list = (user: SessionUser) =>
        db
          .select({
            id: profile.userId,
            displayName: profile.displayName,
            photoUrl: profile.photoUrl,
            ntrp: profile.ntrp,
            playsSingles: profile.playsSingles,
            playsDoubles: profile.playsDoubles,
            playsHitting: profile.playsHitting,
            // Whole km, at least 1: home points are rounded to about 1 km anyway.
            distanceKm: sql<number | null>`case
              when ${mine.homePoint} is null or ${profile.homePoint} is null then null
              else greatest(1, round(ST_Distance(${mine.homePoint}::geography, ${profile.homePoint}::geography) / 1000))::int
            end`,
          })
          .from(follow)
          .innerJoin(profile, eq(profile.userId, follow.followedId))
          .leftJoin(mine, eq(mine.userId, follow.followerId))
          .where(eq(follow.followerId, user.id))
          .orderBy(desc(follow.createdAt), profile.userId)
          .pipe(
            Effect.map(
              (rows) => new FollowedPlayers({ items: rows.map((row) => new FollowedPlayer(row)) }),
            ),
            Effect.orDie,
            Effect.withSpan("Follows.list"),
          );

      const followPlayer = (user: SessionUser, playerId: string) =>
        Effect.gen(function* () {
          if (playerId === user.id) {
            return yield* new CannotFollowSelf({ message: "You can't follow yourself" });
          }
          const [target] = yield* db
            .select({ id: profile.userId })
            .from(profile)
            .where(eq(profile.userId, playerId))
            .pipe(Effect.orDie);
          if (!target) return yield* new PlayerNotFound({ id: playerId });

          const [already] = yield* db
            .select({ id: follow.followedId })
            .from(follow)
            .where(and(eq(follow.followerId, user.id), eq(follow.followedId, playerId)))
            .pipe(Effect.orDie);
          if (already) return;

          const [{ total } = { total: 0 }] = yield* db
            .select({ total: count() })
            .from(follow)
            .where(eq(follow.followerId, user.id))
            .pipe(Effect.orDie);
          if (total >= MAX_FOLLOWS) return yield* new FollowLimitReached({ limit: MAX_FOLLOWS });

          yield* db
            .insert(follow)
            .values({ followerId: user.id, followedId: playerId })
            .onConflictDoNothing()
            .pipe(Effect.orDie);
        }).pipe(Effect.withSpan("Follows.follow"));

      const unfollow = (user: SessionUser, playerId: string) =>
        db
          .delete(follow)
          .where(and(eq(follow.followerId, user.id), eq(follow.followedId, playerId)))
          .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Follows.unfollow"));

      return Follows.of({ list, follow: followPlayer, unfollow });
    }),
  );
}
