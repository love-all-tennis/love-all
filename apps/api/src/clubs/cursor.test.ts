import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { decodeReviewsCursor, encodeReviewsCursor, likeContains } from "./cursor";

describe("reviews cursor", () => {
  it("round-trips", () => {
    const cursor = { createdAt: 1_763_370_000_123, id: "0b6f0c1e-3a0e-4c55-9a3e-6c1f3b2a9d10" };
    expect(decodeReviewsCursor(encodeReviewsCursor(cursor))).toEqual(Option.some(cursor));
  });

  it("rejects tokens it didn't make", () => {
    expect(Option.isNone(decodeReviewsCursor("not a cursor"))).toBe(true);
    expect(Option.isNone(decodeReviewsCursor(Buffer.from('[1.5,"x"]').toString("base64url")))).toBe(
      true,
    );
  });
});

describe("likeContains", () => {
  it("escapes wildcards", () => {
    expect(likeContains("100% clay_courts")).toBe(String.raw`%100\% clay\_courts%`);
  });
});
