import type {
  ModerationReport,
  ReportReason,
  ReportResolution,
  ReportTargetType,
} from "@love-all/domain";

export const TARGET_LABELS: Record<ReportTargetType, string> = {
  player: "Player",
  forum_thread: "Thread",
  forum_post: "Reply",
  direct_message: "Message",
  club_review: "Club review",
  equipment_review: "Gear review",
};

export const REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment",
  inappropriate: "Inappropriate",
  fake_profile: "Fake profile",
  underage: "Under 18",
  spam: "Spam",
  other: "Something else",
};

const RESOLUTION_LABELS: Record<ReportResolution, string> = {
  dismissed: "Dismissed",
  content_hidden: "Post hidden",
  player_suspended: "Player suspended",
};

export type StateTag = {
  readonly label: string;
  readonly tone: "neutral" | "clay" | "danger";
};

/** Forum threads and replies, club reviews and gear reviews can be hidden; players and direct messages can't. */
export const hideableType = (report: ModerationReport) =>
  report.targetType === "forum_thread" ||
  report.targetType === "forum_post" ||
  report.targetType === "club_review" ||
  report.targetType === "equipment_review"
    ? report.targetType
    : null;

/** "3 reports" when others have reported the same thing; nothing for just this one. */
export const reportCountLabel = (open: number) => (open > 1 ? `${open} reports` : null);

/** Read-only tags for where things stand: hidden, deleted, suspended, resolved. */
export const stateTags = (report: ModerationReport) => {
  const tags: Array<StateTag> = [];

  if (report.status === "resolved" && report.resolution) {
    tags.push({ label: RESOLUTION_LABELS[report.resolution], tone: "neutral" });
  }

  if (report.hidden) tags.push({ label: "Hidden", tone: "clay" });

  if (report.removed) {
    tags.push({
      label: report.targetType === "player" ? "Account deleted" : "Deleted by author",
      tone: "neutral",
    });
  }

  if (report.subject?.suspended) tags.push({ label: "Suspended", tone: "danger" });

  return tags;
};

/** Who reported it and when, for the meta line. */
export const reportedByLabel = (report: ModerationReport, when: string) =>
  `Reported by ${report.reporter?.displayName ?? "a deleted account"} · ${when}`;

/** Which actions to offer on a report card. */
export const reportActions = (report: ModerationReport) => {
  const hideable = hideableType(report) !== null && !report.removed;

  return {
    hide: hideable && !report.hidden,
    unhide: hideable && report.hidden,
    suspend: report.subject !== null && !report.subject.suspended,
    unsuspend: report.subject !== null && report.subject.suspended,
    dismiss: report.status === "open",
    openThread: report.threadId !== null && !report.hidden && !report.removed,
    openClub: report.clubId !== null,
    openItem: report.equipmentId !== null,
  };
};
