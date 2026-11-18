import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { MESSAGE_BODY_MAX, NewDirectMessage } from "./Message";
import { NewReport } from "./Safety";

const decode = Schema.decodeUnknownExit(NewDirectMessage);

describe("NewDirectMessage", () => {
  it("accepts a trimmed message up to the limit", () => {
    expect(decode({ body: "Court 3 at 6?" })._tag).toBe("Success");
    expect(decode({ body: "x".repeat(MESSAGE_BODY_MAX) })._tag).toBe("Success");
  });

  it("rejects empty, untrimmed and overlong messages", () => {
    expect(decode({ body: "" })._tag).toBe("Failure");
    expect(decode({ body: " hi " })._tag).toBe("Failure");
    expect(decode({ body: "x".repeat(MESSAGE_BODY_MAX + 1) })._tag).toBe("Failure");
  });
});

describe("NewReport for a message", () => {
  it("accepts a direct message as the target", () => {
    const report = {
      targetType: "direct_message",
      targetId: "9b2f6c1e-3d4a-4b5c-8d6e-7f8091a2b3c4",
      reason: "spam",
    };

    expect(Schema.decodeUnknownExit(NewReport)(report)._tag).toBe("Success");
  });
});
