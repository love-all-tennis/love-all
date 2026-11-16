import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Authentication } from "./Auth";
import { CannotFollowSelf, FollowLimitReached, FollowedPlayers } from "./Follow";
import {
  HomePointRequired,
  InvalidCursor,
  PlayerId,
  PlayerNotFound,
  PlayerProfile,
  PlayersPage,
  PlayersQuery,
} from "./Player";
import { Availability, Me, ProfilePatch } from "./Profile";

export const Health = Schema.Struct({
  status: Schema.Literal("ok"),
});
export type Health = typeof Health.Type;

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Health }),
) {}

/** The signed-in player's own account, profile and availability. */
export class MeApi extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("get", "/me", { success: Me }))
  .add(HttpApiEndpoint.patch("update", "/me", { payload: ProfilePatch, success: Me }))
  .add(
    HttpApiEndpoint.put("replaceAvailability", "/me/availability", {
      payload: Availability,
      success: Availability,
    }),
  )
  /**
   * Records that the signed-in player confirmed they are 18 or older. The app
   * asks once, right after sign-up (or the first social sign-in). Calling it
   * again keeps the first confirmation time.
   */
  .add(HttpApiEndpoint.post("confirmAdult", "/me/adult-confirmation"))
  .middleware(Authentication) {}

/** Finding other players near me and viewing their profiles. */
export class PlayersApi extends HttpApiGroup.make("players")
  /** Players within the radius of my home point, nearest first, cursor-paginated. */
  .add(
    HttpApiEndpoint.get("search", "/players", {
      query: PlayersQuery,
      success: PlayersPage,
      error: [HomePointRequired, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/players/:id", {
      params: { id: PlayerId },
      success: PlayerProfile,
      error: PlayerNotFound,
    }),
  )
  .middleware(Authentication) {}

/**
 * Players I follow for later, so I can find them again without searching.
 * Following is private: the followed player isn't told, and nobody else sees
 * who I follow.
 */
export class FollowsApi extends HttpApiGroup.make("follows")
  .add(HttpApiEndpoint.get("list", "/me/follows", { success: FollowedPlayers }))
  /** Idempotent: following someone I already follow does nothing. */
  .add(
    HttpApiEndpoint.put("follow", "/players/:id/follow", {
      params: { id: PlayerId },
      error: [PlayerNotFound, CannotFollowSelf, FollowLimitReached],
    }),
  )
  /** Idempotent: unfollowing someone I don't follow does nothing. */
  .add(
    HttpApiEndpoint.delete("unfollow", "/players/:id/follow", {
      params: { id: PlayerId },
    }),
  )
  .middleware(Authentication) {}

/** The whole Love All API. Shared by the server and the mobile client. */
export class Api extends HttpApi.make("love-all")
  .add(SystemApi)
  .add(MeApi)
  .add(PlayersApi)
  .add(FollowsApi)
  .annotateMerge(OpenApi.annotations({ title: "Love All API" })) {}
