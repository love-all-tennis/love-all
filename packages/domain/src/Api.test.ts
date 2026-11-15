import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Health, SessionUser } from "./index";

describe("domain schemas", () => {
  it("decodes a health response", () => {
    expect(Schema.decodeUnknownSync(Health)({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("rejects a session user without an email", () => {
    expect(() => Schema.decodeUnknownSync(SessionUser)({ id: "u1", name: "Sam" })).toThrow();
  });
});
