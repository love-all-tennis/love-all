import { Schema } from "effect";
import { PlayerId } from "./Player";
import { Ntrp } from "./Profile";

/**
 * Equipment reviews: a shared catalog of gear (rackets, strings, shoes and
 * so on) that players add to, and one review per player per item: a 1 to 5
 * star rating with an optional title and text.
 *
 * Reviews by players blocked either way with me are left out of lists and of
 * the rating summary, and so is anything a moderator hid.
 */

export const EquipmentId = Schema.String.check(Schema.isUUID());

export type EquipmentId = typeof EquipmentId.Type;

export const EquipmentReviewId = Schema.String.check(Schema.isUUID());

export type EquipmentReviewId = typeof EquipmentReviewId.Type;

/** Kinds of gear, in the order the app lists them. Adding one needs a migration for the enum. */
export const EQUIPMENT_KINDS = ["racket", "strings", "shoes", "balls", "bag", "other"] as const;
export const EquipmentKind = Schema.Literals(EQUIPMENT_KINDS);

export type EquipmentKind = typeof EquipmentKind.Type;

export const EQUIPMENT_BRAND_MAX = 40;
export const EQUIPMENT_MODEL_MAX = 80;
export const EQUIPMENT_REVIEW_TITLE_MAX = 80;
export const EQUIPMENT_REVIEW_BODY_MAX = 2000;

export const EquipmentBrand = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, EQUIPMENT_BRAND_MAX),
);

export const EquipmentModel = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, EQUIPMENT_MODEL_MAX),
);

export const EquipmentReviewTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, EQUIPMENT_REVIEW_TITLE_MAX),
);

export const EquipmentReviewBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, EQUIPMENT_REVIEW_BODY_MAX),
);

/** Stars, 1 to 5. */
export const EquipmentRating = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }));

export type EquipmentRating = typeof EquipmentRating.Type;

/** How many items one player can add to the catalog an hour, to blunt spam. */
export const EQUIPMENT_ADDED_PER_HOUR = 10;

/**
 * The ratings I can see for an item. `average` is rounded to one decimal and
 * is null with no reviews. `stars` counts reviews with 1 to 5 stars, in that
 * order.
 */
export const EquipmentRatingSummary = Schema.Struct({
  count: Schema.Int,
  average: Schema.NullOr(Schema.Number),
  stars: Schema.Array(Schema.Int),
});

export type EquipmentRatingSummary = typeof EquipmentRatingSummary.Type;

/** An item as listed in the catalog. */
export class EquipmentSummary extends Schema.Class<EquipmentSummary>("EquipmentSummary")({
  id: EquipmentId,
  kind: EquipmentKind,
  brand: Schema.String,
  model: Schema.String,
  rating: EquipmentRatingSummary,
  /** My stars, when I reviewed it. */
  myRating: Schema.NullOr(EquipmentRating),
}) {}

/** Who wrote a review, as shown next to it. */
export const EquipmentReviewer = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
});

export type EquipmentReviewer = typeof EquipmentReviewer.Type;

/** A review. `authorNtrp` is the reviewer's level when they last saved it. */
export class EquipmentReview extends Schema.Class<EquipmentReview>("EquipmentReview")({
  id: EquipmentReviewId,
  equipmentId: EquipmentId,
  author: EquipmentReviewer,
  authorNtrp: Schema.NullOr(Ntrp),
  rating: EquipmentRating,
  title: Schema.NullOr(Schema.String),
  body: Schema.NullOr(Schema.String),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
}) {}

/** An item with its rating summary and my own review. */
export class EquipmentDetail extends Schema.Class<EquipmentDetail>("EquipmentDetail")({
  id: EquipmentId,
  kind: EquipmentKind,
  brand: Schema.String,
  model: Schema.String,
  rating: EquipmentRatingSummary,
  myReview: Schema.NullOr(EquipmentReview),
  createdAt: Schema.DateFromString,
}) {}

export const EQUIPMENT_PAGE_DEFAULT = 30;
export const EQUIPMENT_PAGE_MAX = 100;

const EquipmentPageSize = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: EQUIPMENT_PAGE_MAX }),
);

/**
 * `GET /equipment` query. `q` matches brand and model, any words in any
 * order. `cursor` is the previous page's `nextCursor`.
 */
export const EquipmentQuery = {
  kind: Schema.optionalKey(EquipmentKind),
  q: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(100))),
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(EquipmentPageSize),
};

export type EquipmentQuery = Schema.Struct<typeof EquipmentQuery>["Type"];

/** One page of the catalog, by brand then model. */
export class EquipmentPage extends Schema.Class<EquipmentPage>("EquipmentPage")({
  items: Schema.Array(EquipmentSummary),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `GET /equipment/:id/reviews` query. */
export const EquipmentReviewsQuery = {
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(EquipmentPageSize),
};

export type EquipmentReviewsQuery = Schema.Struct<typeof EquipmentReviewsQuery>["Type"];

/** One page of other players' reviews of an item, newest first. Mine is on `EquipmentDetail`. */
export class EquipmentReviewsPage extends Schema.Class<EquipmentReviewsPage>(
  "EquipmentReviewsPage",
)({
  items: Schema.Array(EquipmentReview),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `POST /equipment` body. */
export const NewEquipment = Schema.Struct({
  kind: EquipmentKind,
  brand: EquipmentBrand,
  model: EquipmentModel,
});

export type NewEquipment = typeof NewEquipment.Type;

/** `PUT /equipment/:id/review` body. Leave out (or null) the title or text for a rating only. */
export const EquipmentReviewInput = Schema.Struct({
  rating: EquipmentRating,
  title: Schema.optionalKey(Schema.NullOr(EquipmentReviewTitle)),
  body: Schema.optionalKey(Schema.NullOr(EquipmentReviewBody)),
});

export type EquipmentReviewInput = typeof EquipmentReviewInput.Type;

/** No item with that id. */
export class EquipmentNotFound extends Schema.TaggedError<EquipmentNotFound>()(
  "EquipmentNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/**
 * The catalog already has that item (same kind, brand and model, ignoring
 * case and spacing). `id` is the existing item, so the app can open it.
 */
export class EquipmentExists extends Schema.TaggedError<EquipmentExists>()(
  "EquipmentExists",
  { id: EquipmentId },
  { httpApiStatus: 409 },
) {}

/** Too many items added in the last hour. */
export class EquipmentRateLimited extends Schema.TaggedError<EquipmentRateLimited>()(
  "EquipmentRateLimited",
  { message: Schema.String },
  { httpApiStatus: 429 },
) {}
