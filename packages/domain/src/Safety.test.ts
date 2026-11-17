import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { NewReport, REPORT_DETAILS_MAX } from "./Safety";

const decode = Schema.decodeUnknownExit(NewReport);

describe("NewReport", () => {
  it("accepts a player report with or without details", () => {
    expect(decode({ targetType: "player", targetId: "u_1", reason: "spam" })._tag).toBe("Success");
    expect(
      decode({ targetType: "player", targetId: "u_1", reason: "other", details: "Never showed" })
        ._tag,
    ).toBe("Success");
  });

  it("accepts forum threads and replies", () => {
    const base = { targetId: "0b9b6d5e-2f4c-4c55-9d8a-0a8f1d1c2b3a", reason: "spam" };
    expect(decode({ ...base, targetType: "forum_thread" })._tag).toBe("Success");
    expect(decode({ ...base, targetType: "forum_post" })._tag).toBe("Success");
  });

  it("rejects unknown targets and reasons, empty ids and long details", () => {
    const base = { targetType: "player", targetId: "u_1", reason: "spam" };
    expect(decode({ ...base, targetType: "post" })._tag).toBe("Failure");
    expect(decode({ ...base, reason: "rude" })._tag).toBe("Failure");
    expect(decode({ ...base, targetId: "" })._tag).toBe("Failure");
    expect(decode({ ...base, details: "x".repeat(REPORT_DETAILS_MAX + 1) })._tag).toBe("Failure");
  });
});
