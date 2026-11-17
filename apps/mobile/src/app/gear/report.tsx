import { router, useLocalSearchParams } from "expo-router";

import { ReportSheet } from "@/features/safety/report-sheet";

/**
 * Report another player's gear review, in a form sheet, then the offer to
 * block them. Their reviews are hidden from me once I block them.
 */
export default function ReportReviewSheet() {
  const { id, authorId, name } = useLocalSearchParams<{
    id: string;
    authorId: string;
    name: string;
  }>();
  return (
    <ReportSheet
      targetType="equipment_review"
      targetId={id}
      author={{ id: authorId, name }}
      title="Report review"
      subject={`${name}'s review`}
      // Back to the item, which reloads without their review.
      afterBlock={() => router.back()}
    />
  );
}
