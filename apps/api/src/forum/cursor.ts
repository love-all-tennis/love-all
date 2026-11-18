import { Option, Schema } from "effect";

/**
 * Where a page of a category's threads ended: the last thread's
 * `last_post_at` in epoch milliseconds (the column is stored to the
 * millisecond, so this is exact) and its id. Threads are ordered by
 * (last_post_at, id), both descending, and the next page starts strictly
 * after this pair.
 */
export interface ThreadsCursor {
  readonly lastPostAt: number;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CursorJson = Schema.fromJsonString(Schema.Tuple([Schema.Finite, Schema.String]));
const decodeJson = Schema.decodeUnknownOption(CursorJson);

/** An opaque, URL-safe token. Clients pass it back unchanged. */
export const encodeThreadsCursor = (cursor: ThreadsCursor) =>
  Buffer.from(JSON.stringify([cursor.lastPostAt, cursor.id])).toString("base64url");

/** None when the token wasn't made by `encodeThreadsCursor`. */
export const decodeThreadsCursor = (token: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return Option.none();
  return decodeJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([ms, id]) => Number.isInteger(ms) && UUID.test(id)),
    Option.map(([lastPostAt, id]) => ({ lastPostAt, id })),
  );
};

/** A replies cursor is the last reply's id, base64url-encoded so clients treat it as opaque. */
export const encodeRepliesCursor = (id: string) => Buffer.from(id).toString("base64url");

/** None when the token isn't an encoded reply id. */
export const decodeRepliesCursor = (token: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return Option.none();
  const id = Buffer.from(token, "base64url").toString("utf8");
  return UUID.test(id) ? Option.some(id) : Option.none();
};
