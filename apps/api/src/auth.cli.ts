import { makeAuth } from "./auth";

/** Only for the Better Auth CLI (`pnpm auth:generate`), which needs a default export. */
export const auth = makeAuth({
  databaseUrl: process.env.DATABASE_URL ?? "postgres://love_all:love_all@localhost:5432/love_all",
  trustedOrigins: [],
});
