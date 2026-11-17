import { Schema } from "effect";
import { PlayerId } from "./Player";
import { LatLng } from "./Profile";

/**
 * Clubs and their reviews. A club is any place with tennis courts that
 * players add: a park, a public tennis center or a private club. Each player
 * can leave one review per club (stars and an optional note) and change it
 * later. Clubs are public places, so their pins are stored as given.
 */

export const ClubId = Schema.String.check(Schema.isUUID());
export type ClubId = typeof ClubId.Type;

export const ClubReviewId = Schema.String.check(Schema.isUUID());
export type ClubReviewId = typeof ClubReviewId.Type;

export const CLUB_NAME_MAX = 100;
export const CLUB_ADDRESS_MAX = 200;
export const CLUB_REVIEW_BODY_MAX = 2000;

export const ClubName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, CLUB_NAME_MAX),
);
export const ClubAddress = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, CLUB_ADDRESS_MAX),
);
export const ClubReviewBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, CLUB_REVIEW_BODY_MAX),
);

/**
 * Who can play there:
 * - `free`: public courts anyone can walk on to, like a park.
 * - `pay_to_play`: open to the public for a court fee.
 * - `members_only`: a private club.
 *
 * Adding a kind is a one-line change here (plus a migration for the
 * database enum).
 */
export const CLUB_ACCESS = ["free", "pay_to_play", "members_only"] as const;
export const ClubAccess = Schema.Literals(CLUB_ACCESS);
export type ClubAccess = typeof ClubAccess.Type;

/** Whole stars, 1 to 5. */
export const ClubRating = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }));
export type ClubRating = typeof ClubRating.Type;

/**
 * Limits per player, to blunt spam. Clubs a player added still count after
 * the club is gone.
 */
export const CLUBS_PER_DAY = 5;

/**
 * Two clubs with the same name (ignoring case) closer than this are taken to
 * be the same place, and adding the second one fails with the first one's id.
 */
export const CLUB_DUPLICATE_RADIUS_KM = 1;

/** The most clubs one list returns. Lists are nearest first, so far ones fall off. */
export const CLUBS_LIST_MAX = 100;

/** How far `GET /clubs` looks when no radius is given: farther than players, since people drive to clubs. */
export const CLUBS_RADIUS_DEFAULT_KM = 40;
export const ClubsRadiusKm = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 160 }));

/**
 * A club's stars from players I can see (reviews by players blocked either
 * way with me, or hidden by a moderator, don't count). `average` is rounded
 * to one decimal and is null while nobody has reviewed it.
 */
export const ClubRatingSummary = Schema.Struct({
  average: Schema.NullOr(Schema.Number),
  count: Schema.Int,
});
export type ClubRatingSummary = typeof ClubRatingSummary.Type;

/** A club as it shows in a list. */
export class ClubSummary extends Schema.Class<ClubSummary>("ClubSummary")({
  id: ClubId,
  name: Schema.String,
  address: Schema.NullOr(Schema.String),
  point: LatLng,
  access: ClubAccess,
  indoorCourts: Schema.Boolean,
  /** Whole kilometres (at least 1) from my home point, or null when I haven't set one. */
  distanceKm: Schema.NullOr(Schema.Int),
  rating: ClubRatingSummary,
}) {}

/** Who wrote a review, as shown next to it. */
export const ClubReviewAuthor = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
});
export type ClubReviewAuthor = typeof ClubReviewAuthor.Type;

/** One player's review of a club. */
export class ClubReview extends Schema.Class<ClubReview>("ClubReview")({
  id: ClubReviewId,
  clubId: ClubId,
  author: ClubReviewAuthor,
  rating: ClubRating,
  body: Schema.NullOr(Schema.String),
  /** True on my own review. */
  mine: Schema.Boolean,
  createdAt: Schema.DateFromString,
  /** Later than `createdAt` once the author has changed it. */
  updatedAt: Schema.DateFromString,
}) {}

/** A club with everything its page shows above the reviews. */
export class Club extends Schema.Class<Club>("Club")({
  id: ClubId,
  name: Schema.String,
  address: Schema.NullOr(Schema.String),
  point: LatLng,
  access: ClubAccess,
  indoorCourts: Schema.Boolean,
  distanceKm: Schema.NullOr(Schema.Int),
  rating: ClubRatingSummary,
  /** How many reviews gave 1, 2, 3, 4 and 5 stars, in that order. */
  ratingCounts: Schema.Array(Schema.Int),
  /** My review, or null when I haven't written one. */
  myReview: Schema.NullOr(ClubReview),
  createdAt: Schema.DateFromString,
}) {}

/**
 * `GET /clubs` query. Nearest first, from my home point.
 * - `q` keeps clubs whose name or address contains it (any case).
 * - `radiusKm` defaults to `CLUBS_RADIUS_DEFAULT_KM`.
 */
export const ClubsQuery = {
  q: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(CLUB_NAME_MAX))),
  radiusKm: Schema.optionalKey(ClubsRadiusKm),
};
export type ClubsQuery = Schema.Struct<typeof ClubsQuery>["Type"];

/** `POST /clubs` body. */
export const NewClub = Schema.Struct({
  name: ClubName,
  address: Schema.optionalKey(Schema.NullOr(ClubAddress)),
  point: LatLng,
  access: ClubAccess,
  indoorCourts: Schema.optionalKey(Schema.Boolean),
});
export type NewClub = typeof NewClub.Type;

/** `PUT /clubs/:id/review` body: my review, written or replaced. */
export const ClubReviewInput = Schema.Struct({
  rating: ClubRating,
  body: Schema.optionalKey(Schema.NullOr(ClubReviewBody)),
});
export type ClubReviewInput = typeof ClubReviewInput.Type;

export const CLUB_REVIEWS_PAGE_DEFAULT = 20;
export const CLUB_REVIEWS_PAGE_MAX = 50;

/** `GET /clubs/:id/reviews` query. `cursor` is the previous page's `nextCursor`. */
export const ClubReviewsQuery = {
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: CLUB_REVIEWS_PAGE_MAX })),
  ),
};
export type ClubReviewsQuery = Schema.Struct<typeof ClubReviewsQuery>["Type"];

/** One page of a club's reviews, newest first. */
export class ClubReviewsPage extends Schema.Class<ClubReviewsPage>("ClubReviewsPage")({
  items: Schema.Array(ClubReview),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** No club with that id. */
export class ClubNotFound extends Schema.TaggedError<ClubNotFound>()(
  "ClubNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** A club with the same name is already on the map nearby. `id` is that club, to open instead. */
export class ClubAlreadyExists extends Schema.TaggedError<ClubAlreadyExists>()(
  "ClubAlreadyExists",
  { id: ClubId, name: Schema.String },
  { httpApiStatus: 409 },
) {}

/** Too many clubs added in the last day. */
export class ClubRateLimited extends Schema.TaggedError<ClubRateLimited>()(
  "ClubRateLimited",
  { message: Schema.String },
  { httpApiStatus: 429 },
) {}
