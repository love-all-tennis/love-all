import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { decodeCursor, encodeCursor } from "./cursor";

describe("message cursors", () => {
  it("round-trips a time and id", () => {
    const cursor = { at: 1_763_000_000_123, id: crypto.randomUUID() };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(Option.some(cursor));
  });

  it("rejects tokens it didn't make", () => {
    expect(Option.isNone(decodeCursor("not a cursor"))).toBe(true);
    expect(Option.isNone(decodeCursor(Buffer.from('[1.5,"x"]').toString("base64url")))).toBe(true);
    expect(Option.isNone(decodeCursor(Buffer.from("{}").toString("base64url")))).toBe(true);
  });
});
