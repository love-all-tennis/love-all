import {
  Api,
  Authentication,
  BlockedPlayer,
  CannotTargetSelf,
  CurrentUser,
  ReportCreated,
  SessionUser,
  TargetNotFound,
  Unauthorized,
} from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { SafetyHandlers } from "./Handlers";
import { Safety } from "./Safety";

const sam = new SessionUser({ id: "u_sam", name: "Sam", email: "sam@example.com", role: "player" });

const signedIn = Layer.succeed(
  Authentication,
  Authentication.of((httpEffect) => Effect.provideService(httpEffect, CurrentUser, sam)),
);

const signedOut = Layer.succeed(
  Authentication,
  Authentication.of(() => Effect.fail(new Unauthorized({ message: "Sign in to continue" }))),
);

const makeSafety = () => {
  const known = new Set(["u_alex", "u_jo"]);
  const blocks = new Map<string, Date>();
  const reports: Array<unknown> = [];

  const check: (
    id: string,
    verb: string,
  ) => Effect.Effect<void, CannotTargetSelf | TargetNotFound> = (id, verb) =>
    id === sam.id
      ? Effect.fail(new CannotTargetSelf({ message: `You can't ${verb} yourself` }))
      : known.has(id)
        ? Effect.void
        : Effect.fail(new TargetNotFound({ id }));

  const layer = Layer.succeed(
    Safety,
    Safety.of({
      block: (_, id) =>
        check(id, "block").pipe(
          Effect.andThen(Effect.sync(() => void blocks.set(id, new Date(Date.UTC(2026, 10, 16))))),
        ),
      unblock: (_, id) => Effect.sync(() => void blocks.delete(id)),
      listBlocks: () =>
        Effect.sync(() =>
          [...blocks].map(
            ([id, blockedAt]) =>
              new BlockedPlayer({ id, displayName: null, photoUrl: null, blockedAt }),
          ),
        ),
      report: (_, input) =>
        check(input.targetId, "report").pipe(
          Effect.map(() => {
            reports.push(input);

            return new ReportCreated({ id: `r_${reports.length}` });
          }),
        ),
    }),
  );

  return { blocks, reports, layer };
};

const makeClient = HttpApiTest.groups(Api, ["safety"]);

const run = <A, E>(
  auth: Layer.Layer<Authentication>,
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
  safety = makeSafety(),
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(
        SafetyHandlers.pipe(Layer.provide(safety.layer), Layer.provideMerge(auth)),
        HttpServer.layerServices,
      ),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

describe("POST /players/:id/block", () => {
  it("blocks the player, and the block shows up in GET /me/blocks", async () => {
    const listed = await run(signedIn, (client) =>
      Effect.gen(function* () {
        yield* client.safety.block({ params: { id: "u_alex" } });

        return yield* client.safety.listBlocks();
      }),
    );

    expect(listed).toEqual([
      new BlockedPlayer({
        id: "u_alex",
        displayName: null,
        photoUrl: null,
        blockedAt: new Date(Date.UTC(2026, 10, 16)),
      }),
    ]);
  });

  it("fails with TargetNotFound for an unknown player and CannotTargetSelf for me", async () => {
    const errors = await run(signedIn, (client) =>
      Effect.all([
        Effect.flip(client.safety.block({ params: { id: "u_nobody" } })),
        Effect.flip(client.safety.block({ params: { id: sam.id } })),
      ]),
    );

    expect(errors.map((e) => e._tag)).toEqual(["TargetNotFound", "CannotTargetSelf"]);
  });

  it("fails with Unauthorized when signed out", async () => {
    const error = await run(signedOut, (client) =>
      Effect.flip(client.safety.block({ params: { id: "u_alex" } })),
    );

    expect(error._tag).toBe("Unauthorized");
  });
});

describe("DELETE /players/:id/block", () => {
  it("unblocks the player", async () => {
    const listed = await run(signedIn, (client) =>
      Effect.gen(function* () {
        yield* client.safety.block({ params: { id: "u_alex" } });
        yield* client.safety.unblock({ params: { id: "u_alex" } });

        return yield* client.safety.listBlocks();
      }),
    );

    expect(listed).toEqual([]);
  });
});

describe("POST /reports", () => {
  it("files the report and returns its id", async () => {
    const safety = makeSafety();

    const created = await run(
      signedIn,
      (client) =>
        client.safety.report({
          payload: { targetType: "player", targetId: "u_jo", reason: "fake_profile" },
        }),
      safety,
    );

    expect(created.id).toBe("r_1");
    expect(safety.reports).toEqual([
      { targetType: "player", targetId: "u_jo", reason: "fake_profile" },
    ]);
  });

  it("fails with Unauthorized when signed out", async () => {
    const error = await run(signedOut, (client) =>
      Effect.flip(
        client.safety.report({
          payload: { targetType: "player", targetId: "u_jo", reason: "spam" },
        }),
      ),
    );

    expect(error._tag).toBe("Unauthorized");
  });
});
