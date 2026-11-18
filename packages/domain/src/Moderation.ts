import { Schema } from "effect";
import { PlayerId } from "./Player";
import { ReportReason, ReportTargetType } from "./Safety";

/**
 * Moderation: the reports queue, hiding content and suspending players.
 * Only admins (`role` "admin") can use it.
 */

export const ReportId = Schema.String.check(Schema.isUUID());

export type ReportId = typeof ReportId.Type;

/** Same values as the `report_status` enum. */
export const ReportStatus = Schema.Literals(["open", "resolved"]);

export type ReportStatus = typeof ReportStatus.Type;

/**
 * How a report was closed. Same values as the `report_resolution` enum.
 * Hiding content closes the open reports on it; suspending a player closes
 * the open reports about them (as a player, not their content).
 */
export const ReportResolution = Schema.Literals([
  "dismissed",
  "content_hidden",
  "player_suspended",
]);

export type ReportResolution = typeof ReportResolution.Type;

/** Report target types that are content a moderator can hide. */
export const HideableTargetType = Schema.Literals([
  "forum_thread",
  "forum_post",
  "club_review",
  "equipment_review",
]);

export type HideableTargetType = typeof HideableTargetType.Type;

export const SUSPENSION_REASON_MAX = 500;

/** A player as moderators see them. */
export const ModerationPlayer = Schema.Struct({
  id: PlayerId,
  /** Profile name, or the account name before they set up a profile. */
  displayName: Schema.String,
  suspended: Schema.Boolean,
});

export type ModerationPlayer = typeof ModerationPlayer.Type;

/** A report in the moderation queue, with what moderators need to act on it. */
export class ModerationReport extends Schema.Class<ModerationReport>("ModerationReport")({
  id: ReportId,
  targetType: ReportTargetType,
  targetId: Schema.String,
  reason: ReportReason,
  details: Schema.NullOr(Schema.String),
  /** The reported text as it was when reported. Null for player reports. */
  content: Schema.NullOr(Schema.String),
  /** Null when the reporter has deleted their account. */
  reporter: Schema.NullOr(ModerationPlayer),
  /** The player responsible. Null when their account is gone. */
  subject: Schema.NullOr(ModerationPlayer),
  /** For forum content: the thread it's in, to open it. */
  threadId: Schema.NullOr(Schema.String),
  /** For a club review: its club, to open it. */
  clubId: Schema.NullOr(Schema.String),
  /** For a gear review: the item it reviews, to open it. */
  equipmentId: Schema.NullOr(Schema.String),
  /** For content: whether a moderator has hidden it. */
  hidden: Schema.Boolean,
  /** For content: whether its author deleted it (or it's gone). */
  removed: Schema.Boolean,
  /** Open reports on the same target, this one included. */
  openReportsOnTarget: Schema.Int,
  status: ReportStatus,
  resolution: Schema.NullOr(ReportResolution),
  createdAt: Schema.DateFromString,
  resolvedAt: Schema.NullOr(Schema.DateFromString),
}) {}

export const MODERATION_PAGE_DEFAULT = 30;
export const MODERATION_PAGE_MAX = 100;

/** `GET /moderation/reports` query. Open reports by default. */
export const ModerationReportsQuery = {
  status: Schema.optionalKey(ReportStatus),
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MODERATION_PAGE_MAX })),
  ),
};

export type ModerationReportsQuery = Schema.Struct<typeof ModerationReportsQuery>["Type"];

/** Newest first. */
export class ModerationReportsPage extends Schema.Class<ModerationReportsPage>(
  "ModerationReportsPage",
)({
  items: Schema.Array(ModerationReport),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `PUT /moderation/players/:id/suspension` body. */
export const NewSuspension = Schema.Struct({
  /** Optional note for other moderators. */
  reason: Schema.optionalKey(
    Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(SUSPENSION_REASON_MAX)),
  ),
});

export type NewSuspension = typeof NewSuspension.Type;

/** The signed-in user isn't an admin. */
export class NotModerator extends Schema.TaggedError<NotModerator>()(
  "NotModerator",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class ReportNotFound extends Schema.TaggedError<ReportNotFound>()(
  "ReportNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}
