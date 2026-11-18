import {
  Api,
  Authentication,
  CurrentUser,
  type NewDevice,
  SessionUser,
  Unauthorized,
} from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { DevicesHandlers } from "./Handlers";
import { Notifications } from "./Notifications";

const sam = new SessionUser({ id: "u_sam", name: "Sam", email: "sam@example.com", role: "player" });

const signedIn = Layer.succeed(
  Authentication,
  Authentication.of((httpEffect) => Effect.provideService(httpEffect, CurrentUser, sam)),
);

const signedOut = Layer.succeed(
  Authentication,
  Authentication.of(() => Effect.fail(new Unauthorized({ message: "Sign in to continue" }))),
);

const makeNotifications = () => {
  const tokens = new Map<string, NewDevice & { userId: string }>();
  const layer = Layer.succeed(
    Notifications,
    Notifications.of({
      register: (user, device) =>
        Effect.sync(() => void tokens.set(device.token, { ...device, userId: user.id })),
      unregister: (user, token) =>
        Effect.sync(() => {
          if (tokens.get(token)?.userId === user.id) tokens.delete(token);
        }),
      notify: () => Effect.void,
      flush: Effect.void,
    }),
  );
  return { tokens, layer };
};

const makeClient = HttpApiTest.groups(Api, ["devices"]);

const run = <A, E>(
  auth: Layer.Layer<Authentication>,
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
  notifications = makeNotifications(),
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(
        DevicesHandlers.pipe(Layer.provide(notifications.layer), Layer.provideMerge(auth)),
        HttpServer.layerServices,
      ),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

const token = "ExponentPushToken[xXx-123_abc]";

describe("POST /devices", () => {
  it("saves the push token for me", async () => {
    const notifications = makeNotifications();
    await run(
      signedIn,
      (client) => client.devices.register({ payload: { token, platform: "ios" } }),
      notifications,
    );
    expect([...notifications.tokens.values()]).toEqual([
      { token, platform: "ios", userId: sam.id },
    ]);
  });

  it("rejects a token that isn't an Expo push token", async () => {
    const notifications = makeNotifications();
    const error = await run(
      signedIn,
      (client) =>
        Effect.flip(
          client.devices.register({ payload: { token: "not-a-token", platform: "ios" } }),
        ),
      notifications,
    );
    expect(error._tag).not.toBe("Unauthorized");
    expect(notifications.tokens.size).toBe(0);
  });

  it("fails with Unauthorized when signed out", async () => {
    const error = await run(signedOut, (client) =>
      Effect.flip(client.devices.register({ payload: { token, platform: "android" } })),
    );
    expect(error._tag).toBe("Unauthorized");
  });
});

describe("DELETE /devices/:token", () => {
  it("removes my token, brackets and all", async () => {
    const notifications = makeNotifications();
    await run(
      signedIn,
      (client) =>
        Effect.gen(function* () {
          yield* client.devices.register({ payload: { token, platform: "ios" } });
          yield* client.devices.unregister({ params: { token } });
        }),
      notifications,
    );
    expect(notifications.tokens.size).toBe(0);
  });
});
