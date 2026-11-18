import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { CLUB_NAME_MAX, CLUB_REVIEW_BODY_MAX, ClubReviewInput, NewClub } from "./Club";

const decodeClub = Schema.decodeUnknownExit(NewClub);
const decodeReview = Schema.decodeUnknownExit(ClubReviewInput);
const point = { lat: 42.49, lng: -83.14 };

describe("NewClub", () => {
  it("needs a name, a pin and who can play there", () => {
    expect(decodeClub({ name: "Memorial Park", point, access: "free" })._tag).toBe("Success");
    expect(
      decodeClub({
        name: "x".repeat(CLUB_NAME_MAX),
        address: "1 Main St, Royal Oak, MI",
        point,
        access: "members_only",
        indoorCourts: true,
      })._tag,
    ).toBe("Success");
    expect(decodeClub({ name: "Memorial Park", access: "free" })._tag).toBe("Failure");
    expect(decodeClub({ name: "Memorial Park", point })._tag).toBe("Failure");
  });

  it("rejects empty, untrimmed or long names and unknown access", () => {
    const base = { name: "Memorial Park", point, access: "free" };
    expect(decodeClub({ ...base, name: "" })._tag).toBe("Failure");
    expect(decodeClub({ ...base, name: " Memorial Park" })._tag).toBe("Failure");
    expect(decodeClub({ ...base, name: "x".repeat(CLUB_NAME_MAX + 1) })._tag).toBe("Failure");
    expect(decodeClub({ ...base, access: "secret" })._tag).toBe("Failure");
    expect(decodeClub({ ...base, address: "" })._tag).toBe("Failure");
  });
});

describe("ClubReviewInput", () => {
  it("takes 1 to 5 whole stars", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(decodeReview({ rating })._tag).toBe("Success");
    }

    for (const rating of [0, 6, 3.5, "4"]) {
      expect(decodeReview({ rating })._tag).toBe("Failure");
    }
  });

  it("takes an optional note within the limit", () => {
    expect(decodeReview({ rating: 4, body: "Lights till 11." })._tag).toBe("Success");
    expect(decodeReview({ rating: 4, body: null })._tag).toBe("Success");
    expect(decodeReview({ rating: 4, body: "" })._tag).toBe("Failure");
    expect(decodeReview({ rating: 4, body: "y".repeat(CLUB_REVIEW_BODY_MAX + 1) })._tag).toBe(
      "Failure",
    );
  });
});
