import { Api, CurrentUser } from "@love-all/domain";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Db } from "./Db";

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

export const MeHandlers = HttpApiBuilder.group(Api, "me", (handlers) =>
  Effect.succeed(
    handlers.handle("get", () =>
      Effect.gen(function* () {
        return yield* CurrentUser;
      }),
    ),
  ),
);

export const ApiHandlers = Layer.mergeAll(SystemHandlers, MeHandlers);
