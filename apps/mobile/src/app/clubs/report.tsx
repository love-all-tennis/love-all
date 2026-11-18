import { router, useLocalSearchParams } from "expo-router";

import { announce } from "@/features/clubs/clubs-api";
import { ReportSheet } from "@/features/safety/report-sheet";

/** Report another player's club review, in a form sheet, then the offer to block its author. */
export default function ReportClubReviewSheet() {
  const { id, clubId, authorId, name } = useLocalSearchParams<{
    id: string;
    clubId: string;
    authorId: string;
    name: string;
  }>();

  return (
    <ReportSheet
      targetType="club_review"
      targetId={id}
      author={{ id: authorId, name }}
      title="Report review"
      subject={`${name}'s review`}
      afterBlock={() => {
        announce(clubId);
        router.back();
      }}
    />
  );
}
