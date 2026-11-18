import {
  CLUB_DUPLICATE_RADIUS_KM,
  CLUB_REVIEWS_PAGE_DEFAULT,
  CLUBS_LIST_MAX,
  CLUBS_PER_DAY,
  CLUBS_RADIUS_DEFAULT_KM,
  Club,
  ClubAlreadyExists,
  ClubNotFound,
  ClubRateLimited,
  type ClubRatingSummary,
  ClubReview,
  type ClubReviewInput,
  ClubReviewsPage,
  type ClubReviewsQuery,
  ClubSummary,
  type ClubsQuery,
  HomePointRequired,
  InvalidCursor,
  type LatLng,
  type NewClub,
  type SessionUser,
} from "@love-all/domain";
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import { decodeReviewsCursor, encodeReviewsCursor, likeContains } from "./clubs/cursor";
import { notBlocked } from "./db/blocks";
import { club, clubReview, metro, profile, user } from "./db/schema";
import type { LngLat } from "./db/geo";
import { displayKm } from "./players/cursor";

const DAY_MS = 86_400_000;

/** How an author is shown: their profile name, or their account name before they have a profile. */
const authorName = sql<string>`coalesce(${profile.displayName}, ${user.name})`;

const toLngLat = (point: LatLng): LngLat => ({ x: point.lng, y: point.lat });
const toLatLng = (point: LngLat): LatLng => ({ lat: point.y, lng: point.x });

const pointSql = (point: LngLat) => sql`ST_SetSRID(ST_MakePoint(${point.x}, ${point.y}), 4326)`;

interface Ratings {
  readonly summary: ClubRatingSummary;
  /** Reviews giving 1..5 stars, in that order. */
  readonly counts: ReadonlyArray<number>;
}

const noRatings = (): Ratings => ({
  summary: { average: null, count: 0 },
  counts: [0, 0, 0, 0, 0],
});

/**
 * Clubs and club reviews.
 *
 * Clubs are public places: anyone signed in sees every club. Reviews follow
 * the usual rules: a review by a player blocked either way with me, or one a
 * moderator hid, is left out of the list and of the star counts. My own
 * review always comes back to me as `myReview`, so I can change or remove it.
 *
 * Database failures are defects (a 500).
 */
export class Clubs extends Context.Service<
  Clubs,
  {
    readonly list: (
      viewer: SessionUser,
      query: ClubsQuery,
    ) => Effect.Effect<ReadonlyArray<ClubSummary>, HomePointRequired>;
    readonly create: (
      viewer: SessionUser,
      input: NewClub,
    ) => Effect.Effect<Club, ClubAlreadyExists | ClubRateLimited>;
    readonly get: (viewer: SessionUser, id: string) => Effect.Effect<Club, ClubNotFound>;
    readonly listReviews: (
      viewer: SessionUser,
      id: string,
      query: ClubReviewsQuery,
    ) => Effect.Effect<ClubReviewsPage, ClubNotFound | InvalidCursor>;
    readonly saveReview: (
      viewer: SessionUser,
      id: string,
      input: ClubReviewInput,
    ) => Effect.Effect<ClubReview, ClubNotFound>;
    readonly deleteReview: (viewer: SessionUser, id: string) => Effect.Effect<void>;
  }
