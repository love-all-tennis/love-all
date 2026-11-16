import { Schema } from "effect";
import { SessionUser } from "./Auth";

/** NTRP self-rating. "5.5" means 5.5 and up. Same levels, in order, as the `ntrp_level` enum. */
export const Ntrp = Schema.Literals(["2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5"]);
export type Ntrp = typeof Ntrp.Type;

export const Handedness = Schema.Literals(["right", "left"]);
export type Handedness = typeof Handedness.Type;

/**
 * A point on the map. Home points come back rounded to two decimals (about
 * 1 km), so they never pin down an address.
 */
export const LatLng = Schema.Struct({
  lat: Schema.Number.check(Schema.isBetween({ minimum: -90, maximum: 90 })),
  lng: Schema.Number.check(Schema.isBetween({ minimum: -180, maximum: 180 })),
});
export type LatLng = typeof LatLng.Type;

/** The launch area a profile falls in, derived from its home point. */
export const MetroSummary = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
});
export type MetroSummary = typeof MetroSummary.Type;

export const DisplayName = Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, 50));
export const Bio = Schema.String.check(Schema.isMaxLength(500));
export const SearchRadiusKm = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
export const PhotoUrl = Schema.String.check(Schema.isPattern(/^https:\/\/\S+$/));

/** What other players see about me, as I edit it. */
export class Profile extends Schema.Class<Profile>("Profile")({
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  homePoint: Schema.NullOr(LatLng),
  metro: Schema.NullOr(MetroSummary),
  searchRadiusKm: Schema.Int,
  ntrp: Schema.NullOr(Ntrp),
  handedness: Schema.NullOr(Handedness),
  playsSingles: Schema.Boolean,
  playsDoubles: Schema.Boolean,
  playsHitting: Schema.Boolean,
  bio: Schema.NullOr(Schema.String),
}) {}

/**
 * `PATCH /me` body. Every field is optional: only the ones sent change, and
 * `null` clears a nullable field. The first call creates the profile, with
 * the display name defaulting to the account name. The metro is not set
 * directly: it follows the home point.
 */
export const ProfilePatch = Schema.Struct({
  displayName: Schema.optionalKey(DisplayName),
  photoUrl: Schema.optionalKey(Schema.NullOr(PhotoUrl)),
  homePoint: Schema.optionalKey(Schema.NullOr(LatLng)),
  searchRadiusKm: Schema.optionalKey(SearchRadiusKm),
  ntrp: Schema.optionalKey(Schema.NullOr(Ntrp)),
  handedness: Schema.optionalKey(Schema.NullOr(Handedness)),
  playsSingles: Schema.optionalKey(Schema.Boolean),
  playsDoubles: Schema.optionalKey(Schema.Boolean),
  playsHitting: Schema.optionalKey(Schema.Boolean),
  bio: Schema.optionalKey(Schema.NullOr(Bio)),
});
export type ProfilePatch = typeof ProfilePatch.Type;

/** A 24-hour wall-clock time, "HH:MM", in the player's local time. */
export const TimeOfDay = Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/));

/** ISO 8601 weekday: 1 = Monday, 7 = Sunday. */
export const Weekday = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 7 }));

/** A weekly time block when I can usually play, such as Tuesday 18:00 to 21:00. */
export const AvailabilityBlock = Schema.Struct({
  weekday: Weekday,
  startTime: TimeOfDay,
  endTime: TimeOfDay,
}).check(
  Schema.makeFilter(
    (block) => block.endTime > block.startTime || "endTime must be after startTime",
  ),
);
export type AvailabilityBlock = typeof AvailabilityBlock.Type;

/** Most anyone needs is a few blocks a day; the cap keeps a bad client from writing thousands. */
export const MAX_AVAILABILITY_BLOCKS = 50;

const noOverlaps = Schema.makeFilter((blocks: ReadonlyArray<AvailabilityBlock>) => {
  const sorted = [...blocks].sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (prev.weekday === next.weekday && next.startTime < prev.endTime) {
      return `Blocks overlap on weekday ${next.weekday}: ${prev.startTime}-${prev.endTime} and ${next.startTime}-${next.endTime}`;
    }
  }
  return true;
});

/** `PUT /me/availability` body: the full weekly schedule, replacing what was there. */
export const Availability = Schema.Array(AvailabilityBlock).check(
  Schema.isMaxLength(MAX_AVAILABILITY_BLOCKS),
  noOverlaps,
);
export type Availability = typeof Availability.Type;

/**
 * `GET /me`: the account, my profile (null until onboarding saves it), and my
 * weekly availability, sorted by weekday then start time.
 */
export class Me extends Schema.Class<Me>("Me")({
  user: SessionUser,
  profile: Schema.NullOr(Profile),
  availability: Availability,
}) {}
