import { describe, expect, it } from "vite-plus/test";
import { messages, truncate, whenLabel } from "./messages";

const session = {
  id: "s1",
  kind: "singles" as const,
  startsAt: new Date("2026-11-21T14:00:00Z"),
  courtName: "Palmer Park",
};

describe("notification messages", () => {
  it("shows times in Detroit", () => {
    expect(whenLabel(session.startsAt)).toBe("Sat, Nov 21 at 9:00 AM");
  });

  it("opens the session a notice is about", () => {
    expect(messages.invited(session, "Sam")).toEqual({
      title: "Sam invited you to play",
      body: "Singles on Sat, Nov 21 at 9:00 AM at Palmer Park",
      url: "/sessions/s1",
    });
    expect(messages.reminder({ ...session, kind: "hitting" })).toEqual({
      title: "Hitting session at 9:00 AM",
      body: "Starting soon at Palmer Park",
      url: "/sessions/s1",
    });
  });

  it("quotes a forum reply, shortened", () => {
    const notice = messages.forumReply(
      { id: "t1", title: "Best strings for a 3.5?" },
      "Jo",
      `Try a  multifilament.\n${"x".repeat(200)}`,
    );

    expect(notice.title).toBe('Jo replied to "Best strings for a 3.5?"');
    expect(notice.body.startsWith("Try a multifilament. x")).toBe(true);
    expect(notice.body).toHaveLength(140);
    expect(notice.url).toBe("/forum/thread/t1");
  });

  it("truncates only when needed", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("a long sentence here", 10)).toBe("a long se…");
  });

  it("quotes a direct message and opens the conversation", () => {
    expect(messages.directMessage("c1", "Maya", "Thursday after 6?\nPalmer Park")).toEqual({
      title: "Maya",
      body: "Thursday after 6? Palmer Park",
      url: "/messages/c1",
    });
  });
});
