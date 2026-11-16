import { describe, expect, it } from "vite-plus/test";

import { distanceLabel, kmToMiles, milesToKm, nearestMiles, radiusLabel } from "./distance";

describe("distanceLabel", () => {
  it("says about 1 mi for anything that rounds to a mile or less", () => {
    expect(distanceLabel(1)).toBe("About 1 mi away");
    expect(distanceLabel(2)).toBe("About 1 mi away");
  });

  it("shows whole miles after that", () => {
    expect(distanceLabel(3)).toBe("2 mi away");
    expect(distanceLabel(16)).toBe("10 mi away");
    expect(distanceLabel(80)).toBe("50 mi away");
  });

  it("has nothing to say without a distance", () => {
    expect(distanceLabel(null)).toBeNull();
  });
});

describe("conversions", () => {
  it("turns miles into whole km for the API", () => {
    expect(milesToKm(10)).toBe(16);
    expect(milesToKm(50)).toBe(80);
  });

  it("turns km into miles", () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1);
  });

  it("picks the closest mile option for a saved km radius", () => {
    expect(nearestMiles(25, [5, 10, 15, 25])).toBe(15);
    expect(nearestMiles(15, [5, 10, 15, 25])).toBe(10);
    expect(nearestMiles(100, [5, 10, 15, 25, 50])).toBe(50);
  });
});

describe("radiusLabel", () => {
  it("reads as a search radius", () => {
    expect(radiusLabel(10)).toBe("Within 10 mi");
  });
});
