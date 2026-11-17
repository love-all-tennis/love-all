import { describe, expect, it } from "vite-plus/test";
import {
  itemName,
  newItemErrors,
  ratingLabel,
  reviewCountLabel,
  reviewErrors,
  reviewPayload,
  starShares,
  starsLabel,
} from "./gear";

const none = { count: 0, average: null, stars: [0, 0, 0, 0, 0] };
const some = { count: 4, average: 3.8, stars: [0, 1, 0, 2, 1] };

describe("labels", () => {
  it("names an item and counts reviews", () => {
    expect(itemName({ brand: "Wilson", model: "Blade 98" })).toBe("Wilson Blade 98");
    expect(reviewCountLabel(0)).toBe("No reviews yet");
    expect(reviewCountLabel(1)).toBe("1 review");
    expect(reviewCountLabel(12)).toBe("12 reviews");
    expect(starsLabel(1)).toBe("1 star");
    expect(starsLabel(4)).toBe("4 stars");
  });

  it("reads a rating summary", () => {
    expect(ratingLabel(none)).toBe("No reviews yet");
    expect(ratingLabel(some)).toBe("3.8 out of 5 · 4 reviews");
    expect(ratingLabel({ count: 1, average: 5, stars: [0, 0, 0, 0, 1] })).toBe(
      "5.0 out of 5 · 1 review",
    );
  });

  it("gives each star level its share, 5 stars first", () => {
    expect(starShares(some).map((s) => [s.stars, s.count, s.share])).toEqual([
      [5, 1, 0.25],
      [4, 2, 0.5],
      [3, 0, 0],
      [2, 1, 0.25],
      [1, 0, 0],
    ]);
    expect(starShares(none).every((s) => s.share === 0)).toBe(true);
  });
});

describe("adding an item", () => {
  it("needs a kind, brand and model within the limits", () => {
    expect(newItemErrors({ kind: "racket", brand: "Wilson", model: "Blade 98" })).toEqual({
      kind: null,
      brand: null,
      model: null,
    });
    const errors = newItemErrors({ kind: null, brand: " ", model: "x".repeat(81) });
    expect(errors.kind).toBe("Pick what kind of gear it is");
    expect(errors.brand).toBe("Enter the brand");
    expect(errors.model).toBe("Keep the model to 80 characters (81 now)");
  });
});

describe("a review", () => {
  it("needs stars; title and text are optional but limited", () => {
    expect(reviewErrors({ rating: null, title: "", body: "" }).rating).toBe(
      "Pick from 1 to 5 stars",
    );
    expect(reviewErrors({ rating: 4, title: "", body: "" })).toEqual({
      rating: null,
      title: null,
      body: null,
    });
    expect(reviewErrors({ rating: 4, title: "x".repeat(81), body: "" }).title).toBe(
      "Keep the title to 80 characters (81 now)",
    );
  });

  it("sends blank fields as null and trims the rest", () => {
    expect(reviewPayload({ rating: 3, title: "  ", body: " Good spin " })).toEqual({
      rating: 3,
      title: null,
      body: "Good spin",
    });
  });
});
