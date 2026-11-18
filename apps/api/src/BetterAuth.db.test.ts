import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BetterAuth } from "./BetterAuth";
import { Db } from "./Db";
import { makeAppleTokensMemory } from "./testing/AppleTokensMemory";
import { betterAuthTestLayer } from "./testing/BetterAuthTest";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";
import { account, session, user } from "./db/schema";

describe.skipIf(!process.env.DATABASE_URL)("BetterAuth on Effect SQL", () => {
  it("signs up and in, and Drizzle reads back what auth wrote", async () => {
    const email = `test_${crypto.randomUUID()}@Example.com`;
    const password = "correct-horse-battery";

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* BetterAuth;
        const db = yield* Db;
        const before = Date.now();

        const signedUp = yield* Effect.promise(() =>
          auth.api.signUpEmail({ body: { email, password, name: "Sam" } }),
        );

        return yield* Effect.gen(function* () {
          const { headers, response: signedIn } = yield* Effect.promise(() =>
            auth.api.signInEmail({
              body: { email: email.toLowerCase(), password },
              returnHeaders: true,
            }),
          );

          const cookie = headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; ");

          const found = yield* Effect.promise(() =>
            auth.api.getSession({ headers: new Headers({ cookie }) }),
          );

          const accounts = yield* db
            .select()
            .from(account)
            .where(eq(account.userId, signedUp.user.id));

          const sessions = yield* db
            .select()
            .from(session)
            .where(eq(session.userId, signedUp.user.id));

          return { before, signedUp, signedIn, found, accounts, sessions };
        }).pipe(
          Effect.ensuring(Effect.orDie(db.delete(user).where(eq(user.id, signedUp.user.id)))),
        );
      }).pipe(
        Effect.provide(
          betterAuthTestLayer(makeNotificationsMemory().layer, makeAppleTokensMemory().layer),
        ),
      ),
    );

    expect(result.signedUp.user).toMatchObject({ email: result.signedUp.user.email, name: "Sam" });
    expect(result.found?.user.id).toBe(result.signedUp.user.id);
    expect(result.found?.user).toMatchObject({ role: "player", emailVerified: false });
    expect(result.accounts).toEqual([
      expect.objectContaining({ providerId: "credential", accountId: result.signedUp.user.id }),
    ]);
    expect(result.sessions.map((s) => s.token)).toHaveLength(2);
    expect(result.sessions.map((s) => s.token)).toEqual(
      expect.arrayContaining([result.signedUp.token, result.signedIn.token]),
    );
    const expiresAt = result.found!.session.expiresAt.getTime();
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - (result.before + week))).toBeLessThan(60_000);

    for (const row of result.sessions) {
      expect(Math.abs(row.expiresAt.getTime() - (result.before + week))).toBeLessThan(60_000);
    }
  });
});
