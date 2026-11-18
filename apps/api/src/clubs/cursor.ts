import { Option, Schema } from "effect";

/**
 * Where a page of a club's reviews ended: the last review's `created_at` in
 * epoch milliseconds (the column is stored to the millisecond, so this is
 * exact) and its id. Reviews are ordered by (created_at, id), both
 * descending, and the next page starts strictly after this pair.
 */
export interface ReviewsCursor {
  readonly createdAt: number;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CursorJson = Schema.fromJsonString(Schema.Tuple([Schema.Finite, Schema.String]));
const decodeJson = Schema.decodeUnknownOption(CursorJson);

/** An opaque, URL-safe token. Clients pass it back unchanged. */
export const encodeReviewsCursor = (cursor: ReviewsCursor) =>
  Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString("base64url");

/** None when the token wasn't made by `encodeReviewsCursor`. */
export const decodeReviewsCursor = (token: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return Option.none();
  return decodeJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([ms, id]) => Number.isInteger(ms) && UUID.test(id)),
    Option.map(([createdAt, id]) => ({ createdAt, id })),
  );
};

/** `%`, `_` and `\` matched literally in an `ilike` pattern. */
export const likeContains = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
