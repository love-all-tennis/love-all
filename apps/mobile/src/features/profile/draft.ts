/**
 * The profile setup form, kept free of React Native so it can be unit tested.
 * Screens read and write a `ProfileDraft`; `toProfileUpdate` and
 * `toAvailabilityBlocks` turn it into what the API takes.
 */

import type { Availability, Handedness, LatLng, Me, Ntrp } from "@love-all/domain";

export type { Handedness, LatLng, Ntrp };

/** NTRP levels in order, as the API spells them. "5.5" is shown as "5.5+". */
export const NTRP_LEVELS: ReadonlyArray<Ntrp> = ["2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5"];

export const ntrpLabel = (level: Ntrp) => (level === "5.5" ? "5.5+" : level);

/** One line on each level, so a new player can place themselves. */
export const NTRP_HINTS: Record<Ntrp, string> = {
  "2.5": "Learning to keep a rally going",
  "3.0": "Consistent at medium pace, still working on direction",
  "3.5": "Steady rallies with some direction and depth",
  "4.0": "Dependable strokes, can place the ball and vary pace",
  "4.5": "Uses power and spin, starting to play with a game plan",
  "5.0": "Strong shot making, can hurt you with a weapon",
  "5.5": "Tournament level and up",
};

/**
 * Must match `HOME_POINT_DECIMALS` in `apps/api/src/db/geo.ts`. The server
 * rounds too; rounding here means the app never sends a precise location.
 */
export const HOME_POINT_DECIMALS = 2;

export const roundPoint = ({ lat, lng }: LatLng) => {
  const factor = 10 ** HOME_POINT_DECIMALS;
  return { lat: Math.round(lat * factor) / factor, lng: Math.round(lng * factor) / factor };
};

/** Where a player plays from: a city they typed, or a pin from their location. */
export type HomeArea =
  | { readonly kind: "city"; readonly label: string; readonly point: LatLng }
  | { readonly kind: "pin"; readonly point: LatLng };

/** ISO 8601 weekdays, matching the `availability` table: 1 = Monday, 7 = Sunday. */
export const WEEKDAYS = [
  { weekday: 1, short: "Mon" },
  { weekday: 2, short: "Tue" },
  { weekday: 3, short: "Wed" },
  { weekday: 4, short: "Thu" },
  { weekday: 5, short: "Fri" },
  { weekday: 6, short: "Sat" },
  { weekday: 7, short: "Sun" },
] as const;
export type Weekday = (typeof WEEKDAYS)[number]["weekday"];

/** The simple time blocks a player picks from. Times are local, "HH:MM". */
export const DAY_PARTS = [
  { part: "morning", label: "Morning", start: "06:00", end: "12:00" },
  { part: "afternoon", label: "Afternoon", start: "12:00", end: "17:00" },
  { part: "evening", label: "Evening", start: "17:00", end: "22:00" },
] as const;
export type DayPart = (typeof DAY_PARTS)[number]["part"];

/** A picked cell in the week grid, such as "2-evening" for Tuesday evening. */
export type SlotKey = `${Weekday}-${DayPart}`;
export const slotKey = (weekday: Weekday, part: DayPart) => `${weekday}-${part}` satisfies SlotKey;

type AvailabilityBlock = Availability[number];

export type ProfileDraft = {
  readonly displayName: string;
  /** A photo picked on the device. Saved once photo uploads exist. */
  readonly photoUri: string | null;
  readonly homeArea: HomeArea | null;
  readonly ntrp: Ntrp | null;
  readonly handedness: Handedness | null;
  readonly playsSingles: boolean;
  readonly playsDoubles: boolean;
  readonly playsHitting: boolean;
  readonly slots: ReadonlyArray<SlotKey>;
};

export const emptyDraft = (displayName = "") => ({
  displayName,
  photoUri: null,
  homeArea: null,
  ntrp: null,
  handedness: null,
  playsSingles: false,
  playsDoubles: false,
  playsHitting: false,
  slots: [],
});

export const DISPLAY_NAME_MAX = 50;

/** The steps of setup, in order. Each one is a screen. */
export type Step = "basics" | "home" | "game" | "availability";

