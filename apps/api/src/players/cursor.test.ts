import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { decodeCursor, displayKm, encodeCursor } from "./cursor";

describe("players cursor", () => {
  it("round-trips the exact distance and id", () => {
    const cursor = { distanceM: 1112.4508528727, id: "user_abc-123" };
    const token = encodeCursor(cursor);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(token)).toEqual(Option.some(cursor));
  });

  it("rejects tokens it didn't make", () => {
    const base64url = (value: string) => Buffer.from(value).toString("base64url");
    for (const token of [
      "",
      "not base64!",
      base64url("hello"),
      base64url("{}"),
      base64url('["1", "a"]'),
      base64url('[-1, "a"]'),
      base64url('[1, ""]'),
    ]) {
      expect(decodeCursor(token), token).toEqual(Option.none());
    }
  });
});

describe("displayKm", () => {
  it("rounds to whole kilometres and never shows 0", () => {
    expect(displayKm(0)).toBe(1);
    expect(displayKm(400)).toBe(1);
    expect(displayKm(1499)).toBe(1);
    expect(displayKm(1500)).toBe(2);
    expect(displayKm(29_870)).toBe(30);
  });
});
