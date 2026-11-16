import { ReportReason } from "@love-all/domain";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { REPORT_REASONS } from "./reasons";

describe("REPORT_REASONS", () => {
  it("offers every reason the API takes, once", () => {
    const offered = REPORT_REASONS.map((r) => r.reason);
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered].sort()).toEqual([...ReportReason.literals].sort());
    for (const reason of offered) expect(Schema.is(ReportReason)(reason)).toBe(true);
  });
});
