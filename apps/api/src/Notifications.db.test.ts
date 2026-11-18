import { SessionUser } from "@love-all/domain";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { block, pushToken, user } from "./db/schema";
import { Notifications } from "./Notifications";
import { makePushSenderMemory } from "./testing/PushSenderMemory";

const withPlayers = <A, E>(
  count: number,
  f: (
    players: ReadonlyArray<SessionUser>,
    services: { db: Db["Service"]; notifications: Notifications["Service"] },
  ) => Effect.Effect<A, E>,
  sender = makePushSenderMemory(),
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const notifications = yield* Notifications;
    const players = Array.from({ length: count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    return yield* f(players, { db, notifications }).pipe(
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
  }).pipe(
    Effect.provide(
      Notifications.layer.pipe(Layer.provide(sender.layer), Layer.provideMerge(Db.layer)),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

const tokenFor = () => `ExponentPushToken[${crypto.randomUUID()}]`;

describe.skipIf(!process.env.DATABASE_URL)("Notifications", () => {
  it("moves a token to the account that registers it last", () =>
    withPlayers(2, ([a, b], { db, notifications }) =>
      Effect.gen(function* () {
        const token = tokenFor();
        yield* notifications.register(a!, { token, platform: "ios" });
        yield* notifications.register(a!, { token, platform: "ios" });
        yield* notifications.register(b!, { token, platform: "ios" });
        const rows = yield* db.select().from(pushToken).where(eq(pushToken.token, token));
        expect(rows.map((r) => r.userId)).toEqual([b!.id]);
      }),
    ));

  it("only removes a token for its owner", () =>
    withPlayers(2, ([a, b], { db, notifications }) =>
      Effect.gen(function* () {
        const token = tokenFor();
        yield* notifications.register(a!, { token, platform: "android" });
        yield* notifications.unregister(b!, token);
        expect(yield* db.select().from(pushToken).where(eq(pushToken.token, token))).toHaveLength(
          1,
        );
        yield* notifications.unregister(a!, token);
        expect(yield* db.select().from(pushToken).where(eq(pushToken.token, token))).toHaveLength(
          0,
        );
      }),
    ));

  it("sends to every phone of each player, but not to the sender or anyone blocked", async () => {
    const sender = makePushSenderMemory();
    const tokens = { a: tokenFor(), b1: tokenFor(), b2: tokenFor(), c: tokenFor(), d: tokenFor() };
    await withPlayers(
      4,
      ([a, b, c, d], { db, notifications }) =>
        Effect.gen(function* () {
          yield* notifications.register(a!, { token: tokens.a, platform: "ios" });
          yield* notifications.register(b!, { token: tokens.b1, platform: "ios" });
          yield* notifications.register(b!, { token: tokens.b2, platform: "android" });
          yield* notifications.register(c!, { token: tokens.c, platform: "ios" });
          yield* notifications.register(d!, { token: tokens.d, platform: "ios" });
          yield* db.insert(block).values({ blockerId: d!.id, blockedId: a!.id });
          yield* notifications.notify({
            to: [a!.id, b!.id, b!.id, d!.id],
            from: a!.id,
            title: "Hi",
            body: "There",
            url: "/sessions/1",
          });
          yield* notifications.flush;
        }),
      sender,
    );
    expect(sender.sent.map((m) => m.to).sort()).toEqual([tokens.b1, tokens.b2].sort());
    expect(sender.sent[0]).toMatchObject({
      title: "Hi",
      body: "There",
      data: { url: "/sessions/1" },
    });
  });

  it("deletes tokens Expo says are no longer registered", async () => {
    const gone = tokenFor();
    const kept = tokenFor();
    const sender = makePushSenderMemory(new Set([gone]));
    await withPlayers(
      1,
      ([a], { db, notifications }) =>
        Effect.gen(function* () {
          yield* notifications.register(a!, { token: gone, platform: "ios" });
          yield* notifications.register(a!, { token: kept, platform: "ios" });
          yield* notifications.notify({ to: [a!.id], title: "t", body: "b", url: "/" });
          yield* notifications.flush;
          const rows = yield* db.select().from(pushToken).where(eq(pushToken.userId, a!.id));
          expect(rows.map((r) => r.token)).toEqual([kept]);
        }),
      sender,
    );
  });
});
