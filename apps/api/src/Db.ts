import { PgClient } from "@effect/sql-pg";
import { Config, Context, Effect, Layer } from "effect";
import * as PgDrizzle from "drizzle-orm/effect-postgres";

const makeDb = PgDrizzle.makeWithDefaults();

/**
 * Drizzle on top of Effect's Postgres client. Queries are Effects.
 *
 * The layer also provides the `SqlClient` underneath, which Better Auth's
 * adapter uses, so the whole API runs on one pool.
 */
export class Db extends Context.Service<Db, Effect.Success<typeof makeDb>>()("love-all/Db") {
  static readonly layer = Layer.effect(Db, makeDb).pipe(
    Layer.provideMerge(PgClient.layerConfig({ url: Config.Redacted("DATABASE_URL") })),
  );
}
