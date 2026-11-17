import { Api, CurrentUser } from "@love-all/domain";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Accounts } from "./Accounts";
import { Db } from "./Db";
import { Follows } from "./Follows";
import { Players } from "./Players";
import { Profiles } from "./Profiles";
import { Safety } from "./Safety";
import { Sessions } from "./Sessions";
import { SessionJoins } from "./SessionJoins";

export const SystemHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    const db = yield* Db;
    return handlers.handle("health", () =>
      // A round trip to Postgres, so the host's health check covers the database too.
      db.execute(sql`select 1`).pipe(Effect.as({ status: "ok" as const }), Effect.orDie),
    );
  }),
);

export const MeHandlers = HttpApiBuilder.group(
  Api,
  "me",
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts;
    const profiles = yield* Profiles;
    return handlers
      .handle("get", () => Effect.flatMap(CurrentUser, profiles.get))
      .handle("update", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => profiles.update(user, payload)),
      )
      .handle("replaceAvailability", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => profiles.replaceAvailability(user, payload)),
      )
      .handle("confirmAdult", () =>
        Effect.flatMap(CurrentUser, (user) => accounts.confirmAdult(user.id)),
      );
  }),
);

export const FollowsHandlers = HttpApiBuilder.group(
  Api,
  "follows",
  Effect.fn(function* (handlers) {
    const follows = yield* Follows;
    return handlers
      .handle("list", () => Effect.flatMap(CurrentUser, follows.list))
      .handle("follow", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => follows.follow(user, params.id)),
      )
      .handle("unfollow", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => follows.unfollow(user, params.id)),
      );
  }),
);

export const PlayersHandlers = HttpApiBuilder.group(
  Api,
  "players",
  Effect.fn(function* (handlers) {
    const players = yield* Players;
    return handlers
      .handle("search", ({ query }) =>
        Effect.flatMap(CurrentUser, (viewer) => players.search(viewer, query)),
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(CurrentUser, (viewer) => players.get(viewer, params.id)),
      );
  }),
);

export const SafetyHandlers = HttpApiBuilder.group(
  Api,
  "safety",
  Effect.fn(function* (handlers) {
    const safety = yield* Safety;
    return handlers
      .handle("block", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => safety.block(user, params.id)),
      )
      .handle("unblock", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => safety.unblock(user, params.id)),
      )
      .handle("listBlocks", () => Effect.flatMap(CurrentUser, safety.listBlocks))
      .handle("report", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => safety.report(user, payload)),
      );
  }),
);

export const SessionsHandlers = HttpApiBuilder.group(
  Api,
  "sessions",
  Effect.fn(function* (handlers) {
    const sessions = yield* Sessions;
    const joins = yield* SessionJoins;
    return handlers
      .handle("create", ({ payload }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.create(viewer, payload)),
      )
      .handle("list", ({ query }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.list(viewer, query)),
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.get(viewer, params.id)),
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.update(viewer, params.id, payload)),
      )
      .handle("invite", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.invite(viewer, params.id, payload)),
      )
      .handle("respond", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => joins.respond(user, params.id, payload.answer)),
      )
      .handle("approve", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.approve(user, params.id, params.userId)),
      )
      .handle("reject", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.reject(user, params.id, params.userId)),
      )
      .handle("leave", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.leave(user, params.id)),
      )
      .handle("cancel", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.cancel(user, params.id)),
      );
  }),
);

export const ApiHandlers = Layer.mergeAll(
  SystemHandlers,
  MeHandlers,
  PlayersHandlers,
  FollowsHandlers,
  SafetyHandlers,
  SessionsHandlers,
);
