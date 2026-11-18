import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Accounts } from "./Accounts";
import { Db } from "./Db";
import { user } from "./db/schema";

const run = <A, E>(effect: Effect.Effect<A, E, Db | Accounts>) =>
  effect.pipe(Effect.provide(Accounts.layer.pipe(Layer.provideMerge(Db.layer))), Effect.runPromise);

describe.skipIf(!process.env.DATABASE_URL)("Accounts.confirmAdult", () => {
  it("stamps the first confirmation and keeps it on later calls", async () => {
    const [first, second] = await run(
      Effect.gen(function* () {
        const db = yield* Db;
        const accounts = yield* Accounts;
        const id = `test_${crypto.randomUUID()}`;
        yield* db.insert(user).values({ id, name: "Sam", email: `${id}@example.com` });
        const confirmedAt = () =>
          db
            .select({ at: user.adultConfirmedAt })
            .from(user)
            .where(eq(user.id, id))
            .pipe(Effect.map(([row]) => row?.at));
        return yield* Effect.gen(function* () {
          expect(yield* confirmedAt()).toBeNull();
          yield* accounts.confirmAdult(id);
          const first = yield* confirmedAt();
          yield* Effect.sleep("10 millis");
          yield* accounts.confirmAdult(id);
          return [first, yield* confirmedAt()] as const;
        }).pipe(Effect.ensuring(Effect.orDie(db.delete(user).where(eq(user.id, id)))));
      }),
    );
    expect(first).toBeInstanceOf(Date);
    expect(second).toEqual(first);
  });
});
