import { REPORT_TARGET_TYPES, ReportReason } from "@love-all/domain";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { REPORT_REASONS, reasonsFor } from "./reasons";

describe("REPORT_REASONS", () => {
  it("offers every reason the API takes, once", () => {
    const offered = REPORT_REASONS.map((r) => r.reason);
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered].sort()).toEqual([...ReportReason.literals].sort());

    for (const reason of offered) expect(Schema.is(ReportReason)(reason)).toBe(true);
  });
});

describe("reasonsFor", () => {
  it("offers every reason for a player", () => {
    expect(reasonsFor("player")).toBe(REPORT_REASONS);
  });

  it("leaves profile-only reasons off for posts, and ends with Something else", () => {
    for (const target of REPORT_TARGET_TYPES.filter((t) => t !== "player")) {
      const reasons = reasonsFor(target).map((r) => r.reason);
      expect(reasons).not.toContain("fake_profile");
      expect(reasons).not.toContain("underage");
      expect(reasons.at(-1)).toBe("other");
    }
  });
});
