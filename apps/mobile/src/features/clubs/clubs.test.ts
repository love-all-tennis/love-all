import { describe, expect, it } from "vite-plus/test";
import {
  addressError,
  averageLabel,
  clubTags,
  filledStars,
  nameError,
  noteError,
  optionalText,
  ratingAccessibilityLabel,
  ratingBars,
  reviewCountLabel,
  starChoiceLabel,
  wasEdited,
} from "./clubs";

describe("labels", () => {
  it("counts reviews", () => {
    expect(reviewCountLabel(0)).toBe("No reviews yet");
    expect(reviewCountLabel(1)).toBe("1 review");
    expect(reviewCountLabel(12)).toBe("12 reviews");
  });

  it("shows averages with one decimal", () => {
    expect(averageLabel(4)).toBe("4.0");
    expect(averageLabel(3.8)).toBe("3.8");
  });

  it("reads the rating for screen readers", () => {
    expect(ratingAccessibilityLabel({ average: null, count: 0 })).toBe("No reviews yet");
    expect(ratingAccessibilityLabel({ average: 4.3, count: 12 })).toBe(
      "Rated 4.3 out of 5 from 12 reviews",
    );
  });

  it("tags access, then indoor courts", () => {
    expect(clubTags({ access: "free", indoorCourts: false })).toEqual(["Free public courts"]);
    expect(clubTags({ access: "members_only", indoorCourts: true })).toEqual([
      "Members only",
      "Indoor courts",
    ]);
  });

  it("names each star choice", () => {
    expect(starChoiceLabel(1)).toBe("1 star, Poor");
    expect(starChoiceLabel(5)).toBe("5 stars, Excellent");
  });
});

describe("stars", () => {
  it("fills whole stars to the nearest one", () => {
    expect(filledStars(null)).toBe(0);
    expect(filledStars(3.4)).toBe(3);
    expect(filledStars(3.5)).toBe(4);
    expect(filledStars(5)).toBe(5);
  });

  it("builds the breakdown from 5 stars down", () => {
    expect(ratingBars([0, 1, 0, 2, 1])).toEqual([
      { stars: 5, count: 1, share: 0.25 },
      { stars: 4, count: 2, share: 0.5 },
      { stars: 3, count: 0, share: 0 },
      { stars: 2, count: 1, share: 0.25 },
      { stars: 1, count: 0, share: 0 },
    ]);
    expect(ratingBars([0, 0, 0, 0, 0]).every((bar) => bar.share === 0)).toBe(true);
  });
});

describe("forms", () => {
  it("needs a club name within the limit", () => {
    expect(nameError("  ")).toBe("Enter a club name.");
    expect(nameError("Memorial Park")).toBeNull();
    expect(nameError("x".repeat(101))).toBe("Keep the club name to 100 characters or fewer.");
  });

  it("lets the address and note be empty but not too long", () => {
    expect(addressError("")).toBeNull();
    expect(addressError("x".repeat(201))).not.toBeNull();
    expect(noteError("")).toBeNull();
    expect(noteError("x".repeat(2001))).not.toBeNull();
  });

  it("sends empty optional text as null", () => {
    expect(optionalText("   ")).toBeNull();
    expect(optionalText(" Lights till 11 ")).toBe("Lights till 11");
  });

  it("marks reviews changed after posting as edited", () => {
    const createdAt = new Date(2026, 10, 17, 10, 0, 0);
    expect(wasEdited({ createdAt, updatedAt: new Date(createdAt.getTime() + 300) })).toBe(false);
    expect(wasEdited({ createdAt, updatedAt: new Date(createdAt.getTime() + 60_000) })).toBe(true);
  });
});
