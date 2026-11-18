import { Option, Schema } from "effect";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]+$/;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Where a catalog page ended: the last item's `name_key` and id, in ascending order. */
export interface CatalogCursor {
  readonly nameKey: string;
  readonly id: string;
}

const CatalogJson = Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.String]));
const decodeCatalogJson = Schema.decodeUnknownOption(CatalogJson);

export const encodeCatalogCursor = (cursor: CatalogCursor) => encode([cursor.nameKey, cursor.id]);

export const decodeCatalogCursor = (token: string) => {
  if (!TOKEN.test(token)) return Option.none();
  return decodeCatalogJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([, id]) => UUID.test(id)),
    Option.map(([nameKey, id]) => ({ nameKey, id })),
  );
};

/**
 * Where a page of reviews ended: the last review's `created_at` in epoch
 * milliseconds (stored to the millisecond, so exact) and its id, both
 * descending.
 */
export interface ReviewsCursor {
  readonly createdAt: number;
  readonly id: string;
}

const ReviewsJson = Schema.fromJsonString(Schema.Tuple([Schema.Finite, Schema.String]));
const decodeReviewsJson = Schema.decodeUnknownOption(ReviewsJson);

export const encodeReviewsCursor = (cursor: ReviewsCursor) => encode([cursor.createdAt, cursor.id]);

export const decodeReviewsCursor = (token: string) => {
  if (!TOKEN.test(token)) return Option.none();
  return decodeReviewsJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([ms, id]) => Number.isInteger(ms) && UUID.test(id)),
    Option.map(([createdAt, id]) => ({ createdAt, id })),
  );
};
