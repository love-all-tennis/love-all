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

/**
 * What can be reported: a player, or something a player wrote. Keep in step
 * with the `report_target_type` enum. To make something new reportable
 * (messages, reviews), add it here and to the enum, and teach
 * `Safety.report` in the API who wrote it.
 */
export const REPORT_TARGET_TYPES = [
  "player",
  "forum_thread",
  "forum_post",
  "direct_message",
] as const;
export const ReportTargetType = Schema.Literals(REPORT_TARGET_TYPES);
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

/**
 * `POST /reports` body. `targetId` is the account id for a player, the
 * thread or reply id for forum content, and the message id for a direct
 * message (one the other player sent me).
 */
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

/** The player, or the content being reported, doesn't exist or isn't visible to me. */
export class TargetNotFound extends Schema.TaggedError<TargetNotFound>()(
  "TargetNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Players can't block or report themselves, or report what they wrote. */
export class CannotTargetSelf extends Schema.TaggedError<CannotTargetSelf>()(
  "CannotTargetSelf",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
