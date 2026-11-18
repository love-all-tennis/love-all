import { eq } from "drizzle-orm";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { type Auth, makeAuth, type SocialProviders } from "./auth";
import { Db } from "./Db";
import { effectSqlAdapter } from "./db/better-auth-adapter";
import { accountSuspension } from "./db/schema";

const list = (name: string) =>
  Config.String(name).pipe(
    Config.map((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );

export const TrustedOrigins = list("TRUSTED_ORIGINS").pipe(Config.withDefault(["loveall://"]));

const GoogleConfig = Config.all({
  clientIds: list("GOOGLE_CLIENT_ID"),
  clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
}).pipe(
  Config.map(({ clientIds, clientSecret }) => ({
    clientIds,
    clientSecret: Redacted.value(clientSecret),
  })),
  Config.option,
);

const AppleConfig = Config.all({
  clientIds: list("APPLE_CLIENT_ID"),
  clientSecret: Config.Redacted("APPLE_CLIENT_SECRET"),
  appBundleIdentifier: Config.String("APPLE_APP_BUNDLE_IDENTIFIER").pipe(Config.option),
}).pipe(
  Config.map(({ clientIds, clientSecret, appBundleIdentifier }) => ({
    clientIds,
    clientSecret: Redacted.value(clientSecret),
    ...(Option.isSome(appBundleIdentifier) && { appBundleIdentifier: appBundleIdentifier.value }),
  })),
  Config.option,
);

export const SocialProvidersConfig: Config.Config<SocialProviders> = Config.all({
  google: GoogleConfig,
  apple: AppleConfig,
}).pipe(
  Config.map(({ google, apple }) => ({
    ...(Option.isSome(google) && { google: google.value }),
    ...(Option.isSome(apple) && { apple: apple.value }),
  })),
);

/**
 * The Better Auth instance, built from config. Its queries go through the
 * app's Effect SQL client (`effectSqlAdapter`), on the same pool as `Db`.
 */
export class BetterAuth extends Context.Service<BetterAuth, Auth>()("love-all/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const services = yield* Effect.context<SqlClient.SqlClient | Db>();
      const run = Effect.runPromiseWith(services);
      const db = yield* Db;
      const trustedOrigins = yield* TrustedOrigins;
      const socialProviders = yield* SocialProvidersConfig;
      return makeAuth({
        database: effectSqlAdapter(services),
        isSuspended: (userId) =>
          run(
            db
              .select({ userId: accountSuspension.userId })
              .from(accountSuspension)
              .where(eq(accountSuspension.userId, userId))
              .pipe(Effect.map((rows) => rows.length > 0)),
          ),
        trustedOrigins,
        socialProviders,
      });
    }),
  );
}
