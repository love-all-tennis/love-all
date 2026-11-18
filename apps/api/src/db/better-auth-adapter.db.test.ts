import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  normalTestSuite,
  testAdapter,
  transactionsTestSuite,
} from "@better-auth/test-utils/adapter";
import { PgClient } from "@effect/sql-pg";
import type { BetterAuthOptions } from "better-auth";
import { getAuthTables } from "better-auth/db";
import { Effect, ManagedRuntime, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { describe } from "vite-plus/test";
import { effectSqlAdapter, toSnakeCase } from "./better-auth-adapter";

const schemaName = "better_auth_adapter_test";

type FieldType = ReturnType<typeof getAuthTables>[string]["fields"][string]["type"];

const columnType = (type: FieldType, bigint: boolean | undefined) => {
  switch (type) {
    case "boolean":
      return "boolean";
    case "number":
      return bigint ? "bigint" : "integer";
    case "date":
      return "timestamp";
    default:
      return "text";
  }
};

const migrate = (options: BetterAuthOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const tables = getAuthTables(options);
    yield* sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    yield* sql.unsafe(`CREATE SCHEMA ${schemaName}`);
    const foreignKeys: Array<string> = [];

    for (const table of Object.values(tables)) {
      const name = toSnakeCase(table.modelName);
      const columns = [`"id" text PRIMARY KEY`];

      for (const [key, field] of Object.entries(table.fields)) {
        const column = toSnakeCase(field.fieldName ?? key);
        columns.push(
          `"${column}" ${columnType(field.type, field.bigint)}${field.required !== false ? " NOT NULL" : ""}${field.unique ? " UNIQUE" : ""}`,
        );

        if (field.references) {
          const { model, field: targetField, onDelete = "cascade" } = field.references;
          const targetTable = tables[model];
          const target = toSnakeCase(targetTable?.modelName ?? model);

          const targetColumn = toSnakeCase(
            targetTable?.fields[targetField]?.fieldName ?? targetField,
          );

          foreignKeys.push(
            `ALTER TABLE "${name}" ADD FOREIGN KEY ("${column}") REFERENCES "${target}" ("${targetColumn}") ON DELETE ${onDelete}`,
          );
        }
      }

      yield* sql.unsafe(`CREATE TABLE "${name}" (${columns.join(", ")})`);
    }

    for (const statement of foreignKeys) yield* sql.unsafe(statement);
  });

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("effectSqlAdapter", async () => {
  if (!databaseUrl) return;

  const runtime = ManagedRuntime.make(
    PgClient.layer({
      url: Redacted.make(databaseUrl),
      startupParameters: { search_path: schemaName },
    }),
  );

  const services = await runtime.context();

  const { execute } = await testAdapter({
    adapter: () => effectSqlAdapter(services),
    runMigrations: (options) => runtime.runPromise(migrate(options)),
    tests: [
      normalTestSuite(),
      caseInsensitiveTestSuite(),
      transactionsTestSuite(),
      authFlowTestSuite(),
    ],
    onFinish: async () => {
      await runtime.runPromise(
        Effect.flatMap(SqlClient.SqlClient, (sql) =>
          sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`),
        ),
      );
      await runtime.dispose();
    },
  });

  execute();
});
