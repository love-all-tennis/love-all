import { Schema } from "effect";
import { Availability, Handedness, MetroSummary, Ntrp, SearchRadiusKm } from "./Profile";

/** A player's id is their account id, the same id that blocks and messages point at. */
export const PlayerId = Schema.String.check(Schema.isMinLength(1));
export type PlayerId = typeof PlayerId.Type;

/** A kind of tennis a player is open to: the `plays*` flags on a profile. */
export const PlayKind = Schema.Literals(["singles", "doubles", "hitting"]);
export type PlayKind = typeof PlayKind.Type;

export const PLAYERS_PAGE_DEFAULT = 20;
export const PLAYERS_PAGE_MAX = 50;
export const PlayersPageSize = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: PLAYERS_PAGE_MAX }),
);

/**
 * `GET /players` query. Everything is optional:
 * - `radiusKm` defaults to my own search radius.
 * - `levelMin` and `levelMax` are inclusive NTRP bounds. Players with no
 *   rating are left out when either is set.
 * - `plays` keeps players open to that kind of tennis.
 * - `cursor` is the `nextCursor` of the previous page.
 */
export const PlayersQuery = {
  radiusKm: Schema.optionalKey(SearchRadiusKm),
  levelMin: Schema.optionalKey(Ntrp),
  levelMax: Schema.optionalKey(Ntrp),
  plays: Schema.optionalKey(PlayKind),
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(PlayersPageSize),
};
export type PlayersQuery = Schema.Struct<typeof PlayersQuery>["Type"];

/**
 * Another player as they appear in search results. Their home point is never
 * sent: only how far away they are, in whole kilometres (at least 1, since
 * home points are rounded to about 1 km anyway).
 */
export class PlayerSummary extends Schema.Class<PlayerSummary>("PlayerSummary")({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  metro: Schema.NullOr(MetroSummary),
  ntrp: Schema.NullOr(Ntrp),
  handedness: Schema.NullOr(Handedness),
  playsSingles: Schema.Boolean,
  playsDoubles: Schema.Boolean,
  playsHitting: Schema.Boolean,
  distanceKm: Schema.Int,
}) {}

/** One page of `GET /players`, nearest first. `nextCursor` is null on the last page. */
export class PlayersPage extends Schema.Class<PlayersPage>("PlayersPage")({
  items: Schema.Array(PlayerSummary),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/**
 * `GET /players/:id`: another player's public profile. `distanceKm` is null
 * when either of us has no home point yet.
 */
export class PlayerProfile extends Schema.Class<PlayerProfile>("PlayerProfile")({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  metro: Schema.NullOr(MetroSummary),
  ntrp: Schema.NullOr(Ntrp),
  handedness: Schema.NullOr(Handedness),
  playsSingles: Schema.Boolean,
  playsDoubles: Schema.Boolean,
  playsHitting: Schema.Boolean,
  bio: Schema.NullOr(Schema.String),
  availability: Availability,
  distanceKm: Schema.NullOr(Schema.Int),
}) {}

/** Search needs to know where I am: set a home point with `PATCH /me` first. */
export class HomePointRequired extends Schema.TaggedError<HomePointRequired>()(
  "HomePointRequired",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** No player with that id, or they haven't set up a profile. */
export class PlayerNotFound extends Schema.TaggedError<PlayerNotFound>()(
  "PlayerNotFound",
  { id: PlayerId },
  { httpApiStatus: 404 },
) {}

/** The `cursor` wasn't one this API handed out. */
export class InvalidCursor extends Schema.TaggedError<InvalidCursor>()(
  "InvalidCursor",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
