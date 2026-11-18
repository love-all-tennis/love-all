import { router, useLocalSearchParams } from "expo-router";

import { ReportSheet } from "@/features/safety/report-sheet";

/**
 * Report a forum thread or reply, in a form sheet, then the offer to block
 * its author. `type` is "thread" or "post".
 */
export default function ReportPostSheet() {
  const { type, id, authorId, name } = useLocalSearchParams<{
    type: "thread" | "post";
    id: string;
    authorId: string;
    name: string;
  }>();

  const thread = type === "thread";

  return (
    <ReportSheet
      targetType={thread ? "forum_thread" : "forum_post"}
      targetId={id}
      author={{ id: authorId, name }}
      title={thread ? "Report thread" : "Report reply"}
      subject={thread ? `${name}'s thread` : `${name}'s reply`}
      afterBlock={() => router.dismissTo("/forum")}
    />
  );
}
