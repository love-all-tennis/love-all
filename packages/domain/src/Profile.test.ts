import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Availability, MAX_AVAILABILITY_BLOCKS, ProfilePatch } from "./index";

const decodePatch = Schema.decodeUnknownSync(ProfilePatch);
const decodeAvailability = Schema.decodeUnknownSync(Availability);

describe("ProfilePatch", () => {
  it("accepts a partial update and nulls", () => {
    expect(decodePatch({ ntrp: "3.5", bio: null, homePoint: { lat: 42.49, lng: -83.14 } })).toEqual(
      { ntrp: "3.5", bio: null, homePoint: { lat: 42.49, lng: -83.14 } },
    );
  });

  it("rejects an unknown NTRP level", () => {
    expect(() => decodePatch({ ntrp: "6.0" })).toThrow();
  });

  it("rejects an empty or padded display name", () => {
    expect(() => decodePatch({ displayName: "" })).toThrow();
    expect(() => decodePatch({ displayName: " Sam" })).toThrow();
  });

  it("rejects a search radius out of range", () => {
    expect(() => decodePatch({ searchRadiusKm: 0 })).toThrow();
    expect(() => decodePatch({ searchRadiusKm: 101 })).toThrow();
    expect(() => decodePatch({ searchRadiusKm: 2.5 })).toThrow();
  });

  it("rejects a point off the globe and a non-https photo", () => {
    expect(() => decodePatch({ homePoint: { lat: 91, lng: 0 } })).toThrow();
    expect(() => decodePatch({ photoUrl: "http://x.co/a.jpg" })).toThrow();
  });
});

describe("Availability", () => {
  it("accepts separate blocks, including two on one day", () => {
    const blocks = [
      { weekday: 2, startTime: "06:00", endTime: "08:00" },
      { weekday: 2, startTime: "18:00", endTime: "21:00" },
      { weekday: 7, startTime: "09:00", endTime: "12:00" },
    ];
    expect(decodeAvailability(blocks)).toEqual(blocks);
  });

  it("accepts back-to-back blocks", () => {
    expect(() =>
      decodeAvailability([
        { weekday: 1, startTime: "08:00", endTime: "10:00" },
        { weekday: 1, startTime: "10:00", endTime: "12:00" },
      ]),
    ).not.toThrow();
  });

  it("rejects overlapping blocks on the same day", () => {
    expect(() =>
      decodeAvailability([
        { weekday: 3, startTime: "18:00", endTime: "21:00" },
        { weekday: 3, startTime: "20:00", endTime: "22:00" },
      ]),
    ).toThrow(/overlap/);
  });

  it("rejects a block that ends before it starts", () => {
    expect(() =>
      decodeAvailability([{ weekday: 1, startTime: "21:00", endTime: "18:00" }]),
    ).toThrow();
  });

  it("rejects bad weekdays and times", () => {
    expect(() =>
      decodeAvailability([{ weekday: 0, startTime: "08:00", endTime: "09:00" }]),
    ).toThrow();
    expect(() =>
      decodeAvailability([{ weekday: 1, startTime: "8:00", endTime: "09:00" }]),
    ).toThrow();
    expect(() =>
      decodeAvailability([{ weekday: 1, startTime: "08:00", endTime: "24:00" }]),
    ).toThrow();
  });

  it("caps the number of blocks", () => {
    const blocks = Array.from({ length: MAX_AVAILABILITY_BLOCKS + 1 }, (_, i) => ({
      weekday: (i % 7) + 1,
      startTime: `${String(Math.floor(i / 7)).padStart(2, "0")}:00`,
      endTime: `${String(Math.floor(i / 7)).padStart(2, "0")}:30`,
    }));
    expect(() => decodeAvailability(blocks)).toThrow();
  });
});
