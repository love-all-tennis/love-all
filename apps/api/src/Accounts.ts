import { and, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Db } from "./Db";
import { user } from "./db/schema";

/** Writes to a player's own account that Better Auth doesn't let the client make. */
export class Accounts extends Context.Service<
  Accounts,
  {
    /** Stamps `adult_confirmed_at` with the current time, unless it is already set. */
    readonly confirmAdult: (userId: string) => Effect.Effect<void>;
  }
>()("love-all/Accounts") {
  static readonly layer = Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const db = yield* Db;

      return Accounts.of({
        confirmAdult: (userId) =>
          db
            .update(user)
            .set({ adultConfirmedAt: new Date() })
            .where(and(eq(user.id, userId), isNull(user.adultConfirmedAt)))
            .pipe(Effect.asVoid, Effect.orDie),
      });
    }),
  );
}
