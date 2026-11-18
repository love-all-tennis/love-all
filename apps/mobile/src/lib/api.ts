import { Api } from "@love-all/domain";
import { Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { Platform } from "react-native";
import { authClient } from "./auth-client";
import { apiUrl } from "./config";

const isWeb = Platform.OS === "web";

const sessionCookie = isWeb ? Effect.succeed("") : Effect.promise(() => authClient.getCookie());

const makeClient = HttpApiClient.make(Api, {
  transformClient: (client) =>
    client.pipe(
      HttpClient.mapRequestEffect((request) =>
        sessionCookie.pipe(
          Effect.map((cookie) => {
            const withUrl = HttpClientRequest.prependUrl(request, apiUrl);

            return cookie ? HttpClientRequest.setHeader(withUrl, "cookie", cookie) : withUrl;
          }),
        ),
      ),
    ),
});

export type ApiClient = Effect.Success<typeof makeClient>;

/**
 * Runs one API call as a Promise, for use from React (for example inside a
 * TanStack Query `queryFn`).
 *
 * @example
 * const me = await callApi((api) => api.me.get())
 */
export const callApi = <A, E>(request: (api: ApiClient) => Effect.Effect<A, E>) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, isWeb ? { credentials: "include" } : {}),
    Effect.runPromise,
  );
