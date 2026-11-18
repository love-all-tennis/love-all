import { type ProfilePatch, SessionUser } from "@love-all/domain";
import { inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { user } from "./db/schema";
import { Players } from "./Players";
import { Profiles } from "./Profiles";

/**
 * Runs against a migrated Postgres + PostGIS. Skipped when DATABASE_URL is not set.
 *
 * Players live near Dunedin, New Zealand, far from the Detroit points other
 * test files use, so tests running in parallel never show up in each other's
 * searches.
 */
const TestLayer = Layer.mergeAll(Players.layer, Profiles.layer).pipe(Layer.provideMerge(Db.layer));

const HOME = { lat: -45.87, lng: 170.5 };
/** About 1.1 km per 0.01 degrees of latitude. */
const north = (hundredths: number) => ({ lat: HOME.lat + hundredths / 100, lng: HOME.lng });

/**
 * Creates throwaway players with the given profiles, runs `f`, then deletes
 * them. The first player is the one searching.
 */
const withPlayers = <A, E>(
  patches: ReadonlyArray<ProfilePatch | null>,
  f: (
    players: ReadonlyArray<SessionUser>,
    service: Players["Service"],
    profiles: Profiles["Service"],
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const profiles = yield* Profiles;
    const service = yield* Players;
    const run = crypto.randomUUID().slice(0, 8);
    const people = patches.map(
      (_, i) =>
        new SessionUser({
          // Zero-padded so ids sort in creation order, which the tie-break relies on.
          id: `test_${run}_${String(i).padStart(2, "0")}`,
          name: `Player ${i}`,
          email: `test_${run}_${i}@example.com`,
          role: "player",
        }),
    );
    yield* db.insert(user).values(people.map(({ id, name, email }) => ({ id, name, email })));
    const cleanup = Effect.orDie(
      db.delete(user).where(
        inArray(
          user.id,
          people.map((p) => p.id),
        ),
      ),
    );
    return yield* Effect.gen(function* () {
      for (const [i, patch] of patches.entries()) {
        if (patch) {
          yield* profiles.update(people[i]!, patch);
        }
      }
      return yield* f(people, service, profiles);
    }).pipe(Effect.ensuring(cleanup));
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const names = (page: { items: ReadonlyArray<{ displayName: string }> }) =>
  page.items.map((p) => p.displayName);

describe.skipIf(!process.env.DATABASE_URL)("Players.search", () => {
  it("lists players within my radius, nearest first, without me", async () => {
    const result = await withPlayers(
      [
        { homePoint: HOME, searchRadiusKm: 10 },
        { displayName: "Far", homePoint: north(50) }, // ~56 km
        { displayName: "Near", homePoint: north(1), ntrp: "3.5", playsSingles: true },
        { displayName: "Mid", homePoint: north(5) }, // ~5.6 km
        { displayName: "Nowhere" }, // no home point
        null, // no profile at all
      ],
      ([me], players) => players.search(me!, {}),
    );
    expect(result.items.map((p) => [p.displayName, p.distanceKm])).toEqual([
      ["Near", 1],
      ["Mid", 6],
    ]);
    expect(result.items[0]).toMatchObject({
      ntrp: "3.5",
      playsSingles: true,
      playsDoubles: false,
      metro: null,
    });
    expect(result.items[0]).not.toHaveProperty("homePoint");
    expect(result.nextCursor).toBeNull();
  });

  it("uses radiusKm over my saved radius", async () => {
    const result = await withPlayers(
      [{ homePoint: HOME, searchRadiusKm: 1 }, { homePoint: north(5) }, { homePoint: north(50) }],
      ([me], players) => players.search(me!, { radiusKm: 20 }),
    );
    expect(result.items).toHaveLength(1);
  });

  it("filters by NTRP range, inclusive, and by what they play", async () => {
    const result = await withPlayers(
      [
        { homePoint: HOME },
        { displayName: "3.0", homePoint: north(1), ntrp: "3.0", playsDoubles: true },
        { displayName: "3.5", homePoint: north(2), ntrp: "3.5", playsDoubles: true },
        { displayName: "4.0", homePoint: north(3), ntrp: "4.0" },
        { displayName: "4.5", homePoint: north(4), ntrp: "4.5", playsDoubles: true },
        { displayName: "unrated", homePoint: north(5), playsDoubles: true },
      ],
      ([me], players) =>
        Effect.all({
          range: players.search(me!, { levelMin: "3.5", levelMax: "4.0" }),
          atLeast: players.search(me!, { levelMin: "4.0" }),
          doubles: players.search(me!, { plays: "doubles" }),
          both: players.search(me!, { levelMax: "3.5", plays: "doubles" }),
        }),
    );
    expect(names(result.range)).toEqual(["3.5", "4.0"]);
    expect(names(result.atLeast)).toEqual(["4.0", "4.5"]);
    expect(names(result.doubles)).toEqual(["3.0", "3.5", "4.5", "unrated"]);
    expect(names(result.both)).toEqual(["3.0", "3.5"]);
  });

  it("pages through every player once, including ties at the same distance", async () => {
    const result = await withPlayers(
      [
        { homePoint: HOME },
        { displayName: "a", homePoint: north(2) },
        { displayName: "b", homePoint: north(1) },
        { displayName: "c", homePoint: north(1) },
        { displayName: "d", homePoint: north(1) },
        { displayName: "e", homePoint: north(3) },
      ],
      ([me], players) =>
        Effect.gen(function* () {
          const pages = [];
          let cursor: string | undefined;
          do {
            const page = yield* players.search(me!, cursor ? { limit: 2, cursor } : { limit: 2 });
            pages.push(page.items.map((p) => p.displayName));
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
          return pages;
        }),
    );
    expect(result).toEqual([["b", "c"], ["d", "a"], ["e"]]);
  });

  it("fails with HomePointRequired until I set a home point", async () => {
    const errors = await withPlayers(
      [{ displayName: "New" }, null],
      ([withProfile, without], players) =>
        Effect.all([
          players.search(withProfile!, {}).pipe(Effect.flip),
          players.search(without!, {}).pipe(Effect.flip),
        ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["HomePointRequired", "HomePointRequired"]);
  });

  it("fails with InvalidCursor for a made-up cursor", async () => {
    const error = await withPlayers([{ homePoint: HOME }], ([me], players) =>
      players.search(me!, { cursor: "garbage" }).pipe(Effect.flip),
    );
    expect(error._tag).toBe("InvalidCursor");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Players.get", () => {
  it("shows another player's public profile, availability and distance", async () => {
    const result = await withPlayers(
      [{ homePoint: HOME }, { displayName: "Alex", homePoint: north(5), bio: "Loves to rally" }],
      ([me, alex], players, profiles) =>
        Effect.gen(function* () {
          yield* profiles.replaceAvailability(alex!, [
            { weekday: 6, startTime: "09:00", endTime: "11:00" },
            { weekday: 2, startTime: "18:00", endTime: "20:00" },
          ]);
          return yield* players.get(me!, alex!.id);
        }),
    );
    expect(result).toMatchObject({
      displayName: "Alex",
      bio: "Loves to rally",
      distanceKm: 6,
      availability: [
        { weekday: 2, startTime: "18:00", endTime: "20:00" },
        { weekday: 6, startTime: "09:00", endTime: "11:00" },
      ],
    });
    expect(result).not.toHaveProperty("homePoint");
  });

  it("has no distance when either player has no home point", async () => {
    const result = await withPlayers(
      [{ displayName: "Me" }, { homePoint: north(1) }, { displayName: "Homeless" }],
      ([me, placed, unplaced], players) =>
        Effect.all([players.get(me!, placed!.id), players.get(placed!, unplaced!.id)]),
    );
    expect(result.map((p) => p.distanceKm)).toEqual([null, null]);
  });

  it("fails with PlayerNotFound for an unknown id or a player with no profile", async () => {
    const errors = await withPlayers([{ homePoint: HOME }, null], ([me, noProfile], players) =>
      Effect.all([
        players.get(me!, "no_such_user").pipe(Effect.flip),
        players.get(me!, noProfile!.id).pipe(Effect.flip),
      ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["PlayerNotFound", "PlayerNotFound"]);
  });
});
