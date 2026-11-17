import { type SQLWrapper, sql } from "drizzle-orm";
import { accountSuspension } from "./app-schema";

/**
 * A `where` condition that is true unless the player in `userId` is
 * suspended. Player search uses it, so suspended players can't be found.
 */
export const notSuspended = (userId: SQLWrapper) =>
  sql`not exists (select 1 from ${accountSuspension} where ${accountSuspension.userId} = ${userId})`;
