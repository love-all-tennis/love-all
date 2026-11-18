import { Config, Context, Data, Effect, Layer, Option, Redacted } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { list } from "./config";

/** Sign in with Apple, when its `APPLE_*` variables are set. */
export const AppleConfig = Config.all({
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

/** A token Apple gave us for a player, as Better Auth stored it on their `account` row. */
export interface AppleToken {
  readonly value: string;
  readonly kind: "refresh_token" | "access_token";
}

/** Apple didn't take the revocation (network, 4xx or 5xx). */
export class AppleRevokeError extends Data.TaggedError("AppleRevokeError")<{
  readonly cause: unknown;
}> {}

const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

/**
 * Sign in with Apple tokens. Apple requires apps that offer account deletion
 * to revoke the player's tokens when they delete their account, which also
 * removes Love All from "Apps using Apple ID" in their Apple settings.
 */
export class AppleTokens extends Context.Service<
  AppleTokens,
  {
    readonly revoke: (token: AppleToken) => Effect.Effect<void, AppleRevokeError>;
  }
>()("love-all/AppleTokens") {
  /**
   * Apple's revoke endpoint, signed with the same client id and secret Better
   * Auth signs in with. The web flow (the one the app uses) issues tokens to
   * the Services ID, the first `APPLE_CLIENT_ID`. Without Apple config there
   * are no Apple accounts, so revoking does nothing.
   */
  static readonly layer = Layer.effect(
    AppleTokens,
    Effect.gen(function* () {
      const apple = yield* AppleConfig;
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

      return AppleTokens.of({
        revoke: (token) =>
          Option.match(apple, {
            onNone: () => Effect.void,
            onSome: ({ clientIds, clientSecret }) =>
              HttpClientRequest.post(APPLE_REVOKE_URL).pipe(
                HttpClientRequest.bodyUrlParams({
                  client_id: clientIds[0] ?? "",
                  client_secret: clientSecret,
                  token: token.value,
                  token_type_hint: token.kind,
                }),
                client.execute,
                Effect.asVoid,
                Effect.mapError((cause) => new AppleRevokeError({ cause })),
                Effect.withSpan("AppleTokens.revoke"),
              ),
          }),
      });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
