import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { NewSession, SESSION_NOTES_MAX, SessionInvites, SessionPatch } from "./Session";

const decode = Schema.decodeUnknownExit(NewSession);

const base = {
  kind: "singles",
  startsAt: "2026-12-01T18:00:00-05:00",
  durationMinutes: 90,
  courtName: "Palmer Park, court 3",
  visibility: "open",
};

describe("NewSession", () => {
  it("accepts a session with or without a pin, levels and notes", () => {
    expect(decode(base)._tag).toBe("Success");
    expect(
      decode({
        ...base,
        courtPoint: { lat: 42.42, lng: -83.12 },
        levelMin: "3.0",
        levelMax: "3.5",
        notes: "Bring a can of balls",
      })._tag,
    ).toBe("Success");
  });

  it("parses the start time as a date", () => {
    const session = Schema.decodeUnknownSync(NewSession)(base);
    expect(session.startsAt.toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("only lets hitting sessions pick their spots", () => {
    expect(decode({ ...base, kind: "hitting", spots: 3 })._tag).toBe("Success");
    expect(decode({ ...base, kind: "hitting", spots: 5 })._tag).toBe("Failure");
    expect(decode({ ...base, spots: 2 })._tag).toBe("Success");
    expect(decode({ ...base, spots: 4 })._tag).toBe("Failure");
    expect(decode({ ...base, kind: "doubles", spots: 3 })._tag).toBe("Failure");
  });

  it("rejects a level range out of order, a bad time, and blank or long text", () => {
    expect(decode({ ...base, levelMin: "4.0", levelMax: "3.5" })._tag).toBe("Failure");
    expect(decode({ ...base, startsAt: "next tuesday" })._tag).toBe("Failure");
    expect(decode({ ...base, courtName: "" })._tag).toBe("Failure");
    expect(decode({ ...base, notes: "x".repeat(SESSION_NOTES_MAX + 1) })._tag).toBe("Failure");
    expect(decode({ ...base, durationMinutes: 5 })._tag).toBe("Failure");
  });
});

describe("SessionPatch", () => {
  it("accepts any subset, with nulls to clear", () => {
    const decodePatch = Schema.decodeUnknownExit(SessionPatch);
    expect(decodePatch({})._tag).toBe("Success");
    expect(decodePatch({ courtPoint: null, levelMin: null, notes: null })._tag).toBe("Success");
    expect(decodePatch({ levelMin: "5.0", levelMax: "4.0" })._tag).toBe("Failure");
  });
});

describe("SessionInvites", () => {
  it("needs between 1 and 20 player ids", () => {
    const decodeInvites = Schema.decodeUnknownExit(SessionInvites);
    expect(decodeInvites({ playerIds: ["u_1"] })._tag).toBe("Success");
    expect(decodeInvites({ playerIds: [] })._tag).toBe("Failure");
    expect(decodeInvites({ playerIds: Array.from({ length: 21 }, (_, i) => `u_${i}`) })._tag).toBe(
      "Failure",
    );
  });
});
