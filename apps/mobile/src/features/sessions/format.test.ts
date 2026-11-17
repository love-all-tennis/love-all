import { describe, expect, it } from "vite-plus/test";
import {
  dayChipLabel,
  durationLabel,
  isEditable,
  levelRangeLabel,
  mapsUrl,
  sessionTags,
  spotsLabel,
  timeLabel,
  whenLabel,
} from "./format";

const now = new Date(2026, 10, 17, 10, 0);
const later = new Date(2026, 10, 22, 9, 0);

const base = {
  startsAt: later,
  status: "open" as const,
  spots: 4,
  acceptedCount: 2,
  me: null,
};

describe("times", () => {
  it("reads like the design doc", () => {
    expect(whenLabel(later)).toBe("Sun, Nov 22 · 9:00 AM");
    expect(timeLabel("18:30")).toBe("6:30 PM");
    expect(timeLabel("12:00")).toBe("12:00 PM");
    expect(timeLabel("00:00")).toBe("12:00 AM");
    expect(durationLabel(90)).toBe("90 min");
  });

  it("names today and tomorrow in the day picker", () => {
    expect(dayChipLabel("2026-11-17", now)).toBe("Today");
    expect(dayChipLabel("2026-11-18", now)).toBe("Tomorrow");
    expect(dayChipLabel("2026-11-19", now)).toBe("Thu, Nov 19");
  });
});

describe("levelRangeLabel", () => {
  it("covers open and closed ranges", () => {
    expect(levelRangeLabel(null, null)).toBe("Any level");
    expect(levelRangeLabel("3.5", "3.5")).toBe("NTRP 3.5");
    expect(levelRangeLabel("3.0", "4.0")).toBe("NTRP 3.0–4.0");
    expect(levelRangeLabel("4.0", null)).toBe("NTRP 4.0 and up");
    expect(levelRangeLabel(null, "5.5")).toBe("NTRP 5.5+ and below");
  });
});

describe("sessionTags", () => {
  it("leads with an invite waiting on me, then open spots", () => {
    expect(sessionTags({ ...base, me: { role: "player", state: "invited" } }, now)).toEqual([
      { label: "Invited", tone: "clay" },
      { label: "2 spots open", tone: "highlight" },
    ]);
  });

  it("marks hosting, confirmed, past and cancelled", () => {
    const hosting = { role: "host", state: "accepted" } as const;
    expect(sessionTags({ ...base, me: hosting, status: "confirmed" }, now)).toEqual([
      { label: "Hosting", tone: "neutral" },
      { label: "Confirmed", tone: "accent" },
    ]);
    expect(sessionTags({ ...base, startsAt: new Date(2026, 10, 1) }, now)).toEqual([
      { label: "Past", tone: "neutral" },
    ]);
    expect(sessionTags({ ...base, status: "cancelled" }, now)).toEqual([
      { label: "Cancelled", tone: "danger" },
    ]);
    expect(sessionTags({ ...base, acceptedCount: 3 }, now)).toEqual([
      { label: "1 spot open", tone: "highlight" },
    ]);
  });
});

describe("misc", () => {
  it("counts spots", () => expect(spotsLabel(1, 2)).toBe("1 of 2 spots filled"));

  it("only lets the host edit upcoming sessions that are still on", () => {
    expect(isEditable(base, now)).toBe(true);
    expect(isEditable({ ...base, status: "cancelled" }, now)).toBe(false);
    expect(isEditable({ ...base, startsAt: now }, now)).toBe(false);
  });

  it("links to the platform's maps app", () => {
    const pin = { lat: 42.42, lng: -83.13 };
    expect(mapsUrl(pin, "Palmer Park", "ios")).toBe(
      "https://maps.apple.com/?ll=42.42,-83.13&q=Palmer%20Park",
    );
    expect(mapsUrl(pin, "Palmer Park", "android")).toBe(
      "https://www.google.com/maps/search/?api=1&query=42.42,-83.13",
    );
  });
});
