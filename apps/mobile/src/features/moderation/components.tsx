import type { ModerationReport } from "@love-all/domain";
import { StyleSheet, View } from "react-native";

import { Button, Card, space, Tag, Text } from "@/design";
import { DELETED_ACCOUNT } from "@/lib/deleted-account";

import {
  REASON_LABELS,
  reportActions,
  reportCountLabel,
  reportedByLabel,
  stateTags,
  TARGET_LABELS,
} from "./moderation";

export type ReportAction =
  | "hide"
  | "unhide"
  | "suspend"
  | "unsuspend"
  | "dismiss"
  | "openThread"
  | "openClub"
  | "openItem"
  | "openPlayer";

/**
 * One report in the queue: what was reported and why, who's responsible, the
 * reported text, where things stand, and what a moderator can do about it.
 */
export function ReportCard({
  report,
  when,
  busy,
  onAction,
}: {
  report: ModerationReport;
  when: string;
  /** The action running on this card, if any. */
  busy: ReportAction | null;
  onAction: (action: ReportAction) => void;
}) {
  const actions = reportActions(report);
  const subjectName = report.subject?.displayName ?? DELETED_ACCOUNT;
  const count = reportCountLabel(report.openReportsOnTarget);
  const what = TARGET_LABELS[report.targetType];
  return (
    <Card>
      <View style={styles.group}>
        <View style={styles.tags}>
          <Tag label={what} />
          <Tag label={REASON_LABELS[report.reason]} tone="clay" />
          {count ? <Tag label={count} /> : null}
          {stateTags(report).map((tag) => (
            <Tag key={tag.label} label={tag.label} tone={tag.tone} />
          ))}
        </View>
        <View style={styles.tight}>
          <Text variant="subheading" numberOfLines={1}>
            {report.targetType === "player" ? subjectName : `${what} by ${subjectName}`}
          </Text>
          <Text variant="caption" color="textMuted">
            {reportedByLabel(report, when)}
          </Text>
        </View>
        {report.content ? (
          <Card tone="sunken">
            <Text>{report.content}</Text>
          </Card>
        ) : null}
        {report.details ? (
          <View style={styles.tight}>
            <Text variant="label" color="textMuted">
              {"Reporter's note"}
            </Text>
            <Text>{report.details}</Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          {actions.hide ? (
            <Button
              variant="danger"
              size="small"
              label={`Hide ${what.toLowerCase()}`}
              loading={busy === "hide"}
              onPress={() => onAction("hide")}
            />
          ) : null}
          {actions.unhide ? (
            <Button
              variant="secondary"
              size="small"
              label={`Unhide ${what.toLowerCase()}`}
              loading={busy === "unhide"}
              onPress={() => onAction("unhide")}
            />
          ) : null}
          {actions.suspend ? (
            <Button
              variant="danger"
              size="small"
              label={`Suspend ${subjectName}`}
              loading={busy === "suspend"}
              onPress={() => onAction("suspend")}
            />
          ) : null}
          {actions.unsuspend ? (
            <Button
              variant="secondary"
              size="small"
              label="Lift suspension"
              loading={busy === "unsuspend"}
              onPress={() => onAction("unsuspend")}
            />
          ) : null}
          {actions.dismiss ? (
            <Button
              variant="quiet"
              size="small"
              label="Dismiss"
              loading={busy === "dismiss"}
              onPress={() => onAction("dismiss")}
            />
          ) : null}
          {actions.openThread ? (
            <Button
              variant="quiet"
              size="small"
              label="Open thread"
              onPress={() => onAction("openThread")}
            />
          ) : actions.openItem ? (
            <Button
              variant="quiet"
              size="small"
              label="Open gear"
              onPress={() => onAction("openItem")}
            />
          ) : actions.openClub ? (
            <Button
              variant="quiet"
              size="small"
              label="Open club"
              onPress={() => onAction("openClub")}
            />
          ) : report.targetType === "player" && report.subject && !report.subject.suspended ? (
            <Button
              variant="quiet"
              size="small"
              label="Open profile"
              onPress={() => onAction("openPlayer")}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  tight: { gap: space[1] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
