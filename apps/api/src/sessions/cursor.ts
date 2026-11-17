import { Option, Schema } from "effect";

/**
 * Where a page of sessions ended. Lists are ordered by (bucket, key, id),
 * all ascending, and the next page starts strictly after this triple:
 * - `bucket` is 0 for upcoming sessions and 1 for past ones (only `mine` has past ones).
 * - `key` is the start time in epoch milliseconds, negated for past sessions
 *   so they come latest first.
 * - `id` (the session's uuid) breaks ties between sessions starting at the same time.
 */
export interface SessionsCursor {
  readonly bucket: 0 | 1;
  readonly key: number;
  readonly id: string;
}

const CursorJson = Schema.fromJsonString(
  Schema.Tuple([Schema.Literals([0, 1]), Schema.Finite, Schema.String]),
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decodeJson = Schema.decodeUnknownOption(CursorJson);

/** An opaque, URL-safe token. Clients pass it back unchanged. */
export const encodeCursor = (cursor: SessionsCursor): string =>
  Buffer.from(JSON.stringify([cursor.bucket, cursor.key, cursor.id])).toString("base64url");

/** None when the token wasn't made by `encodeCursor`. */
export const decodeCursor = (token: string): Option.Option<SessionsCursor> => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return Option.none();
  return decodeJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([, , id]) => UUID.test(id)),
    Option.map(([bucket, key, id]) => ({ bucket, key, id })),
  );
};
