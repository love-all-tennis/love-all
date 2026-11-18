import { EQUIPMENT_ADDED_PER_HOUR, SessionUser } from "@love-all/domain";
import { eq, inArray, like } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { block, equipment, equipmentReview, profile, user } from "./db/schema";
import { Equipment } from "./Equipment";

const TestLayer = Equipment.layer.pipe(Layer.provideMerge(Db.layer));

interface World {
  readonly players: ReadonlyArray<SessionUser>;
  readonly gear: Equipment["Service"];
  readonly db: Db["Service"];
  readonly brand: string;
}

const withGear = <A, E>(count: number, f: (world: World) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const gear = yield* Equipment;
    const brand = `Test${crypto.randomUUID().slice(0, 8)}`;
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
          ntrp: "4.0" as const,
        })),
      );
      return yield* f({ players, gear, db, brand });
    }).pipe(
      Effect.ensuring(
        Effect.orDie(
          Effect.all([
            db.delete(user).where(inArray(user.id, ids)),
            db.delete(equipment).where(like(equipment.brand, `${brand}%`)),
          ]),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

describe.skipIf(!process.env.DATABASE_URL)("Equipment catalog", () => {
  it("adds items and lists them by brand and model, with paging, kind and search", async () => {
    const result = await withGear(1, ({ players: [me], gear, brand }) =>
      Effect.gen(function* () {
        yield* gear.create(me!, { kind: "racket", brand, model: "Blade 98" });
        yield* gear.create(me!, { kind: "racket", brand, model: "Pro Staff 97" });
        yield* gear.create(me!, { kind: "strings", brand, model: "Alu Power" });
        const first = yield* gear.list(me!, { q: brand, limit: 2 });
        const second = yield* gear.list(me!, { q: brand, limit: 2, cursor: first.nextCursor! });
        const rackets = yield* gear.list(me!, { q: brand, kind: "racket" });
        const search = yield* gear.list(me!, { q: `staff ${brand.toLowerCase()}` });
        return { first, second, rackets, search };
      }),
    );
    expect(result.first.items.map((i) => i.model)).toEqual(["Alu Power", "Blade 98"]);
    expect(result.second.items.map((i) => i.model)).toEqual(["Pro Staff 97"]);
    expect(result.second.nextCursor).toBeNull();
    expect(result.rackets.items).toHaveLength(2);
    expect(result.search.items.map((i) => i.model)).toEqual(["Pro Staff 97"]);
    expect(result.first.items[0]!.rating).toEqual({
      count: 0,
      average: null,
      stars: [0, 0, 0, 0, 0],
    });
  });

  it("doesn't add the same item twice, ignoring case and spacing", async () => {
    const result = await withGear(2, ({ players: [a, b], gear, brand }) =>
      Effect.gen(function* () {
        const first = yield* gear.create(a!, { kind: "shoes", brand, model: "Gel Resolution 9" });
        const again = yield* gear
          .create(b!, { kind: "shoes", brand: brand.toUpperCase(), model: "gel  resolution 9" })
          .pipe(Effect.flip);
        const otherKind = yield* gear.create(b!, {
          kind: "other",
          brand,
          model: "Gel Resolution 9",
        });
        return { first, again, otherKind };
      }),
    );
    expect(result.again).toMatchObject({ _tag: "EquipmentExists", id: result.first.id });
    expect(result.otherKind.id).not.toBe(result.first.id);
  });

  it("limits how many items a player adds an hour", async () => {
    const error = await withGear(1, ({ players: [me], gear, brand }) =>
      Effect.gen(function* () {
        for (let i = 0; i < EQUIPMENT_ADDED_PER_HOUR; i++) {
          yield* gear.create(me!, { kind: "balls", brand, model: `Ball ${i}` });
        }
        return yield* gear
          .create(me!, { kind: "balls", brand, model: "One more" })
          .pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("EquipmentRateLimited");
  });

  it("hides items a moderator hid", async () => {
    const result = await withGear(1, ({ players: [me], gear, db, brand }) =>
      Effect.gen(function* () {
        const item = yield* gear.create(me!, { kind: "bag", brand, model: "Tour 12" });
        yield* db.update(equipment).set({ hiddenAt: new Date() }).where(eq(equipment.id, item.id));
        return {
          list: yield* gear.list(me!, { q: brand }),
          get: yield* gear.get(me!, item.id).pipe(Effect.flip),
        };
      }),
    );
    expect(result.list.items).toHaveLength(0);
    expect(result.get._tag).toBe("EquipmentNotFound");
  });

  it("rejects a cursor it didn't make", async () => {
    const error = await withGear(1, ({ players: [me], gear }) =>
      gear.list(me!, { cursor: "nope" }).pipe(Effect.flip),
    );
    expect(error._tag).toBe("InvalidCursor");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Equipment reviews", () => {
  it("keeps one review per player, replaced on save, with the author's level", async () => {
    const result = await withGear(1, ({ players: [me], gear, brand }) =>
      Effect.gen(function* () {
        const item = yield* gear.create(me!, { kind: "racket", brand, model: "Ezone 100" });
        const first = yield* gear.saveReview(me!, item.id, { rating: 3, body: "Stiff" });
        const second = yield* gear.saveReview(me!, item.id, { rating: 5, title: "Grew on me" });
        return { first, second, detail: yield* gear.get(me!, item.id) };
      }),
    );
    expect(result.second.id).toBe(result.first.id);
    expect(result.second).toMatchObject({
      rating: 5,
      title: "Grew on me",
      body: null,
      authorNtrp: "4.0",
    });
    expect(result.detail.myReview?.rating).toBe(5);
    expect(result.detail.rating).toEqual({ count: 1, average: 5, stars: [0, 0, 0, 0, 1] });
  });

  it("summarises ratings and lists other players' reviews newest first, with paging", async () => {
    const result = await withGear(4, ({ players: [me, a, b, c], gear, brand }) =>
      Effect.gen(function* () {
        const item = yield* gear.create(me!, { kind: "strings", brand, model: "RPM Blast" });
        yield* gear.saveReview(me!, item.id, { rating: 4 });
        yield* gear.saveReview(a!, item.id, { rating: 5, body: "Spin!" });
        yield* Effect.sleep("5 millis");
        yield* gear.saveReview(b!, item.id, { rating: 2, body: "Dies fast" });
        yield* Effect.sleep("5 millis");
        yield* gear.saveReview(c!, item.id, { rating: 4, body: "Solid" });
        const first = yield* gear.listReviews(me!, item.id, { limit: 2 });
        const second = yield* gear.listReviews(me!, item.id, {
          limit: 2,
          cursor: first.nextCursor!,
        });
        const list = yield* gear.list(me!, { q: brand });
        return { first, second, summary: list.items[0]! };
      }),
    );
    expect(result.first.items.map((r) => r.body)).toEqual(["Solid", "Dies fast"]);
    expect(result.second.items.map((r) => r.body)).toEqual(["Spin!"]);
    expect(result.second.nextCursor).toBeNull();
    expect(result.summary.rating).toEqual({ count: 4, average: 3.8, stars: [0, 1, 0, 2, 1] });
    expect(result.summary.myRating).toBe(4);
  });

  it("leaves out reviews by blocked players and hidden reviews", async () => {
    const result = await withGear(3, ({ players: [me, blocked, hidden], gear, db, brand }) =>
      Effect.gen(function* () {
        const item = yield* gear.create(me!, { kind: "racket", brand, model: "Speed MP" });
        yield* gear.saveReview(blocked!, item.id, { rating: 1, body: "Bad" });
        const h = yield* gear.saveReview(hidden!, item.id, { rating: 1, body: "Spam" });
        yield* db.insert(block).values({ blockerId: blocked!.id, blockedId: me!.id });
        yield* db
          .update(equipmentReview)
          .set({ hiddenAt: new Date() })
          .where(eq(equipmentReview.id, h.id));
        return {
          reviews: yield* gear.listReviews(me!, item.id, {}),
          detail: yield* gear.get(me!, item.id),
        };
      }),
    );
    expect(result.reviews.items).toHaveLength(0);
    expect(result.detail.rating.count).toBe(0);
  });

  it("deletes my review, and deleting again does nothing", async () => {
    const detail = await withGear(1, ({ players: [me], gear, brand }) =>
      Effect.gen(function* () {
        const item = yield* gear.create(me!, { kind: "shoes", brand, model: "Barricade" });
        yield* gear.saveReview(me!, item.id, { rating: 2 });
        yield* gear.deleteReview(me!, item.id);
        yield* gear.deleteReview(me!, item.id);
        return yield* gear.get(me!, item.id);
      }),
    );
    expect(detail.myReview).toBeNull();
    expect(detail.rating.count).toBe(0);
  });

  it("can't review an item that doesn't exist", async () => {
    const error = await withGear(1, ({ players: [me], gear }) =>
      gear.saveReview(me!, crypto.randomUUID(), { rating: 3 }).pipe(Effect.flip),
    );
    expect(error._tag).toBe("EquipmentNotFound");
  });
});
