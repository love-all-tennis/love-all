import { Session, SessionPlayer } from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import {
  dayKey,
  dayOptions,
  dayPartOf,
  draftErrors,
  draftFromSession,
  emptyDraft,
  hasErrors,
  setKind,
  setLevelBound,
  startsAtOf,
  timeKey,
  timeOptions,
  toNewSession,
  toSessionPatch,
  type SessionDraft,
} from "./form";

const now = new Date(2026, 10, 17, 10, 0);

const filled: SessionDraft = {
  ...emptyDraft("3.5"),
  day: "2026-11-21",
  time: "09:00",
  courtName: "  Palmer Park, Detroit ",
};

const host = new SessionPlayer({
  id: crypto.randomUUID(),
  displayName: "Sam",
  photoUrl: null,
  ntrp: "3.5",
});

const saved = new Session({
  id: crypto.randomUUID(),
  kind: "singles",
  startsAt: startsAtOf("2026-11-21", "09:00"),
  durationMinutes: 90,
  courtName: "Palmer Park, Detroit",
  courtPoint: null,
  levelMin: "3.0",
  levelMax: "4.0",
  spots: 2,
  acceptedCount: 1,
  requestCount: 0,
  visibility: "open",
  status: "open",
  notes: null,
  host,
  me: { role: "host", state: "accepted" },
  distanceKm: null,
  participants: [],
  createdAt: now,
});

describe("emptyDraft", () => {
  it("starts half a level either side of my NTRP, open, 90 minutes", () => {
    expect(emptyDraft("3.5")).toMatchObject({
      kind: "singles",
      levelMin: "3.0",
      levelMax: "4.0",
      durationMinutes: 90,
      visibility: "open",
      spots: 2,
      day: null,
      time: null,
    });
  });

  it("clamps at the ends of the scale", () => {
    expect(emptyDraft("2.5")).toMatchObject({ levelMin: "2.5", levelMax: "3.0" });
    expect(emptyDraft("5.5")).toMatchObject({ levelMin: "5.0", levelMax: "5.5" });
  });

  it("is open to any level when I have no rating", () => {
    expect(emptyDraft(null)).toMatchObject({ levelMin: null, levelMax: null });
  });
});

describe("setKind", () => {
  it("resets spots to what the kind has", () => {
    expect(setKind(filled, "doubles").spots).toBe(4);
    expect(setKind({ ...filled, kind: "hitting", spots: 3 }, "singles").spots).toBe(2);
  });
});

describe("setLevelBound", () => {
  it("moves the other end when the range would cross", () => {
    expect(setLevelBound(filled, "min", "4.5")).toMatchObject({ levelMin: "4.5", levelMax: "4.5" });
    expect(setLevelBound(filled, "max", "2.5")).toMatchObject({ levelMin: "2.5", levelMax: "2.5" });
  });

  it("clears one end without touching the other", () => {
    expect(setLevelBound(filled, "max", null)).toMatchObject({ levelMin: "3.0", levelMax: null });
    expect(setLevelBound({ ...filled, levelMax: null }, "min", "5.0")).toMatchObject({
      levelMin: "5.0",
      levelMax: null,
    });
  });
});

describe("draftErrors", () => {
  it("passes a filled form", () => {
    expect(hasErrors(draftErrors(filled, now))).toBe(false);
  });

  it("asks for a day, a time and a court", () => {
    expect(draftErrors(emptyDraft(null), now)).toEqual({
      when: "Pick a day and a start time",
      courtName: "Enter the court's name, like Palmer Park, Detroit",
    });
  });

  it("refuses a start time that has passed", () => {
    expect(draftErrors({ ...filled, day: "2026-11-17", time: "09:30" }, now).when).toBe(
      "Pick a start time later than now",
    );
  });

  it("limits the court name and notes", () => {
    const errors = draftErrors(
      { ...filled, courtName: "x".repeat(101), notes: "y".repeat(501) },
      now,
    );

    expect(Object.keys(errors).sort()).toEqual(["courtName", "notes"]);
  });
});

describe("toNewSession", () => {
  it("trims text, sends local time, and leaves spots to the server for singles", () => {
    const body = toNewSession({ ...filled, notes: "  " });
    expect(body).toEqual({
      kind: "singles",
      startsAt: new Date(2026, 10, 21, 9, 0),
      durationMinutes: 90,
      courtName: "Palmer Park, Detroit",
      courtPoint: null,
      levelMin: "3.0",
      levelMax: "4.0",
      visibility: "open",
      notes: null,
    });
  });

  it("sends spots for hitting", () => {
    expect(toNewSession({ ...setKind(filled, "hitting"), spots: 3 }).spots).toBe(3);
  });
});

describe("toSessionPatch", () => {
  it("sends nothing for an untouched form", () => {
    expect(toSessionPatch(draftFromSession(saved), saved)).toEqual({});
  });

  it("sends only what changed, with null to clear", () => {
    const draft = {
      ...draftFromSession(saved),
      time: "10:30",
      levelMax: null,
      notes: "Bring balls",
      courtPoint: { lat: 42.42, lng: -83.13 },
    };

    expect(toSessionPatch(draft, saved)).toEqual({
      startsAt: new Date(2026, 10, 21, 10, 30),
      levelMax: null,
      notes: "Bring balls",
      courtPoint: { lat: 42.42, lng: -83.13 },
    });
  });
});

describe("day and time options", () => {
  it("offers three weeks from today", () => {
    const days = dayOptions(now);
    expect(days).toHaveLength(21);
    expect(days[0]).toBe("2026-11-17");
    expect(days[20]).toBe("2026-12-07");
  });

  it("keeps a saved day or time that's off the grid", () => {
    expect(dayOptions(now, "2027-01-05").at(-1)).toBe("2027-01-05");
    expect(timeOptions("18:15")).toContain("18:15");
    expect(timeOptions()).toHaveLength(32);
  });

  it("groups times by part of the day", () => {
    expect([dayPartOf("06:00"), dayPartOf("12:00"), dayPartOf("17:30")]).toEqual([
      "Morning",
      "Afternoon",
      "Evening",
    ]);
  });

  it("round-trips a local day and time", () => {
    const at = startsAtOf("2026-03-08", "07:30");
    expect(dayKey(at)).toBe("2026-03-08");
    expect(timeKey(at)).toBe("07:30");
  });
});
