import { ModerationReport } from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";

import { reportActions, reportCountLabel, reportedByLabel, stateTags } from "./moderation";

type Fields = ConstructorParameters<typeof ModerationReport>[0];

const fields: Fields = {
  id: "0b9b6d5e-2f4c-4c55-9d8a-0a8f1d1c2b3a",
  targetType: "forum_post",
  targetId: "1b9b6d5e-2f4c-4c55-9d8a-0a8f1d1c2b3a",
  reason: "spam",
  details: null,
  content: "Cheap balls",
  reporter: { id: "u_sam", displayName: "Sam", suspended: false },
  subject: { id: "u_alex", displayName: "Alex", suspended: false },
  threadId: "2b9b6d5e-2f4c-4c55-9d8a-0a8f1d1c2b3a",
  equipmentId: null,
  hidden: false,
  removed: false,
  openReportsOnTarget: 1,
  status: "open",
  resolution: null,
  createdAt: new Date(),
  resolvedAt: null,
};
const base = new ModerationReport(fields);

const with_ = (patch: Partial<Fields>) => new ModerationReport({ ...fields, ...patch });

describe("reportActions", () => {
  it("offers hide, suspend, dismiss and open thread on an open post report", () => {
    expect(reportActions(base)).toEqual({
      hide: true,
      unhide: false,
      suspend: true,
      unsuspend: false,
      dismiss: true,
      openThread: true,
      openItem: false,
    });
  });

  it("offers unhide and lift on hidden content by a suspended player", () => {
    const report = with_({
      hidden: true,
      status: "resolved",
      resolution: "content_hidden",
      subject: { id: "u_alex", displayName: "Alex", suspended: true },
    });
    expect(reportActions(report)).toMatchObject({
      hide: false,
      unhide: true,
      suspend: false,
      unsuspend: true,
      dismiss: false,
      openThread: false,
    });
  });

  it("never offers hiding a player, or anything on a deleted account", () => {
    expect(reportActions(with_({ targetType: "player", threadId: null }))).toMatchObject({
      hide: false,
      unhide: false,
      openThread: false,
    });
    expect(reportActions(with_({ subject: null }))).toMatchObject({
      suspend: false,
      unsuspend: false,
    });
  });
});

describe("gear review reports", () => {
  it("can be hidden, and open their item even once hidden", () => {
    const review = {
      targetType: "equipment_review",
      threadId: null,
      equipmentId: "3b9b6d5e-2f4c-4c55-9d8a-0a8f1d1c2b3a",
    } as const;
    expect(reportActions(with_(review))).toMatchObject({
      hide: true,
      openThread: false,
      openItem: true,
    });
    expect(reportActions(with_({ ...review, hidden: true }))).toMatchObject({
      hide: false,
      unhide: true,
      openItem: true,
    });
  });
});

describe("labels", () => {
  it("counts reports only when there's more than one", () => {
    expect(reportCountLabel(1)).toBeNull();
    expect(reportCountLabel(3)).toBe("3 reports");
  });

  it("tags where things stand", () => {
    expect(stateTags(base)).toEqual([]);
    expect(
      stateTags(
        with_({
          status: "resolved",
          resolution: "content_hidden",
          hidden: true,
          subject: { id: "u_alex", displayName: "Alex", suspended: true },
        }),
      ).map((t) => t.label),
    ).toEqual(["Post hidden", "Hidden", "Suspended"]);
    expect(stateTags(with_({ removed: true })).map((t) => t.label)).toEqual(["Deleted by author"]);
  });

  it("names the reporter, or says their account is gone", () => {
    expect(reportedByLabel(base, "2 min ago")).toBe("Reported by Sam · 2 min ago");
    expect(reportedByLabel(with_({ reporter: null }), "1 h ago")).toBe(
      "Reported by a deleted account · 1 h ago",
    );
  });
});
