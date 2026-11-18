import {
  Api,
  Authentication,
  CurrentUser,
  ModerationReportsPage,
  NotModerator,
  SessionUser,
} from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { ModerationHandlers } from "./Handlers";
import { Moderation } from "./Moderation";

const admin = new SessionUser({
  id: "u_admin",
  name: "Ada",
  email: "a@example.com",
  role: "admin",
});
const sam = new SessionUser({ id: "u_sam", name: "Sam", email: "s@example.com", role: "player" });

const as = (viewer: SessionUser) =>
  Layer.succeed(
    Authentication,
    Authentication.of((httpEffect) => Effect.provideService(httpEffect, CurrentUser, viewer)),
  );

const makeModeration = () => {
  const calls: Array<string> = [];
  const gate = (viewer: SessionUser, call: string) =>
    viewer.role === "admin"
      ? Effect.sync(() => void calls.push(call))
      : Effect.fail(new NotModerator({ message: "Only moderators can do that" }));
  const layer = Layer.succeed(
    Moderation,
    Moderation.of({
      listReports: (viewer, query) =>
        gate(viewer, `list ${query.status ?? "open"}`).pipe(
          Effect.as(new ModerationReportsPage({ items: [], nextCursor: null })),
        ),
      dismissReport: (viewer, id) => gate(viewer, `dismiss ${id}`),
      hideContent: (viewer, type, id) => gate(viewer, `hide ${type} ${id}`),
      unhideContent: (viewer, type, id) => gate(viewer, `unhide ${type} ${id}`),
      suspend: (viewer, id, input) => gate(viewer, `suspend ${id} ${input.reason ?? ""}`),
      unsuspend: (viewer, id) => gate(viewer, `unsuspend ${id}`),
    }),
  );
  return { calls, layer };
};

const makeClient = HttpApiTest.groups(Api, ["moderation"]);

const run = <A, E>(
  viewer: SessionUser,
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
  moderation = makeModeration(),
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(
        ModerationHandlers.pipe(Layer.provide(moderation.layer), Layer.provideMerge(as(viewer))),
        HttpServer.layerServices,
      ),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

const postId = "0b9b6d5e-2f4c-4c55-9d8a-0a8f1d1c2b3a";

describe("moderation endpoints", () => {
  it("route each action to the service for an admin", async () => {
    const moderation = makeModeration();
    await run(
      admin,
      (client) =>
        Effect.all([
          client.moderation.listReports({ query: { status: "resolved" } }),
          client.moderation.dismissReport({ params: { id: postId } }),
          client.moderation.hideContent({ params: { type: "forum_post", id: postId } }),
          client.moderation.unhideContent({ params: { type: "forum_thread", id: postId } }),
          client.moderation.suspend({ params: { id: "u_alex" }, payload: { reason: "Spam" } }),
          client.moderation.unsuspend({ params: { id: "u_alex" } }),
        ]),
      moderation,
    );
    expect(moderation.calls).toEqual([
      "list resolved",
      `dismiss ${postId}`,
      `hide forum_post ${postId}`,
      `unhide forum_thread ${postId}`,
      "suspend u_alex Spam",
      "unsuspend u_alex",
    ]);
  });

  it("refuse players with NotModerator", async () => {
    const error = await run(sam, (client) =>
      Effect.flip(client.moderation.listReports({ query: {} })),
    );
    expect(error._tag).toBe("NotModerator");
  });
});
