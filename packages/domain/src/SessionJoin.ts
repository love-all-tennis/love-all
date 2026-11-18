import { Schema } from "effect";

/**
 * `POST /sessions/:id/respond` body.
 * - `accept` / `decline`: answer my invite.
 * - `request`: ask the host to let me join an open session. With an invite,
 *   it accepts the invite instead.
 */
export const SessionAnswer = Schema.Literals(["accept", "decline", "request"]);

export type SessionAnswer = typeof SessionAnswer.Type;

export const SessionResponse = Schema.Struct({ answer: SessionAnswer });

export type SessionResponse = typeof SessionResponse.Type;

/**
 * I can't do that from where I stand in the session: accepting or declining
 * with no invite, asking to join an invite-only session, asking again after
 * the host said no, or leaving a session I'm not in.
 */
export class NotInvited extends Schema.TaggedError<NotInvited>()(
  "NotInvited",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** My NTRP is outside the session's level range, or I have no NTRP and it has one. */
export class LevelOutOfRange extends Schema.TaggedError<LevelOutOfRange>()(
  "LevelOutOfRange",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** The player has no pending request to join this session. */
export class JoinRequestNotFound extends Schema.TaggedError<JoinRequestNotFound>()(
  "JoinRequestNotFound",
  { userId: Schema.String },
  { httpApiStatus: 404 },
) {}
