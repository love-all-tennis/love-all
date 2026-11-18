import { ConfigProvider, Effect, Layer, Result } from "effect";
import { FetchHttpClient } from "effect/http";
import { describe, expect, it } from "vite-plus/test";
import { AppleRevokeError, type AppleToken, AppleTokens } from "./AppleTokens";

type SentRequest = { url: string; form: Record<string, string> };

const revokeWith = (env: Record<string, string>, token: AppleToken, status = 200) => {
  const requests: Array<SentRequest> = [];

  // WARNING: fakeFetch only implements the call shape AppleTokens.layer uses.
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    // WARNING: HttpClientRequest.bodyUrlParams sends its body as a Uint8Array.
    const body = new TextDecoder().decode(init?.body as Uint8Array);

    requests.push({
      url: input.toString(),
      form: Object.fromEntries(new URLSearchParams(body)),
    });

    return new Response(null, { status });
  }) as typeof fetch;

  return Effect.gen(function* () {
    const apple = yield* AppleTokens;
    return yield* apple.revoke(token);
  }).pipe(
    Effect.provide(
      AppleTokens.layer.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
      ),
    ),
    Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
    Effect.result,
    Effect.runPromise,
    (promise) => promise.then((result) => ({ result, requests })),
  );
};

const apple = {
  APPLE_CLIENT_ID: "app.loveall.signin,app.loveall",
  APPLE_CLIENT_SECRET: "apple-jwt",
};

describe("AppleTokens", () => {
  it("revokes with the Services ID and client secret", async () => {
    const { result, requests } = await revokeWith(apple, {
      value: "r-token",
      kind: "refresh_token",
    });

    expect(Result.isSuccess(result)).toBe(true);
    expect(requests).toEqual([
      {
        url: "https://appleid.apple.com/auth/revoke",
        form: {
          client_id: "app.loveall.signin",
          client_secret: "apple-jwt",
          token: "r-token",
          token_type_hint: "refresh_token",
        },
      },
    ]);
  });

  it("fails when Apple refuses", async () => {
    const { result } = await revokeWith(apple, { value: "r-token", kind: "refresh_token" }, 400);

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(AppleRevokeError);
  });

  it("does nothing without Apple config", async () => {
    const { result, requests } = await revokeWith({}, { value: "a-token", kind: "access_token" });

    expect(Result.isSuccess(result)).toBe(true);
    expect(requests).toEqual([]);
  });
});
