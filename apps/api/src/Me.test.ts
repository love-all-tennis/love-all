import { Api, Authentication, CurrentUser, SessionUser, Unauthorized } from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { Accounts } from "./Accounts";
import { MeHandlers } from "./Handlers";

const sam = new SessionUser({
  id: "u_sam",
  name: "Sam",
  email: "sam@example.com",
  role: "player",
});

const signedIn = Layer.succeed(
  Authentication,
  Authentication.of((httpEffect) => Effect.provideService(httpEffect, CurrentUser, sam)),
);

const signedOut = Layer.succeed(
  Authentication,
  Authentication.of(() => Effect.fail(new Unauthorized({ message: "Sign in to continue" }))),
);

/** An in-memory `Accounts` that records who confirmed their age. */
const makeAccounts = () => {
  const confirmed: Array<string> = [];
  const layer = Layer.succeed(
    Accounts,
    Accounts.of({
      confirmAdult: (userId) => Effect.sync(() => void confirmed.push(userId)),
    }),
  );
  return { confirmed, layer };
};

const makeClient = HttpApiTest.groups(Api, ["me"]);

/** Runs a request against the real handlers in memory, with the given auth state. */
const run = <A, E>(
  auth: Layer.Layer<Authentication>,
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
  accounts: Layer.Layer<Accounts> = makeAccounts().layer,
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(
        MeHandlers.pipe(Layer.provide(accounts), Layer.provideMerge(auth)),
        HttpServer.layerServices,
      ),
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

describe("POST /me/adult-confirmation", () => {
  it("records the confirmation for the signed-in player", async () => {
    const accounts = makeAccounts();
    await run(signedIn, (client) => client.me.confirmAdult(), accounts.layer);
    expect(accounts.confirmed).toEqual(["u_sam"]);
  });

  it("fails with Unauthorized when signed out", async () => {
    const accounts = makeAccounts();
    const error = await run(
      signedOut,
      (client) => client.me.confirmAdult().pipe(Effect.flip),
      accounts.layer,
    );
    expect(error._tag).toBe("Unauthorized");
    expect(accounts.confirmed).toEqual([]);
  });
});
