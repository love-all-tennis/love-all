import { Option, Schema } from "effect";

/**
 * Where a page ended, for lists ordered by (time, id), both descending: the
 * inbox (by last message) and a conversation's messages (by send time).
 * `at` is epoch milliseconds; the columns are stored to the millisecond, so
 * it is exact. The next page starts strictly after this pair.
 */
export interface TimeIdCursor {
  readonly at: number;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CursorJson = Schema.fromJsonString(Schema.Tuple([Schema.Finite, Schema.String]));
const decodeJson = Schema.decodeUnknownOption(CursorJson);

/** An opaque, URL-safe token. Clients pass it back unchanged. */
export const encodeCursor = (cursor: TimeIdCursor) =>
  Buffer.from(JSON.stringify([cursor.at, cursor.id])).toString("base64url");

/** None when the token wasn't made by `encodeCursor`. */
export const decodeCursor = (token: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return Option.none();
  return decodeJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([ms, id]) => Number.isInteger(ms) && UUID.test(id)),
    Option.map(([at, id]) => ({ at, id })),
  );
};

/** True for a string shaped like a UUID, before it goes near a `uuid` column. */
export const isUuid = (value: string) => UUID.test(value);