/** What's wrong with a step, in words for the player, or `null` if it can be left. */
export const stepError = (draft: ProfileDraft, step: Step) => {
  switch (step) {
    case "basics": {
      const name = draft.displayName.trim();
      if (name.length === 0) return "Add the name other players will see.";
      if (name.length > DISPLAY_NAME_MAX)
        return `Keep your name to ${DISPLAY_NAME_MAX} characters.`;
      return null;
    }
    case "home":
      return draft.homeArea ? null : "Pick a city or drop a pin so we can find players near you.";
    case "game":
      if (!draft.ntrp) return "Pick your NTRP level.";
      if (!draft.handedness) return "Pick which hand you play with.";
      if (!draft.playsSingles && !draft.playsDoubles && !draft.playsHitting)
        return "Pick at least one way you like to play.";
      return null;
    case "availability":
      return null;
  }
};

export const toggleSlot = (draft: ProfileDraft, key: SlotKey) => ({
  ...draft,
  slots: draft.slots.includes(key) ? draft.slots.filter((k) => k !== key) : [...draft.slots, key],
});

/**
 * The week grid as blocks, one per picked cell, sorted by day and time.
 * Back to back cells on the same day are merged, so Monday morning and
 * afternoon is one 06:00 to 17:00 block.
 */
export const toAvailabilityBlocks = (slots: ReadonlyArray<SlotKey>) => {
  const picked = new Set(slots);
  const blocks: Array<AvailabilityBlock> = [];
  for (const { weekday } of WEEKDAYS) {
    let open: { startTime: string; endTime: string } | null = null;
    for (const { part, start, end } of DAY_PARTS) {
      if (picked.has(slotKey(weekday, part))) {
        if (open && open.endTime === start) open.endTime = end;
        else {
          if (open) blocks.push({ weekday, ...open });
          open = { startTime: start, endTime: end };
        }
      } else if (open) {
        blocks.push({ weekday, ...open });
        open = null;
      }
    }
    if (open) blocks.push({ weekday, ...open });
  }
  return blocks;
};

const minutes = (time: string) => {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
};

/**
 * Saved blocks back onto the grid. A block lights every cell it overlaps, so
 * a block set some other way (say 07:30 to 09:00) still shows up.
 */
export const fromAvailabilityBlocks = (
  blocks: ReadonlyArray<{ weekday: number; startTime: string; endTime: string }>,
) => {
  const keys = new Set<SlotKey>();
  for (const block of blocks) {
    const day = WEEKDAYS.find((d) => d.weekday === block.weekday);
    if (!day) continue;
    const from = minutes(block.startTime);
    const to = minutes(block.endTime);
    for (const { part, start, end } of DAY_PARTS) {
      if (from < minutes(end) && to > minutes(start)) keys.add(slotKey(day.weekday, part));
    }
  }
  return [...keys];
};

/** The `PATCH /me` body. Call only once every step passes `stepError`. */
export const toProfileUpdate = (draft: ProfileDraft) => ({
  displayName: draft.displayName.trim(),
  homePoint: draft.homeArea ? roundPoint(draft.homeArea.point) : null,
  ntrp: draft.ntrp,
  handedness: draft.handedness,
  playsSingles: draft.playsSingles,
  playsDoubles: draft.playsDoubles,
  playsHitting: draft.playsHitting,
});

/**
 * Start the form from what's saved, so setup can be re-run to edit. A saved
 * home point has no city name, so it comes back as a pin.
 */
export const draftFromMe = (me: Me) => {
  const { profile } = me;
  if (!profile) return emptyDraft(me.user.name.slice(0, DISPLAY_NAME_MAX));
  return {
    displayName: profile.displayName,
    photoUri: profile.photoUrl,
    homeArea: profile.homePoint ? { kind: "pin", point: profile.homePoint } : null,
    ntrp: profile.ntrp,
    handedness: profile.handedness,
    playsSingles: profile.playsSingles,
    playsDoubles: profile.playsDoubles,
    playsHitting: profile.playsHitting,
    slots: fromAvailabilityBlocks(me.availability),
  } satisfies ProfileDraft;
};

/** Whether a player still has setup to do: true until the required steps are saved. */
export const needsSetup = (me: Me) => {
  const draft = draftFromMe(me);
  return (
    me.profile === null || (["basics", "home", "game"] as const).some((s) => stepError(draft, s))
  );
};
