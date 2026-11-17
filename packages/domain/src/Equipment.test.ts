import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  EQUIPMENT_BRAND_MAX,
  EQUIPMENT_REVIEW_BODY_MAX,
  EquipmentReviewInput,
  NewEquipment,
} from "./Equipment";

const decodeItem = Schema.decodeUnknownExit(NewEquipment);
const decodeReview = Schema.decodeUnknownExit(EquipmentReviewInput);

describe("NewEquipment", () => {
  it("accepts a known kind with a brand and model", () => {
    expect(decodeItem({ kind: "racket", brand: "Wilson", model: "Blade 98 v9" })._tag).toBe(
      "Success",
    );
  });

  it("rejects unknown kinds and empty, untrimmed or long names", () => {
    const base = { kind: "racket", brand: "Wilson", model: "Blade 98" };
    expect(decodeItem({ ...base, kind: "paddle" })._tag).toBe("Failure");
    expect(decodeItem({ ...base, brand: "" })._tag).toBe("Failure");
    expect(decodeItem({ ...base, model: " Blade " })._tag).toBe("Failure");
    expect(decodeItem({ ...base, brand: "x".repeat(EQUIPMENT_BRAND_MAX + 1) })._tag).toBe(
      "Failure",
    );
  });
});

describe("EquipmentReviewInput", () => {
  it("takes a rating alone, or with a title and text", () => {
    expect(decodeReview({ rating: 4 })._tag).toBe("Success");
    expect(decodeReview({ rating: 5, title: null, body: null })._tag).toBe("Success");
    expect(
      decodeReview({ rating: 1, title: "Arm pain", body: "y".repeat(EQUIPMENT_REVIEW_BODY_MAX) })
        ._tag,
    ).toBe("Success");
  });

  it("needs whole stars from 1 to 5 and non-empty text", () => {
    expect(decodeReview({ rating: 0 })._tag).toBe("Failure");
    expect(decodeReview({ rating: 6 })._tag).toBe("Failure");
    expect(decodeReview({ rating: 3.5 })._tag).toBe("Failure");
    expect(decodeReview({ rating: 3, body: "" })._tag).toBe("Failure");
    expect(decodeReview({ rating: 3, body: "y".repeat(EQUIPMENT_REVIEW_BODY_MAX + 1) })._tag).toBe(
      "Failure",
    );
  });
});
