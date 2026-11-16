import { Profile } from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import {
  availabilityLines,
  defaultFilters,
  distanceLabel,
  filtersSummary,
  playsLabel,
  setLevelBound,
  togglePlay,
  toPlayersQuery,
  type PlayerFilters,
} from "./filters";

const profile = (fields: Partial<ConstructorParameters<typeof Profile>[0]> = {}) =>
  new Profile({
    displayName: "Sam",
    photoUrl: null,
    homePoint: { lat: 42.33, lng: -83.05 },
    metro: null,
    searchRadiusKm: 25,
    ntrp: "3.5",
    handedness: null,
    playsSingles: true,
    playsDoubles: false,
    playsHitting: false,
    bio: null,
    ...fields,
  });

const base: PlayerFilters = { radiusKm: 15, levelMin: "3.0", levelMax: "4.0", plays: null };

describe("defaultFilters", () => {
  it("starts at my radius and half a level either side of my NTRP", () => {
    expect(defaultFilters(profile())).toEqual({
      radiusKm: 25,
      levelMin: "3.0",
      levelMax: "4.0",
      plays: null,
    });
  });

  it("clamps the range at the ends of the scale", () => {
    expect(defaultFilters(profile({ ntrp: "2.5" }))).toMatchObject({
      levelMin: "2.5",
      levelMax: "3.0",
    });
    expect(defaultFilters(profile({ ntrp: "5.5" }))).toMatchObject({
      levelMin: "5.0",
      levelMax: "5.5",
    });
  });

  it("covers every level when I have no rating or no profile", () => {
    expect(defaultFilters(profile({ ntrp: null }))).toMatchObject({
      levelMin: "2.5",
      levelMax: "5.5",
    });
    expect(defaultFilters(null)).toEqual({
      radiusKm: 15,
      levelMin: "2.5",
      levelMax: "5.5",
      plays: null,
    });
  });
});

describe("setLevelBound", () => {
  it("moves one end", () => {
    expect(setLevelBound(base, "min", "3.5")).toMatchObject({ levelMin: "3.5", levelMax: "4.0" });
    expect(setLevelBound(base, "max", "5.0")).toMatchObject({ levelMin: "3.0", levelMax: "5.0" });
  });

  it("drags the other end along instead of crossing it", () => {
    expect(setLevelBound(base, "min", "4.5")).toMatchObject({ levelMin: "4.5", levelMax: "4.5" });
    expect(setLevelBound(base, "max", "2.5")).toMatchObject({ levelMin: "2.5", levelMax: "2.5" });
  });
});

describe("togglePlay", () => {
  it("picks one kind, and tapping it again goes back to any", () => {
    const singles = togglePlay(base, "singles");
    expect(singles.plays).toBe("singles");
    expect(togglePlay(singles, "hitting").plays).toBe("hitting");
    expect(togglePlay(singles, "singles").plays).toBeNull();
  });
});

describe("toPlayersQuery", () => {
  it("sends the radius, a narrowed level range, the play kind and the cursor", () => {
    expect(toPlayersQuery({ ...base, plays: "doubles" }, "c1")).toEqual({
      radiusKm: 15,
      levelMin: "3.0",
      levelMax: "4.0",
      plays: "doubles",
      cursor: "c1",
    });
  });

  it("leaves out the level bounds for the whole range, so unrated players still show", () => {
    expect(toPlayersQuery({ ...base, levelMin: "2.5", levelMax: "5.5" })).toEqual({
      radiusKm: 15,
    });
  });
});

describe("labels", () => {
  it("summarizes the filters in one line", () => {
    expect(filtersSummary(base)).toBe("Within 15 km · 3.0 to 4.0 · Any play");
    expect(filtersSummary({ ...base, levelMin: "5.5", levelMax: "5.5", plays: "hitting" })).toBe(
      "Within 15 km · 5.5+ · Hitting",
    );
  });

  it("describes distance, with no false precision under the 1 km rounding", () => {
    expect(distanceLabel(1)).toBe("About 1 km away");
    expect(distanceLabel(12)).toBe("12 km away");
    expect(distanceLabel(null)).toBeNull();
  });

  it("lists what a player is open to", () => {
    expect(playsLabel({ playsSingles: true, playsDoubles: false, playsHitting: true })).toBe(
      "Singles, Hitting",
    );
    expect(playsLabel({ playsSingles: false, playsDoubles: false, playsHitting: false })).toBe(
      "Not set",
    );
  });

  it("groups availability by day", () => {
    expect(
      availabilityLines([
        { weekday: 2, startTime: "06:00", endTime: "12:00" },
        { weekday: 2, startTime: "17:00", endTime: "22:00" },
        { weekday: 6, startTime: "06:00", endTime: "12:00" },
      ]),
    ).toEqual(["Tue: 06:00 to 12:00, 17:00 to 22:00", "Sat: 06:00 to 12:00"]);
  });
});
