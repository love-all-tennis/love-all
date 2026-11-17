import { router, useLocalSearchParams } from "expo-router";

import { ReportSheet } from "@/features/safety/report-sheet";

/** Report a player, in a form sheet, then the offer to block them. */
export default function ReportPlayerSheet() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  return (
    <ReportSheet
      targetType="player"
      targetId={id}
      author={{ id, name }}
      title={`Report ${name}`}
      subject={name}
      // They're hidden from me now: close the sheet and their profile.
      afterBlock={() => router.dismissTo("/players")}
    />
  );
}
