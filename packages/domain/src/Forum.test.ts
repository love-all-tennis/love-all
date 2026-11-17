import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { FORUM_BODY_MAX, FORUM_TITLE_MAX, NewForumPost, NewForumThread } from "./Forum";

const decodeThread = Schema.decodeUnknownExit(NewForumThread);
const decodePost = Schema.decodeUnknownExit(NewForumPost);
const categoryId = "0b6f0c1e-3a0e-4c55-9a3e-6c1f3b2a9d10";

describe("NewForumThread", () => {
  it("accepts a title and body within the limits", () => {
    expect(decodeThread({ categoryId, title: "Strings?", body: "Poly or gut?" })._tag).toBe(
      "Success",
    );
    expect(
      decodeThread({
        categoryId,
        title: "x".repeat(FORUM_TITLE_MAX),
        body: "y".repeat(FORUM_BODY_MAX),
      })._tag,
    ).toBe("Success");
  });

  it("rejects empty, untrimmed or long text and bad category ids", () => {
    const base = { categoryId, title: "Strings?", body: "Poly or gut?" };
    expect(decodeThread({ ...base, title: "" })._tag).toBe("Failure");
    expect(decodeThread({ ...base, title: " Strings? " })._tag).toBe("Failure");
    expect(decodeThread({ ...base, title: "x".repeat(FORUM_TITLE_MAX + 1) })._tag).toBe("Failure");
    expect(decodeThread({ ...base, body: "y".repeat(FORUM_BODY_MAX + 1) })._tag).toBe("Failure");
    expect(decodeThread({ ...base, categoryId: "general" })._tag).toBe("Failure");
  });
});

describe("NewForumPost", () => {
  it("needs a non-empty body", () => {
    expect(decodePost({ body: "Thanks!" })._tag).toBe("Success");
    expect(decodePost({ body: "" })._tag).toBe("Failure");
  });
});
