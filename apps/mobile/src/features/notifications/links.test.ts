import { describe, expect, it } from "vite-plus/test";
import { notificationRoute } from "./links";

describe("notificationRoute", () => {
  it("follows session, forum thread and conversation links", () => {
    expect(notificationRoute({ url: "/sessions/7f1c-22ab" })).toBe("/sessions/7f1c-22ab");
    expect(notificationRoute({ url: "/forum/thread/abc" })).toBe("/forum/thread/abc");
    expect(notificationRoute({ url: "/messages/9b2f-c1" })).toBe("/messages/9b2f-c1");
  });

  it("ignores anything else", () => {
    expect(notificationRoute(null)).toBeNull();
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute({ url: 42 })).toBeNull();
    expect(notificationRoute({ url: "https://example.com" })).toBeNull();
    expect(notificationRoute({ url: "/sessions/1/../../settings" })).toBeNull();
    expect(notificationRoute({ url: "/profile-setup" })).toBeNull();
  });
});
