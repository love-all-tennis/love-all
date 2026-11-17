import { router, useLocalSearchParams } from "expo-router";

import { ReportSheet } from "@/features/safety/report-sheet";

/**
 * Report a direct message the other player sent, in a form sheet, then the
 * offer to block them. Blocking ends the conversation for both of us.
 */
export default function ReportMessageSheet() {
  const { id, authorId, name } = useLocalSearchParams<{
    id: string;
    authorId: string;
    name: string;
  }>();
  return (
    <ReportSheet
      targetType="direct_message"
      targetId={id}
      author={{ id: authorId, name }}
      title="Report message"
      subject={`${name}'s message`}
      // The conversation is gone for both of us now.
      afterBlock={() => router.dismissTo("/messages")}
    />
  );
}
