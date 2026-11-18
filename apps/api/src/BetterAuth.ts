import { eq } from "drizzle-orm";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- BetterAuth is the Layer that owns makeAuth.
import { type Auth, type IpAddress, makeAuth, type SocialProviders } from "./auth";
import { AccountDeletion } from "./AccountDeletion";
import { Db } from "./Db";
import { effectSqlAdapter } from "./db/better-auth-adapter";
import { accountSuspension } from "./db/schema";
import { AppleConfig } from "./AppleTokens";
import { list } from "./config";

export const TrustedOrigins = list("TRUSTED_ORIGINS").pipe(Config.withDefault(["loveall://"]));

export const IpAddressConfig: Config.Config<IpAddress> = Config.all({
  headers: list("IP_ADDRESS_HEADERS").pipe(Config.withDefault([])),
  trustedProxies: list("TRUSTED_PROXIES").pipe(Config.withDefault([])),
});

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
 * Deleting an account runs `AccountDeletion.prepare` first.
 */
export class BetterAuth extends Context.Service<BetterAuth, Auth>()("love-all/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const services = yield* Effect.context<SqlClient.SqlClient | Db>();
      const run = Effect.runPromiseWith(services);
      const db = yield* Db;
      const deletion = yield* AccountDeletion;
      const trustedOrigins = yield* TrustedOrigins;
      const socialProviders = yield* SocialProvidersConfig;
      const ipAddress = yield* IpAddressConfig;

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
        beforeDeleteUser: (userId) => run(deletion.prepare(userId)),
        trustedOrigins,
        socialProviders,
        ipAddress,
      });
    }),
  );
}