>()("love-all/Clubs") {
  static readonly layer = Layer.effect(
    Clubs,
    Effect.gen(function* () {
      const db = yield* Db;

      const homePointOf = (viewer: SessionUser) =>
        db
          .select({ homePoint: profile.homePoint })
          .from(profile)
          .where(eq(profile.userId, viewer.id))
          .pipe(
            Effect.map(([row]) => row?.homePoint ?? null),
            Effect.orDie,
          );

      /** Metres from `home` to the club, or null when I have no home point. */
      const distanceFrom = (home: LngLat | null) =>
        (home
          ? sql`ST_Distance(${club.point}::geography, ${pointSql(home)}::geography)`
          : sql`null::float8`
        ).mapWith((value): number | null => (value === null ? null : Number(value)));

      const selectClubs = (home: LngLat | null) =>
        db
          .select({
            id: club.id,
            name: club.name,
            address: club.address,
            point: club.point,
            access: club.access,
            indoorCourts: club.indoorCourts,
            createdAt: club.createdAt,
            distanceM: distanceFrom(home),
          })
          .from(club);

      type ClubRow = Effect.Success<ReturnType<typeof selectClubs>>[number];

      /** Star counts for each club in `ids`, from reviews I can see. */
      const ratingsFor = (viewer: SessionUser, ids: ReadonlyArray<string>) =>
        ids.length === 0
          ? Effect.succeed(new Map<string, Ratings>())
          : db
              .select({ clubId: clubReview.clubId, rating: clubReview.rating, total: count() })
              .from(clubReview)
              .where(
                and(
                  inArray(clubReview.clubId, [...ids]),
                  isNull(clubReview.hiddenAt),
                  notBlocked(viewer.id, clubReview.authorId),
                ),
              )
              .groupBy(clubReview.clubId, clubReview.rating)
              .pipe(
                Effect.map((rows) => {
                  const counts = new Map<string, Array<number>>();
                  for (const row of rows) {
                    const list = counts.get(row.clubId) ?? [0, 0, 0, 0, 0];
                    list[row.rating - 1] = row.total;
                    counts.set(row.clubId, list);
                  }
                  const byClub = new Map<string, Ratings>();
                  for (const [clubId, list] of counts) {
                    const total = list.reduce((a, b) => a + b, 0);
                    const stars = list.reduce((sum, n, i) => sum + n * (i + 1), 0);
                    byClub.set(clubId, {
                      summary: { average: Math.round((stars / total) * 10) / 10, count: total },
                      counts: list,
                    });
                  }
                  return byClub;
                }),
                Effect.orDie,
              );

      const clubFields = (row: ClubRow, ratings: Ratings) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        point: toLatLng(row.point),
        access: row.access,
        indoorCourts: row.indoorCourts,
        distanceKm: row.distanceM === null ? null : displayKm(row.distanceM),
        rating: ratings.summary,
      });

      const selectReviews = (viewer: SessionUser) =>
        db
          .select({
            id: clubReview.id,
            clubId: clubReview.clubId,
            rating: clubReview.rating,
            body: clubReview.body,
            createdAt: clubReview.createdAt,
            updatedAt: clubReview.updatedAt,
            authorId: clubReview.authorId,
            authorName,
            authorPhotoUrl: profile.photoUrl,
            mine: sql<boolean>`${clubReview.authorId} = ${viewer.id}`,
          })
          .from(clubReview)
          .innerJoin(user, eq(user.id, clubReview.authorId))
          .leftJoin(profile, eq(profile.userId, clubReview.authorId));

      type ReviewRow = Effect.Success<ReturnType<typeof selectReviews>>[number];

      const toReview = (row: ReviewRow) =>
        new ClubReview({
          id: row.id,
          clubId: row.clubId,
          author: { id: row.authorId, displayName: row.authorName, photoUrl: row.authorPhotoUrl },
          rating: row.rating,
          body: row.body,
          mine: row.mine,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });

      const findMyReview = (viewer: SessionUser, clubId: string) =>
        selectReviews(viewer)
          .where(and(eq(clubReview.clubId, clubId), eq(clubReview.authorId, viewer.id)))
          .pipe(
            Effect.map(([row]) => (row ? toReview(row) : null)),
            Effect.orDie,
          );

      const clubExists = (id: string) =>
        db
          .select({ id: club.id })
          .from(club)
          .where(eq(club.id, id))
          .pipe(
            Effect.orDie,
            Effect.flatMap(([row]) => (row ? Effect.void : Effect.fail(new ClubNotFound({ id })))),
          );

      const get = (viewer: SessionUser, id: string) =>
        Effect.gen(function* () {
          const home = yield* homePointOf(viewer);
          const [row] = yield* selectClubs(home).where(eq(club.id, id)).pipe(Effect.orDie);
          if (!row) return yield* new ClubNotFound({ id });
          const ratings = (yield* ratingsFor(viewer, [id])).get(id) ?? noRatings();
          return new Club({
            ...clubFields(row, ratings),
            ratingCounts: ratings.counts,
            myReview: yield* findMyReview(viewer, id),
            createdAt: row.createdAt,
          });
        });

      return Clubs.of({
        list: (viewer, query) =>
          Effect.gen(function* () {
            const home = yield* homePointOf(viewer);
            if (!home) {
              return yield* new HomePointRequired({
                message: "Set your home area to see clubs near you.",
              });
            }
            const radiusKm = query.radiusKm ?? CLUBS_RADIUS_DEFAULT_KM;
            const q = query.q?.trim();
            const rows = yield* selectClubs(home)
              .where(
                and(
                  sql`ST_DWithin(${club.point}::geography, ${pointSql(home)}::geography, ${radiusKm * 1000})`,
                  q
                    ? or(ilike(club.name, likeContains(q)), ilike(club.address, likeContains(q)))
                    : undefined,
                ),
              )
              .orderBy(sql`${club.point}::geography <-> ${pointSql(home)}::geography`, club.id)
              .limit(CLUBS_LIST_MAX)
              .pipe(Effect.orDie);
            const ratings = yield* ratingsFor(
              viewer,
              rows.map((r) => r.id),
            );
            return rows.map(
              (row) => new ClubSummary(clubFields(row, ratings.get(row.id) ?? noRatings())),
            );
          }).pipe(Effect.withSpan("Clubs.list")),

        create: (viewer, input) =>
          Effect.gen(function* () {
            const point = toLngLat(input.point);
            const [recent] = yield* db
              .select({ total: count() })
              .from(club)
              .where(
                and(
                  eq(club.createdBy, viewer.id),
                  gte(club.createdAt, new Date(Date.now() - DAY_MS)),
                ),
              )
              .pipe(Effect.orDie);
            if ((recent?.total ?? 0) >= CLUBS_PER_DAY) {
              return yield* new ClubRateLimited({
                message: `You can add ${CLUBS_PER_DAY} clubs a day. Try again tomorrow.`,
              });
            }
            const [existing] = yield* db
              .select({ id: club.id, name: club.name })
              .from(club)
              .where(
                and(
                  sql`lower(${club.name}) = lower(${input.name})`,
                  sql`ST_DWithin(${club.point}::geography, ${pointSql(point)}::geography, ${CLUB_DUPLICATE_RADIUS_KM * 1000})`,
                ),
              )
              .limit(1)
              .pipe(Effect.orDie);
            if (existing) return yield* new ClubAlreadyExists(existing);
            const [area] = yield* db
              .select({ id: metro.id })
              .from(metro)
              .where(
                sql`ST_DWithin(${metro.centerPoint}::geography, ${pointSql(point)}::geography, ${metro.radiusKm} * 1000)`,
              )
              .orderBy(sql`${metro.centerPoint} <-> ${pointSql(point)}`)
              .limit(1)
              .pipe(Effect.orDie);
            const [inserted] = yield* db
              .insert(club)
              .values({
                name: input.name,
                address: input.address ?? null,
                point,
                access: input.access,
                indoorCourts: input.indoorCourts ?? false,
                metroId: area?.id ?? null,
                createdBy: viewer.id,
              })
              .returning({ id: club.id })
              .pipe(Effect.orDie);
            return yield* get(viewer, inserted!.id).pipe(Effect.orDie);
          }).pipe(Effect.withSpan("Clubs.create")),

        get: (viewer, id) => get(viewer, id).pipe(Effect.withSpan("Clubs.get")),

        listReviews: (viewer, id, query) =>
          Effect.gen(function* () {
            const limit = query.limit ?? CLUB_REVIEWS_PAGE_DEFAULT;
            const cursor =
              query.cursor === undefined ? undefined : decodeReviewsCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            yield* clubExists(id);
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* selectReviews(viewer)
              .where(
                and(
                  eq(clubReview.clubId, id),
                  isNull(clubReview.hiddenAt),
                  notBlocked(viewer.id, clubReview.authorId),
                  after === undefined
                    ? undefined
                    : sql`(${clubReview.createdAt}, ${clubReview.id}) < (${new Date(after.createdAt).toISOString()}::timestamptz, ${after.id}::uuid)`,
                ),
              )
              .orderBy(desc(clubReview.createdAt), desc(clubReview.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            return new ClubReviewsPage({
              items: page.map(toReview),
              nextCursor:
                rows.length > limit && last
                  ? encodeReviewsCursor({ createdAt: last.createdAt.getTime(), id: last.id })
                  : null,
            });
          }).pipe(Effect.withSpan("Clubs.listReviews")),

        saveReview: (viewer, id, input) =>
          Effect.gen(function* () {
            yield* clubExists(id);
            const body = input.body ?? null;
            // A moderator's `hidden_at` stays put when the author edits.
            yield* db
              .insert(clubReview)
              .values({ clubId: id, authorId: viewer.id, rating: input.rating, body })
              .onConflictDoUpdate({
                target: [clubReview.clubId, clubReview.authorId],
                set: { rating: input.rating, body, updatedAt: new Date() },
              })
              .pipe(Effect.orDie);
            const review = yield* findMyReview(viewer, id);
            return review!;
          }).pipe(Effect.withSpan("Clubs.saveReview")),

        deleteReview: (viewer, id) =>
          db
            .delete(clubReview)
            .where(and(eq(clubReview.clubId, id), eq(clubReview.authorId, viewer.id)))
            .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Clubs.deleteReview")),
      });
    }),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A club review as a report of it needs it: who wrote it, and its stars,
 * note and club as moderators will read them. None when the review is gone,
 * hidden, or by a player blocked either way with the reporter, since they
 * couldn't have seen it.
 */
export const reportableClubReview = (db: Db["Service"], viewerId: string, reviewId: string) =>
  Effect.gen(function* () {
    if (!UUID.test(reviewId)) return Option.none<{ authorId: string; content: string }>();
    const [row] = yield* db
      .select({
        authorId: clubReview.authorId,
        rating: clubReview.rating,
        body: clubReview.body,
        clubName: club.name,
      })
      .from(clubReview)
      .innerJoin(club, eq(club.id, clubReview.clubId))
      .where(
        and(
          eq(clubReview.id, reviewId),
          isNull(clubReview.hiddenAt),
          notBlocked(viewerId, clubReview.authorId),
        ),
      )
      .pipe(Effect.orDie);
    if (!row) return Option.none<{ authorId: string; content: string }>();
    const stars = `${row.rating} ${row.rating === 1 ? "star" : "stars"} for ${row.clubName}`;
    return Option.some({
      authorId: row.authorId,
      content: row.body ? `${stars}\n\n${row.body}` : stars,
    });
  });
