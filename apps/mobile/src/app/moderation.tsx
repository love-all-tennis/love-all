import type { ModerationReport, ReportStatus } from "@love-all/domain";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Chip, EmptyState, ErrorBanner, Loading, Screen, space, useColors } from "@/design";
import { confirmDestructive } from "@/features/forum/components";
import { type ReportAction, ReportCard } from "@/features/moderation/components";
import { hideableType } from "@/features/moderation/moderation";
import { dismissReport, setHidden, setSuspended } from "@/features/moderation/moderation-api";
import { useReports } from "@/features/moderation/use-reports";
import { timeAgo } from "@/features/session-activity/comments";
import { useNow } from "@/features/sessions/use-sessions";

const NETWORK = "Check your connection and try again.";

const FILTERS: ReadonlyArray<{ status: ReportStatus; label: string }> = [
  { status: "open", label: "Open" },
  { status: "resolved", label: "Resolved" },
];

/**
 * The moderation queue, for admins: reports newest first, open ones by
 * default. From a report a moderator can hide the post, suspend the player
 * responsible, or dismiss it. The Home tab only links here for admins.
 */
export default function ModerationScreen() {
  const palette = useColors();
  const [status, setStatus] = useState<ReportStatus>("open");
  const list = useReports(status);
  const now = useNow();
  const [busy, setBusy] = useState<{ id: string; action: ReportAction } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = (report: ModerationReport, action: ReportAction, call: () => Promise<void>) => {
    setBusy({ id: report.id, action });
    setProblem(null);
    call()
      .then(list.refresh)
      .catch(() => setProblem(`Couldn't do that. ${NETWORK}`))
      .finally(() => setBusy(null));
  };

  const onAction = (report: ModerationReport, action: ReportAction) => {
    const type = hideableType(report);
    const subject = report.subject;
    switch (action) {
      case "hide":
        if (type) run(report, action, () => setHidden(type, report.targetId, true));
        return;
      case "unhide":
        if (type) run(report, action, () => setHidden(type, report.targetId, false));
        return;
      case "suspend":
        if (subject) {
          confirmDestructive(
            `Suspend ${subject.displayName}?`,
            "They're signed out everywhere, can't sign in again, and drop out of player search until you lift it.",
            "Suspend",
            () => run(report, action, () => setSuspended(subject.id, true)),
          );
        }
        return;
      case "unsuspend":
        if (subject) run(report, action, () => setSuspended(subject.id, false));
        return;
      case "dismiss":
        run(report, action, () => dismissReport(report.id));
        return;
      case "openThread":
        if (report.threadId) {
          router.push({ pathname: "/forum/thread/[id]", params: { id: report.threadId } });
        }
        return;
      case "openItem":
        if (report.equipmentId) {
          router.push({ pathname: "/gear/[id]", params: { id: report.equipmentId } });
        }
        return;
      case "openClub":
        if (report.clubId) {
          router.push({ pathname: "/clubs/[id]", params: { id: report.clubId } });
        }
        return;
      case "openPlayer":
        if (subject) router.push({ pathname: "/players/[id]", params: { id: subject.id } });
        return;
    }
  };

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Moderation" }} />
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        data={list.reports}
        keyExtractor={(report) => report.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.filters}>
              {FILTERS.map((filter) => (
                <Chip
                  key={filter.status}
                  label={filter.label}
                  selected={status === filter.status}
                  onPress={() => setStatus(filter.status)}
                />
              ))}
            </View>
            <ErrorBanner>{problem}</ErrorBanner>
          </View>
        }
        renderItem={({ item }) => (
          <ReportCard
            report={item}
            when={timeAgo(item.createdAt, now)}
            busy={busy?.id === item.id ? busy.action : null}
            onAction={(action) => onAction(item, action)}
          />
        )}
        ListEmptyComponent={
          list.status === "loading" ? (
            <Loading label="Loading reports" />
          ) : list.status === "error" ? (
            <EmptyState
              title="Couldn't load reports"
              body={NETWORK}
              action={{ label: "Try again", onPress: list.refresh }}
            />
          ) : status === "open" ? (
            <EmptyState
              title="No open reports"
              body="When players report someone or a post, it shows up here."
              action={{ label: "Show resolved", onPress: () => setStatus("resolved") }}
            />
          ) : (
            <EmptyState title="No resolved reports yet" body="Reports you act on move here." />
          )
        }
        ListFooterComponent={
          list.loadingMore ? <Loading label="Loading more reports" /> : undefined
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={list.refresh}
            tintColor={palette.textMuted}
            colors={[palette.accent]}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[2], paddingBottom: space[8] },
  header: { gap: space[3], paddingBottom: space[2] },
  filters: { flexDirection: "row", gap: space[2] },
});
