import {
  Api,
  Authentication,
  CurrentUser,
  type PlayersQuery,
  PlayerNotFound,
  PlayerProfile,
  PlayersPage,
  SessionUser,
} from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { HttpApiTest } from "effect/http-api";
import { describe, expect, it } from "vite-plus/test";
import { PlayersHandlers } from "./Handlers";
import { Players } from "./Players";

const sam = new SessionUser({ id: "u_sam", name: "Sam", email: "sam@example.com", role: "player" });

const signedIn = Layer.succeed(
  Authentication,
  Authentication.of((httpEffect) => Effect.provideService(httpEffect, CurrentUser, sam)),
);

const alex = new PlayerProfile({
  id: "u_alex",
  displayName: "Alex",
  photoUrl: null,
  metro: null,
  ntrp: "4.0",
  handedness: null,
  playsSingles: true,
  playsDoubles: false,
  playsHitting: false,
  bio: null,
  availability: [],
  distanceKm: 3,
});

const makePlayers = () => {
  const queries: Array<PlayersQuery> = [];

  const layer = Layer.succeed(
    Players,
    Players.of({
      search: (_viewer, query) =>
        Effect.sync(() => {
          queries.push(query);

          return new PlayersPage({ items: [], nextCursor: null });
        }),
      get: (_viewer, id) =>
        id === alex.id ? Effect.succeed(alex) : Effect.fail(new PlayerNotFound({ id })),
    }),
  );

  return { queries, layer };
};

const makeClient = HttpApiTest.groups(Api, ["players"]);

const run = <A, E>(
  request: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
  players = makePlayers().layer,
) =>
  makeClient.pipe(
    Effect.flatMap(request),
    Effect.provide(
      Layer.mergeAll(
        PlayersHandlers.pipe(Layer.provide(players), Layer.provideMerge(signedIn)),
        HttpServer.layerServices,
      ),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

describe("GET /players", () => {
  it("decodes the query string into typed filters", async () => {
    const players = makePlayers();
    await run(
      (client) =>
        client.players.search({
          query: { radiusKm: 25, levelMin: "3.5", levelMax: "4.5", plays: "doubles", limit: 10 },
        }),
      players.layer,
    );
    expect(players.queries).toEqual([
      { radiusKm: 25, levelMin: "3.5", levelMax: "4.5", plays: "doubles", limit: 10 },
    ]);
  });

  it("passes an empty query through as defaults", async () => {
    const players = makePlayers();
    const page = await run((client) => client.players.search({ query: {} }), players.layer);
    expect(page.items).toEqual([]);
    expect(players.queries).toEqual([{}]);
  });
});

describe("GET /players/:id", () => {
  it("returns the player's profile", async () => {
    const profile = await run((client) => client.players.get({ params: { id: "u_alex" } }));
    expect(profile).toEqual(alex);
  });

  it("fails with PlayerNotFound for an unknown id", async () => {
    const error = await run((client) =>
      client.players.get({ params: { id: "u_nobody" } }).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(PlayerNotFound);
    expect(error).toMatchObject({ id: "u_nobody" });
  });
});
