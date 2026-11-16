import { type SQLWrapper, sql } from "drizzle-orm";
import { block } from "./app-schema";

/**
 * A `where` condition that is true when neither the viewer nor `otherUserId`
 * has blocked the other. Add it to every query that returns other players
 * (or their posts, sessions and messages), so blocked players are hidden
 * from each other everywhere.
 *
 * @example db.select().from(profile).where(and(notBlocked(viewer.id, profile.userId), ...))
 */
export const notBlocked = (viewerId: string, otherUserId: SQLWrapper) =>
  sql`not exists (
    select 1 from ${block}
    where (${block.blockerId} = ${viewerId} and ${block.blockedId} = ${otherUserId})
       or (${block.blockerId} = ${otherUserId} and ${block.blockedId} = ${viewerId})
  )`;
