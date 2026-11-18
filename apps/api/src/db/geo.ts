/** A longitude/latitude pair in WGS 84 (SRID 4326), as Drizzle maps PostGIS points. */
export interface LngLat {
  readonly x: number;
  readonly y: number;
}

/**
 * Home locations are stored to two decimal places, about 1 km of latitude.
 * That is enough for "players within 15 km" and never pins down an address.
 * The `profile_home_point_rounded` check constraint enforces the same rule.
 */
export const HOME_POINT_DECIMALS = 2;

const factor = 10 ** HOME_POINT_DECIMALS;
const round = (n: number) => Math.round(n * factor) / factor;

/** Rounds a point to the precision we store for a player's home. */
export const roundHomePoint = (point: LngLat) => ({ x: round(point.x), y: round(point.y) });
