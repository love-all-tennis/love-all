/**
 * The create and edit session form, kept free of React Native so it can be
 * unit tested. Screens hold a `SessionDraft`; `draftErrors` checks it, and
 * `toNewSession` and `toSessionPatch` turn it into what the API takes.
 */

import {
  defaultSpots,
  HITTING_SPOTS_MAX,
  HITTING_SPOTS_MIN,
  SESSION_NOTES_MAX,
  type LatLng,
  type NewSession,
  type Ntrp,
  type Session,
  type SessionKind,
  type SessionPatch,
  type SessionVisibility,
} from "@love-all/domain";

import { NTRP_LEVELS } from "../profile/draft";

export const SESSION_KINDS = [
  { kind: "singles", label: "Singles" },
  { kind: "doubles", label: "Doubles" },
  { kind: "hitting", label: "Hitting" },
] as const satisfies ReadonlyArray<{ kind: SessionKind; label: string }>;

/** Lengths the form offers, in minutes. */
export const DURATION_OPTIONS: ReadonlyArray<number> = [60, 90, 120, 180];
export const DEFAULT_DURATION = 90;

export const HITTING_SPOT_OPTIONS: ReadonlyArray<number> = Array.from(
  { length: HITTING_SPOTS_MAX - HITTING_SPOTS_MIN + 1 },
  (_, i) => HITTING_SPOTS_MIN + i,
);

/** How many days ahead the day picker reaches. */
export const DAYS_AHEAD = 21;

export const COURT_NAME_MAX = 100;

export type SessionDraft = {
  readonly kind: SessionKind;
  /** A local calendar day, "YYYY-MM-DD". */
  readonly day: string | null;
  /** A local time, "HH:MM". */
  readonly time: string | null;
  readonly durationMinutes: number;
  readonly courtName: string;
  /** The court's map pin. Courts are public places, so the pin is kept exactly. */
  readonly courtPoint: LatLng | null;
  /** Null means no lower (or upper) bound. */
  readonly levelMin: Ntrp | null;
  readonly levelMax: Ntrp | null;
  /** Only picked for hitting; singles and doubles have 2 and 4. */
  readonly spots: number;
  readonly visibility: SessionVisibility;
  readonly notes: string;
};

export type DraftField = "when" | "courtName" | "notes";
export type DraftErrors = Partial<Record<DraftField, string>>;

const pad = (n: number): string => String(n).padStart(2, "0");

