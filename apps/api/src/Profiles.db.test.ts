import { SessionUser } from "@love-all/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { user } from "./db/schema";
import { Profiles } from "./Profiles";

const TestLayer = Profiles.layer.pipe(Layer.provideMerge(Db.layer));

const asNewPlayer = <A, E>(
  f: (player: SessionUser, profiles: Profiles["Service"]) => Effect.Effect<A, E>,
  name = "Sam",
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const profiles = yield* Profiles;
    const id = `test_${crypto.randomUUID()}`;
    yield* db.insert(user).values({ id, name, email: `${id}@example.com` });
    const player = new SessionUser({ id, name, email: `${id}@example.com`, role: "player" });

    return yield* f(player, profiles).pipe(
      Effect.ensuring(Effect.orDie(db.delete(user).where(eq(user.id, id)))),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

describe.skipIf(!process.env.DATABASE_URL)("Profiles", () => {
  it("has no profile before the first save", async () => {
    const me = await asNewPlayer((player, profiles) => profiles.get(player));
    expect(me.profile).toBeNull();
    expect(me.availability).toEqual([]);
  });

  it("creates the profile on first save, with defaults and the account name", async () => {
    const me = await asNewPlayer((player, profiles) =>
      profiles.update(player, { ntrp: "4.0", handedness: "left" }),
    );

    expect(me.profile).toEqual({
      displayName: "Sam",
      photoUrl: null,
      homePoint: null,
      metro: null,
      searchRadiusKm: 15,
      ntrp: "4.0",
      handedness: "left",
      playsSingles: false,
      playsDoubles: false,
      playsHitting: false,
      bio: null,
    });
  });

  it("cuts a long account name to fit as the default display name", async () => {
    const me = await asNewPlayer(
      (player, profiles) => profiles.update(player, {}),
      `  ${"x".repeat(60)}`,
    );

    expect(me.profile?.displayName).toBe("x".repeat(50));
  });

  it("rounds the home point and puts a Detroit-area player in the Detroit metro", async () => {
    const me = await asNewPlayer((player, profiles) =>
      profiles.update(player, { homePoint: { lat: 42.489876, lng: -83.141234 } }),
    );

    expect(me.profile?.homePoint).toEqual({ lat: 42.49, lng: -83.14 });
    expect(me.profile?.metro).toMatchObject({ slug: "detroit", name: "Detroit" });
  });

  it("leaves the metro empty outside every launch area, and clears it with the point", async () => {
    const result = await asNewPlayer((player, profiles) =>
      Effect.gen(function* () {
        const chicago = yield* profiles.update(player, { homePoint: { lat: 41.88, lng: -87.63 } });
        yield* profiles.update(player, { homePoint: { lat: 42.33, lng: -83.05 } });
        const cleared = yield* profiles.update(player, { homePoint: null });

        return { chicago, cleared };
      }),
    );

    expect(result.chicago.profile?.metro).toBeNull();
    expect(result.cleared.profile).toMatchObject({ homePoint: null, metro: null });
  });

  it("changes only the fields sent, and null clears a field", async () => {
    const me = await asNewPlayer((player, profiles) =>
      Effect.gen(function* () {
        yield* profiles.update(player, {
          displayName: "Sammy",
          bio: "Lefty, loves to rally",
          playsDoubles: true,
          searchRadiusKm: 25,
        });

        return yield* profiles.update(player, { bio: null, playsHitting: true });
      }),
    );

    expect(me.profile).toMatchObject({
      displayName: "Sammy",
      bio: null,
      playsDoubles: true,
      playsHitting: true,
      searchRadiusKm: 25,
    });
  });

  it("replaces availability, sorted, and shows it on GET /me", async () => {
    const result = await asNewPlayer((player, profiles) =>
      Effect.gen(function* () {
        yield* profiles.replaceAvailability(player, [
          { weekday: 1, startTime: "07:00", endTime: "08:00" },
        ]);

        const saved = yield* profiles.replaceAvailability(player, [
          { weekday: 6, startTime: "09:00", endTime: "12:30" },
          { weekday: 2, startTime: "18:00", endTime: "21:00" },
          { weekday: 2, startTime: "06:00", endTime: "07:30" },
        ]);

        const me = yield* profiles.get(player);

        return { saved, me };
      }),
    );

    const expected = [
      { weekday: 2, startTime: "06:00", endTime: "07:30" },
      { weekday: 2, startTime: "18:00", endTime: "21:00" },
      { weekday: 6, startTime: "09:00", endTime: "12:30" },
    ];

    expect(result.saved).toEqual(expected);
    expect(result.me.availability).toEqual(expected);
    expect(result.me.profile?.displayName).toBe("Sam");
  });

  it("clears availability with an empty list", async () => {
    const saved = await asNewPlayer((player, profiles) =>
      Effect.gen(function* () {
        yield* profiles.replaceAvailability(player, [
          { weekday: 3, startTime: "17:00", endTime: "19:00" },
        ]);

        return yield* profiles.replaceAvailability(player, []);
      }),
    );

    expect(saved).toEqual([]);
  });
});
