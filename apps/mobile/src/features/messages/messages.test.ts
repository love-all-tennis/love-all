import { Conversation, DirectMessage, MESSAGE_BODY_MAX } from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import {
  dayLabel,
  mergeMessages,
  messageError,
  previewLine,
  threadItems,
  unreadBadge,
} from "./messages";

const message = (id: string, createdAt: Date, mine = false, body = "Hi") =>
  new DirectMessage({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    conversationId: "00000000-0000-4000-8000-0000000000aa",
    senderId: mine ? "me" : "them",
    mine,
    body,
    createdAt,
  });

const conversation = (lastMessage: DirectMessage | null) =>
  new Conversation({
    id: "00000000-0000-4000-8000-0000000000aa",
    otherPlayer: { id: "them", displayName: "Sam", photoUrl: null },
    lastMessage,
    unreadCount: 0,
    createdAt: new Date(2026, 10, 1),
  });

describe("previewLine", () => {
  it("prefixes my own messages and flattens line breaks", () => {
    expect(previewLine(conversation(message("1", new Date(), true, "See you\nat 6")))).toBe(
      "You: See you at 6",
    );
    expect(previewLine(conversation(message("1", new Date(), false, "Court 3")))).toBe("Court 3");
    expect(previewLine(conversation(null))).toBe("No messages yet");
  });
});

describe("unreadBadge", () => {
  it("hides at zero and caps at 99+", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(4)).toBe("4");
    expect(unreadBadge(120)).toBe("99+");
  });
});

describe("messageError", () => {
  it("wants some text, within the limit", () => {
    expect(messageError("  ")).toBe("Write a message first");
    expect(messageError("Saturday?")).toBeNull();
    expect(messageError("x".repeat(MESSAGE_BODY_MAX + 1))).toMatch(/Keep a message to/);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 10, 17, 15, 0);
  it("says today and yesterday, then the date", () => {
    expect(dayLabel(new Date(2026, 10, 17, 8, 0), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 16, 23, 0), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 10, 9, 0), now)).toBe("Tue, Nov 10");
    expect(dayLabel(new Date(2025, 10, 10, 9, 0), now)).toMatch(/2025/);
  });
});

describe("threadItems", () => {
  it("puts a day heading after the oldest message of each day", () => {
    const now = new Date(2026, 10, 17, 15, 0);

    const items = threadItems(
      [
        message("3", new Date(2026, 10, 17, 10, 0)),
        message("2", new Date(2026, 10, 17, 9, 0)),
        message("1", new Date(2026, 10, 16, 9, 0)),
      ],
      now,
    );

    expect(items.map((i) => (i.kind === "day" ? i.label : i.kind))).toEqual([
      "message",
      "message",
      "Today",
      "message",
      "Yesterday",
    ]);
  });
});

describe("mergeMessages", () => {
  it("keeps newest first without repeats", () => {
    const a = message("1", new Date(2026, 10, 17, 9, 0));
    const b = message("2", new Date(2026, 10, 17, 10, 0));
    const c = message("3", new Date(2026, 10, 17, 11, 0));
    expect(mergeMessages([b, a], [c, b]).map((m) => m.id)).toEqual([c.id, b.id, a.id]);
  });
});
