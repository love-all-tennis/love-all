import type {
  EquipmentKind,
  EquipmentQuery,
  EquipmentReviewInput,
  NewEquipment,
} from "@love-all/domain";
import { Effect, type Types } from "effect";

import { callApi } from "@/lib/api";

/**
 * Gear review calls. A call that can be refused for a reason the player can
 * act on resolves to `{ refusal }` with copy to show; a network failure
 * rejects, and the screen says to try again.
 */
export type Outcome<A> = { readonly ok: A } | { readonly refusal: string };

const GONE = "This item is no longer in the catalog.";

export const fetchCatalog = (filter: {
  readonly kind: EquipmentKind | null;
  readonly q: string;
  readonly cursor?: string;
}) => {
  const q = filter.q.trim();

  const query: Types.Mutable<EquipmentQuery> = {};

  if (filter.kind) query.kind = filter.kind;

  if (q) query.q = q.slice(0, 100);

  if (filter.cursor) query.cursor = filter.cursor;

  return callApi((api) => api.equipment.list({ query }));
};

/** The item with its ratings and my review, or null when it's gone. */
export const fetchItem = (id: string) =>
  callApi((api) =>
    api.equipment
      .get({ params: { id } })
      .pipe(Effect.catchTag("EquipmentNotFound", () => Effect.succeed(null))),
  );

/** A page of other players' reviews, or null when the item is gone. */
export const fetchReviews = (id: string, cursor?: string) =>
  callApi((api) =>
    api.equipment
      .listReviews({ params: { id }, query: cursor ? { cursor } : {} })
      .pipe(Effect.catchTag("EquipmentNotFound", () => Effect.succeed(null))),
  );

/**
 * Adds an item. When the catalog already has it, resolves to `{ existing }`
 * with its id, so the screen can open it instead.
 */
export const addItem = (input: NewEquipment) =>
  callApi((api) =>
    api.equipment.create({ payload: input }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        EquipmentExists: (e) => Effect.succeed({ existing: e.id }),
        EquipmentRateLimited: (e) => Effect.succeed({ refusal: e.message }),
      }),
    ),
  );

export const saveReview = (id: string, input: EquipmentReviewInput) =>
  callApi((api) =>
    api.equipment.saveReview({ params: { id }, payload: input }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTag("EquipmentNotFound", () => Effect.succeed({ refusal: GONE })),
    ),
  );

export const deleteReview = (id: string) =>
  callApi((api) => api.equipment.deleteReview({ params: { id } }));
