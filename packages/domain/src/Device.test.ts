import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { NewDevice } from "./Device";

const decode = Schema.decodeUnknownSync(NewDevice);

describe("NewDevice", () => {
  it("takes an Expo push token", () => {
    expect(decode({ token: "ExponentPushToken[abc123]", platform: "ios" })).toEqual({
      token: "ExponentPushToken[abc123]",
      platform: "ios",
    });
    expect(decode({ token: "ExpoPushToken[abc123]", platform: "android" }).platform).toBe(
      "android",
    );
  });

  it("rejects raw APNs or FCM tokens and unknown platforms", () => {
    expect(() => decode({ token: "a1b2c3d4", platform: "ios" })).toThrow();
    expect(() => decode({ token: "ExponentPushToken[]", platform: "ios" })).toThrow();
    expect(() => decode({ token: "ExponentPushToken[abc]", platform: "web" })).toThrow();
  });
});
