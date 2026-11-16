/**
 * The "find players" filters, kept free of React Native so they can be unit
 * tested. The list screen holds a `PlayerFilters` and turns it into the
 * `GET /players` query with `toPlayersQuery`.
 */

import type { Availability, Ntrp, PlayersQuery, PlayKind, Profile } from "@love-all/domain";

import { NTRP_LEVELS, ntrpLabel } from "../profile/draft";

/** The kinds of tennis a player can be open to. */
export const PLAY_KINDS = [
  { kind: "singles", label: "Singles" },
  { kind: "doubles", label: "Doubles" },
  { kind: "hitting", label: "Hitting" },
] as const satisfies ReadonlyArray<{ kind: PlayKind; label: string }>;
export type { PlayKind };

/** Distances the list offers, in km. The API accepts 1 to 100. */
export const RADIUS_OPTIONS_KM: ReadonlyArray<number> = [5, 10, 15, 25, 50, 100];

export type PlayerFilters = {
  readonly radiusKm: number;
  readonly levelMin: Ntrp;
  readonly levelMax: Ntrp;
  /** Null means any. The API filters on one kind at a time. */
  readonly plays: PlayKind | null;
};

const levelIndex = (level: Ntrp): number => NTRP_LEVELS.indexOf(level);
const levelAt = (index: number): Ntrp =>
  NTRP_LEVELS[Math.min(Math.max(index, 0), NTRP_LEVELS.length - 1)]!;

/**
 * Where the list starts: my own search radius, and half a level either side
 * of my NTRP (the whole range if I haven't set one).
 */
export const defaultFilters = (profile: Profile | null): PlayerFilters => {
  const own = profile?.ntrp ?? null;
  const at = own ? levelIndex(own) : -1;
  return {
    radiusKm: profile?.searchRadiusKm ?? 15,
    levelMin: own ? levelAt(at - 1) : NTRP_LEVELS[0]!,
    levelMax: own ? levelAt(at + 1) : NTRP_LEVELS[NTRP_LEVELS.length - 1]!,
    plays: null,
  };
};

/**
 * Sets one end of the level range. If it would cross the other end, the
 * other end moves with it, so the range is never empty.
 */
export const setLevelBound = (
  filters: PlayerFilters,
  bound: "min" | "max",
  level: Ntrp,
): PlayerFilters => {
  const at = levelIndex(level);
  if (bound === "min") {
    const max = levelIndex(filters.levelMax) < at ? level : filters.levelMax;
    return { ...filters, levelMin: level, levelMax: max };
  }
  const min = levelIndex(filters.levelMin) > at ? level : filters.levelMin;
  return { ...filters, levelMin: min, levelMax: level };
};

/** Picks a kind of tennis, or goes back to any when the picked one is tapped again. */
export const togglePlay = (filters: PlayerFilters, kind: PlayKind): PlayerFilters => ({
  ...filters,
  plays: filters.plays === kind ? null : kind,
});

/**
 * The `GET /players` query for these filters. The level bounds are only sent
 * when they narrow the range, because sending them leaves out players who
 * haven't rated themselves.
 */
export const toPlayersQuery = (filters: PlayerFilters, cursor?: string): PlayersQuery => {
  const wholeRange =
    filters.levelMin === NTRP_LEVELS[0] && filters.levelMax === NTRP_LEVELS[NTRP_LEVELS.length - 1];
  return {
    radiusKm: filters.radiusKm,
    ...(wholeRange ? {} : { levelMin: filters.levelMin, levelMax: filters.levelMax }),
    ...(filters.plays ? { plays: filters.plays } : {}),
    ...(cursor ? { cursor } : {}),
  };
};

/** "3.0 to 4.0", or a single level when both ends match. */
export const levelRangeLabel = ({ levelMin, levelMax }: PlayerFilters): string =>
  levelMin === levelMax ? ntrpLabel(levelMin) : `${ntrpLabel(levelMin)} to ${ntrpLabel(levelMax)}`;

/** One line for the collapsed filter bar, such as "Within 15 km · 3.0 to 4.0 · Singles". */
export const filtersSummary = (filters: PlayerFilters): string => {
  const plays = PLAY_KINDS.find((p) => p.kind === filters.plays)?.label ?? "Any play";
  return `Within ${filters.radiusKm} km · ${levelRangeLabel(filters)} · ${plays}`;
};

/**
 * A distance for a list row or profile. The API sends whole km, at least 1,
 * since home points are rounded to about 1 km: so 1 reads as "About 1 km".
 */
export const distanceLabel = (km: number | null): string | null => {
  if (km === null) return null;
  return km <= 1 ? "About 1 km away" : `${km} km away`;
};

/** What a player is open to, for a list row or a profile: "Singles, Doubles". */
export const playsLabel = (p: {
  readonly playsSingles: boolean;
  readonly playsDoubles: boolean;
  readonly playsHitting: boolean;
}): string => {
  const kinds = [
    p.playsSingles && "Singles",
    p.playsDoubles && "Doubles",
    p.playsHitting && "Hitting",
  ].filter((k): k is string => typeof k === "string");
  return kinds.length > 0 ? kinds.join(", ") : "Not set";
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * A player's weekly availability as one line per day, such as
 * "Tue: 17:00 to 22:00". Blocks arrive sorted by weekday, then start time.
 */
export const availabilityLines = (blocks: Availability): ReadonlyArray<string> => {
  const byDay = new Map<number, Array<string>>();
  for (const block of blocks) {
    const spans = byDay.get(block.weekday) ?? [];
    spans.push(`${block.startTime} to ${block.endTime}`);
    byDay.set(block.weekday, spans);
  }
  return [...byDay].map(([weekday, spans]) => `${DAY_NAMES[weekday - 1]}: ${spans.join(", ")}`);
};
