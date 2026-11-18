/**
 * Distances for players to read. The API and the database stay metric
 * (`radiusKm`, `distanceKm`), and v1 is US only, so the app converts to miles
 * here, at the edge, and never shows km.
 *
 * Plain TypeScript with no React Native imports, so it can be unit tested.
 */

export const KM_PER_MILE = 1.609344;

export const kmToMiles = (km: number) => km / KM_PER_MILE;

/** Whole km for the API, which takes integer radii. */
export const milesToKm = (miles: number) => Math.round(miles * KM_PER_MILE);

/**
 * How far away another player is, for a list row or a profile. Home points
 * are rounded to about 1 km, so anything that rounds to a mile or less reads
 * "About 1 mi away" rather than a false fraction.
 */
export const distanceLabel = (km: number | null) => {
  if (km === null) return null;
  const miles = Math.round(kmToMiles(km));

  return miles <= 1 ? "About 1 mi away" : `${miles} mi away`;
};

/** A search radius: "Within 10 mi". */
export const radiusLabel = (miles: number) => `Within ${miles} mi`;

/** The option in `options` closest to `km`, for starting a picker from a saved metric radius. */
export const nearestMiles = (km: number, options: ReadonlyArray<number>) => {
  const miles = kmToMiles(km);

  return options.reduce((best, option) =>
    Math.abs(option - miles) < Math.abs(best - miles) ? option : best,
  );
};
