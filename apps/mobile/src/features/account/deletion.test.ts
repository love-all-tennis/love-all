import { describe, expect, it } from "vite-plus/test";
import { deletionCheck, deletionProblem, providerName } from "./deletion";

describe("deletionCheck", () => {
  it("asks for the password when the player has one", () => {
    expect(deletionCheck(["apple", "credential"])).toEqual({ kind: "password" });
  });

  it("asks Apple and Google players to sign in again", () => {
    expect(deletionCheck(["apple"])).toEqual({ kind: "sign-in", provider: "apple" });
    expect(deletionCheck(["google"])).toEqual({ kind: "sign-in", provider: "google" });
  });

  it("names the provider", () => {
    expect(providerName("apple")).toBe("Apple");
    expect(providerName("google")).toBe("Google");
  });
});

describe("deletionProblem", () => {
  it("points a wrong or missing password at the field", () => {
    expect(deletionProblem("INVALID_PASSWORD").kind).toBe("password");
    expect(deletionProblem("PASSWORD_REQUIRED").kind).toBe("password");
  });

  it("asks for a fresh sign-in when the session is too old", () => {
    expect(deletionProblem("SESSION_EXPIRED").kind).toBe("sign-in");
  });

  it("falls back to a retry for anything else", () => {
    expect(deletionProblem(undefined)).toEqual({
      kind: "other",
      message: "Couldn't delete your account. Try again.",
    });
  });
});
