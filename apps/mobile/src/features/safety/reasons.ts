/**
 * Report reasons in the words players see, kept free of React Native so
 * the list can be unit tested against the API's values.
 */
import type { ReportReason } from "@love-all/domain";

export const REPORT_REASONS = [
  { reason: "harassment", label: "Harassment or threats" },
  { reason: "inappropriate", label: "Inappropriate messages or photos" },
  { reason: "fake_profile", label: "Fake profile or pretending to be someone" },
  { reason: "underage", label: "Under 18" },
  { reason: "spam", label: "Spam or selling" },
  { reason: "other", label: "Something else" },
] as const satisfies ReadonlyArray<{ reason: ReportReason; label: string }>;
