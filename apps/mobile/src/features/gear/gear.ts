import {
  EQUIPMENT_BRAND_MAX,
  EQUIPMENT_KINDS,
  EQUIPMENT_MODEL_MAX,
  EQUIPMENT_REVIEW_BODY_MAX,
  EQUIPMENT_REVIEW_TITLE_MAX,
  type EquipmentKind,
  type EquipmentRatingSummary,
  type EquipmentReviewInput,
} from "@love-all/domain";

/** How each kind reads on a chip or tag. */
export const KIND_LABELS: Record<EquipmentKind, string> = {
  racket: "Racket",
  strings: "Strings",
  shoes: "Shoes",
  balls: "Balls",
  bag: "Bag",
  other: "Other",
};

/** Kinds in the order the filter chips show them. */
export const KINDS: ReadonlyArray<EquipmentKind> = EQUIPMENT_KINDS;

/** "Wilson Blade 98". */
export const itemName = (item: { readonly brand: string; readonly model: string }): string =>
  `${item.brand} ${item.model}`;

/** "No reviews yet", "1 review", "12 reviews". */
export const reviewCountLabel = (count: number): string =>
  count === 0 ? "No reviews yet" : count === 1 ? "1 review" : `${count} reviews`;

/** "4.3 out of 5 · 12 reviews", or "No reviews yet". */
export const ratingLabel = (rating: EquipmentRatingSummary): string =>
  rating.average === null
    ? reviewCountLabel(0)
    : `${rating.average.toFixed(1)} out of 5 · ${reviewCountLabel(rating.count)}`;

/** "1 star", "4 stars". */
export const starsLabel = (stars: number): string => (stars === 1 ? "1 star" : `${stars} stars`);

/** Each star level's share of the reviews, 0 to 1, from 5 stars down, for the breakdown bars. */
export const starShares = (
  rating: EquipmentRatingSummary,
): ReadonlyArray<{ readonly stars: number; readonly count: number; readonly share: number }> =>
  [5, 4, 3, 2, 1].map((stars) => {
    const count = rating.stars[stars - 1] ?? 0;
    return { stars, count, share: rating.count === 0 ? 0 : count / rating.count };
  });

/** "NTRP 4.0" for the reviewer's level when they wrote it, or null without one. */
export const reviewerLevel = (ntrp: string | null): string | null =>
  ntrp === null ? null : `NTRP ${ntrp}`;

const lengthError = (text: string, what: string, max: number): string | null => {
  const value = text.trim();
  if (value.length === 0) return `Enter the ${what}`;
  if (value.length > max) return `Keep the ${what} to ${max} characters (${value.length} now)`;
  return null;
};

/** Field errors for adding an item, or nulls. */
export const newItemErrors = (input: {
  readonly kind: EquipmentKind | null;
  readonly brand: string;
  readonly model: string;
}) => ({
  kind: input.kind ? null : "Pick what kind of gear it is",
  brand: lengthError(input.brand, "brand", EQUIPMENT_BRAND_MAX),
  model: lengthError(input.model, "model", EQUIPMENT_MODEL_MAX),
});

const optionalLengthError = (text: string, what: string, max: number): string | null => {
  const length = text.trim().length;
  return length > max ? `Keep the ${what} to ${max} characters (${length} now)` : null;
};

/** Field errors for a review, or nulls. Title and text are optional. */
export const reviewErrors = (input: {
  readonly rating: number | null;
  readonly title: string;
  readonly body: string;
}) => ({
  rating: input.rating === null ? "Pick from 1 to 5 stars" : null,
  title: optionalLengthError(input.title, "title", EQUIPMENT_REVIEW_TITLE_MAX),
  body: optionalLengthError(input.body, "review", EQUIPMENT_REVIEW_BODY_MAX),
});

/** What to send for a review: trimmed, with blank title or text sent as null. */
export const reviewPayload = (input: {
  readonly rating: number;
  readonly title: string;
  readonly body: string;
}): EquipmentReviewInput => ({
  rating: input.rating,
  title: input.title.trim() || null,
  body: input.body.trim() || null,
});

/** "42 / 2000", shown under a field so the limit is clear before it's hit. */
export const lengthHint = (text: string, max: number): string => `${text.trim().length} / ${max}`;

/** Adds a page to a list without repeating any item, keeping the order. */
export const mergeById = <T extends { readonly id: string }>(
  current: ReadonlyArray<T>,
  more: ReadonlyArray<T>,
): ReadonlyArray<T> => {
  const seen = new Set(current.map((x) => x.id));
  return [...current, ...more.filter((x) => !seen.has(x.id))];
};
