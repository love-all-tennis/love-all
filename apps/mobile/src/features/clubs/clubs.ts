import {
  CLUB_ADDRESS_MAX,
  CLUB_NAME_MAX,
  CLUB_REVIEW_BODY_MAX,
  type ClubAccess,
  type ClubRatingSummary,
} from "@love-all/domain";

/**
 * Club reviews logic with no React Native imports, so it can be unit tested.
 * Screens and components in this folder build on it.
 */

/** How each kind of access reads, as a tag and as a choice when adding a club. */
export const ACCESS_LABELS: Record<ClubAccess, { readonly label: string; readonly hint: string }> =
  {
    free: { label: "Free public courts", hint: "Anyone can walk on, like a park." },
    pay_to_play: { label: "Pay to play", hint: "Open to the public for a court fee." },
    members_only: { label: "Members only", hint: "A private club." },
  };

/** The tags on a club's card and page: who can play there, then indoor courts if any. */
export const clubTags = (club: {
  readonly access: ClubAccess;
  readonly indoorCourts: boolean;
}): ReadonlyArray<string> => [
  ACCESS_LABELS[club.access].label,
  ...(club.indoorCourts ? ["Indoor courts"] : []),
];

/** "No reviews yet", "1 review", "12 reviews". */
export const reviewCountLabel = (count: number): string =>
  count === 0 ? "No reviews yet" : count === 1 ? "1 review" : `${count} reviews`;

/** "4.3", always with one decimal so a list lines up. */
export const averageLabel = (average: number): string => average.toFixed(1);

/** The rating as a screen reader says it: "Rated 4.3 out of 5 from 12 reviews". */
export const ratingAccessibilityLabel = (rating: ClubRatingSummary): string =>
  rating.average === null
    ? "No reviews yet"
    : `Rated ${averageLabel(rating.average)} out of 5 from ${reviewCountLabel(rating.count)}`;

/**
 * How many of five stars to fill for an average: rounded to the nearest whole
 * star, since the stars only show whole ones and the number shows the rest.
 */
export const filledStars = (average: number | null): number =>
  average === null ? 0 : Math.min(5, Math.max(0, Math.round(average)));

/** What each star means in the review sheet. */
export const STAR_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"] as const;

/** "4 stars, Very good". */
export const starChoiceLabel = (stars: number): string =>
  `${stars} ${stars === 1 ? "star" : "stars"}, ${STAR_WORDS[stars - 1]}`;

/**
 * Each row of the 5-to-1 breakdown on a club's page, from the API's 1-to-5
 * counts: the stars, how many, and the share of all reviews as 0 to 1.
 */
export const ratingBars = (
  counts: ReadonlyArray<number>,
): ReadonlyArray<{ readonly stars: number; readonly count: number; readonly share: number }> => {
  const total = counts.reduce((a, b) => a + b, 0);
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = counts[stars - 1] ?? 0;
    return { stars, count, share: total === 0 ? 0 : count / total };
  });
};

/** "Edited" when a review changed after it was first posted (a second's grace for the save itself). */
export const wasEdited = (review: {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): boolean => review.updatedAt.getTime() - review.createdAt.getTime() > 1000;

const lengthError = (text: string, what: string, min: number, max: number): string | null => {
  const length = text.trim().length;
  if (length < min) return `Enter a ${what}.`;
  if (length > max) return `Keep the ${what} to ${max} characters or fewer.`;
  return null;
};

/** The club's name: required. */
export const nameError = (text: string): string | null =>
  lengthError(text, "club name", 1, CLUB_NAME_MAX);

/** The address is optional, so only its length is checked. */
export const addressError = (text: string): string | null =>
  text.trim().length > CLUB_ADDRESS_MAX
    ? `Keep the address to ${CLUB_ADDRESS_MAX} characters or fewer.`
    : null;

/** The review's note is optional, so only its length is checked. */
export const noteError = (text: string): string | null =>
  text.trim().length > CLUB_REVIEW_BODY_MAX
    ? `Keep your review to ${CLUB_REVIEW_BODY_MAX} characters or fewer.`
    : null;

/** Trimmed text, or null when nothing's left: for the optional fields. */
export const optionalText = (text: string): string | null => {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/** "42 / 2000", shown under a field so the limit is clear before it's hit. */
export const lengthHint = (text: string, max: number): string => `${text.trim().length} / ${max}`;

/** Adds a page to a list without repeating any, keeping the order. */
export const mergeById = <T extends { readonly id: string }>(
  current: ReadonlyArray<T>,
  more: ReadonlyArray<T>,
): ReadonlyArray<T> => {
  const seen = new Set(current.map((x) => x.id));
  return [...current, ...more.filter((x) => !seen.has(x.id))];
};
