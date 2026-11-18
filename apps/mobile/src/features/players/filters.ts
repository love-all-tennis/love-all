/**
 * The "find players" filters, kept free of React Native so they can be unit
 * tested. The list screen holds a `PlayerFilters` and turns it into the
 * `GET /players` query with `toPlayersQuery`.
 */

import type { Availability, Ntrp, PlayersQuery, PlayKind, Profile } from "@love-all/domain";
import type { Types } from "effect";

import { milesToKm, nearestMiles, radiusLabel } from "../../lib/distance";

import { NTRP_LEVELS, ntrpLabel } from "../profile/draft";

/** The kinds of tennis a player can be open to. */
export const PLAY_KINDS = [
  { kind: "singles", label: "Singles" },
  { kind: "doubles", label: "Doubles" },
  { kind: "hitting", label: "Hitting" },
] as const satisfies ReadonlyArray<{ kind: PlayKind; label: string }>;
export type { PlayKind };

/**
 * Distances the list offers, in miles. The API takes 1 to 100 km, and 50 mi
 * is about 80 km, so every option fits.
 */
export const RADIUS_OPTIONS_MI: ReadonlyArray<number> = [5, 10, 15, 25, 50];

/** Where the list starts for a player with no saved radius. */
const DEFAULT_RADIUS_MI = 10;

export type PlayerFilters = {
  /** Shown in miles; sent to the API in km by `toPlayersQuery`. */
  readonly radiusMi: number;
  readonly levelMin: Ntrp;
  readonly levelMax: Ntrp;
  /** Null means any. The API filters on one kind at a time. */
  readonly plays: PlayKind | null;
};

const levelIndex = (level: Ntrp): number => NTRP_LEVELS.indexOf(level);
const levelAt = (index: number): Ntrp =>
  NTRP_LEVELS[Math.min(Math.max(index, 0), NTRP_LEVELS.length - 1)]!;

/**
 * Where the list starts: my own search radius (as the nearest mile option), and half a level either side
 * of my NTRP (the whole range if I haven't set one).
 */
export const defaultFilters = (profile: Profile | null): PlayerFilters => {
  const own = profile?.ntrp ?? null;
  const at = own ? levelIndex(own) : -1;
  return {
    radiusMi: profile ? nearestMiles(profile.searchRadiusKm, RADIUS_OPTIONS_MI) : DEFAULT_RADIUS_MI,
    levelMin: own ? levelAt(at - 1) : NTRP_LEVELS[0]!,
    levelMax: own ? levelAt(at + 1) : NTRP_LEVELS.at(-1)!,
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
  const wholeRange = filters.levelMin === NTRP_LEVELS[0] && filters.levelMax === NTRP_LEVELS.at(-1);
  const query: Types.Mutable<PlayersQuery> = { radiusKm: milesToKm(filters.radiusMi) };
  if (!wholeRange) {
    query.levelMin = filters.levelMin;
    query.levelMax = filters.levelMax;
  }
  if (filters.plays) {
    query.plays = filters.plays;
  }
  if (cursor) {
    query.cursor = cursor;
  }
  return query;
};

/** "3.0 to 4.0", or a single level when both ends match. */
export const levelRangeLabel = ({ levelMin, levelMax }: PlayerFilters): string =>
  levelMin === levelMax ? ntrpLabel(levelMin) : `${ntrpLabel(levelMin)} to ${ntrpLabel(levelMax)}`;

/** One line for the collapsed filter bar, such as "Within 10 mi · 3.0 to 4.0 · Singles". */
export const filtersSummary = (filters: PlayerFilters): string => {
  const plays = PLAY_KINDS.find((p) => p.kind === filters.plays)?.label ?? "Any play";
  return `${radiusLabel(filters.radiusMi)} · ${levelRangeLabel(filters)} · ${plays}`;
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

/** A 24-hour "HH:MM" as players say it: "17:00" is "5 PM", "06:30" is "6:30 AM". */
export const clockLabel = (time: string): string => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${hour} ${suffix}`
    : `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

/**
 * A player's weekly availability as one line per day, such as
 * "Tue: 5 PM–10 PM". Blocks arrive sorted by weekday, then start time.
 */
export const availabilityLines = (blocks: Availability): ReadonlyArray<string> => {
  const byDay = new Map<number, Array<string>>();
  for (const block of blocks) {
    const spans = byDay.get(block.weekday) ?? [];
    spans.push(`${clockLabel(block.startTime)}–${clockLabel(block.endTime)}`);
    byDay.set(block.weekday, spans);
  }
  return [...byDay].map(([weekday, spans]) => `${DAY_NAMES[weekday - 1]}: ${spans.join(", ")}`);
};
