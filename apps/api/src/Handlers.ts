import { Api, CurrentUser } from "@love-all/domain";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Accounts } from "./Accounts";
import { Db } from "./Db";
import { Follows } from "./Follows";
import { Profiles } from "./Profiles";

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

export const ApiHandlers = Layer.mergeAll(SystemHandlers, MeHandlers, FollowsHandlers);
