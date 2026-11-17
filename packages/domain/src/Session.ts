import { Schema } from "effect";
import { PlayerId, PlayKind } from "./Player";
import { LatLng, Ntrp } from "./Profile";

/**
 * Matches and hitting sessions ("sessions" for short): a time, a court, a
 * level range and a few spots. The host invites players, or opens it to
 * nearby players in range.
 */

export const SessionId = Schema.String.check(Schema.isUUID());
export type SessionId = typeof SessionId.Type;

/** Singles, doubles or a hitting session: the same kinds a profile says it plays. */
export const SessionKind = PlayKind;
export type SessionKind = typeof SessionKind.Type;

/** `invite_only`: only invited players can join. `open`: nearby players in range can find it. */
export const SessionVisibility = Schema.Literals(["invite_only", "open"]);
export type SessionVisibility = typeof SessionVisibility.Type;

/** `confirmed` once every spot is taken, and back to `open` if someone leaves. */
export const SessionStatus = Schema.Literals(["open", "confirmed", "cancelled"]);
export type SessionStatus = typeof SessionStatus.Type;

export const ParticipantRole = Schema.Literals(["host", "player"]);
export type ParticipantRole = typeof ParticipantRole.Type;

/**
 * Where a player stands with a session. `invited` waits on the player,
 * `requested` waits on the host. Only `accepted` players take a spot, and the
 * host is always `accepted`.
 */
export const ParticipantState = Schema.Literals([
  "invited",
  "requested",
  "accepted",
  "declined",
  "left",
]);
export type ParticipantState = typeof ParticipantState.Type;

/** Spots per kind: singles 2, doubles 4, hitting 2 to 4 (the host picks; 2 by default). */
export const SINGLES_SPOTS = 2;
export const DOUBLES_SPOTS = 4;
export const HITTING_SPOTS_MIN = 2;
export const HITTING_SPOTS_MAX = 4;

/** Spots a session of this kind has when the host doesn't pick. */
export const defaultSpots = (kind: SessionKind): number =>
  kind === "doubles" ? DOUBLES_SPOTS : kind === "singles" ? SINGLES_SPOTS : HITTING_SPOTS_MIN;

/** Whether `spots` is allowed for `kind`. */
export const spotsFitKind = (kind: SessionKind, spots: number): boolean =>
  kind === "hitting"
    ? spots >= HITTING_SPOTS_MIN && spots <= HITTING_SPOTS_MAX
    : spots === defaultSpots(kind);

export const Spots = Schema.Int.check(
  Schema.isBetween({ minimum: HITTING_SPOTS_MIN, maximum: DOUBLES_SPOTS }),
);
export const DurationMinutes = Schema.Int.check(Schema.isBetween({ minimum: 15, maximum: 480 }));
export const CourtName = Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, 100));
export const SESSION_NOTES_MAX = 500;
export const SessionNotes = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMaxLength(SESSION_NOTES_MAX),
);

/** An ISO 8601 date-time, such as "2026-11-20T18:00:00-05:00". */
export const SessionTime = Schema.DateFromString;

const levelsInOrder = (range: {
  readonly levelMin?: Ntrp | null | undefined;
  readonly levelMax?: Ntrp | null | undefined;
}) =>
  range.levelMin == null || range.levelMax == null || range.levelMin <= range.levelMax
    ? true
    : "levelMin can't be above levelMax";

/**
 * `POST /sessions` body. A missing or null level bound means "any level".
 * `spots` is only picked for hitting (2 to 4); singles and doubles always
 * have 2 and 4. `startsAt` must be in the future (checked by the server).
 */
export const NewSession = Schema.Struct({
  kind: SessionKind,
  startsAt: SessionTime,
  durationMinutes: DurationMinutes,
  courtName: CourtName,
  courtPoint: Schema.optionalKey(Schema.NullOr(LatLng)),
  levelMin: Schema.optionalKey(Schema.NullOr(Ntrp)),
  levelMax: Schema.optionalKey(Schema.NullOr(Ntrp)),
  spots: Schema.optionalKey(Spots),
  visibility: SessionVisibility,
  notes: Schema.optionalKey(Schema.NullOr(SessionNotes)),
}).check(
  Schema.makeFilter(levelsInOrder),
  Schema.makeFilter(
    (s) =>
      s.spots === undefined ||
      spotsFitKind(s.kind, s.spots) ||
      `A ${s.kind} session has ${defaultSpots(s.kind)} spots`,
  ),
);
export type NewSession = typeof NewSession.Type;

/**
 * `PATCH /sessions/:id` body, host only. Only the fields sent change, and
 * `null` clears a nullable one. The kind can't change, and `spots` (hitting
 * only) can't drop below the players already accepted.
 */
