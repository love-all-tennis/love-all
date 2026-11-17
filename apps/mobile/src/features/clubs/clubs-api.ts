import type { Club, ClubReview, ClubReviewsPage, ClubSummary, NewClub } from "@love-all/domain";
import { Effect } from "effect";

import { callApi } from "@/lib/api";

/**
 * Club calls. A call that can be refused for a reason the player can act on
 * resolves to `{ refusal }` with copy to show; a network failure rejects,
 * and the screen says to try again.
 */
export type Outcome<A> = { readonly ok: A } | { readonly refusal: string };

const refuse = (refusal: string) => Effect.succeed<{ refusal: string }>({ refusal });

const GONE = "This club is no longer listed.";

/** Clubs near my home point, or `needsHome` when I haven't set one. */
export const fetchClubs = (
  q: string,
): Promise<{ readonly clubs: ReadonlyArray<ClubSummary> } | { readonly needsHome: true }> =>
  callApi((api) =>
    api.clubs.list({ query: q ? { q } : {} }).pipe(
      Effect.map((clubs) => ({ clubs })),
      Effect.catchTag("HomePointRequired", () => Effect.succeed({ needsHome: true as const })),
    ),
  );

/** The club, or null when it's gone. */
export const fetchClub = (id: string): Promise<Club | null> =>
  callApi((api) =>
    api.clubs
      .get({ params: { id } })
      .pipe(Effect.catchTag("ClubNotFound", () => Effect.succeed(null))),
  );

/** A page of the club's reviews, or null when the club is gone. */
export const fetchReviews = (id: string, cursor?: string): Promise<ClubReviewsPage | null> =>
  callApi((api) =>
    api.clubs
      .listReviews({ params: { id }, query: cursor ? { cursor } : {} })
      .pipe(Effect.catchTag("ClubNotFound", () => Effect.succeed(null))),
  );

/**
 * Adds a club. When the same name is already pinned nearby, resolves to
 * `{ existing }` with that club, so the screen can offer to open it.
 */
export const createClub = (
  input: NewClub,
): Promise<Outcome<Club> | { readonly existing: { readonly id: string; readonly name: string } }> =>
  callApi((api) =>
    api.clubs.create({ payload: input }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        ClubAlreadyExists: (e) => Effect.succeed({ existing: { id: e.id, name: e.name } }),
        ClubRateLimited: (e) => refuse(e.message),
      }),
    ),
  );

type ReviewListener = (clubId: string) => void;
const reviewListeners = new Set<ReviewListener>();

/**
 * Called after I save or delete a review, so the club's page updates when
 * the review sheet closes (form sheets don't reliably refocus the screen
 * under them).
 */
export const onReviewChanged = (listener: ReviewListener): (() => void) => {
  reviewListeners.add(listener);
  return () => reviewListeners.delete(listener);
};

/** Tells an open club page to reload, after a change made somewhere else (blocking a reviewer, say). */
export const announce = (clubId: string) => {
  for (const listener of reviewListeners) listener(clubId);
};

export const saveReview = (
  clubId: string,
  input: { readonly rating: number; readonly body: string | null },
): Promise<Outcome<ClubReview>> =>
  callApi((api) =>
    api.clubs.saveReview({ params: { id: clubId }, payload: input }).pipe(
      Effect.tap(() => Effect.sync(() => announce(clubId))),
      Effect.map((ok) => ({ ok })),
      Effect.catchTag("ClubNotFound", () => refuse(GONE)),
    ),
  );

export const deleteReview = (clubId: string): Promise<Outcome<null>> =>
  callApi((api) =>
    api.clubs.deleteReview({ params: { id: clubId } }).pipe(
      Effect.tap(() => Effect.sync(() => announce(clubId))),
      Effect.as({ ok: null }),
    ),
  );
