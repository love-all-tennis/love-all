import {
  type Availability,
  type AvailabilityBlock,
  Me,
  Profile,
  type ProfilePatch,
  type SessionUser,
} from "@love-all/domain";
import { asc, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Db } from "./Db";
import { type LngLat, roundHomePoint } from "./db/geo";
import { availability, metro, profile } from "./db/schema";

/**
 * The signed-in player's own profile and weekly availability.
 *
 * Database failures are defects (a 500): every input has already been
 * validated against the domain schemas, which mirror the table constraints.
 */
export class Profiles extends Context.Service<
  Profiles,
  {
    readonly get: (user: SessionUser) => Effect.Effect<Me>;
    readonly update: (user: SessionUser, patch: ProfilePatch) => Effect.Effect<Me>;
    readonly replaceAvailability: (
      user: SessionUser,
      blocks: Availability,
    ) => Effect.Effect<Availability>;
  }
>()("love-all/Profiles") {
  static readonly layer = Layer.effect(
    Profiles,
    Effect.gen(function* () {
      const db = yield* Db;

      const pointSql = (point: LngLat) =>
        sql`ST_SetSRID(ST_MakePoint(${point.x}, ${point.y}), 4326)`;

      /** The closest metro whose radius covers the point, if any. */
      const metroFor = (point: LngLat) =>
        db
          .select({ id: metro.id })
          .from(metro)
          .where(
            sql`ST_DWithin(${metro.centerPoint}::geography, ${pointSql(point)}::geography, ${metro.radiusKm} * 1000)`,
          )
          .orderBy(sql`${metro.centerPoint} <-> ${pointSql(point)}`)
          .limit(1)
          .pipe(Effect.map(([row]) => row?.id ?? null));

      const loadAvailability = (profileId: string) =>
        db
          .select({
            weekday: availability.weekday,
            startTime: availability.startTime,
            endTime: availability.endTime,
          })
          .from(availability)
          .where(eq(availability.profileId, profileId))
          .orderBy(asc(availability.weekday), asc(availability.startTime))
          .pipe(
            Effect.map((rows): Availability =>
              rows.map((row) => ({
                weekday: row.weekday,
                // Postgres `time` reads back as "HH:MM:SS"; the API speaks "HH:MM".
                startTime: row.startTime.slice(0, 5),
                endTime: row.endTime.slice(0, 5),
              })),
            ),
          );

      const get = (user: SessionUser) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select({ profile, metro: { id: metro.id, slug: metro.slug, name: metro.name } })
            .from(profile)
            .leftJoin(metro, eq(metro.id, profile.metroId))
            .where(eq(profile.userId, user.id));
          if (!row) {
            return new Me({ user, profile: null, availability: [] });
          }
          const p = row.profile;
          return new Me({
            user,
            profile: new Profile({
              displayName: p.displayName,
              photoUrl: p.photoUrl,
              homePoint: p.homePoint ? { lat: p.homePoint.y, lng: p.homePoint.x } : null,
              metro: row.metro,
              searchRadiusKm: p.searchRadiusKm,
              ntrp: p.ntrp,
              handedness: p.handedness,
              playsSingles: p.playsSingles,
              playsDoubles: p.playsDoubles,
              playsHitting: p.playsHitting,
              bio: p.bio,
            }),
            availability: yield* loadAvailability(p.id),
          });
        }).pipe(Effect.orDie, Effect.withSpan("Profiles.get"));

      /**
       * Creates the profile on first write, otherwise applies `changes`.
       * Returns the profile id.
       */
      const upsert = (user: SessionUser, changes: Partial<typeof profile.$inferInsert>) =>
        db
          .insert(profile)
          .values({ userId: user.id, displayName: defaultDisplayName(user), ...changes })
          .onConflictDoUpdate({
            target: profile.userId,
            set: { ...changes, updatedAt: new Date() },
          })
          .returning({ id: profile.id })
          .pipe(Effect.map(([row]) => row!.id));

      const update = (user: SessionUser, patch: ProfilePatch) =>
        Effect.gen(function* () {
          const { homePoint, ...rest } = patch;
          const changes: Partial<typeof profile.$inferInsert> = { ...rest };
          if (homePoint !== undefined) {
            const point = homePoint && roundHomePoint({ x: homePoint.lng, y: homePoint.lat });
            changes.homePoint = point;
            changes.metroId = point ? yield* metroFor(point) : null;
          }
          yield* upsert(user, changes);
          return yield* get(user);
        }).pipe(Effect.orDie, Effect.withSpan("Profiles.update"));

      const replaceAvailability = (user: SessionUser, blocks: Availability) =>
        Effect.gen(function* () {
          const profileId = yield* upsert(user, {});
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              // Lock the profile so two concurrent replaces can't interleave.
              yield* tx
                .select({ id: profile.id })
                .from(profile)
                .where(eq(profile.id, profileId))
                .for("update");
              yield* tx.delete(availability).where(eq(availability.profileId, profileId));
              if (blocks.length > 0) {
                yield* tx
                  .insert(availability)
                  .values(blocks.map((block: AvailabilityBlock) => ({ profileId, ...block })));
              }
            }),
          );
          return yield* loadAvailability(profileId);
        }).pipe(Effect.orDie, Effect.withSpan("Profiles.replaceAvailability"));

      return Profiles.of({ get, update, replaceAvailability });
    }),
  );
}

/** A new profile starts with the account name, cut to fit the 50-character limit. */
const defaultDisplayName = (user: SessionUser) => user.name.trim().slice(0, 50) || "Player";
