import type { SessionScope, SessionSummary } from "@love-all/domain";
import { router } from "expo-router";
import { useState } from "react";
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
import { SessionCard } from "@/features/sessions/components";
import { groupMySessions } from "@/features/sessions/joining";
import { useNow, useSessionList } from "@/features/sessions/use-sessions";

const openSession = (id: string) => router.push({ pathname: "/sessions/[id]", params: { id } });
const newSession = () => router.push("/sessions/new");

/** Matches and hitting sessions: mine (hosting, invited, playing) and open ones nearby. */
export default function PlayScreen() {
  const [scope, setScope] = useState<SessionScope>("mine");

  return (
    <Screen title="Play" scroll={false} edges={["top", "left", "right"]}>
      <View style={styles.bar}>
        <View style={styles.switcher}>
          <Chip label="My sessions" selected={scope === "mine"} onPress={() => setScope("mine")} />
          <Chip label="Nearby" selected={scope === "nearby"} onPress={() => setScope("nearby")} />
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
      {/* Keyed, so each scope keeps its own list and reloads when it's shown. */}
      <SessionList key={scope} scope={scope} />
    </Screen>
  );
}

function SessionList({ scope }: { scope: SessionScope }) {
  const palette = useColors();
  const list = useSessionList(scope);
  const now = useNow();

  if (list.status === "needsHomePoint") {
    return (
      <EmptyState
        title="Set where you play"
        body="Love All needs your home area to find sessions near you."
        action={{ label: "Set home area", onPress: () => router.push("/profile-setup/home") }}
      />
    );
  }

  const sections = listSections(scope, list.sessions, now);

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
        />
      )}
      ListEmptyComponent={
        list.status === "loading" ? (
          <Loading label="Loading sessions" />
        ) : list.status === "error" ? (
          <EmptyState
            title="Couldn't load sessions"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: list.refresh }}
          />
        ) : scope === "mine" ? (
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

/**
 * My sessions puts invites and requests waiting on me in a short group at the
 * top. Nearby is one plain list. Empty groups are left out, so an empty list
 * shows its empty state.
 */
const listSections = (
  scope: SessionScope,
  sessions: ReadonlyArray<SessionSummary>,
  now: Date,
): ReadonlyArray<ListSection> => {
  if (scope === "nearby") return sessions.length > 0 ? [{ title: null, data: sessions }] : [];
  const { needsAnswer, rest } = groupMySessions(sessions, now);
  const sections: Array<ListSection> = [];
  if (needsAnswer.length > 0) sections.push({ title: "Needs your answer", data: needsAnswer });
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
