import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

await migrate(drizzle({ client: pool }), { migrationsFolder });
await pool.end();
console.log("Migrations applied");
