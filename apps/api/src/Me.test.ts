import { Api, Authentication, CurrentUser, SessionUser, Unauthorized } from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { MeHandlers } from "./Handlers";

const sam = new SessionUser({ id: "u_sam", name: "Sam", email: "sam@example.com" });

const signedIn = Layer.succeed(
  Authentication,
  Authentication.of((httpEffect) => Effect.provideService(httpEffect, CurrentUser, sam)),
);

const signedOut = Layer.succeed(
  Authentication,
  Authentication.of(() => Effect.fail(new Unauthorized({ message: "Sign in to continue" }))),
);

const makeClient = HttpApiTest.groups(Api, ["me"]);

/** Runs a request against the real handlers in memory, with the given auth state. */
const run = <A, E>(
  auth: Layer.Layer<Authentication>,
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(MeHandlers.pipe(Layer.provideMerge(auth)), HttpServer.layerServices),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

describe("GET /me", () => {
  it("returns the signed-in player", async () => {
    const me = await run(signedIn, (client) => client.me.get());
    expect(me).toEqual(sam);
  });

  it("fails with Unauthorized when signed out", async () => {
    const error = await run(signedOut, (client) => client.me.get().pipe(Effect.flip));
    expect(error._tag).toBe("Unauthorized");
  });
});
