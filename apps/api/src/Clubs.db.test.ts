import { type LatLng, SessionUser } from "@love-all/domain";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Clubs } from "./Clubs";
import { Db } from "./Db";
import { block, club, clubReview, metro, profile, user } from "./db/schema";

const TestLayer = Clubs.layer.pipe(Layer.provideMerge(Db.layer));

interface World {
  readonly players: ReadonlyArray<SessionUser>;
  readonly clubs: Clubs["Service"];
  readonly db: Db["Service"];
  readonly home: LatLng;
  readonly near: (km: number) => LatLng;
}

const withClubs = <A, E>(count: number, f: (world: World) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const clubs = yield* Clubs;
    const home = {
      lat: Math.round((-55 + Math.random() * 10) * 100) / 100,
      lng: Math.round((-140 + Math.random() * 20) * 100) / 100,
    };
    const kmPerLng = 111.32 * Math.cos((home.lat * Math.PI) / 180);
    const near = (km: number) => ({ lat: home.lat, lng: home.lng + km / kmPerLng });
    const players = Array.from({ length: count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    const ids = players.map((p) => p.id);
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    return yield* Effect.gen(function* () {
      yield* db.insert(profile).values(
        players.map((p, i) => ({
          userId: p.id,
          displayName: `Player ${i}`,
          homePoint: { x: home.lng, y: home.lat },
        })),
      );
      return yield* f({ players, clubs, db, home, near });
    }).pipe(
      Effect.ensuring(
        Effect.orDie(
          Effect.gen(function* () {
            const made = yield* db
              .select({ id: club.id })
              .from(club)
              .where(inArray(club.createdBy, ids));
            if (made.length > 0) {
              yield* db.delete(club).where(
                inArray(
                  club.id,
                  made.map((c) => c.id),
                ),
              );
            }
            yield* db.delete(user).where(inArray(user.id, ids));
          }),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const newClub = (name: string, point: LatLng) => ({ name, point, access: "free" as const });

describe.skipIf(!process.env.DATABASE_URL)("Clubs", () => {
  it("adds a club and lists clubs nearest first within the radius", async () => {
    const result = await withClubs(1, ({ players, clubs, near }) =>
      Effect.gen(function* () {
        const me = players[0]!;
        const far = yield* clubs.create(me, newClub("Far Courts", near(30)));
        const close = yield* clubs.create(me, {
          ...newClub("Close Courts", near(2)),
          address: "1 Harbour Rd",
          access: "members_only",
          indoorCourts: true,
        });
        yield* clubs.create(me, newClub("Too Far", near(60)));
        const list = yield* clubs.list(me, {});
        const search = yield* clubs.list(me, { q: "harbour" });
        const small = yield* clubs.list(me, { radiusKm: 10 });
        return { far, close, list, search, small };
      }),
    );
    expect(result.close).toMatchObject({
      name: "Close Courts",
      address: "1 Harbour Rd",
      access: "members_only",
      indoorCourts: true,
      distanceKm: 2,
      rating: { average: null, count: 0 },
      ratingCounts: [0, 0, 0, 0, 0],
      myReview: null,
    });
    expect(result.list.map((c) => c.name)).toEqual(["Close Courts", "Far Courts"]);
    expect(result.list[1]!.distanceKm).toBe(30);
    expect(result.search.map((c) => c.name)).toEqual(["Close Courts"]);
    expect(result.small.map((c) => c.name)).toEqual(["Close Courts"]);
  });

  it("needs a home point to list clubs", async () => {
    const error = await withClubs(1, ({ players, clubs, db }) =>
      Effect.gen(function* () {
        yield* db
          .update(profile)
          .set({ homePoint: null })
          .where(eq(profile.userId, players[0]!.id));
        return yield* Effect.flip(clubs.list(players[0]!, {}));
      }),
    );
    expect(error._tag).toBe("HomePointRequired");
  });

  it("refuses the same name pinned close by and points at the first club", async () => {
    const result = await withClubs(2, ({ players, clubs, near }) =>
      Effect.gen(function* () {
        const first = yield* clubs.create(players[0]!, newClub("Lakeside Tennis", near(1)));
        const again = yield* Effect.flip(
          clubs.create(players[1]!, newClub("lakeside tennis", near(1.3))),
        );
        const elsewhere = yield* clubs.create(players[1]!, newClub("Lakeside Tennis", near(8)));
        return { first, again, elsewhere };
      }),
    );
    expect(result.again).toMatchObject({ _tag: "ClubAlreadyExists", id: result.first.id });
    expect(result.elsewhere.id).not.toBe(result.first.id);
  });

  it("limits how many clubs a player adds in a day", async () => {
    const error = await withClubs(1, ({ players, clubs, near }) =>
      Effect.gen(function* () {
        for (let i = 0; i < 5; i++) {
          yield* clubs.create(players[0]!, newClub(`Club ${i}`, near(i * 3)));
        }
        return yield* Effect.flip(clubs.create(players[0]!, newClub("One more", near(20))));
      }),
    );
    expect(error._tag).toBe("ClubRateLimited");
  });

  it("puts a club in the Detroit metro when its pin is there", async () => {
    const result = await withClubs(1, ({ players, clubs, db }) =>
      Effect.gen(function* () {
        const made = yield* clubs.create(
          players[0]!,
          newClub(`Royal Oak Test ${crypto.randomUUID().slice(0, 6)}`, {
            lat: 42.49,
            lng: -83.14,
          }),
        );
        const [row] = yield* db
          .select({ slug: metro.slug })
          .from(club)
          .innerJoin(metro, eq(metro.id, club.metroId))
          .where(eq(club.id, made.id));
        return row?.slug;
      }),
    );
    expect(result).toBe("detroit");
  });

  it("fails for a club that doesn't exist", async () => {
    const error = await withClubs(1, ({ players, clubs }) =>
      Effect.flip(clubs.get(players[0]!, crypto.randomUUID())),
    );
    expect(error._tag).toBe("ClubNotFound");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Club reviews", () => {
  it("keeps one review per player, which they can change and remove", async () => {
    const result = await withClubs(1, ({ players, clubs, near }) =>
      Effect.gen(function* () {
        const me = players[0]!;
        const made = yield* clubs.create(me, newClub("Review Courts", near(1)));
        const first = yield* clubs.saveReview(me, made.id, { rating: 3, body: "Cracks on 2." });
        const changed = yield* clubs.saveReview(me, made.id, { rating: 5 });
        const afterSave = yield* clubs.get(me, made.id);
        yield* clubs.deleteReview(me, made.id);
        yield* clubs.deleteReview(me, made.id);
        const afterDelete = yield* clubs.get(me, made.id);
        return { first, changed, afterSave, afterDelete };
      }),
    );
    expect(result.first).toMatchObject({ rating: 3, body: "Cracks on 2.", mine: true });
    expect(result.changed).toMatchObject({ id: result.first.id, rating: 5, body: null });
    expect(result.changed.updatedAt.getTime()).toBeGreaterThanOrEqual(
      result.changed.createdAt.getTime(),
    );
    expect(result.afterSave.rating).toEqual({ average: 5, count: 1 });
    expect(result.afterSave.ratingCounts).toEqual([0, 0, 0, 0, 1]);
    expect(result.afterSave.myReview?.id).toBe(result.first.id);
    expect(result.afterDelete.rating).toEqual({ average: null, count: 0 });
    expect(result.afterDelete.myReview).toBeNull();
  });

  it("averages to one decimal and pages through reviews newest first", async () => {
    const result = await withClubs(4, ({ players, clubs, near }) =>
      Effect.gen(function* () {
        const made = yield* clubs.create(players[0]!, newClub("Busy Courts", near(1)));
        for (const [i, rating] of [4, 5, 4, 2].entries()) {
          yield* clubs.saveReview(players[i]!, made.id, { rating, body: `Review ${i}` });
        }
        const detail = yield* clubs.get(players[0]!, made.id);
        const [listed] = yield* clubs.list(players[0]!, { q: "Busy" });
        const page1 = yield* clubs.listReviews(players[0]!, made.id, { limit: 3 });
        const page2 = yield* clubs.listReviews(players[0]!, made.id, {
          limit: 3,
          cursor: page1.nextCursor!,
        });
        return { detail, listed, page1, page2 };
      }),
    );
    expect(result.detail.rating).toEqual({ average: 3.8, count: 4 });
    expect(result.detail.ratingCounts).toEqual([0, 1, 0, 2, 1]);
    expect(result.listed?.rating).toEqual({ average: 3.8, count: 4 });
    expect(result.page1.items.map((r) => r.body)).toEqual(["Review 3", "Review 2", "Review 1"]);
    expect(result.page1.items.map((r) => r.mine)).toEqual([false, false, false]);
    expect(result.page2.items.map((r) => r.body)).toEqual(["Review 0"]);
    expect(result.page2.items[0]!.mine).toBe(true);
    expect(result.page2.nextCursor).toBeNull();
  });

  it("leaves out reviews by blocked players and hidden reviews, from lists and stars", async () => {
    const result = await withClubs(3, ({ players, clubs, db, near }) =>
      Effect.gen(function* () {
        const [me, blocked, hidden] = players as [SessionUser, SessionUser, SessionUser];
        const made = yield* clubs.create(me, newClub("Quiet Courts", near(1)));
        yield* clubs.saveReview(blocked, made.id, { rating: 1 });
        yield* clubs.saveReview(hidden, made.id, { rating: 1 });
        yield* clubs.saveReview(me, made.id, { rating: 5 });
        yield* db.insert(block).values({ blockerId: blocked.id, blockedId: me.id });
        yield* db
          .update(clubReview)
          .set({ hiddenAt: new Date() })
          .where(eq(clubReview.authorId, hidden.id));
        return {
          mine: yield* clubs.get(me, made.id),
          reviews: yield* clubs.listReviews(me, made.id, {}),
          blockedView: yield* clubs.listReviews(blocked, made.id, {}),
        };
      }),
    );
    expect(result.mine.rating).toEqual({ average: 5, count: 1 });
    expect(result.reviews.items.map((r) => r.rating)).toEqual([5]);
    expect(result.blockedView.items.map((r) => r.rating)).toEqual([1]);
  });

  it("fails to review or list reviews of a missing club, and rejects bad cursors", async () => {
    const result = await withClubs(1, ({ players, clubs, near }) =>
      Effect.gen(function* () {
        const made = yield* clubs.create(players[0]!, newClub("Cursor Courts", near(1)));
        return {
          save: yield* Effect.flip(
            clubs.saveReview(players[0]!, crypto.randomUUID(), { rating: 4 }),
          ),
          list: yield* Effect.flip(clubs.listReviews(players[0]!, crypto.randomUUID(), {})),
          cursor: yield* Effect.flip(clubs.listReviews(players[0]!, made.id, { cursor: "nope!" })),
        };
      }),
    );
    expect(result.save._tag).toBe("ClubNotFound");
    expect(result.list._tag).toBe("ClubNotFound");
    expect(result.cursor._tag).toBe("InvalidCursor");
  });
});
