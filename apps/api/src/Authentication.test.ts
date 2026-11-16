import { Api } from "@love-all/domain";
import { Effect, Exit, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import type { Auth } from "./auth";
import { AuthenticationLive } from "./Authentication";
import { BetterAuth } from "./BetterAuth";
import { MeHandlers } from "./Handlers";
import { ProfilesMemory } from "./testing/ProfilesMemory";

type GetSession = () => Promise<{
  user: { id: string; name: string; email: string; role?: unknown };
} | null>;

/** A stand-in for Better Auth whose only behavior is the session lookup. */
const fakeAuth = (getSession: GetSession) =>
  Layer.succeed(BetterAuth, { api: { getSession } } as unknown as Auth);

const makeClient = HttpApiTest.groups(Api, ["me"]);

/** GET /me through the real middleware, with Better Auth's answer stubbed. */
const getMe = (getSession: GetSession) =>
  makeClient.pipe(
    Effect.flatMap((client) => client.me.get()),
    Effect.provide(
      Layer.mergeAll(
        MeHandlers.pipe(
          Layer.provide(ProfilesMemory),
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
    const error = Exit.isFailure(exit)
      ? exit.cause.reasons.find((r) => r._tag === "Fail")
      : undefined;
    expect(error?._tag === "Fail" && error.error._tag).toBe("Unauthorized");
  });
});
