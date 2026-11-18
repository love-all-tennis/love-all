import type { SessionScope, SessionSummary } from "@love-all/domain";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";

import {
  Button,
  Chip,
  EmptyState,
  Icon,
  Loading,
  Screen,
  size,
  space,
  Text,
  useColors,
} from "@/design";
import { PastScore } from "@/features/session-activity/components";
import { isPastSession } from "@/features/session-activity/score";
import { SessionCard } from "@/features/sessions/components";
import { groupMySessions } from "@/features/sessions/joining";
import { useNow, useSessionList } from "@/features/sessions/use-sessions";
import { authClient } from "@/lib/auth-client";

const openSession = (id: string) => router.push({ pathname: "/sessions/[id]", params: { id } });
const newSession = () => router.push("/sessions/new");

/** My sessions is split by time: still to come, and Past (started, with their scores). */
type Segment = "mine" | "past" | "nearby";

/** Matches and hitting sessions: mine (hosting, invited, playing), past ones, and open ones nearby. */
export default function PlayScreen() {
  const [segment, setSegment] = useState<Segment>("mine");

  return (
    <Screen title="Play" scroll={false} edges={["top", "left", "right"]}>
      <View style={styles.bar}>
        <View style={styles.switcher}>
          <Chip
            label="My sessions"
            selected={segment === "mine"}
            onPress={() => setSegment("mine")}
          />
          <Chip label="Past" selected={segment === "past"} onPress={() => setSegment("past")} />
          <Chip
            label="Nearby"
            selected={segment === "nearby"}
            onPress={() => setSegment("nearby")}
          />
        </View>
        <Button
          variant="quiet"
          size="small"
          label="New"
          icon={<Icon ios="plus" md="add" size="sm" color="accent" />}
          accessibilityHint="Sets up a match or hitting session"
          onPress={newSession}
        />
      </View>
      {/* Keyed, so each segment keeps its own list and reloads when it's shown. */}
      <SessionList key={segment} segment={segment} />
    </Screen>
  );
}

function SessionList({ segment }: { segment: Segment }) {
  const palette = useColors();
  const scope: SessionScope = segment === "nearby" ? "nearby" : "mine";
  const list = useSessionList(scope);
  const now = useNow();
  const { data: auth } = authClient.useSession();
  const meId = auth?.user.id ?? null;
  const sections = listSections(segment, list.sessions, now);
  // `mine` comes upcoming first, then past, so page on until past ones show up.
  const { status, hasMore, loadingMore, loadMore } = list;
  const needsMore =
    segment === "past" && status === "ready" && sections.length === 0 && hasMore && !loadingMore;
  useEffect(() => {
    if (needsMore) {
      loadMore();
    }
  }, [needsMore, loadMore]);

  if (list.status === "needsHomePoint") {
    return (
      <EmptyState
        title="Set where you play"
        body="Love All needs your home area to find sessions near you."
        action={{ label: "Set home area", onPress: () => router.push("/profile-setup/home") }}
      />
    );
  }

  return (
    <SectionList
      style={styles.fill}
      contentContainerStyle={styles.list}
      sections={sections}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) =>
        section.title ? (
          <Text variant="heading" accessibilityRole="header" style={styles.header}>
            {section.title}
          </Text>
        ) : null
      }
      keyExtractor={(session) => session.id}
      renderItem={({ item }) => (
        <SessionCard
          session={item}
          now={now}
          showHost={scope === "nearby" || item.me?.role !== "host"}
          onPress={() => openSession(item.id)}
          footer={segment === "past" ? <PastScore session={item} meId={meId} /> : undefined}
        />
      )}
      ListEmptyComponent={
        list.status === "loading" || needsMore || (segment === "past" && list.loadingMore) ? (
          <Loading label="Loading sessions" />
        ) : list.status === "error" ? (
          <EmptyState
            title="Couldn't load sessions"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: list.refresh }}
          />
        ) : segment === "past" ? (
          <EmptyState
            title="No past sessions yet"
            body="Sessions you've played show here once they start, with their scores."
          />
        ) : segment === "mine" ? (
          <EmptyState
            title="No sessions yet"
            body="Set up a match or hitting session and invite players, or open it to players nearby."
            action={{ label: "New session", onPress: newSession }}
          />
        ) : (
          <EmptyState
            title="No open sessions nearby"
            body="Nobody near you at your level has an open session right now. Host one and others can find it."
            action={{ label: "New session", onPress: newSession }}
          />
        )
      }
      ListFooterComponent={list.loadingMore ? <Loading label="Loading more sessions" /> : undefined}
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
  );
}

type ListSection = { readonly title: string | null; readonly data: ReadonlyArray<SessionSummary> };

const plain = (data: ReadonlyArray<SessionSummary>) =>
  data.length > 0 ? [{ title: null, data }] : [];

/**
 * My sessions shows upcoming ones, with invites and requests waiting on me in
 * a short group at the top. Past and Nearby are plain lists. Empty groups are
 * left out, so an empty list shows its empty state.
 */
const listSections = (
  segment: Segment,
  sessions: ReadonlyArray<SessionSummary>,
  now: Date,
): ReadonlyArray<ListSection> => {
  if (segment === "nearby") {
    return plain(sessions);
  }
  if (segment === "past") {
    return plain(sessions.filter((s) => isPastSession(s, now)));
  }
  const upcoming = sessions.filter((s) => !isPastSession(s, now));
  const { needsAnswer, rest } = groupMySessions(upcoming, now);
  const sections: Array<ListSection> = [];
  if (needsAnswer.length > 0) {
    sections.push({ title: "Needs your answer", data: needsAnswer });
  }
  if (rest.length > 0) {
    sections.push({ title: needsAnswer.length > 0 ? "All sessions" : null, data: rest });
  }
  return sections;
};

const styles = StyleSheet.create({
  header: { paddingTop: space[2] },
  fill: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: space[2] },
  switcher: { flex: 1, flexDirection: "row", gap: space[2] },
  list: { gap: space[2], paddingBottom: size.tabBarClearance },
});
