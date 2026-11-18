/**
 * Report reasons in the words players see, kept free of React Native so
 * the list can be unit tested against the API's values.
 */
import type { ReportReason, ReportTargetType } from "@love-all/domain";

export const REPORT_REASONS = [
  { reason: "harassment", label: "Harassment or threats" },
  { reason: "inappropriate", label: "Inappropriate messages or photos" },
  { reason: "fake_profile", label: "Fake profile or pretending to be someone" },
  { reason: "underage", label: "Under 18" },
  { reason: "spam", label: "Spam or selling" },
  { reason: "other", label: "Something else" },
] as const satisfies ReadonlyArray<{ reason: ReportReason; label: string }>;

export type ReasonOption = { readonly reason: ReportReason; readonly label: string };

/** Reasons that fit something a player wrote. */
const CONTENT_REASONS: ReadonlyArray<ReasonOption> = [
  { reason: "harassment", label: "Harassment or threats" },
  { reason: "inappropriate", label: "Offensive or inappropriate" },
  { reason: "spam", label: "Spam or selling" },
  { reason: "other", label: "Something else" },
];

/** The reasons to offer for a report target: all of them for a player, fewer for a post. */
export const reasonsFor = (target: ReportTargetType): ReadonlyArray<ReasonOption> =>
  target === "player" ? REPORT_REASONS : CONTENT_REASONS;