/** A date's local calendar day, "YYYY-MM-DD". */
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** A date's local time of day, "HH:MM". */
export const timeKey = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The moment a local day and time name. */
export const startsAtOf = (day: string, time: string): Date => {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

const levelIndex = (level: Ntrp): number => NTRP_LEVELS.indexOf(level);
const levelAt = (index: number): Ntrp =>
  NTRP_LEVELS[Math.min(Math.max(index, 0), NTRP_LEVELS.length - 1)]!;

/**
 * A new form: half a level either side of my NTRP (any level if I haven't
 * set one), open to nearby players, 90 minutes, no day or time picked yet.
 */
export const emptyDraft = (myLevel: Ntrp | null, kind: SessionKind = "singles"): SessionDraft => {
  const at = myLevel ? levelIndex(myLevel) : -1;
  return {
    kind,
    day: null,
    time: null,
    durationMinutes: DEFAULT_DURATION,
    courtName: "",
    courtPoint: null,
    levelMin: myLevel ? levelAt(at - 1) : null,
    levelMax: myLevel ? levelAt(at + 1) : null,
    spots: defaultSpots(kind),
    visibility: "open",
    notes: "",
  };
};

/** The form for editing a saved session. */
export const draftFromSession = (session: Session): SessionDraft => ({
  kind: session.kind,
  day: dayKey(session.startsAt),
  time: timeKey(session.startsAt),
  durationMinutes: session.durationMinutes,
  courtName: session.courtName,
  courtPoint: session.courtPoint,
  levelMin: session.levelMin,
  levelMax: session.levelMax,
  spots: session.spots,
  visibility: session.visibility,
  notes: session.notes ?? "",
});

/** Changes the kind, and resets spots to what that kind has. */
export const setKind = (draft: SessionDraft, kind: SessionKind): SessionDraft => ({
  ...draft,
  kind,
  spots: defaultSpots(kind),
});

/**
 * Sets one end of the level range (null for no bound). If it would cross the
 * other end, the other end moves with it, so the range is never empty.
 */
export const setLevelBound = (
  draft: SessionDraft,
  bound: "min" | "max",
  level: Ntrp | null,
): SessionDraft => {
  if (bound === "min") {
    const crosses = level && draft.levelMax && levelIndex(draft.levelMax) < levelIndex(level);
    return { ...draft, levelMin: level, levelMax: crosses ? level : draft.levelMax };
  }
  const crosses = level && draft.levelMin && levelIndex(draft.levelMin) > levelIndex(level);
  return { ...draft, levelMin: crosses ? level : draft.levelMin, levelMax: level };
};

/** What's wrong with the form, by field. Empty when it can be sent. */
export const draftErrors = (draft: SessionDraft, now: Date): DraftErrors => {
  const errors: { -readonly [K in DraftField]?: string } = {};
  if (!draft.day || !draft.time) errors.when = "Pick a day and a start time";
  else if (startsAtOf(draft.day, draft.time).getTime() <= now.getTime())
    errors.when = "Pick a start time later than now";
  const court = draft.courtName.trim();
  if (!court) errors.courtName = "Enter the court's name, like Palmer Park, Detroit";
  else if (court.length > COURT_NAME_MAX)
    errors.courtName = `Keep the court name to ${COURT_NAME_MAX} characters`;
  if (draft.notes.trim().length > SESSION_NOTES_MAX)
    errors.notes = `Keep notes to ${SESSION_NOTES_MAX} characters`;
  return errors;
};

export const hasErrors = (errors: DraftErrors): boolean => Object.keys(errors).length > 0;

const notesOf = (draft: SessionDraft): string | null => draft.notes.trim() || null;

/** The `POST /sessions` body. Call only once `draftErrors` is empty. */
export const toNewSession = (draft: SessionDraft): NewSession => ({
  kind: draft.kind,
  startsAt: startsAtOf(draft.day!, draft.time!),
  durationMinutes: draft.durationMinutes,
  courtName: draft.courtName.trim(),
  courtPoint: draft.courtPoint,
  levelMin: draft.levelMin,
  levelMax: draft.levelMax,
  ...(draft.kind === "hitting" ? { spots: draft.spots } : {}),
  visibility: draft.visibility,
  notes: notesOf(draft),
});

const samePoint = (a: LatLng | null, b: LatLng | null): boolean =>
  a === b || (a !== null && b !== null && a.lat === b.lat && a.lng === b.lng);

/**
 * The `PATCH /sessions/:id` body: only what changed from the saved session,
 * so an untouched form sends nothing and the start time isn't re-checked.
 */
export const toSessionPatch = (draft: SessionDraft, saved: Session): SessionPatch => {
  const next = toNewSession(draft);
  const patch: { -readonly [K in keyof SessionPatch]: SessionPatch[K] } = {};
  if (next.startsAt.getTime() !== saved.startsAt.getTime()) patch.startsAt = next.startsAt;
  if (next.durationMinutes !== saved.durationMinutes) patch.durationMinutes = next.durationMinutes;
  if (next.courtName !== saved.courtName) patch.courtName = next.courtName;
  if (!samePoint(next.courtPoint ?? null, saved.courtPoint))
    patch.courtPoint = next.courtPoint ?? null;
  if ((next.levelMin ?? null) !== saved.levelMin) patch.levelMin = next.levelMin ?? null;
  if ((next.levelMax ?? null) !== saved.levelMax) patch.levelMax = next.levelMax ?? null;
  if (next.spots !== undefined && next.spots !== saved.spots) patch.spots = next.spots;
  if (next.visibility !== saved.visibility) patch.visibility = next.visibility;
  if ((next.notes ?? null) !== saved.notes) patch.notes = next.notes ?? null;
  return patch;
};

/**
 * Days the picker offers: today and the next `DAYS_AHEAD - 1`. A saved day
 * outside that window (when editing) is added so it still shows as picked.
 */
export const dayOptions = (now: Date, include: string | null = null): ReadonlyArray<string> => {
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) =>
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)),
  );
  return include && !days.includes(include) ? [...days, include].sort() : days;
};

/**
 * Start times the picker offers, every 30 minutes from 6 AM to 9:30 PM. A
 * saved time off that grid (when editing) is added so it still shows.
 */
export const timeOptions = (include: string | null = null): ReadonlyArray<string> => {
  const times = Array.from(
    { length: 32 },
    (_, i) => `${pad(6 + Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`,
  );
  return include && !times.includes(include) ? [...times, include].sort() : times;
};

/** Which part of the day a "HH:MM" start falls in, for grouping the time picker. */
export const dayPartOf = (time: string): "Morning" | "Afternoon" | "Evening" => {
  const hour = Number(time.split(":")[0]);
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
};
