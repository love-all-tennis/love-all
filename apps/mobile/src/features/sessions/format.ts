import { Match } from "effect";
import type {
  LatLng,
  MySessionPlace,
  Ntrp,
  SessionKind,
  SessionStatus,
  SessionVisibility,
} from "@love-all/domain";

import { ntrpLabel } from "../profile/draft";
import { dayKey } from "./form";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const kindLabel = (kind: SessionKind) =>
  Match.value(kind).pipe(
    Match.when("singles", () => "Singles match"),
    Match.when("doubles", () => "Doubles match"),
    Match.when("hitting", () => "Hitting session"),
    Match.exhaustive,
  );

/** "Sat, Nov 22". */
export const dateLabel = (date: Date) =>
  `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;

/** "9:00 AM", "6:30 PM". */
export const clockOf = (date: Date) => timeLabel(`${date.getHours()}:${date.getMinutes()}`);

/** A "HH:MM" start as players say it: "9:00 AM". */
export const timeLabel = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

/** "Sat, Nov 22 · 9:00 AM". */
export const whenLabel = (startsAt: Date) => `${dateLabel(startsAt)} · ${clockOf(startsAt)}`;

/** "90 min", as players write durations. */
export const durationLabel = (minutes: number) => `${minutes} min`;

/** A day in the picker: "Today", "Tomorrow", or "Wed, Nov 19". */
export const dayChipLabel = (day: string, now: Date) => {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (day === dayKey(now)) return "Today";

  if (day === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)))
    return "Tomorrow";

  return dateLabel(date);
};

/** "Any level", "NTRP 3.5", "NTRP 3.0–4.0", "NTRP 3.5 and up", "NTRP 4.0 and below". */
export const levelRangeLabel = (min: Ntrp | null, max: Ntrp | null) => {
  if (!min && !max) return "Any level";

  if (min && max)
    return min === max ? `NTRP ${ntrpLabel(min)}` : `NTRP ${ntrpLabel(min)}–${ntrpLabel(max)}`;

  return min ? `NTRP ${ntrpLabel(min)} and up` : `NTRP ${ntrpLabel(max!)} and below`;
};

/** "2 of 4 spots filled". */
export const spotsLabel = (accepted: number, spots: number) =>
  `${accepted} of ${spots} spots filled`;

export const visibilityLabel = (visibility: SessionVisibility) =>
  visibility === "open" ? "Open to nearby players" : "Invite only";

export type SessionTag = {
  readonly label: string;
  readonly tone: "neutral" | "accent" | "highlight" | "clay" | "danger";
};

/**
 * Up to two tags for a session row: my place in it first (an invite, or
 * requests to join my session, waiting on me stand out), then its state. Past and cancelled sessions say so.
 */
export const sessionTags = (
  session: {
    readonly startsAt: Date;
    readonly status: SessionStatus;
    readonly spots: number;
    readonly acceptedCount: number;
    /** Requests waiting on me, when I host. */
    readonly requestCount?: number;
    readonly me: MySessionPlace | null;
  },
  now: Date,
) => {
  const tags: Array<SessionTag> = [];
  const me = session.me;
  const upcoming = session.status !== "cancelled" && session.startsAt.getTime() > now.getTime();
  const requests = upcoming ? (session.requestCount ?? 0) : 0;

  if (me?.role === "host" && requests > 0)
    tags.push({ label: requests === 1 ? "1 request" : `${requests} requests`, tone: "clay" });
  else if (me?.role === "host") tags.push({ label: "Hosting", tone: "neutral" });
  else if (me?.state === "invited") tags.push({ label: "Invited", tone: "clay" });
  else if (me?.state === "requested") tags.push({ label: "Asked to join", tone: "clay" });
  else if (me?.state === "accepted") tags.push({ label: "Playing", tone: "neutral" });

  if (session.status === "cancelled") tags.push({ label: "Cancelled", tone: "danger" });
  else if (session.startsAt.getTime() <= now.getTime())
    tags.push({ label: "Past", tone: "neutral" });
  else if (session.status === "confirmed") tags.push({ label: "Confirmed", tone: "accent" });
  else {
    const left = session.spots - session.acceptedCount;

    if (left > 0)
      tags.push({ label: left === 1 ? "1 spot open" : `${left} spots open`, tone: "highlight" });
  }

  return tags.slice(0, 2);
};

/** Whether the host can still change this session: not cancelled and not started. */
export const isEditable = (
  session: { readonly startsAt: Date; readonly status: SessionStatus },
  now: Date,
) => session.status !== "cancelled" && session.startsAt.getTime() > now.getTime();

/**
 * A link that opens the court's pin in the phone's maps app: Apple Maps on
 * iOS, Google Maps elsewhere.
 */
export const mapsUrl = (point: LatLng, label: string, platform: string) => {
  const ll = `${point.lat},${point.lng}`;

  return platform === "ios"
    ? `https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/search/?api=1&query=${ll}`;
};
