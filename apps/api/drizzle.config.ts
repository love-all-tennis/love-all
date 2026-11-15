import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  extensionsFilters: ["postgis"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://love_all:love_all@localhost:5432/love_all",
  },
});
