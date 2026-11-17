import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  decodeCatalogCursor,
  decodeReviewsCursor,
  encodeCatalogCursor,
  encodeReviewsCursor,
} from "./cursor";

const id = "0b6f0c1e-3a0e-4c55-9a3e-6c1f3b2a9d10";

describe("catalog cursor", () => {
  it("round-trips", () => {
    const cursor = { nameKey: "wilson blade 98 v9", id };
    expect(decodeCatalogCursor(encodeCatalogCursor(cursor))).toEqual(Option.some(cursor));
  });

  it("rejects tokens it didn't make", () => {
    expect(Option.isNone(decodeCatalogCursor("not a cursor"))).toBe(true);
    expect(Option.isNone(decodeCatalogCursor(encodeReviewsCursor({ createdAt: 1, id })))).toBe(
      true,
    );
    expect(
      Option.isNone(decodeCatalogCursor(Buffer.from('["x","nope"]').toString("base64url"))),
    ).toBe(true);
  });
});

describe("reviews cursor", () => {
  it("round-trips", () => {
    const cursor = { createdAt: 1_763_370_000_123, id };
    expect(decodeReviewsCursor(encodeReviewsCursor(cursor))).toEqual(Option.some(cursor));
  });

  it("rejects tokens it didn't make", () => {
    expect(Option.isNone(decodeReviewsCursor("%%"))).toBe(true);
    expect(Option.isNone(decodeReviewsCursor(encodeCatalogCursor({ nameKey: "a", id })))).toBe(
      true,
    );
    expect(
      Option.isNone(decodeReviewsCursor(Buffer.from(`[1.5,"${id}"]`).toString("base64url"))),
    ).toBe(true);
  });
});
