import { describe, expect, it } from "vite-plus/test";
import {
  emptyDraft,
  fromAvailabilityBlocks,
  roundPoint,
  slotKey,
  stepError,
  toAvailabilityBlocks,
  toggleSlot,
  toProfileUpdate,
  type ProfileDraft,
} from "./draft";

const ready: ProfileDraft = {
  ...emptyDraft("  Sam  "),
  homeArea: { kind: "pin", point: { lat: 42.33149, lng: -83.04575 } },
  ntrp: "3.5",
  handedness: "left",
  playsDoubles: true,
};

describe("stepError", () => {
  it("needs a display name of 1 to 50 characters", () => {
    expect(stepError(emptyDraft("   "), "basics")).not.toBeNull();
    expect(stepError(emptyDraft("x".repeat(51)), "basics")).not.toBeNull();
    expect(stepError(emptyDraft("Sam"), "basics")).toBeNull();
  });

  it("needs a home area", () => {
    expect(stepError(emptyDraft("Sam"), "home")).not.toBeNull();
    expect(stepError(ready, "home")).toBeNull();
  });

  it("needs a level, a hand and at least one way to play", () => {
    expect(stepError({ ...ready, ntrp: null }, "game")).toMatch(/NTRP/);
    expect(stepError({ ...ready, handedness: null }, "game")).toMatch(/hand/);
    expect(stepError({ ...ready, playsDoubles: false }, "game")).toMatch(/at least one/);
    expect(stepError(ready, "game")).toBeNull();
  });

  it("lets availability be empty", () => {
    expect(stepError(ready, "availability")).toBeNull();
  });
});

describe("roundPoint", () => {
  it("rounds to two decimals, about 1 km", () => {
    expect(roundPoint({ lat: 42.33149, lng: -83.04575 })).toEqual({ lat: 42.33, lng: -83.05 });
  });
});

describe("toProfileUpdate", () => {
  it("trims the name and rounds the home point", () => {
    expect(toProfileUpdate(ready)).toEqual({
      displayName: "Sam",
      homePoint: { lat: 42.33, lng: -83.05 },
      ntrp: "3.5",
      handedness: "left",
      playsSingles: false,
      playsDoubles: true,
      playsHitting: false,
    });
  });
});

describe("availability", () => {
  it("toggles a cell on and off", () => {
    const on = toggleSlot(ready, slotKey(2, "evening"));
    expect(on.slots).toEqual(["2-evening"]);
    expect(toggleSlot(on, slotKey(2, "evening")).slots).toEqual([]);
  });

  it("turns cells into blocks, merging back to back cells on a day", () => {
    expect(
      toAvailabilityBlocks(["6-afternoon", "1-evening", "6-morning", "3-morning", "3-evening"]),
    ).toEqual([
      { weekday: 1, startTime: "17:00", endTime: "22:00" },
      { weekday: 3, startTime: "06:00", endTime: "12:00" },
      { weekday: 3, startTime: "17:00", endTime: "22:00" },
      { weekday: 6, startTime: "06:00", endTime: "17:00" },
    ]);
  });

  it("round trips blocks through the grid", () => {
    const slots = ["1-morning", "1-afternoon", "1-evening", "7-evening"] as const;
    expect(fromAvailabilityBlocks(toAvailabilityBlocks(slots)).sort()).toEqual([...slots].sort());
  });

  it("lights every cell an odd block overlaps", () => {
    expect(
      fromAvailabilityBlocks([{ weekday: 4, startTime: "11:30:00", endTime: "13:00:00" }]).sort(),
    ).toEqual(["4-afternoon", "4-morning"]);
    expect(fromAvailabilityBlocks([{ weekday: 9, startTime: "08:00", endTime: "09:00" }])).toEqual(
      [],
    );
  });
});
