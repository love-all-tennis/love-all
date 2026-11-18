import { ConfigProvider, Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { SocialProvidersConfig, TrustedOrigins } from "./BetterAuth";

const parse = <A>(
  config: { parse: (provider: ConfigProvider.ConfigProvider) => Effect.Effect<A, unknown> },
  env: Record<string, string>,
) => Effect.runSync(config.parse(ConfigProvider.fromEnvRecord(env)));

describe("auth config", () => {
  it("splits TRUSTED_ORIGINS on commas", () => {
    expect(
      parse(TrustedOrigins, { TRUSTED_ORIGINS: "loveall://, http://localhost:8081," }),
    ).toEqual(["loveall://", "http://localhost:8081"]);
  });

  it("leaves social providers off when their credentials are missing", () => {
    expect(parse(SocialProvidersConfig, { GOOGLE_CLIENT_ID: "web" })).toEqual({});
  });

  it("turns on Google and Apple when configured", () => {
    const providers = parse(SocialProvidersConfig, {
      GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com,ios.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "g-secret",
      APPLE_CLIENT_ID: "app.loveall.signin,app.loveall",
      APPLE_CLIENT_SECRET: "apple-jwt",
      APPLE_APP_BUNDLE_IDENTIFIER: "app.loveall",
    });

    expect(providers).toEqual({
      google: {
        clientIds: ["web.apps.googleusercontent.com", "ios.apps.googleusercontent.com"],
        clientSecret: "g-secret",
      },
      apple: {
        clientIds: ["app.loveall.signin", "app.loveall"],
        clientSecret: "apple-jwt",
        appBundleIdentifier: "app.loveall",
      },
    });
  });
});
