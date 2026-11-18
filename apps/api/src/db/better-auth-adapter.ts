import type { BetterAuthOptions } from "better-auth";
import {
  type AdapterFactoryConfig,
  type CleanedWhere,
  type CustomAdapter,
  createAdapterFactory,
  type DBAdapter,
} from "better-auth/adapters";
import { PgTypes } from "@effect/sql-pg";
import { Context, Effect, Predicate } from "effect";
import { SqlClient, type Statement } from "effect/sql";

/**
 * The tables and columns Better Auth uses are the snake_case of its model and
 * field names (`emailVerified` → `email_verified`), which is how the Better
 * Auth CLI and drizzle-kit laid out the auth tables in `auth-schema.ts`.
 */
export const toSnakeCase = (name: string) =>
  name.replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** `LIKE` treats `%`, `_` and `\` as special, so a search for them must escape them. */
const escapeLike = (value: string) => value.replaceAll(/[\\%_]/g, String.raw`\$&`);

const param = (value: unknown) => (Predicate.isDate(value) ? PgTypes.timestamp(value) : value);

const first = <A>(rows: ReadonlyArray<A>) => rows[0] ?? null;

/**
 * Better Auth's database adapter on the app's Effect SQL client.
 *
 * Auth queries share the API's Postgres pool, show up in its traces, and
 * Better Auth's transactions (sign-up writes the user and account together)
 * are `sql.withTransaction`, the same transactions Drizzle's Effect driver uses.
 *
 * `services` must hold the `SqlClient`; every query runs with them. Columns
 * are Postgres `timestamp` (without time zone) holding UTC, as Drizzle writes
 * them, so dates are bound as `timestamp` whatever the session time zone.
 */
export const effectSqlAdapter = (
  services: Context.Context<SqlClient.SqlClient>,
  options: { readonly debugLogs?: AdapterFactoryConfig["debugLogs"] } = {},
) => {
  const sql = Context.get(services, SqlClient.SqlClient);
  const table = (model: string) => sql(toSnakeCase(model));
  let betterAuthOptions: BetterAuthOptions | undefined;

  /** A query runner. Inside a transaction it carries the transaction's connection. */
  type Run = <A>(effect: Effect.Effect<A, unknown, SqlClient.SqlClient>) => Promise<A>;

  const createCustomAdapter =
    (run: Run): Parameters<typeof createAdapterFactory>[0]["adapter"] =>
    ({ getFieldName, getDefaultModelName, schema }) => {
      const keyOf = (model: string, modelKey: string | undefined) =>
        modelKey ?? getDefaultModelName(model);
      const column = (modelKey: string, field: string) =>
        sql(toSnakeCase(getFieldName({ model: modelKey, field })));

      /** `column AS "fieldName"` for each field asked for, or all of them. */
      const selection = (modelKey: string, select?: ReadonlyArray<string>) => {
        const fields =
          select && select.length > 0
            ? select.map((field) => getFieldName({ model: modelKey, field }))
            : [
                getFieldName({ model: modelKey, field: "id" }),
                ...Object.keys(schema[modelKey]?.fields ?? {}).map((field) =>
                  getFieldName({ model: modelKey, field }),
                ),
              ];
        return sql.csv(
          [...new Set(fields)].map((field) => sql`${sql(toSnakeCase(field))} AS ${sql(field)}`),
        );
      };

      const condition = (modelKey: string, where: CleanedWhere): Statement.Fragment => {
        const target = column(modelKey, where.field);
        const { value } = where;
        const insensitive =
          where.mode === "insensitive" &&
          (typeof value === "string" ||
            (Array.isArray(value) && value.every((item) => typeof item === "string")));
        const lhs = insensitive ? sql`lower(${target})` : target;
        const rhs = insensitive ? sql`lower(${value})` : sql`${param(value)}`;
        switch (where.operator) {
          case "in":
          case "not_in": {
            const values = (Array.isArray(value) ? value : [value]) as ReadonlyArray<unknown>;
            if (values.length === 0) {
              return sql.literal(where.operator === "in" ? "FALSE" : "TRUE");
            }
            const items = insensitive ? values.map((item) => String(item).toLowerCase()) : values;
            const list = sql.in(items.map(param));
            return where.operator === "in" ? sql`${lhs} IN ${list}` : sql`${lhs} NOT IN ${list}`;
          }
          case "contains":
          case "starts_with":
          case "ends_with": {
            const text = escapeLike(String(value));
            const pattern =
              where.operator === "contains"
                ? `%${text}%`
                : where.operator === "starts_with"
                  ? `${text}%`
                  : `%${text}`;
            return insensitive ? sql`${target} ILIKE ${pattern}` : sql`${target} LIKE ${pattern}`;
          }
          case "lt":
            return sql`${target} < ${param(value)}`;
          case "lte":
            return sql`${target} <= ${param(value)}`;
          case "gt":
            return sql`${target} > ${param(value)}`;
          case "gte":
            return sql`${target} >= ${param(value)}`;
          case "ne":
            return value === null ? sql`${target} IS NOT NULL` : sql`${lhs} <> ${rhs}`;
          default:
            return value === null ? sql`${target} IS NULL` : sql`${lhs} = ${rhs}`;
        }
      };

      /** ANDed conditions, then ORed ones, as Better Auth's own adapters read them. */
      const whereClause = (modelKey: string, where: ReadonlyArray<CleanedWhere> | undefined) => {
        if (!where || where.length === 0) {
          return sql.literal("TRUE");
        }
        const ands = where.filter((w) => w.connector !== "OR").map((w) => condition(modelKey, w));
        const ors = where.filter((w) => w.connector === "OR").map((w) => condition(modelKey, w));
        return sql.and([
          ...(ands.length ? [sql.and(ands)] : []),
          ...(ors.length ? [sql.or(ors)] : []),
        ]);
      };

      const assignments = (
        modelKey: string,
        values: Parameters<CustomAdapter["updateMany"]>[0]["update"],
      ) =>
        Object.entries(values)
          .filter(([, value]) => value !== undefined)
          .map(([field, value]) => sql`${column(modelKey, field)} = ${param(value)}`);

      /** The id of the first row matching `where`, so single-row writes touch one row. */
      const firstId = (model: string, modelKey: string, where: ReadonlyArray<CleanedWhere>) =>
        sql`${column(modelKey, "id")} IN (SELECT ${column(modelKey, "id")} FROM ${table(model)} WHERE ${whereClause(modelKey, where)} LIMIT 1)`;

      const adapter: CustomAdapter = {
        create: ({ model, modelKey, data }) => {
          const key = keyOf(model, modelKey);
          const entries = Object.entries(data).filter(([, value]) => value !== undefined);
          const columns = sql.csv(entries.map(([field]) => sql`${column(key, field)}`));
          const values = sql.csv(entries.map(([, value]) => sql`${param(value)}`));
          return run(
            sql<
              typeof data
            >`INSERT INTO ${table(model)} (${columns}) VALUES (${values}) RETURNING ${selection(key)}`.pipe(
              Effect.map((rows) => rows[0]!),
            ),
          );
        },
        findOne: ({ model, modelKey, where, select }) => {
          const key = keyOf(model, modelKey);
          return run(
            sql`SELECT ${selection(key, select)} FROM ${table(model)} WHERE ${whereClause(key, where)} LIMIT 1`.pipe(
              Effect.map(first),
            ),
          ) as never;
        },
        findMany: ({ model, modelKey, where, limit, select, sortBy, offset }) => {
          const key = keyOf(model, modelKey);
          const order = sortBy
            ? sql`ORDER BY ${column(key, sortBy.field)} ${sql.literal(sortBy.direction === "desc" ? "DESC" : "ASC")}`
            : sql.literal("");
          return run(
            sql`SELECT ${selection(key, select)} FROM ${table(model)} WHERE ${whereClause(key, where)} ${order} LIMIT ${limit} OFFSET ${offset ?? 0}`,
          ) as never;
        },
        count: ({ model, modelKey, where }) => {
          const key = keyOf(model, modelKey);
          return run(
            sql<{
              count: number;
            }>`SELECT count(*)::int AS count FROM ${table(model)} WHERE ${whereClause(key, where)}`.pipe(
              Effect.map((rows) => rows[0]?.count ?? 0),
            ),
          );
        },
        update: ({ model, modelKey, where, update }) => {
          const key = keyOf(model, modelKey);
          const set = assignments(key, update as Parameters<typeof assignments>[1]);
          if (set.length === 0) {
            return adapter.findOne({ model, modelKey, where });
          }
          return run(
            sql`UPDATE ${table(model)} SET ${sql.csv(set)} WHERE ${firstId(model, key, where)} RETURNING ${selection(key)}`.pipe(
              Effect.map(first),
            ),
          ) as never;
        },
        updateMany: ({ model, modelKey, where, update }) => {
          const key = keyOf(model, modelKey);
          const set = assignments(key, update);
          if (set.length === 0) {
            return adapter.count({ model, modelKey, where });
          }
          return run(
            sql<{
              count: number;
            }>`WITH changed AS (UPDATE ${table(model)} SET ${sql.csv(set)} WHERE ${whereClause(key, where)} RETURNING 1) SELECT count(*)::int AS count FROM changed`.pipe(
              Effect.map((rows) => rows[0]?.count ?? 0),
            ),
          );
        },
        delete: ({ model, modelKey, where }) => {
          const key = keyOf(model, modelKey);
          return run(
            sql`DELETE FROM ${table(model)} WHERE ${whereClause(key, where)}`.pipe(Effect.asVoid),
          );
        },
        deleteMany: ({ model, modelKey, where }) => {
          const key = keyOf(model, modelKey);
          return run(
            sql<{
              count: number;
            }>`WITH gone AS (DELETE FROM ${table(model)} WHERE ${whereClause(key, where)} RETURNING 1) SELECT count(*)::int AS count FROM gone`.pipe(
              Effect.map((rows) => rows[0]?.count ?? 0),
            ),
          );
        },
        // Native atomic versions, so Better Auth skips its read-then-write fallbacks.
        consumeOne: ({ model, modelKey, where }) => {
          const key = keyOf(model, modelKey);
          return run(
            sql`DELETE FROM ${table(model)} WHERE ${firstId(model, key, where)} RETURNING ${selection(key)}`.pipe(
              Effect.map(first),
            ),
          ) as never;
        },
        incrementOne: ({ model, modelKey, where, increment, set }) => {
          const key = keyOf(model, modelKey);
          const changes = [
            ...Object.entries(increment).map(([field, delta]) => {
              const target = column(key, field);
              return sql`${target} = ${target} + ${delta}`;
            }),
            ...assignments(key, set ?? {}),
          ];
          // `where` is repeated outside the subquery so Postgres re-checks the
          // guard against the row it locks, if another writer got there first.
          return run(
            sql`UPDATE ${table(model)} SET ${sql.csv(changes)} WHERE ${whereClause(key, where)} AND ${firstId(model, key, where)} RETURNING ${selection(key)}`.pipe(
              Effect.map(first),
            ),
          ) as never;
        },
      };
      return adapter;
    };

  const config: AdapterFactoryConfig = {
    adapterId: "effect-sql",
    adapterName: "Effect SQL",
    usePlural: false,
    debugLogs: options.debugLogs ?? false,
    supportsDates: true,
    supportsBooleans: true,
    supportsNumericIds: true,
    // Better Auth stores JSON and arrays as text, which keeps the codecs simple.
    supportsJSON: false,
    supportsArrays: false,
    transaction: (callback) =>
      Effect.runPromiseWith(services)(
        sql.withTransaction(
          Effect.gen(function* () {
            // These services carry the transaction's connection.
            const inTransaction = yield* Effect.context<SqlClient.SqlClient>();
            const trx = createAdapterFactory({
              config: { ...config, transaction: false },
              adapter: createCustomAdapter(Effect.runPromiseWith(inTransaction)),
            })(betterAuthOptions ?? {});
            return yield* Effect.tryPromise({ try: () => callback(trx), catch: (error) => error });
          }),
        ),
      ),
  };

  const factory = createAdapterFactory({
    config,
    adapter: createCustomAdapter(Effect.runPromiseWith(services)),
  });

  return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
    betterAuthOptions = options;
    return factory(options);
  };
};
