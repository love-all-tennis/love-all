import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "../Db";
import { roundHomePoint } from "./geo";
import { availability, metro, playSession, playSessionParticipant, profile, user } from "./schema";

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

  describe("play_session checks", () => {
    const base = {
      kind: "singles" as const,
      startsAt: new Date(Date.now() + 86_400_000),
      durationMinutes: 60,
      courtName: "Court 1",
      spots: 2,
      visibility: "open" as const,
    };

    const tryInsert = (overrides: Partial<typeof playSession.$inferInsert>) =>
      withPlayer((hostId) =>
        withDb((db) =>
          db
            .insert(playSession)
            .values({ ...base, hostId, ...overrides })
            .pipe(
              Effect.as("ok"),
              Effect.catch((error) =>
                Effect.succeed(
                  /play_session_[a-z_]+/.exec(JSON.stringify(error.cause))?.[0] ?? "other",
                ),
              ),
            ),
        ),
      );

    it.each([
      [{}, "ok"],
      [{ kind: "doubles" as const, spots: 4 }, "ok"],
      [{ kind: "hitting" as const, spots: 3 }, "ok"],
      [{ spots: 3 }, "play_session_spots_match_kind"],
      [{ kind: "doubles" as const, spots: 2 }, "play_session_spots_match_kind"],
      [{ kind: "hitting" as const, spots: 5 }, "play_session_spots_match_kind"],
      [{ levelMin: "4.0" as const, levelMax: "3.5" as const }, "play_session_level_range"],
      [{ levelMin: "3.5" as const, levelMax: "3.5" as const }, "ok"],
      [{ durationMinutes: 10 }, "play_session_duration_range"],
      [{ courtName: "" }, "play_session_court_name_length"],
      [{ notes: "x".repeat(501) }, "play_session_notes_length"],
    ])("%j -> %s", async (overrides, expected) => {
      expect(await run(tryInsert(overrides))).toBe(expected);
    });

    it("keeps one row per player per session, and the host accepted", async () => {
      const errors = await run(
        withPlayer((hostId) =>
          withDb((db) =>
            Effect.gen(function* () {
              const [session] = yield* db
                .insert(playSession)
                .values({ ...base, hostId })
                .returning({ id: playSession.id });

              const sessionId = session!.id;
              yield* db
                .insert(playSessionParticipant)
                .values({ sessionId, userId: hostId, role: "host", state: "accepted" });

              const duplicate = yield* db
                .insert(playSessionParticipant)
                .values({ sessionId, userId: hostId, state: "invited" })
                .pipe(Effect.flip);

              const invitedHost = yield* db
                .update(playSessionParticipant)
                .set({ state: "invited" })
                .where(eq(playSessionParticipant.sessionId, sessionId))
                .pipe(Effect.flip);

              return [duplicate, invitedHost].map((e) => JSON.stringify(e.cause));
            }),
          ),
        ),
      );

      expect(errors[0]).toContain("play_session_participant_pkey");
      expect(errors[1]).toContain("play_session_participant_host_accepted");
    });
  });
});
