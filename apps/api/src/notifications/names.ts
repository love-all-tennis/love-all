import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { Db } from "../Db";
import { profile, user } from "../db/schema";

/**
 * How a player is named in a notification: their profile name, or their
 * account name before they have a profile. Works on `db` or a transaction.
 */
export const playerName = (db: Pick<Db["Service"], "select">, userId: string) =>
  db
    .select({ name: sql<string>`coalesce(${profile.displayName}, ${user.name})` })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(eq(user.id, userId))
    .pipe(Effect.map(([row]) => row?.name ?? "A player"));
