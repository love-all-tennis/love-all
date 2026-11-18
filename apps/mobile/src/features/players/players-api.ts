import type { PlayersPage } from "@love-all/domain";
import { Effect } from "effect";

import { callApi } from "@/lib/api";
import { toPlayersQuery, type PlayerFilters } from "./filters";

/**
 * One page of nearby players, or `needsHomePoint` when I haven't set where
 * I play from yet (the API can't measure distance without it).
 */
export type SearchResult =
  | { readonly kind: "page"; readonly page: PlayersPage }
  | { readonly kind: "needsHomePoint" };

export const searchPlayers = (filters: PlayerFilters, cursor?: string) =>
  callApi((api) =>
    api.players.search({ query: toPlayersQuery(filters, cursor) }).pipe(
      Effect.map((page) => ({ kind: "page", page }) satisfies SearchResult),
      Effect.catchTag("HomePointRequired", () =>
        Effect.succeed<SearchResult>({ kind: "needsHomePoint" }),
      ),
    ),
  );

/** Another player's profile, or null when they don't exist (or can't be shown). */
export const fetchPlayer = (id: string) =>
  callApi((api) =>
    api.players
      .get({ params: { id } })
      .pipe(Effect.catchTag("PlayerNotFound", () => Effect.succeed(null))),
  );

export const fetchFollows = () => callApi((api) => api.follows.list());

/**
 * Follows or unfollows a player. Resolves to a message to show when the
 * server said no for a reason the player can act on, otherwise null.
 */
export const setFollowing = (id: string, following: boolean) =>
  following
    ? callApi((api) =>
        api.follows.follow({ params: { id } }).pipe(
          Effect.as(null),
          Effect.catchTags({
            FollowLimitReached: (e) =>
              Effect.succeed(`You can follow up to ${e.limit} players. Unfollow someone first.`),
            PlayerNotFound: () => Effect.succeed("This player is no longer available."),
            CannotFollowSelf: () => Effect.succeed("That's you!"),
          }),
        ),
      )
    : callApi((api) => api.follows.unfollow({ params: { id } }).pipe(Effect.as(null)));
