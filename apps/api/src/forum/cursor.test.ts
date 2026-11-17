import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  decodeRepliesCursor,
  decodeThreadsCursor,
  encodeRepliesCursor,
  encodeThreadsCursor,
} from "./cursor";

const id = "0b6f0c1e-3a0e-4c55-9a3e-6c1f3b2a9d10";

describe("forum cursors", () => {
  it("round-trips a threads cursor", () => {
    const cursor = { lastPostAt: 1_763_000_000_123, id };
    expect(decodeThreadsCursor(encodeThreadsCursor(cursor))).toEqual(Option.some(cursor));
  });

  it("round-trips a replies cursor", () => {
    expect(decodeRepliesCursor(encodeRepliesCursor(id))).toEqual(Option.some(id));
  });

  it("rejects tokens it didn't make", () => {
    expect(Option.isNone(decodeThreadsCursor("not a cursor!"))).toBe(true);
    expect(Option.isNone(decodeThreadsCursor(encodeRepliesCursor(id)))).toBe(true);
    expect(Option.isNone(decodeThreadsCursor(encodeThreadsCursor({ lastPostAt: 1.5, id })))).toBe(
      true,
    );
    expect(Option.isNone(decodeRepliesCursor(encodeRepliesCursor("nope")))).toBe(true);
  });
});
