import { Schema } from "effect";
import { Ntrp } from "./Profile";
import { PlayerId } from "./Player";

/**
 * A player I follow for later, as my saved list shows them. `distanceKm` is
 * whole kilometres (at least 1), or null when either of us has no home point.
 */
export class FollowedPlayer extends Schema.Class<FollowedPlayer>("FollowedPlayer")({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  ntrp: Schema.NullOr(Ntrp),
  playsSingles: Schema.Boolean,
  playsDoubles: Schema.Boolean,
  playsHitting: Schema.Boolean,
  distanceKm: Schema.NullOr(Schema.Int),
}) {}

/** Following a player is capped so the saved list stays one short page. */
export const MAX_FOLLOWS = 200;

/** `GET /me/follows`: everyone I follow, most recently followed first. */
export class FollowedPlayers extends Schema.Class<FollowedPlayers>("FollowedPlayers")({
  items: Schema.Array(FollowedPlayer),
}) {}

/** You can't follow yourself. */
export class CannotFollowSelf extends Schema.TaggedError<CannotFollowSelf>()(
  "CannotFollowSelf",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** Already following `MAX_FOLLOWS` players: unfollow someone first. */
export class FollowLimitReached extends Schema.TaggedError<FollowLimitReached>()(
  "FollowLimitReached",
  { limit: Schema.Int },
  { httpApiStatus: 409 },
) {}