export const SessionPatch = Schema.Struct({
  startsAt: Schema.optionalKey(SessionTime),
  durationMinutes: Schema.optionalKey(DurationMinutes),
  courtName: Schema.optionalKey(CourtName),
  courtPoint: Schema.optionalKey(Schema.NullOr(LatLng)),
  levelMin: Schema.optionalKey(Schema.NullOr(Ntrp)),
  levelMax: Schema.optionalKey(Schema.NullOr(Ntrp)),
  spots: Schema.optionalKey(Spots),
  visibility: Schema.optionalKey(SessionVisibility),
  notes: Schema.optionalKey(Schema.NullOr(SessionNotes)),
}).check(Schema.makeFilter(levelsInOrder));
export type SessionPatch = typeof SessionPatch.Type;

/** A player as a session shows them. */
export class SessionPlayer extends Schema.Class<SessionPlayer>("SessionPlayer")({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  ntrp: Schema.NullOr(Ntrp),
}) {}

/** A player's place in a session. */
export class SessionParticipant extends Schema.Class<SessionParticipant>("SessionParticipant")({
  player: SessionPlayer,
  role: ParticipantRole,
  state: ParticipantState,
}) {}

/** The signed-in player's own place in a session, or null on the summary when they have none. */
export const MySessionPlace = Schema.Struct({
  role: ParticipantRole,
  state: ParticipantState,
});
export type MySessionPlace = typeof MySessionPlace.Type;

const sessionFields = {
  id: SessionId,
  kind: SessionKind,
  startsAt: SessionTime,
  durationMinutes: Schema.Int,
  courtName: Schema.String,
  /** The court's map pin, as the host dropped it. */
  courtPoint: Schema.NullOr(LatLng),
  levelMin: Schema.NullOr(Ntrp),
  levelMax: Schema.NullOr(Ntrp),
  spots: Schema.Int,
  /** Accepted players, host included. Spots left is `spots - acceptedCount`. */
  acceptedCount: Schema.Int,
  /** Players who asked to join and wait on the host. Counted only for the host; 0 for everyone else. */
  requestCount: Schema.Int,
  visibility: SessionVisibility,
  status: SessionStatus,
  notes: Schema.NullOr(Schema.String),
  host: SessionPlayer,
  me: Schema.NullOr(MySessionPlace),
  /**
   * Whole kilometres (at least 1) from my home point to the court pin, or to
   * the host's home point when there is no pin. Null when either is missing.
   */
  distanceKm: Schema.NullOr(Schema.Int),
};

/** A session in a list (`GET /sessions`). */
export class SessionSummary extends Schema.Class<SessionSummary>("SessionSummary")(sessionFields) {}

/**
 * `GET /sessions/:id`: a session with its players. The host sees everyone
 * (invited, requested, declined and left too); other players see who is
 * accepted or invited, and their own place. Players blocked either way with
 * the viewer are left out.
 */
export class Session extends Schema.Class<Session>("Session")({
  ...sessionFields,
  participants: Schema.Array(SessionParticipant),
  createdAt: SessionTime,
}) {}

export const SessionScope = Schema.Literals(["mine", "nearby"]);
export type SessionScope = typeof SessionScope.Type;

export const SESSIONS_PAGE_DEFAULT = 20;
export const SESSIONS_PAGE_MAX = 50;
export const SessionsPageSize = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: SESSIONS_PAGE_MAX }),
);

/**
 * `GET /sessions` query.
 * - `mine`: sessions I host, or am invited to, asked to join or accepted in.
 *   Upcoming ones first, soonest first, then past ones, latest first.
 * - `nearby`: open sessions by other players with spots left, starting later,
 *   within my search radius and whose level range includes my NTRP. Soonest
 *   first. Needs a home point.
 * `cursor` is the `nextCursor` of the previous page.
 */
export const SessionsQuery = {
  scope: SessionScope,
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(SessionsPageSize),
};
export type SessionsQuery = Schema.Struct<typeof SessionsQuery>["Type"];

/** One page of `GET /sessions`. `nextCursor` is null on the last page. */
export class SessionsPage extends Schema.Class<SessionsPage>("SessionsPage")({
  items: Schema.Array(SessionSummary),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export const MAX_INVITES_PER_REQUEST = 20;

/** `POST /sessions/:id/invites` body: players to invite. Players already in the session are skipped. */
export const SessionInvites = Schema.Struct({
  playerIds: Schema.Array(PlayerId).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_INVITES_PER_REQUEST),
  ),
});
export type SessionInvites = typeof SessionInvites.Type;

/** No session with that id, or the viewer can't see it. */
export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()(
  "SessionNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Only the host can do that. */
export class NotSessionHost extends Schema.TaggedError<NotSessionHost>()(
  "NotSessionHost",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** The session is cancelled or has already started. */
export class SessionClosed extends Schema.TaggedError<SessionClosed>()(
  "SessionClosed",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** Every spot is taken. */
export class SessionFull extends Schema.TaggedError<SessionFull>()(
  "SessionFull",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/**
 * A change the server can't accept: a start time in the past, spots below
 * the accepted players or not allowed for the kind, or a level range out of
 * order once merged with what's saved.
 */
export class InvalidSession extends Schema.TaggedError<InvalidSession>()(
  "InvalidSession",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** Hosting needs a profile (`PATCH /me`) so other players see who it is. */
export class ProfileRequired extends Schema.TaggedError<ProfileRequired>()(
  "ProfileRequired",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}
