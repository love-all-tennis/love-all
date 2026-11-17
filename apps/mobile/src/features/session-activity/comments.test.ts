import { SESSION_COMMENT_MAX } from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import { commentError, mergeComments, timeAgo } from "./comments";

describe("timeAgo", () => {
  const now = new Date("2026-11-20T18:00:00Z");
  const before = (ms: number) => new Date(now.getTime() - ms);
  it("reads like a meta line", () => {
    expect(timeAgo(before(20_000), now)).toBe("Just now");
    expect(timeAgo(before(5 * 60_000), now)).toBe("5 min ago");
    expect(timeAgo(before(3 * 3_600_000), now)).toBe("3 h ago");
    expect(timeAgo(before(2 * 86_400_000), now)).toBe("2 d ago");
    expect(timeAgo(new Date("2026-11-03T18:00:00Z"), now)).toBe("Nov 3");
  });
});

describe("commentError", () => {
  it("needs some text, within the limit", () => {
    expect(commentError("  ")).toBe("Write a comment first");
    expect(commentError(" Court 4, I'll bring balls ")).toBeNull();
    expect(commentError("x".repeat(SESSION_COMMENT_MAX))).toBeNull();
    expect(commentError("x".repeat(SESSION_COMMENT_MAX + 1))).toBe(
      `Keep it to ${SESSION_COMMENT_MAX} characters (${SESSION_COMMENT_MAX + 1} now)`,
    );
  });
});

describe("mergeComments", () => {
  it("appends without repeats", () => {
    expect(mergeComments([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }])).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });
});
