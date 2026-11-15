import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./db/schema";

/**
 * Better Auth runs inside the API process.
 *
 * Its Drizzle adapter awaits promise-based queries, so it gets its own small
 * node-postgres pool on the same database. App code uses the Effect driver
 * (see `Db.ts`). Both share one Drizzle schema.
 *
 * Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
 */
export const makeAuth = (options: { databaseUrl: string; trustedOrigins: ReadonlyArray<string> }) =>
  betterAuth({
    database: drizzleAdapter(
      drizzle({ client: new Pool({ connectionString: options.databaseUrl, max: 5 }) }),
      {
        provider: "pg",
        schema,
      },
    ),
    emailAndPassword: { enabled: true },
    trustedOrigins: [...options.trustedOrigins],
    plugins: [expo()],
  });

export type Auth = ReturnType<typeof makeAuth>;
