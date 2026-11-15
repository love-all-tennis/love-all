import { Config, Context, Effect, Layer, Redacted } from "effect";
import { type Auth, makeAuth } from "./auth";

export const TrustedOrigins = Config.String("TRUSTED_ORIGINS").pipe(
  Config.withDefault("loveall://"),
  Config.map((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  ),
);

/** The Better Auth instance, built from config. */
export class BetterAuth extends Context.Service<BetterAuth, Auth>()("love-all/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const databaseUrl = yield* Config.Redacted("DATABASE_URL");
      const trustedOrigins = yield* TrustedOrigins;
      return makeAuth({ databaseUrl: Redacted.value(databaseUrl), trustedOrigins });
    }),
  );
}
