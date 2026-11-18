import { Api, Unauthorized } from "@love-all/domain";
import { Cause, Effect, Exit, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { Accounts } from "./Accounts";
import { AuthenticationLive } from "./Authentication";
import { BetterAuth } from "./BetterAuth";
import { MeHandlers } from "./Handlers";
import { ProfilesMemory } from "./testing/ProfilesMemory";

type GetSession = () => Promise<{
  user: { id: string; name: string; email: string; role?: unknown };
} | null>;

const fakeAuth = (getSession: GetSession) =>
  // WARNING: the handlers under test only call auth.api.getSession.
  Layer.succeed(BetterAuth, { api: { getSession } } as never);

const noAccounts = Layer.succeed(
  Accounts,
  Accounts.of({ confirmAdult: () => Effect.die("unused") }),
);

const makeClient = HttpApiTest.groups(Api, ["me"]);

const getMe = (getSession: GetSession) =>
  makeClient.pipe(
    Effect.flatMap((client) => client.me.get()),
    Effect.provide(
      Layer.mergeAll(
        MeHandlers.pipe(
          Layer.provide([noAccounts, ProfilesMemory]),
          Layer.provideMerge(AuthenticationLive.pipe(Layer.provide(fakeAuth(getSession)))),
        ),
        HttpServer.layerServices,
      ),
    ),
    Effect.scoped,
    Effect.runPromiseExit,
  );

const sam = { id: "u_sam", name: "Sam", email: "sam@example.com" };

describe("Authentication middleware", () => {
  it("provides the session's user as CurrentUser", async () => {
    const exit = await getMe(async () => ({ user: { ...sam, role: "admin" } }));
    expect(Exit.isSuccess(exit) && exit.value.user).toMatchObject({ ...sam, role: "admin" });
  });

  it("treats an unknown role as a player", async () => {
    const exit = await getMe(async () => ({ user: { ...sam, role: "owner" } }));
    expect(Exit.isSuccess(exit) && exit.value.user.role).toBe("player");
  });

  it("fails with Unauthorized when there is no session (missing or expired)", async () => {
    const exit = await getMe(async () => null);
    expect(Exit.isFailure(exit)).toBe(true);

    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

    expect(error).toBeInstanceOf(Unauthorized);
  });
});
