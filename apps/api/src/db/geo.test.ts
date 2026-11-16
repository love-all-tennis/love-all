import { describe, expect, it } from "vite-plus/test";
import { roundHomePoint } from "./geo";

describe("roundHomePoint", () => {
  it("rounds to two decimal places", () => {
    expect(roundHomePoint({ x: -83.045812, y: 42.331427 })).toEqual({ x: -83.05, y: 42.33 });
  });
});
