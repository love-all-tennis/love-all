import { Schema } from "effect";

/** An account id: what other players are known by in the API. */
const AccountId = Schema.String.check(Schema.isMinLength(1));

/** A player I blocked, for the "Blocked players" list in settings. */
export class BlockedPlayer extends Schema.Class<BlockedPlayer>("BlockedPlayer")({
  id: AccountId,
  /** Null when they never set up a profile. */
  displayName: Schema.NullOr(Schema.String),
  photoUrl: Schema.NullOr(Schema.String),
  blockedAt: Schema.DateFromString,
}) {}

/** What can be reported. Forum posts and direct messages join when those features ship. */
export const ReportTargetType = Schema.Literals(["player"]);
export type ReportTargetType = typeof ReportTargetType.Type;

/** Same values as the `report_reason` enum. */
export const ReportReason = Schema.Literals([
  "spam",
  "harassment",
  "inappropriate",
  "fake_profile",
  "underage",
  "other",
]);
export type ReportReason = typeof ReportReason.Type;

export const REPORT_DETAILS_MAX = 1000;

/** `POST /reports` body. `targetId` is the account id when `targetType` is "player". */
export const NewReport = Schema.Struct({
  targetType: ReportTargetType,
  targetId: AccountId,
  reason: ReportReason,
  /** Optional free text for moderators. */
  details: Schema.optionalKey(
    Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(REPORT_DETAILS_MAX)),
  ),
});
export type NewReport = typeof NewReport.Type;

export class ReportCreated extends Schema.Class<ReportCreated>("ReportCreated")({
  id: Schema.String,
}) {}

/** The player (or other report target) doesn't exist. */
export class TargetNotFound extends Schema.TaggedError<TargetNotFound>()(
  "TargetNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Players can't block or report themselves. */
export class CannotTargetSelf extends Schema.TaggedError<CannotTargetSelf>()(
  "CannotTargetSelf",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
