import {
  EQUIPMENT_ADDED_PER_HOUR,
  EQUIPMENT_PAGE_DEFAULT,
  EquipmentDetail,
  EquipmentExists,
  EquipmentNotFound,
  EquipmentPage,
  type EquipmentQuery,
  EquipmentRateLimited,
  type EquipmentRatingSummary,
  EquipmentReview,
  type EquipmentReviewInput,
  EquipmentReviewsPage,
  type EquipmentReviewsQuery,
  EquipmentSummary,
  InvalidCursor,
  type NewEquipment,
  type SessionUser,
} from "@love-all/domain";
import { and, asc, count, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import { equipment, equipmentReview, profile, user } from "./db/schema";
import {
  decodeCatalogCursor,
  decodeReviewsCursor,
  encodeCatalogCursor,
  encodeReviewsCursor,
} from "./equipment/cursor";

const HOUR_MS = 3_600_000;

const noRatings = () => ({
  count: 0,
  average: null,
  stars: [0, 0, 0, 0, 0],
});

const authorName = sql<string>`coalesce(${profile.displayName}, ${user.name})`;

const searchPatterns = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

/**
 * Equipment reviews: the gear catalog and players' reviews of it.
 *
 * Who sees what:
 * - Items a moderator hid are left out everywhere.
 * - Reviews a moderator hid, and reviews by players blocked either way with
 *   me, are left out of lists and of the rating summary I see.
 *
 * Database failures are defects (a 500).
 */
export class Equipment extends Context.Service<
  Equipment,
  {
    readonly list: (
      viewer: SessionUser,
      query: EquipmentQuery,
    ) => Effect.Effect<EquipmentPage, InvalidCursor>;
    readonly create: (
      viewer: SessionUser,
      input: NewEquipment,
    ) => Effect.Effect<EquipmentDetail, EquipmentExists | EquipmentRateLimited>;
    readonly get: (
      viewer: SessionUser,
      id: string,
    ) => Effect.Effect<EquipmentDetail, EquipmentNotFound>;
    readonly listReviews: (
      viewer: SessionUser,
      id: string,
      query: EquipmentReviewsQuery,
    ) => Effect.Effect<EquipmentReviewsPage, EquipmentNotFound | InvalidCursor>;
    readonly saveReview: (
      viewer: SessionUser,
      id: string,
      input: EquipmentReviewInput,
    ) => Effect.Effect<EquipmentReview, EquipmentNotFound>;
    readonly deleteReview: (viewer: SessionUser, id: string) => Effect.Effect<void>;
  }
>()("love-all/Equipment") {
  static readonly layer = Layer.effect(
    Equipment,
    Effect.gen(function* () {
      const db = yield* Db;

      const findItem = (id: string) =>
        db
          .select()
          .from(equipment)
          .where(and(eq(equipment.id, id), isNull(equipment.hiddenAt)))
          .pipe(
            Effect.map(([row]) => row),
            Effect.orDie,
          );

      const ratingsFor = (viewer: SessionUser, ids: ReadonlyArray<string>) =>
        ids.length === 0
          ? Effect.succeed(
              new Map<string, { summary: EquipmentRatingSummary; mine: number | null }>(),
            )
          : db
              .select({
                equipmentId: equipmentReview.equipmentId,
                total: count(),
                average: sql<number>`round(avg(${equipmentReview.rating})::numeric, 1)::float8`,
                stars: sql<Array<number>>`array[
                  count(*) filter (where ${equipmentReview.rating} = 1),
                  count(*) filter (where ${equipmentReview.rating} = 2),
                  count(*) filter (where ${equipmentReview.rating} = 3),
                  count(*) filter (where ${equipmentReview.rating} = 4),
                  count(*) filter (where ${equipmentReview.rating} = 5)
                ]::int[]`,
                mine: sql<
                  number | null
                >`max(${equipmentReview.rating}) filter (where ${equipmentReview.authorId} = ${viewer.id})`,
              })
              .from(equipmentReview)
              .where(
                and(
                  inArray(equipmentReview.equipmentId, [...ids]),
                  isNull(equipmentReview.hiddenAt),
                  notBlocked(viewer.id, equipmentReview.authorId),
                ),
              )
              .groupBy(equipmentReview.equipmentId)
              .pipe(
                Effect.map(
                  (rows) =>
                    new Map(
                      rows.map((row) => [
                        row.equipmentId,
                        {
                          summary: {
                            count: row.total,
                            average: row.average,
                            stars: row.stars.map(Number),
                          },
                          mine: row.mine === null ? null : Number(row.mine),
                        },
                      ]),
                    ),
                ),
                Effect.orDie,
              );

      const selectReviews = () =>
        db
          .select({
            id: equipmentReview.id,
            equipmentId: equipmentReview.equipmentId,
            authorId: equipmentReview.authorId,
            authorName,
            authorPhotoUrl: profile.photoUrl,
            authorNtrp: equipmentReview.authorNtrp,
            rating: equipmentReview.rating,
            title: equipmentReview.title,
            body: equipmentReview.body,
            createdAt: equipmentReview.createdAt,
            updatedAt: equipmentReview.updatedAt,
          })
          .from(equipmentReview)
          .innerJoin(user, eq(user.id, equipmentReview.authorId))
          .leftJoin(profile, eq(profile.userId, equipmentReview.authorId));

      type ReviewRow = Effect.Success<ReturnType<typeof selectReviews>>[number];

      const toReview = (row: ReviewRow) =>
        new EquipmentReview({
          id: row.id,
          equipmentId: row.equipmentId,
          author: { id: row.authorId, displayName: row.authorName, photoUrl: row.authorPhotoUrl },
          authorNtrp: row.authorNtrp,
          rating: row.rating,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });

      const myReview = (viewer: SessionUser, id: string) =>
        selectReviews()
          .where(and(eq(equipmentReview.equipmentId, id), eq(equipmentReview.authorId, viewer.id)))
          .pipe(
            Effect.map(([row]) => (row ? toReview(row) : null)),
            Effect.orDie,
          );

      const detail = (viewer: SessionUser, item: typeof equipment.$inferSelect) =>
        Effect.gen(function* () {
          const ratings = yield* ratingsFor(viewer, [item.id]);
          const mine = yield* myReview(viewer, item.id);
          return new EquipmentDetail({
            id: item.id,
            kind: item.kind,
            brand: item.brand,
            model: item.model,
            rating: ratings.get(item.id)?.summary ?? noRatings(),
            myReview: mine,
            createdAt: item.createdAt,
          });
        });

      return Equipment.of({
        list: (viewer, query) =>
          Effect.gen(function* () {
            const limit = query.limit ?? EQUIPMENT_PAGE_DEFAULT;
            const cursor =
              query.cursor === undefined ? undefined : decodeCatalogCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const after = cursor?.pipe(Option.getOrUndefined);
            const patterns = query.q === undefined ? [] : searchPatterns(query.q);
            const rows = yield* db
              .select()
              .from(equipment)
              .where(
                and(
                  isNull(equipment.hiddenAt),
                  query.kind === undefined ? undefined : eq(equipment.kind, query.kind),
                  ...patterns.map((p) => sql`${equipment.nameKey} like ${p}`),
                  after === undefined
                    ? undefined
                    : sql`(${equipment.nameKey}, ${equipment.id}) > (${after.nameKey}, ${after.id}::uuid)`,
                ),
              )
              .orderBy(asc(equipment.nameKey), asc(equipment.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            const ratings = yield* ratingsFor(
              viewer,
              page.map((row) => row.id),
            );
            return new EquipmentPage({
              items: page.map((row) => {
                const rating = ratings.get(row.id);
                return new EquipmentSummary({
                  id: row.id,
                  kind: row.kind,
                  brand: row.brand,
                  model: row.model,
                  rating: rating?.summary ?? noRatings(),
                  myRating: rating?.mine ?? null,
                });
              }),
              nextCursor:
                rows.length > limit && last
                  ? encodeCatalogCursor({ nameKey: last.nameKey, id: last.id })
                  : null,
            });
          }).pipe(Effect.withSpan("Equipment.list")),

        create: (viewer, input) =>
          Effect.gen(function* () {
            const [recent] = yield* db
              .select({ total: count() })
              .from(equipment)
              .where(
                and(
                  eq(equipment.createdBy, viewer.id),
                  gte(equipment.createdAt, new Date(Date.now() - HOUR_MS)),
                ),
              )
              .pipe(Effect.orDie);
            if ((recent?.total ?? 0) >= EQUIPMENT_ADDED_PER_HOUR) {
              return yield* new EquipmentRateLimited({
                message: `You can add ${EQUIPMENT_ADDED_PER_HOUR} items an hour. Try again a bit later.`,
              });
            }
            const [inserted] = yield* db
              .insert(equipment)
              .values({
                kind: input.kind,
                brand: input.brand,
                model: input.model,
                createdBy: viewer.id,
              })
              .onConflictDoNothing()
              .returning()
              .pipe(Effect.orDie);
            if (inserted) return yield* detail(viewer, inserted);
            const [existing] = yield* db
              .select({ id: equipment.id })
              .from(equipment)
              .where(
                and(
                  eq(equipment.kind, input.kind),
                  eq(
                    equipment.nameKey,
                    sql`lower(regexp_replace(${input.brand} || ' ' || ${input.model}, '\\s+', ' ', 'g'))`,
                  ),
                ),
              )
              .pipe(Effect.orDie);
            return yield* new EquipmentExists({ id: existing!.id });
          }).pipe(Effect.withSpan("Equipment.create")),

        get: (viewer, id) =>
          Effect.gen(function* () {
            const item = yield* findItem(id);
            if (!item) return yield* new EquipmentNotFound({ id });
            return yield* detail(viewer, item);
          }).pipe(Effect.withSpan("Equipment.get")),

        listReviews: (viewer, id, query) =>
          Effect.gen(function* () {
            const limit = query.limit ?? EQUIPMENT_PAGE_DEFAULT;
            const cursor =
              query.cursor === undefined ? undefined : decodeReviewsCursor(query.cursor);
            if (cursor !== undefined && Option.isNone(cursor)) {
              return yield* new InvalidCursor({ message: "Unknown cursor" });
            }
            const item = yield* findItem(id);
            if (!item) return yield* new EquipmentNotFound({ id });
            const after = cursor?.pipe(Option.getOrUndefined);
            const rows = yield* selectReviews()
              .where(
                and(
                  eq(equipmentReview.equipmentId, id),
                  ne(equipmentReview.authorId, viewer.id),
                  isNull(equipmentReview.hiddenAt),
                  notBlocked(viewer.id, equipmentReview.authorId),
                  after === undefined
                    ? undefined
                    : sql`(${equipmentReview.createdAt}, ${equipmentReview.id}) < (${new Date(after.createdAt).toISOString()}::timestamptz, ${after.id}::uuid)`,
                ),
              )
              .orderBy(desc(equipmentReview.createdAt), desc(equipmentReview.id))
              .limit(limit + 1)
              .pipe(Effect.orDie);
            const page = rows.slice(0, limit);
            const last = page.at(-1);
            return new EquipmentReviewsPage({
              items: page.map(toReview),
              nextCursor:
                rows.length > limit && last
                  ? encodeReviewsCursor({ createdAt: last.createdAt.getTime(), id: last.id })
                  : null,
            });
          }).pipe(Effect.withSpan("Equipment.listReviews")),

        saveReview: (viewer, id, input) =>
          Effect.gen(function* () {
            const item = yield* findItem(id);
            if (!item) return yield* new EquipmentNotFound({ id });
            const [me] = yield* db
              .select({ ntrp: profile.ntrp })
              .from(profile)
              .where(eq(profile.userId, viewer.id))
              .pipe(Effect.orDie);
            const fields = {
              rating: input.rating,
              title: input.title ?? null,
              body: input.body ?? null,
              authorNtrp: me?.ntrp ?? null,
            };
            yield* db
              .insert(equipmentReview)
              .values({ equipmentId: id, authorId: viewer.id, createdAt: new Date(), ...fields })
              .onConflictDoUpdate({
                target: [equipmentReview.equipmentId, equipmentReview.authorId],
                set: { ...fields, updatedAt: new Date() },
              })
              .pipe(Effect.orDie);
            const review = yield* myReview(viewer, id);
            return review!;
          }).pipe(Effect.withSpan("Equipment.saveReview")),

        deleteReview: (viewer, id) =>
          db
            .delete(equipmentReview)
            .where(
              and(eq(equipmentReview.equipmentId, id), eq(equipmentReview.authorId, viewer.id)),
            )
            .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Equipment.deleteReview")),
      });
    }),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A gear review as a report sees it: who wrote it and a copy of what it
 * says. None unless the viewer can see it (not hidden, the item not hidden,
 * and its author not blocked either way).
 */
export const reportableEquipmentReview = (db: Db["Service"], viewerId: string, reviewId: string) =>
  UUID.test(reviewId)
    ? db
        .select({
          authorId: equipmentReview.authorId,
          brand: equipment.brand,
          model: equipment.model,
          rating: equipmentReview.rating,
          title: equipmentReview.title,
          body: equipmentReview.body,
        })
        .from(equipmentReview)
        .innerJoin(equipment, eq(equipment.id, equipmentReview.equipmentId))
        .where(
          and(
            eq(equipmentReview.id, reviewId),
            isNull(equipmentReview.hiddenAt),
            isNull(equipment.hiddenAt),
            notBlocked(viewerId, equipmentReview.authorId),
          ),
        )
        .pipe(
          Effect.map(([row]) =>
            Option.fromNullishOr(row).pipe(
              Option.map((r) => ({
                authorId: r.authorId,
                content: [`${r.brand} ${r.model}: ${r.rating} out of 5`, r.title, r.body]
                  .filter((part): part is string => part !== null)
                  .join("\n\n"),
              })),
            ),
          ),
          Effect.orDie,
        )
    : Effect.succeed(Option.none());
