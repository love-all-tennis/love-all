import type { SessionScope } from "@love-all/domain";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Button, Chip, EmptyState, Icon, Loading, Screen, size, space, useColors } from "@/design";
import { SessionCard } from "@/features/sessions/components";
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

  return (
    <FlatList
      style={styles.fill}
      contentContainerStyle={styles.list}
      data={list.sessions}
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: space[2] },
  switcher: { flex: 1, flexDirection: "row", gap: space[2] },
  list: { gap: space[2], paddingBottom: size.tabBarClearance },
});
