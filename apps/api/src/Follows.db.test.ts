import { MAX_FOLLOWS, SessionUser } from "@love-all/domain";
import { inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { follow, user } from "./db/schema";
import { Follows } from "./Follows";
import { Profiles } from "./Profiles";

const TestLayer = Layer.mergeAll(Follows.layer, Profiles.layer).pipe(Layer.provideMerge(Db.layer));

type Services = { db: Db["Service"]; follows: Follows["Service"]; profiles: Profiles["Service"] };

const withPlayers = <A, E>(
  count: number,
  f: (players: ReadonlyArray<SessionUser>, services: Services) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const services = { db, follows: yield* Follows, profiles: yield* Profiles };
    const players = Array.from({ length: count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    return yield* f(players, services).pipe(
      Effect.ensuring(
        Effect.orDie(
          db.delete(user).where(
            inArray(
              user.id,
              players.map((p) => p.id),
            ),
          ),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const downtown = { lat: 42.33, lng: -83.05 };
const royalOak = { lat: 42.49, lng: -83.14 };

describe.skipIf(!process.env.DATABASE_URL)("Follows", () => {
  it("lists followed players newest first, with the distance between home points", async () => {
    const list = await withPlayers(3, ([me, near, far], { follows, profiles }) =>
      Effect.gen(function* () {
        yield* profiles.update(me!, { homePoint: downtown });
        yield* profiles.update(near!, { homePoint: downtown, ntrp: "3.5", playsSingles: true });
        yield* profiles.update(far!, { homePoint: royalOak });
        yield* follows.follow(me!, near!.id);
        yield* Effect.sleep("5 millis");
        yield* follows.follow(me!, far!.id);
        return yield* follows.list(me!);
      }),
    );
    expect(list.items.map((p) => p.displayName)).toEqual(["P2", "P1"]);
    expect(list.items[1]).toMatchObject({ ntrp: "3.5", playsSingles: true, distanceKm: 1 });
    expect(list.items[0]!.distanceKm).toBeGreaterThan(15);
    expect(list.items[0]!.distanceKm).toBeLessThan(25);
  });

  it("gives no distance when a home point is missing", async () => {
    const list = await withPlayers(2, ([me, other], { follows, profiles }) =>
      Effect.gen(function* () {
        yield* profiles.update(other!, { homePoint: downtown });
        yield* follows.follow(me!, other!.id);
        return yield* follows.list(me!);
      }),
    );
    expect(list.items[0]!.distanceKm).toBeNull();
  });

  it("follows and unfollows idempotently", async () => {
    const result = await withPlayers(2, ([me, other], { follows, profiles }) =>
      Effect.gen(function* () {
        yield* profiles.update(other!, {});
        yield* follows.follow(me!, other!.id);
        yield* follows.follow(me!, other!.id);
        const twice = yield* follows.list(me!);
        yield* follows.unfollow(me!, other!.id);
        yield* follows.unfollow(me!, other!.id);
        return { twice, after: yield* follows.list(me!) };
      }),
    );
    expect(result.twice.items).toHaveLength(1);
    expect(result.after.items).toEqual([]);
  });

  it("refuses to follow yourself or a player without a profile", async () => {
    const errors = await withPlayers(2, ([me, noProfile], { follows, profiles }) =>
      Effect.gen(function* () {
        yield* profiles.update(me!, {});
        return [
          yield* Effect.flip(follows.follow(me!, me!.id)),
          yield* Effect.flip(follows.follow(me!, noProfile!.id)),
          yield* Effect.flip(follows.follow(me!, "nobody")),
        ];
      }),
    );
    expect(errors.map((e) => e._tag)).toEqual([
      "CannotFollowSelf",
      "PlayerNotFound",
      "PlayerNotFound",
    ]);
  });

  it("stops at the follow limit", async () => {
    const error = await withPlayers(2, ([me, other], { db, follows, profiles }) =>
      Effect.gen(function* () {
        yield* profiles.update(other!, {});
        const fillers = Array.from({ length: MAX_FOLLOWS }, () => `test_${crypto.randomUUID()}`);
        yield* db
          .insert(user)
          .values(fillers.map((id) => ({ id, name: "F", email: `${id}@example.com` })));
        yield* db
          .insert(follow)
          .values(fillers.map((followedId) => ({ followerId: me!.id, followedId })));
        return yield* Effect.flip(follows.follow(me!, other!.id)).pipe(
          Effect.ensuring(Effect.orDie(db.delete(user).where(inArray(user.id, fillers)))),
        );
      }),
    );
    expect(error._tag).toBe("FollowLimitReached");
  });
});
