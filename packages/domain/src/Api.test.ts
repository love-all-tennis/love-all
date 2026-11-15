import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Health, SessionUser } from "./index";

describe("domain schemas", () => {
  it("decodes a health response", () => {
    expect(Schema.decodeUnknownSync(Health)({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("rejects a session user with an unknown role", () => {
    expect(() =>
      Schema.decodeUnknownSync(SessionUser)({
        id: "u1",
        name: "Sam",
        email: "s@x.co",
        role: "owner",
      }),
    ).toThrow();
  });

  it("rejects a session user without an email", () => {
    expect(() => Schema.decodeUnknownSync(SessionUser)({ id: "u1", name: "Sam" })).toThrow();
  });
});
