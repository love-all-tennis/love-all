import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- The Better Auth CLI needs a plain instance, outside any Layer.
import { makeAuth } from "./auth";

/**
 * Only for the Better Auth CLI (`pnpm auth:generate`), which needs a default
 * export and an adapter that can write a Drizzle schema. Nothing connects to a
 * database: the API itself uses `effectSqlAdapter` (see `BetterAuth.ts`).
 */
export const auth = makeAuth({
  database: drizzleAdapter(drizzle.mock(), { provider: "pg" }),
  isSuspended: async () => false,
  trustedOrigins: [],
});
