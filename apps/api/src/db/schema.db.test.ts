import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "../Db";
import { roundHomePoint } from "./geo";
import { availability, metro, profile, user } from "./schema";

/** Runs against a migrated Postgres + PostGIS. Skipped when DATABASE_URL is not set. */
const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  effect.pipe(Effect.provide(Db.layer), Effect.runPromise);

const withDb = <A, E>(f: (db: Db["Service"]) => Effect.Effect<A, E, Db>) =>
  Effect.gen(function* () {
    return yield* f(yield* Db);
  });

const withPlayer = <A, E>(f: (userId: string) => Effect.Effect<A, E, Db>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const id = `test_${crypto.randomUUID()}`;
    yield* db.insert(user).values({ id, name: "Sam", email: `${id}@example.com` });
    return yield* f(id).pipe(Effect.ensuring(Effect.orDie(db.delete(user).where(eq(user.id, id)))));
  });

describe.skipIf(!process.env.DATABASE_URL)("core tables", () => {
  it("seeds the Detroit metro", async () => {
    const [detroit] = await run(
      withDb((db) => db.select().from(metro).where(eq(metro.slug, "detroit"))),
    );
    expect(detroit).toMatchObject({ name: "Detroit", radiusKm: 60 });
    expect(detroit?.centerPoint.x).toBeCloseTo(-83.0458);
    expect(detroit?.centerPoint.y).toBeCloseTo(42.3314);
  });

  it("stores a rounded home point and its availability", async () => {
    const saved = await run(
      withPlayer((userId) =>
        Effect.gen(function* () {
          const db = yield* Db;
          const [detroit] = yield* db
            .select({ id: metro.id })
            .from(metro)
            .where(eq(metro.slug, "detroit"));
          const [row] = yield* db
            .insert(profile)
            .values({
              userId,
              displayName: "Sam",
              homePoint: roundHomePoint({ x: -83.141234, y: 42.489876 }),
              metroId: detroit?.id,
              ntrp: "3.5",
              playsSingles: true,
            })
            .returning();
          yield* db.insert(availability).values({
            profileId: row!.id,
            weekday: 2,
            startTime: "18:00",
            endTime: "21:00",
          });
          const blocks = yield* db
            .select()
            .from(availability)
            .where(eq(availability.profileId, row!.id));
          return { row: row!, blocks };
        }),
      ),
    );
    expect(saved.row.homePoint).toEqual({ x: -83.14, y: 42.49 });
    expect(saved.blocks).toHaveLength(1);
  });

  it("rejects a home point that is not rounded", async () => {
    const error = await run(
      withPlayer((userId) =>
        withDb((db) =>
          db
            .insert(profile)
            .values({ userId, displayName: "Sam", homePoint: { x: -83.141234, y: 42.49 } }),
        ).pipe(Effect.flip),
      ),
    );
    expect(error._tag).toBe("EffectDrizzleQueryError");
    expect(JSON.stringify(error.cause)).toContain("profile_home_point_rounded");
  });

  it("compares NTRP levels in order", async () => {
    const [row] = await run(
      withDb((db) =>
        db
          .select({ inRange: sql<boolean>`'3.5'::ntrp_level between '3.0' and '4.0'` })
          .from(metro)
          .limit(1),
      ),
    );
    expect(row?.inRange).toBe(true);
  });
});
