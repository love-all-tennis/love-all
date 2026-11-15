import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { type Auth, makeAuth, type SocialProviders } from "./auth";

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

/** Google is on when GOOGLE_CLIENT_ID (comma-separated) and GOOGLE_CLIENT_SECRET are set. */
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

/** Apple is on when APPLE_CLIENT_ID (comma-separated) and APPLE_CLIENT_SECRET are set. */
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

/** The Better Auth instance, built from config. */
export class BetterAuth extends Context.Service<BetterAuth, Auth>()("love-all/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const databaseUrl = yield* Config.Redacted("DATABASE_URL");
      const trustedOrigins = yield* TrustedOrigins;
      const socialProviders = yield* SocialProvidersConfig;
      return makeAuth({
        databaseUrl: Redacted.value(databaseUrl),
        trustedOrigins,
        socialProviders,
      });
    }),
  );
}
