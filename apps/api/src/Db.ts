import { PgClient } from "@effect/sql-pg";
import { Config, Context, Effect, Layer } from "effect";
import * as PgDrizzle from "drizzle-orm/effect-postgres";

const makeDb = PgDrizzle.makeWithDefaults();

/** Drizzle on top of Effect's Postgres client. Queries are Effects. */
export class Db extends Context.Service<Db, Effect.Success<typeof makeDb>>()("love-all/Db") {
  static readonly layer = Layer.effect(Db, makeDb).pipe(
    Layer.provide(PgClient.layerConfig({ url: Config.Redacted("DATABASE_URL") })),
  );
}
