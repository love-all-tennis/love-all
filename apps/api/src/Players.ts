import {
  HomePointRequired,
  InvalidCursor,
  PLAYERS_PAGE_DEFAULT,
  PlayerNotFound,
  PlayerProfile,
  PlayersPage,
  type PlayersQuery,
  PlayerSummary,
  type SessionUser,
} from "@love-all/domain";
import { type SQL, and, asc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import { loadAvailability } from "./db/availability";
import { notSuspended } from "./db/suspensions";
import type { LngLat } from "./db/geo";
import { metro, profile } from "./db/schema";
import { decodeCursor, displayKm, encodeCursor } from "./players/cursor";

/**
 * Other players, as the signed-in player sees them: a nearby search and
 * public profiles. Home points never leave this module, only distances.
 *
 * Database failures are defects (a 500), as in `Profiles`.
 */
export class Players extends Context.Service<
  Players,
  {
    readonly search: (
      viewer: SessionUser,
      query: PlayersQuery,
    ) => Effect.Effect<PlayersPage, HomePointRequired | InvalidCursor>;
    readonly get: (viewer: SessionUser, id: string) => Effect.Effect<PlayerProfile, PlayerNotFound>;
  }
>()("love-all/Players") {
  static readonly layer = Layer.effect(
    Players,
    Effect.gen(function* () {
      const db = yield* Db;

      const geographyOf = (point: LngLat) =>
        sql`ST_SetSRID(ST_MakePoint(${point.x}, ${point.y}), 4326)::geography`;

      /** Metres from `point` to the profile's home point, on the spheroid. */
      const distanceFrom = (point: LngLat) =>
        sql`ST_Distance(${profile.homePoint}::geography, ${geographyOf(point)})`;

      /**
       * Who the viewer may see. Every query about other players goes through
       * this list, so visibility rules (such as blocks) are added here once.
       */
      const visibleTo = (viewer: SessionUser): Array<SQL> => [
        notBlocked(viewer.id, profile.userId),
        notSuspended(profile.userId),
      ];

      const viewerHome = (viewer: SessionUser) =>
        db
          .select({ homePoint: profile.homePoint, searchRadiusKm: profile.searchRadiusKm })
          .from(profile)
          .where(eq(profile.userId, viewer.id))
          .pipe(Effect.map(([row]) => row));

      const summaryColumns = {
        id: profile.userId,
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
        ntrp: profile.ntrp,
        handedness: profile.handedness,
        playsSingles: profile.playsSingles,
        playsDoubles: profile.playsDoubles,
        playsHitting: profile.playsHitting,
        metro: { id: metro.id, slug: metro.slug, name: metro.name },
      };

      const search = (viewer: SessionUser, query: PlayersQuery) =>
        Effect.gen(function* () {
          const me = yield* viewerHome(viewer).pipe(Effect.orDie);
          if (!me?.homePoint) {
            return yield* new HomePointRequired({
              message: "Set your home location to find players near you",
            });
          }
          const cursor =
            query.cursor === undefined
              ? undefined
              : yield* decodeCursor(query.cursor).pipe(
                  Option.match({
                    onNone: () =>
                      Effect.fail(
                        new InvalidCursor({ message: "Start again from the first page" }),
                      ),
                    onSome: Effect.succeed,
                  }),
                );

          const radiusKm = query.radiusKm ?? me.searchRadiusKm;
          const limit = query.limit ?? PLAYERS_PAGE_DEFAULT;
          const distance = distanceFrom(me.homePoint).mapWith(Number);
          const conditions: Array<SQL | undefined> = [
            ...visibleTo(viewer),
            ne(profile.userId, viewer.id),
            isNotNull(profile.homePoint),
            sql`ST_DWithin(${profile.homePoint}::geography, ${geographyOf(me.homePoint)}, ${radiusKm * 1000})`,
            query.levelMin === undefined ? undefined : gte(profile.ntrp, query.levelMin),
            query.levelMax === undefined ? undefined : lte(profile.ntrp, query.levelMax),
            query.plays === "singles" ? eq(profile.playsSingles, true) : undefined,
            query.plays === "doubles" ? eq(profile.playsDoubles, true) : undefined,
            query.plays === "hitting" ? eq(profile.playsHitting, true) : undefined,
            cursor &&
              sql`(${distance}, ${profile.userId}) > (${cursor.distanceM}::float8, ${cursor.id})`,
          ];

          // One extra row tells us whether there is another page.
          const rows = yield* db
            .select({ ...summaryColumns, distanceM: distance })
            .from(profile)
            .leftJoin(metro, eq(metro.id, profile.metroId))
            .where(and(...conditions))
            .orderBy(asc(distance), asc(profile.userId))
            .limit(limit + 1)
            .pipe(Effect.orDie);

          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return new PlayersPage({
            items: page.map(
              ({ distanceM, ...row }) =>
                new PlayerSummary({ ...row, distanceKm: displayKm(distanceM) }),
            ),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ distanceM: last.distanceM, id: last.id })
                : null,
          });
        }).pipe(Effect.withSpan("Players.search"));

      const get = (viewer: SessionUser, id: string) =>
        Effect.gen(function* () {
          const me = yield* viewerHome(viewer).pipe(Effect.orDie);
          const [row] = yield* db
            .select({
              ...summaryColumns,
              profileId: profile.id,
              bio: profile.bio,
              // Null when either of us has no home point.
              distanceM: (me?.homePoint ? distanceFrom(me.homePoint) : sql`null::float8`).mapWith(
                (value): number | null => (value === null ? null : Number(value)),
              ),
            })
            .from(profile)
            .leftJoin(metro, eq(metro.id, profile.metroId))
            .where(and(eq(profile.userId, id), ...visibleTo(viewer)))
            .pipe(Effect.orDie);
          if (!row) return yield* new PlayerNotFound({ id });
          const { profileId, distanceM, ...rest } = row;
          return new PlayerProfile({
            ...rest,
            availability: yield* loadAvailability(db, profileId).pipe(Effect.orDie),
            distanceKm: distanceM === null ? null : displayKm(distanceM),
          });
        }).pipe(Effect.withSpan("Players.get"));

      return Players.of({ search, get });
    }),
  );
}
