import { Api, Authentication, CurrentUser, SessionUser, Unauthorized } from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { MeHandlers } from "./Handlers";
import { ProfilesMemory } from "./testing/ProfilesMemory";

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

const makeClient = HttpApiTest.groups(Api, ["me"]);

/** Runs requests against the real handlers in memory, with the given auth state. */
const run = <A, E>(
  auth: Layer.Layer<Authentication>,
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(
        MeHandlers.pipe(Layer.provide(ProfilesMemory), Layer.provideMerge(auth)),
        HttpServer.layerServices,
      ),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

describe("GET /me", () => {
  it("returns the signed-in player with no profile before onboarding", async () => {
    const me = await run(signedIn, (client) => client.me.get());
    expect(me.user).toEqual(sam);
    expect(me.profile).toBeNull();
    expect(me.availability).toEqual([]);
  });

  it("fails with Unauthorized when signed out", async () => {
    const error = await run(signedOut, (client) => client.me.get().pipe(Effect.flip));
    expect(error._tag).toBe("Unauthorized");
  });
});

describe("PATCH /me", () => {
  it("creates the profile on first save and returns it", async () => {
    const me = await run(signedIn, (client) =>
      client.me.update({
        payload: {
          ntrp: "3.5",
          playsSingles: true,
          homePoint: { lat: 42.489876, lng: -83.141234 },
        },
      }),
    );
    expect(me.profile).toMatchObject({
      displayName: "Sam",
      ntrp: "3.5",
      playsSingles: true,
      homePoint: { lat: 42.49, lng: -83.14 },
    });
  });

  it("fails with Unauthorized when signed out", async () => {
    const error = await run(signedOut, (client) =>
      client.me.update({ payload: { bio: "hi" } }).pipe(Effect.flip),
    );
    expect(error._tag).toBe("Unauthorized");
  });
});

describe("PUT /me/availability", () => {
  it("replaces the schedule and returns it sorted", async () => {
    const saved = await run(signedIn, (client) =>
      Effect.gen(function* () {
        yield* client.me.replaceAvailability({
          payload: [{ weekday: 1, startTime: "07:00", endTime: "08:00" }],
        });
        yield* client.me.replaceAvailability({
          payload: [
            { weekday: 6, startTime: "09:00", endTime: "12:00" },
            { weekday: 2, startTime: "18:00", endTime: "21:00" },
          ],
        });
        return yield* client.me.get();
      }),
    );
    expect(saved.availability).toEqual([
      { weekday: 2, startTime: "18:00", endTime: "21:00" },
      { weekday: 6, startTime: "09:00", endTime: "12:00" },
    ]);
  });
});
